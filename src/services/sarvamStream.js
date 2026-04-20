/**
 * Sarvam Conversation Stream
 *
 * Twilio Media Stream WebSocket handler. One connection per call.
 * Lifecycle:
 *   - Twilio sends "start" → we play a greeting
 *   - Twilio sends "media" frames (μ-law 8kHz, 20ms) → we buffer + run silence VAD
 *   - When user pauses → STT → Chat → TTS → stream audio back as "media" frames
 *   - "stop" → cleanup
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { getSettingsSync } = require('./settingsService');
const { getCallMeta, forgetCallMeta } = require('./sarvamSessionStore');
const { stt, chat, tts } = require('./sarvamApi');
const {
  muLawToPcm16,
  pcm16ToMuLaw,
  pcm16ToWav,
  wavToPcm16,
  resamplePcm16,
  pcm16Energy,
} = require('../utils/audioCodec');
const Transcript = (() => { try { return require('../models/Transcript'); } catch { return null; } })();

// VAD / turn config
const FRAME_BYTES        = 160;   // 20ms of μ-law @ 8kHz
const SILENCE_ENERGY     = 350;   // mean-abs PCM16 below this = silence
const SILENCE_FRAMES_END = 35;    // ~700ms of silence ends an utterance
const MIN_SPEECH_FRAMES  = 10;    // ignore <200ms blips
const MAX_TURN_FRAMES    = 750;   // hard cap ~15s
const OUT_FRAME_MS       = 20;

function init(server) {
  const wss = new WebSocket.Server({ server, path: '/sarvam-stream' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const callId = url.searchParams.get('callId') || `unknown-${Date.now()}`;
    const wt     = url.searchParams.get('wt');
    const s      = getSettingsSync();
    const expected = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-wh';
    if (wt !== expected) {
      logger.warn(`[sarvam-stream] bad token for call ${callId}, closing`);
      try { ws.close(4003, 'bad token'); } catch {}
      return;
    }
    const session = new Session(ws, callId);
    session.start().catch(err => {
      logger.error(`[sarvam-stream] session error call=${callId}: ${err.message}`);
      try { ws.close(); } catch {}
    });
  });

  logger.info('🎙️  Sarvam Media Stream WS ready at /sarvam-stream');
}

class Session {
  constructor(ws, callId) {
    this.ws        = ws;
    this.callId    = callId;
    this.streamSid = null;
    this.meta      = getCallMeta(callId) || {};
    this.history   = [];
    this.frameBuf  = [];
    this.silentRun = 0;
    this.speechRun = 0;
    this.processing = false;
    this.closed     = false;
    this.systemPrompt = this.buildSystemPrompt();
  }

  buildSystemPrompt() {
    const s = getSettingsSync();
    const meta = this.meta || {};
    const company = meta.companyName || s.companyName || 'Automystics';
    const services = s.servicesList || 'chit funds, lottery, loans';
    const hours    = s.officeHours || 'காலை 10 மணி முதல் மாலை 6 மணி வரை';
    const support  = s.supportNumber || s.escalationPhone || '';
    const customerName = meta.customerName || 'வாடிக்கையாளர்';
    const purpose = meta.callPurposeMessage || 'உங்கள் கணக்கு பற்றி பேச அழைக்கிறேன்';
    const customFields = meta.customData
      ? Object.entries(meta.customData).map(([k, v]) => `- ${k}: ${v}`).join('\n')
      : '';

    const customPrompt = (s.sarvamSystemPrompt || '').trim();

    if (customPrompt) {
      return customPrompt
        .replace(/\{\{\s*customer_name\s*\}\}/gi, customerName)
        .replace(/\{\{\s*company_name\s*\}\}/gi, company)
        .replace(/\{\{\s*services\s*\}\}/gi, services)
        .replace(/\{\{\s*office_hours\s*\}\}/gi, hours)
        .replace(/\{\{\s*support_number\s*\}\}/gi, support)
        .replace(/\{\{\s*purpose\s*\}\}/gi, purpose)
        .replace(/\{\{\s*custom_fields\s*\}\}/gi, customFields);
    }

    return [
      `நீங்கள் "சமுத்ரா", ${company} நிறுவனத்தின் தமிழ் AI உதவியாளர்.`,
      `வாடிக்கையாளர் பெயர்: ${customerName}.`,
      `அழைப்பின் நோக்கம்: ${purpose}.`,
      `நிறுவன சேவைகள்: ${services}. அலுவலக நேரம்: ${hours}. ஆதரவு எண்: ${support}.`,
      customFields ? `கூடுதல் தகவல்:\n${customFields}` : '',
      `பேச்சு விதிமுறைகள்:`,
      `- எப்போதும் தமிழில் மட்டும் பதிலளியுங்கள்.`,
      `- பதில்கள் சுருக்கமாக, 1-2 வாக்கியங்களில், இயற்கையான உரையாடல் தொனியில் இருக்க வேண்டும்.`,
      `- வாடிக்கையாளர் ஆங்கிலத்தில் பேசினாலும் நீங்கள் தமிழில் பதிலளிக்கவும்.`,
      `- கேள்விக்கு பதிலறியாதபோது, "நான் இதை உறுதிப்படுத்தி திரும்ப அழைக்கிறேன்" என்று சொல்லுங்கள்.`,
      `- உரையாடல் முடிந்தால் பணிவாக "நன்றி, வணக்கம்" என்று கூறி முடிக்கவும்.`,
    ].filter(Boolean).join('\n');
  }

  async start() {
    this.ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      this.handleTwilioMsg(msg).catch(err =>
        logger.error(`[sarvam-stream] handler error call=${this.callId}: ${err.message}`)
      );
    });
    this.ws.on('close', () => this.cleanup());
    this.ws.on('error', (err) => logger.warn(`[sarvam-stream] ws error call=${this.callId}: ${err.message}`));
  }

  async handleTwilioMsg(msg) {
    switch (msg.event) {
      case 'connected':
        return;
      case 'start':
        this.streamSid = msg.start?.streamSid;
        logger.info(`[sarvam-stream] START call=${this.callId} stream=${this.streamSid}`);
        await this.speakGreeting();
        return;
      case 'media':
        if (this.processing) return; // ignore inbound while bot is talking
        this.handleAudioFrame(Buffer.from(msg.media.payload, 'base64'));
        return;
      case 'stop':
        logger.info(`[sarvam-stream] STOP call=${this.callId}`);
        this.cleanup();
        return;
      case 'mark':
        return;
    }
  }

  handleAudioFrame(mulawFrame) {
    const pcm = muLawToPcm16(mulawFrame);
    const energy = pcm16Energy(pcm);
    const isSilent = energy < SILENCE_ENERGY;

    if (this.frameBuf.length === 0 && isSilent) return; // wait for speech to start

    this.frameBuf.push(mulawFrame);
    if (isSilent) {
      this.silentRun++;
    } else {
      this.silentRun = 0;
      this.speechRun++;
    }

    if (
      (this.silentRun >= SILENCE_FRAMES_END && this.speechRun >= MIN_SPEECH_FRAMES) ||
      this.frameBuf.length >= MAX_TURN_FRAMES
    ) {
      const utterance = Buffer.concat(this.frameBuf);
      this.frameBuf = [];
      this.silentRun = 0;
      this.speechRun = 0;
      this.processTurn(utterance);
    }
  }

  async processTurn(mulawAudio) {
    this.processing = true;
    try {
      const pcm = muLawToPcm16(mulawAudio);
      const wav = pcm16ToWav(pcm, 8000);

      let userText = '';
      try {
        const { transcript } = await stt(wav, {
          languageCode: this.langCode(),
          model: getSettingsSync().sarvamSttModel || 'saarika:v2',
        });
        userText = (transcript || '').trim();
      } catch (e) {
        logger.warn(`[sarvam-stream] STT failed call=${this.callId}: ${e.message}`);
      }

      if (!userText) {
        this.processing = false;
        return; // nothing to respond to
      }

      logger.info(`[sarvam-stream] ${this.callId} USER: ${userText}`);
      this.history.push({ role: 'user', content: userText });
      this.persistTranscript('user', userText).catch(() => {});

      let reply = '';
      try {
        reply = await chat(
          [{ role: 'system', content: this.systemPrompt }, ...this.history.slice(-12)],
          { model: getSettingsSync().sarvamChatModel || 'sarvam-m' }
        );
      } catch (e) {
        logger.warn(`[sarvam-stream] chat failed call=${this.callId}: ${e.message}`);
        reply = 'மன்னிக்கவும், ஒரு சிறிய தொழில்நுட்பக் கோளாறு. திரும்ப சொல்ல முடியுமா?';
      }
      reply = (reply || '').trim();
      if (!reply) reply = 'மன்னிக்கவும், கேட்கவில்லை. திரும்ப சொல்ல முடியுமா?';

      logger.info(`[sarvam-stream] ${this.callId} BOT : ${reply}`);
      this.history.push({ role: 'assistant', content: reply });
      this.persistTranscript('assistant', reply).catch(() => {});

      await this.speak(reply);
    } finally {
      this.processing = false;
    }
  }

  async speakGreeting() {
    const s = getSettingsSync();
    const meta = this.meta || {};
    const customerName = meta.customerName || 'வாடிக்கையாளர்';
    const greeting = (s.sarvamGreeting || '').trim() ||
      `வணக்கம் ${customerName}, நான் சமுத்ரா. ${s.companyName || 'Automystics'} சார்பாக அழைக்கிறேன். உங்களுக்கு பேச நேரம் இருக்கிறதா?`;
    this.history.push({ role: 'assistant', content: greeting });
    this.persistTranscript('assistant', greeting).catch(() => {});
    await this.speak(greeting);
  }

  async speak(text) {
    const s = getSettingsSync();
    const speaker = s.sarvamVoice || 'meera';
    const ttsModel = s.sarvamTtsModel || 'bulbul:v2';
    const lang = this.langCode();

    let wav;
    try {
      wav = await tts(text, { speaker, model: ttsModel, languageCode: lang, sampleRate: 8000 });
    } catch (e) {
      logger.warn(`[sarvam-stream] TTS failed call=${this.callId}: ${e.message}`);
      return;
    }

    const { pcm, sampleRate } = wavToPcm16(wav);
    const pcm8k = sampleRate === 8000 ? pcm : resamplePcm16(pcm, sampleRate, 8000);
    const mulaw = pcm16ToMuLaw(pcm8k);

    // Stream out in 160-byte (20ms) frames pacing roughly real-time
    for (let i = 0; i < mulaw.length && !this.closed; i += FRAME_BYTES) {
      const slice = mulaw.slice(i, i + FRAME_BYTES);
      const padded = slice.length === FRAME_BYTES
        ? slice
        : Buffer.concat([slice, Buffer.alloc(FRAME_BYTES - slice.length, 0xff)]);
      this.sendMedia(padded);
      await sleep(OUT_FRAME_MS);
    }
    this.sendMark('end-of-utterance');
  }

  sendMedia(mulawFrame) {
    if (this.ws.readyState !== WebSocket.OPEN || !this.streamSid) return;
    this.ws.send(JSON.stringify({
      event: 'media',
      streamSid: this.streamSid,
      media: { payload: mulawFrame.toString('base64') },
    }));
  }

  sendMark(name) {
    if (this.ws.readyState !== WebSocket.OPEN || !this.streamSid) return;
    this.ws.send(JSON.stringify({
      event: 'mark',
      streamSid: this.streamSid,
      mark: { name },
    }));
  }

  langCode() {
    return getSettingsSync().sarvamLanguageCode || 'ta-IN';
  }

  async persistTranscript(role, text) {
    if (!Transcript) return;
    try {
      await Transcript.create({
        id: uuidv4(),
        callId: this.callId,
        speaker: role === 'user' ? 'customer' : 'agent',
        text,
        timestamp: new Date(),
      });
    } catch {}
  }

  cleanup() {
    if (this.closed) return;
    this.closed = true;
    forgetCallMeta(this.callId);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { init };
