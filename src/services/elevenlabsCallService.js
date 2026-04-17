/**
 * ElevenLabs Conversational AI Call Service
 *
 * Initiates outbound calls via ElevenLabs' Twilio-integrated Conversational AI.
 * The agent (Samuthra) handles the entire conversation; tools call back to
 * /api/elevenlabs/tools/* for business logic.
 *
 * Same signature as twilioService.initiateCall() so it's a drop-in alternative.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { getSettingsSync } = require('./settingsService');

const ELEVENLABS_API = 'https://api.elevenlabs.io';

/**
 * Initiate an outbound call via ElevenLabs Conversational AI.
 *
 * @param {string} toPhone   - Destination E.164 phone (+91XXXXXXXXXX)
 * @param {string} callId    - KuralAI internal call UUID (used as customer_id fallback)
 * @param {object} callMeta  - Metadata: customerId, customerName, dueAmount, etc.
 * @returns {Promise<{ sid:string, conversationId:string }>}
 */
async function initiateCall(toPhone, callId, callMeta = {}) {
  const s = getSettingsSync();
  const apiKey      = s.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
  const agentId     = s.elevenlabsAgentId || process.env.ELEVENLABS_AGENT_ID;
  const phoneNumId  = s.elevenlabsAgentPhoneNumberId || process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;

  if (!apiKey)     throw new Error('ElevenLabs API key not configured');
  if (!agentId)    throw new Error('ElevenLabs agent ID not configured (set elevenlabsAgentId in Settings)');
  if (!phoneNumId) throw new Error('ElevenLabs phone number ID not configured (import Twilio number in ElevenLabs and paste ID in Settings)');

  const disclaimer = (s.recordingDisclaimer || '').trim();

  // Build dynamic variables for the agent's prompt + first message
  const dynamicVariables = {
    customer_id:   callMeta.customerId || callId,
    customer_name: callMeta.customerName || 'வாடிக்கையாளர்',
    customer_phone: toPhone,
    company_name:  callMeta.companyName || s.companyName || 'Automystics',
    due_amount:    String(callMeta.dueAmountNum || callMeta.dueAmount || ''),
    due_date:      callMeta.nextDueDate || callMeta.dueDate || '',
    chit_group:    callMeta.chitGroup || '',
    last_contact:  callMeta.lastContact || '',
    language_pref: callMeta.languagePref || 'Tamil',
    call_purpose:  callMeta.callPurpose || 'due_reminder',
    call_purpose_message: callMeta.callPurposeMessage || `உங்களோட payment reminder பத்தி ஒரு call.`,
    services_list: s.servicesList || 'chit funds, lottery, loans',
    office_hours:  s.officeHours  || 'காலை 10 மணி முதல் மாலை 6 மணி வரை',
    support_number: s.supportNumber || s.escalationPhone || '',
    office_address: s.officeAddress || '',
    recording_disclaimer: disclaimer,
  };

  const url = `${ELEVENLABS_API}/v1/convai/twilio/outbound-call`;
  const payload = {
    agent_id: agentId,
    agent_phone_number_id: phoneNumId,
    to_number: toPhone,
    conversation_initiation_client_data: {
      dynamic_variables: dynamicVariables,
      // Prepend the recording disclaimer to the agent's first message
      ...(disclaimer ? {
        conversation_config_override: {
          agent: {
            first_message: `${disclaimer} ${callMeta.customerName ? `வணக்கம் ${callMeta.customerName}!` : 'வணக்கம்!'} நான் ${callMeta.companyName || s.companyName || 'Automystics'}-ல இருந்து சமுத்ரா பேசுறேன்.`,
          },
        },
      } : {}),
    },
  };

  logger.info(`[ElevenLabs] Initiating call to ${toPhone} via agent ${agentId}`);

  try {
    const resp = await axios.post(url, payload, {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const data = resp.data || {};
    const sid  = data.callSid || data.call_sid || data.sid || `el-${callId}`;
    const conversationId = data.conversation_id || data.conversationId || null;

    logger.info(`[ElevenLabs] Call queued: sid=${sid} conversation=${conversationId}`);
    return { sid, conversationId };
  } catch (err) {
    const status = err.response?.status;
    const body   = err.response?.data;
    logger.error(`[ElevenLabs] outbound-call failed status=${status} body=${JSON.stringify(body || err.message)}`);
    throw new Error(`ElevenLabs call failed: ${body?.detail?.message || body?.detail || err.message}`);
  }
}

module.exports = { initiateCall };
