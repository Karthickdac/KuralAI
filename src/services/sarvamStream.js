/**
 * Sarvam Conversation Stream — telephony-agnostic.
 *
 * Handles Media Stream WebSockets from BOTH Twilio (μ-law 8kHz) and Exotel
 * Voicebot Applet (PCM16 / slin16 8kHz). Protocol is auto-detected from the
 * "start" event metadata.
 *
 * Lifecycle:
 *   - Provider sends "connected" / "start"
 *   - We greet the customer
 *   - "media" frames arrive (base64) → buffered + energy-VAD
 *   - On end-of-utterance → STT → Chat → TTS → stream audio back
 *   - "stop" → cleanup
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { getSettingsSync } = require('./settingsService');
const { getCallMeta, forgetCallMeta, hasCall, getCallIdBySid } = require('./sarvamSessionStore');
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

// VAD / turn config (operate on PCM16 normalized energy regardless of provider)
const SILENCE_ENERGY     = 350;     // mean-abs PCM16 below this = silence
const SILENCE_MS_END     = 700;     // ms of silence ends an utterance
const MIN_SPEECH_MS      = 200;     // ignore <200ms blips
const MAX_TURN_MS        = 15000;   // hard cap per turn
const FRAME_MS           = 20;      // outbound pacing chunk

let _wss = null;
function getWss() { return _wss; }

function init(server) {
  // noServer mode — upgrade routing is centralized in server.js so we don't
  // call abortHandshake() on sockets that the dashboard /ws server already
  // upgraded (which corrupts the WS frame stream with a stray HTTP/1.1 400).
  const wss = new WebSocket.Server({ noServer: true });
  _wss = wss;

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const queryCallId = url.searchParams.get('callId') || '';
    const wt          = url.searchParams.get('wt') || '';
    const s           = getSettingsSync();
    const expected    = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-wh';

    // Authorization: prefer wt from query string, but Twilio's media-streams
    // client sometimes drops the query string on the WS upgrade. In that case
    // we accept the connection and validate the wt from the `start` message's
    // customParameters (we set it as a <Parameter> in the TwiML). As a
    // belt-and-braces fallback, a callId that exists in our active call store
    // is also trusted (only our dispatcher can register it).
    const wtFromQuery = wt && wt === expected;
    if (!wtFromQuery) {
      logger.warn(`[sarvam-stream] no wt in query (callId=${queryCallId || 'n/a'}) — deferring auth to start message`);
    }

    const session = new Session(ws, queryCallId);
    session.expectedWt = expected;
    session.wtVerified = wtFromQuery;
    session.start().catch(err => {
      logger.error(`[sarvam-stream] session error call=${session.callId}: ${err.message}`);
      try { ws.close(); } catch {}
    });
  });

  logger.info('🎙️  Sarvam Media Stream WS ready at /sarvam-stream (Twilio + Exotel auto-detect)');
}

class Session {
  constructor(ws, callId) {
    this.ws        = ws;
    this.callId    = callId || `unknown-${Date.now()}`;
    this.streamSid = null;
    this.meta      = getCallMeta(callId) || {};
    this.history   = [];

    // Inbound buffering — we always work in PCM16 8kHz internally
    this.pcmChunks = [];
    this.pcmBytes  = 0;
    this.silentMs  = 0;
    this.speechMs  = 0;
    this.turnMs    = 0;

    this.processing = false;
    this.closed     = false;

    // Telephony protocol — autodetected on 'start'
    this.provider     = 'twilio';   // 'twilio' | 'exotel'
    this.inEncoding   = 'mulaw';    // 'mulaw' | 'pcm16'
    this.inSampleRate = 8000;
    this.outEncoding  = 'mulaw';
    this.outSampleRate = 8000;

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
      this.handleProviderMsg(msg).catch(err =>
        logger.error(`[sarvam-stream] handler error call=${this.callId}: ${err.message}`)
      );
    });
    this.ws.on('close', () => this.cleanup());
    this.ws.on('error', (err) => logger.warn(`[sarvam-stream] ws error call=${this.callId}: ${err.message}`));
  }

  async handleProviderMsg(msg) {
    switch (msg.event) {
      case 'connected':
        return;
      case 'start':
        this.detectProtocol(msg);
        this.bindCallIdFromStart(msg);
        if (!this.wtVerified) {
          const start = msg.start || {};
          const cp = start.customParameters || start.custom_parameters || start.custom_param || {};
          const wtFromParam = cp.wt || cp.WT;
          const callKnown = this.callId && hasCall(this.callId);
          if (wtFromParam === this.expectedWt) {
            this.wtVerified = true;
            logger.info(`[sarvam-stream] wt verified from <Parameter> for call=${this.callId}`);
          } else if (callKnown) {
            this.wtVerified = true;
            logger.info(`[sarvam-stream] wt missing but callId=${this.callId} found in active store — trusting`);
          } else {
            logger.warn(`[sarvam-stream] auth failed on start for call=${this.callId}, closing`);
            try { this.ws.close(4003, 'unauthorized'); } catch {}
            this.cleanup();
            return;
          }
        }
        logger.info(`[sarvam-stream] START call=${this.callId} provider=${this.provider} stream=${this.streamSid} in=${this.inEncoding}@${this.inSampleRate}Hz`);
        await this.speakGreeting();
        return;
      case 'media':
        if (this.processing) return;
        this.handleAudioFrame(Buffer.from(msg.media.payload, 'base64'));
        return;
      case 'dtmf':
        return;
      case 'stop':
        logger.info(`[sarvam-stream] STOP call=${this.callId}`);
        this.cleanup();
        return;
      case 'mark':
        return;
      case 'clear':
        // Twilio/Exotel barge-in signal — drop any pending outbound TTS frames.
        this.processing = false;
        return;
    }
  }

  /**
   * On 'start', try to recover our internal callId. Twilio passes it via the
   * <Stream> query string (already in this.callId). Exotel Voicebot Applet
   * does NOT forward query params reliably — we fall back to mapping the
   * provider's call_sid (stored at dial-time) to our internal callId, then
   * also check custom_parameters payload for a direct callId.
   */
  bindCallIdFromStart(msg) {
    const start = msg.start || {};
    const provCallSid = start.callSid || start.call_sid;
    const customParams =
      start.customParameters || start.custom_parameters || start.custom_param || {};

    if (!this.callId || /^unknown-/.test(this.callId)) {
      // 1) Try custom parameter passed via <Parameter name="callId" .../>
      const fromParam = customParams.callId || customParams.call_id;
      if (fromParam) this.callId = String(fromParam);
      // 2) Try sid-mapping populated at dial time
      else if (provCallSid) {
        const mapped = getCallIdBySid(provCallSid);
        if (mapped) this.callId = mapped;
        else this.callId = `provider-${provCallSid}`;
      } else {
        this.callId = `unknown-${Date.now()}`;
      }
    }
    // Refresh meta now that we know who we are
    const m = getCallMeta(this.callId);
    if (m) this.meta = m;
    this.systemPrompt = this.buildSystemPrompt();
  }

  detectProtocol(msg) {
    // Twilio: msg.start.streamSid + mediaFormat.encoding="audio/x-mulaw"
    // Exotel: msg.start.stream_sid + media_format.encoding="audio/x-raw" or "base64" with bit-depth=16 (slin)
    const start = msg.start || {};
    this.streamSid = start.streamSid || start.stream_sid || msg.streamSid || msg.stream_sid || null;

    const fmt = start.mediaFormat || start.media_format || {};
    const encRaw = String(fmt.encoding || '').toLowerCase();
    const sampleRate = parseInt(fmt.sample_rate || fmt.sampleRate || 8000, 10) || 8000;

    if (encRaw.includes('mulaw') || encRaw.includes('ulaw')) {
      this.provider = 'twilio';
      this.inEncoding = 'mulaw';
      this.outEncoding = 'mulaw';
    } else {
      // Exotel Voicebot defaults to 16-bit signed PCM (slin) at 8kHz, base64-wrapped.
      this.provider = 'exotel';
      this.inEncoding = 'pcm16';
      this.outEncoding = 'pcm16';
    }
    this.inSampleRate  = sampleRate;
    this.outSampleRate = sampleRate;
  }

  // Convert any inbound media frame to PCM16 8kHz before VAD/STT
  toPcm16_8k(frame) {
    let pcm = this.inEncoding === 'mulaw' ? muLawToPcm16(frame) : frame;
    if (this.inSampleRate !== 8000) pcm = resamplePcm16(pcm, this.inSampleRate, 8000);
    return pcm;
  }

  handleAudioFrame(rawFrame) {
    const pcm = this.toPcm16_8k(rawFrame);
    const energy = pcm16Energy(pcm);
    const isSilent = energy < SILENCE_ENERGY;
    const frameMs = (pcm.length / 2 / 8000) * 1000;

    // Wait for first non-silent frame before opening a turn
    if (this.pcmChunks.length === 0 && isSilent) return;

    this.pcmChunks.push(pcm);
    this.pcmBytes += pcm.length;
    this.turnMs   += frameMs;

    if (isSilent) this.silentMs += frameMs;
    else { this.silentMs = 0; this.speechMs += frameMs; }

    if (
      (this.silentMs >= SILENCE_MS_END && this.speechMs >= MIN_SPEECH_MS) ||
      this.turnMs >= MAX_TURN_MS
    ) {
      const utterance = Buffer.concat(this.pcmChunks);
      this.pcmChunks = []; this.pcmBytes = 0;
      this.silentMs = 0; this.speechMs = 0; this.turnMs = 0;
      this.processTurn(utterance);
    }
  }

  async processTurn(pcm8k) {
    this.processing = true;
    try {
      const wav = pcm16ToWav(pcm8k, 8000);

      let userText = '';
      try {
        const { transcript } = await stt(wav, {
          languageCode: this.langCode(),
          model: getSettingsSync().sarvamSttModel || 'saarika:v2.5',
        });
        userText = (transcript || '').trim();
      } catch (e) {
        const body = e.response?.data ? JSON.stringify(e.response.data).slice(0, 500) : '';
        logger.warn(`[sarvam-stream] STT failed call=${this.callId}: ${e.message} body=${body}`);
      }

      if (!userText) { this.processing = false; return; }

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
      reply = (reply || '').trim() || 'மன்னிக்கவும், கேட்கவில்லை. திரும்ப சொல்ல முடியுமா?';

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
    const targetSr = this.outSampleRate || 8000;

    let wav;
    try {
      wav = await tts(text, { speaker, model: ttsModel, languageCode: lang, sampleRate: targetSr });
    } catch (e) {
      const body = e.response?.data ? JSON.stringify(e.response.data).slice(0, 500) : '';
      logger.warn(`[sarvam-stream] TTS failed call=${this.callId} speaker=${speaker} model=${ttsModel} lang=${lang} sr=${targetSr}: ${e.message} body=${body}`);
      return;
    }

    const { pcm, sampleRate } = wavToPcm16(wav);
    const pcmTarget = sampleRate === targetSr ? pcm : resamplePcm16(pcm, sampleRate, targetSr);

    // Frame size: FRAME_MS of audio at targetSr
    const samplesPerFrame = (targetSr * FRAME_MS) / 1000;          // e.g. 160 @ 8kHz, 20ms
    const bytesPerFrameOut = this.outEncoding === 'mulaw' ? samplesPerFrame : samplesPerFrame * 2;
    const pcmBytesPerFrame = samplesPerFrame * 2;

    for (let i = 0; i < pcmTarget.length && !this.closed; i += pcmBytesPerFrame) {
      const slicePcm = pcmTarget.slice(i, i + pcmBytesPerFrame);
      const padded   = slicePcm.length === pcmBytesPerFrame
        ? slicePcm
        : Buffer.concat([slicePcm, Buffer.alloc(pcmBytesPerFrame - slicePcm.length, 0)]);
      const frame = this.outEncoding === 'mulaw' ? pcm16ToMuLaw(padded) : padded;
      // Final safety pad to bytesPerFrameOut
      const out = frame.length === bytesPerFrameOut
        ? frame
        : Buffer.concat([frame, Buffer.alloc(Math.max(0, bytesPerFrameOut - frame.length), this.outEncoding === 'mulaw' ? 0xff : 0)]);
      this.sendMedia(out);
      await sleep(FRAME_MS);
    }
    this.sendMark('end-of-utterance');
  }

  sendMedia(audioFrame) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const payload = audioFrame.toString('base64');
    const msg = this.provider === 'exotel'
      ? {
          event: 'media',
          stream_sid: this.streamSid || undefined,
          media: { payload },
        }
      : {
          event: 'media',
          streamSid: this.streamSid || undefined,
          media: { payload },
        };
    this.ws.send(JSON.stringify(msg));
  }

  sendMark(name) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const msg = this.provider === 'exotel'
      ? { event: 'mark', stream_sid: this.streamSid || undefined, mark: { name } }
      : { event: 'mark', streamSid: this.streamSid || undefined, mark: { name } };
    try { this.ws.send(JSON.stringify(msg)); } catch {}
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { init, getWss };
