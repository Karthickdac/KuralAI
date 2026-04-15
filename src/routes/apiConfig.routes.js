const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requirePlanFeature } = require('../middleware/planLimits');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');

function readSettingsFromFile() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

async function loadSettings() {
  try {
    const AppSetting = require('../models/AppSetting');
    const row = await AppSetting.findByPk('main');
    return row ? row.data : readSettingsFromFile();
  } catch {
    return readSettingsFromFile();
  }
}

function maskKey(val) {
  if (!val || val.length < 8) return val ? '****' : '';
  return val.slice(0, 4) + '••••' + val.slice(-4);
}

router.use(authenticateToken, requireAdmin);
router.use(requirePlanFeature('apiConfig'));

router.get('/status', async (req, res) => {
  const s = await loadSettings();
  const provider = s.telephonyProvider || 'twilio';
  const ttsProvider = s.ttsProvider || 'azure';

  const services = [
    {
      id: 'telephony',
      name: provider === 'twilio' ? 'Twilio' : 'Exotel',
      category: 'Telephony',
      configured: provider === 'twilio'
        ? !!(s.twilioAccountSid && s.twilioAuthToken && s.twilioPhoneNumber)
        : !!(s.exotelSid && s.exotelApiKey && s.exotelApiToken),
      fields: provider === 'twilio'
        ? {
            accountSid: maskKey(s.twilioAccountSid),
            phoneNumber: s.twilioPhoneNumber || '',
          }
        : {
            accountSid: maskKey(s.exotelSid),
            phoneNumber: s.exotelPhoneNumber || '',
          },
    },
    {
      id: 'openai',
      name: 'OpenAI',
      category: 'AI',
      configured: !!s.openaiApiKey,
      fields: {
        model: s.openaiModel || 'gpt-4o',
        apiKey: maskKey(s.openaiApiKey),
      },
    },
    {
      id: 'tts',
      name: ttsProvider === 'elevenlabs' ? 'ElevenLabs' : 'Azure Neural TTS',
      category: 'Voice',
      configured: ttsProvider === 'elevenlabs'
        ? !!s.elevenLabsApiKey
        : !!s.azureSpeechKey,
      fields: ttsProvider === 'elevenlabs'
        ? {
            apiKey: maskKey(s.elevenLabsApiKey),
            voiceId: s.elevenLabsVoiceId || '',
          }
        : {
            apiKey: maskKey(s.azureSpeechKey),
            region: s.azureSpeechRegion || '',
            voice: s.azureSpeechVoice || 'ta-IN-PallaviNeural',
          },
    },
    {
      id: 's3',
      name: 'AWS S3',
      category: 'Storage',
      configured: !!(s.awsAccessKeyId && s.awsSecretAccessKey && s.s3BucketName),
      fields: {
        bucket: s.s3BucketName || '',
        region: s.awsRegion || '',
        accessKey: maskKey(s.awsAccessKeyId),
      },
      optional: true,
    },
  ];

  const externalApiKey = s.apiKey || '';

  res.json({
    success: true,
    services,
    externalApi: {
      configured: !!externalApiKey,
      key: maskKey(externalApiKey),
    },
    appUrl: s.appUrl || '',
    webhookToken: s.exotelWebhookToken ? '••••' : '',
  });
});

router.post('/test/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  const s = await loadSettings();
  const startTime = Date.now();

  try {
    switch (serviceId) {
      case 'telephony': {
        const provider = s.telephonyProvider || 'twilio';
        if (provider === 'twilio') {
          if (!s.twilioAccountSid || !s.twilioAuthToken) {
            return res.json({ success: true, result: { status: 'error', message: 'Twilio credentials not configured', latencyMs: Date.now() - startTime } });
          }
          const fetch = (await import('node-fetch')).default;
          const authStr = Buffer.from(`${s.twilioAccountSid}:${s.twilioAuthToken}`).toString('base64');
          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${s.twilioAccountSid}.json`, {
            headers: { Authorization: `Basic ${authStr}` },
          });
          if (resp.ok) {
            const account = await resp.json();
            return res.json({
              success: true,
              result: {
                status: 'ok',
                message: `Connected — ${account.friendly_name} (${account.status})`,
                details: { friendlyName: account.friendly_name, accountStatus: account.status, type: account.type },
                latencyMs: Date.now() - startTime,
              },
            });
          }
          return res.json({ success: true, result: { status: 'error', message: `Twilio returned HTTP ${resp.status}`, latencyMs: Date.now() - startTime } });
        } else {
          if (!s.exotelSid || !s.exotelApiKey || !s.exotelApiToken) {
            return res.json({ success: true, result: { status: 'error', message: 'Exotel credentials not configured', latencyMs: Date.now() - startTime } });
          }
          const fetch = (await import('node-fetch')).default;
          const authStr = Buffer.from(`${s.exotelApiKey}:${s.exotelApiToken}`).toString('base64');
          const resp = await fetch(`https://api.exotel.com/v1/Accounts/${s.exotelSid}`, {
            headers: { Authorization: `Basic ${authStr}` },
            timeout: 10000,
          });
          if (resp.ok) {
            return res.json({ success: true, result: { status: 'ok', message: 'Connected to Exotel', latencyMs: Date.now() - startTime } });
          }
          return res.json({ success: true, result: { status: 'error', message: `Exotel returned HTTP ${resp.status}`, latencyMs: Date.now() - startTime } });
        }
      }

      case 'openai': {
        if (!s.openaiApiKey) {
          return res.json({ success: true, result: { status: 'error', message: 'OpenAI API key not configured', latencyMs: Date.now() - startTime } });
        }
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey: s.openaiApiKey });
        const models = await client.models.list();
        const modelList = [];
        for await (const m of models) {
          modelList.push(m.id);
          if (modelList.length >= 5) break;
        }
        return res.json({
          success: true,
          result: {
            status: 'ok',
            message: `Connected — ${modelList.length}+ models available`,
            details: { sampleModels: modelList, configuredModel: s.openaiModel || 'gpt-4o' },
            latencyMs: Date.now() - startTime,
          },
        });
      }

      case 'tts': {
        const ttsProvider = s.ttsProvider || 'azure';
        if (ttsProvider === 'elevenlabs') {
          if (!s.elevenLabsApiKey) {
            return res.json({ success: true, result: { status: 'error', message: 'ElevenLabs API key not configured', latencyMs: Date.now() - startTime } });
          }
          const fetch = (await import('node-fetch')).default;
          const resp = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
            headers: { 'xi-api-key': s.elevenLabsApiKey },
          });
          if (resp.ok) {
            const data = await resp.json();
            return res.json({
              success: true,
              result: {
                status: 'ok',
                message: `Connected — ${data.tier || 'active'} plan`,
                details: {
                  tier: data.tier,
                  characterCount: data.character_count,
                  characterLimit: data.character_limit,
                  voiceLimit: data.voice_limit,
                },
                latencyMs: Date.now() - startTime,
              },
            });
          }
          return res.json({ success: true, result: { status: 'error', message: `ElevenLabs returned HTTP ${resp.status}`, latencyMs: Date.now() - startTime } });
        } else {
          if (!s.azureSpeechKey || !s.azureSpeechRegion) {
            return res.json({ success: true, result: { status: 'error', message: 'Azure Speech credentials not configured', latencyMs: Date.now() - startTime } });
          }
          const fetch = (await import('node-fetch')).default;
          const tokenUrl = `https://${s.azureSpeechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
          const resp = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': s.azureSpeechKey,
              'Content-Length': '0',
            },
          });
          if (resp.ok) {
            return res.json({
              success: true,
              result: {
                status: 'ok',
                message: `Connected — region: ${s.azureSpeechRegion}`,
                details: { region: s.azureSpeechRegion, voice: s.azureSpeechVoice || 'ta-IN-PallaviNeural' },
                latencyMs: Date.now() - startTime,
              },
            });
          }
          return res.json({ success: true, result: { status: 'error', message: `Azure returned HTTP ${resp.status} — check key and region`, latencyMs: Date.now() - startTime } });
        }
      }

      case 's3': {
        if (!s.awsAccessKeyId || !s.awsSecretAccessKey || !s.s3BucketName) {
          return res.json({ success: true, result: { status: 'error', message: 'AWS S3 credentials not configured', latencyMs: Date.now() - startTime } });
        }
        try {
          const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
          const client = new S3Client({
            region: s.awsRegion || 'us-east-1',
            credentials: { accessKeyId: s.awsAccessKeyId, secretAccessKey: s.awsSecretAccessKey },
          });
          await client.send(new HeadBucketCommand({ Bucket: s.s3BucketName }));
          return res.json({
            success: true,
            result: {
              status: 'ok',
              message: `Connected — bucket "${s.s3BucketName}" accessible`,
              details: { bucket: s.s3BucketName, region: s.awsRegion || 'us-east-1' },
              latencyMs: Date.now() - startTime,
            },
          });
        } catch (err) {
          return res.json({
            success: true,
            result: {
              status: 'error',
              message: err.name === 'NotFound' ? `Bucket "${s.s3BucketName}" not found` : (err.message || 'S3 connection failed'),
              latencyMs: Date.now() - startTime,
            },
          });
        }
      }

      default:
        return res.status(400).json({ success: false, error: `Unknown service: ${serviceId}` });
    }
  } catch (err) {
    return res.json({
      success: true,
      result: {
        status: 'error',
        message: err.message || 'Connection test failed',
        latencyMs: Date.now() - startTime,
      },
    });
  }
});

module.exports = router;
