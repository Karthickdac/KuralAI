/**
 * Local engine Conversation Stream — telephony-agnostic.
 *
 * Mirrors sarvamStream.js but sources STT/LLM/TTS from the self-hosted
 * inference server (src/services/localApi.js). Per-turn fallback to Sarvam (or
 * any engine listed in settings.engineFallbackChain) is automatic when a
 * request to the inference server fails.
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { getSettingsSync } = require('./settingsService');
const { getCallMeta, forgetCallMeta, hasCall, getCallIdBySid } = require('./localSessionStore');
const localApi = require('./localApi');
const agentsService = (() => { try { return require('./agentsService'); } catch { return null; } })();
const sarvamApi = (() => { try { return require('./sarvamApi'); } catch { return null; } })();
const {
  muLawToPcm16,
  pcm16ToMuLaw,
  pcm16ToWav,
  wavToPcm16,
  resamplePcm16,
  pcm16Energy,
} = require('../utils/audioCodec');
const Transcript = (() => { try { return require('../models/Transcript'); } catch { return null; } })();

const SILENCE_ENERGY     = 350;
const SILENCE_MS_END     = 700;
const MIN_SPEECH_MS      = 200;
const MAX_TURN_MS        = 15000;
const FRAME_MS           = 20;

let _wss = null;
function getWss() { return _wss; }

// In-flight session counter (used by /local-health to expose concurrent call
// count for ops dashboards).
let _activeSessions = 0;
function activeCallCount() { return _activeSessions; }

function init(server) {
  const wss = new WebSocket.Server({ noServer: true });
  _wss = wss;

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const queryCallId = url.searchParams.get('callId') || '';
    const wt          = url.searchParams.get('wt') || '';
    const s           = getSettingsSync();
    const expected    = s.webhookToken || s.exotelWebhookToken || process.env.EXOTEL_WEBHOOK_TOKEN || 'kuralai-wh';

    const session = new Session(ws, queryCallId);
    session.expectedWt = expected;
    session.wtVerified = wt && wt === expected;
    if (!session.wtVerified) {
      logger.warn(`[local-stream] no wt in query (callId=${queryCallId || 'n/a'}) — deferring auth to start message`);
    }
    _activeSessions++;
    const dec = () => { _activeSessions = Math.max(0, _activeSessions - 1); };
    ws.once('close', dec);
    session.start().catch(err => {
      logger.error(`[local-stream] session error call=${session.callId}: ${err.message}`);
      try { ws.close(); } catch {}
    });
  });

  logger.info('🎙️  Local Inference Media Stream WS ready at /local-stream (Twilio + Exotel auto-detect)');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Session {
  constructor(ws, callId) {
    this.ws        = ws;
    this.callId    = callId || `unknown-${Date.now()}`;
    this.streamSid = null;
    this.meta      = getCallMeta(callId) || {};
    this.history   = [];

    // Multi-agent — resolve persona by meta.agentId (or fall back to default
    // agent). Agent fields populate meta so existing meta-driven code paths
    // (voice override, system prompt, greeting) work unchanged.
    this.agent = this.resolveAgent();
    this.applyAgentToMeta();

    this.pcmChunks = [];
    this.pcmBytes  = 0;
    this.silentMs  = 0;
    this.speechMs  = 0;
    this.turnMs    = 0;

    this.processing = false;
    this.closed     = false;

    this.provider     = 'twilio';
    this.inEncoding   = 'mulaw';
    this.inSampleRate = 8000;
    this.outEncoding  = 'mulaw';
    this.outSampleRate = 8000;

    this.systemPrompt = this.buildSystemPrompt();
  }

  resolveAgent() {
    if (!agentsService) return null;
    try {
      const id = this.meta?.agentId;
      return id ? (agentsService.get(id) || agentsService.getDefault()) : agentsService.getDefault();
    } catch { return null; }
  }

  applyAgentToMeta() {
    const a = this.agent;
    if (!a) return;
    const m = this.meta = { ...this.meta };
    if (!m.localTtsVoice && a.voice)             m.localTtsVoice = a.voice;
    if (!m.localVoiceDescription && a.voiceDescription) m.localVoiceDescription = a.voiceDescription;
    if (!m.localGreeting && a.greeting)          m.localGreeting = a.greeting;
    if (!m.localSystemPrompt && a.systemPrompt)  m.localSystemPrompt = a.systemPrompt;
    if (!m.languageCode && a.language)           m.languageCode = a.language;
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

    // Per-call (agent-resolved) system prompt wins over global settings.
    const customPrompt = (meta.localSystemPrompt || s.localSystemPrompt || s.sarvamSystemPrompt || '').trim();

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
      `- பதில்கள் சுருக்கமாக, 1-2 வாக்கியங்களில், இயற்கையான உரையாடல் தொனியில்.`,
      `- கேள்விக்கு பதிலறியாதபோது, "நான் உறுதிப்படுத்தி திரும்ப அழைக்கிறேன்" என்று சொல்லுங்கள்.`,
      `- உரையாடல் முடிந்தால் "நன்றி, வணக்கம்" என்று கூறி முடிக்கவும்.`,
    ].filter(Boolean).join('\n');
  }

  async start() {
    this.ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      this.handleProviderMsg(msg).catch(err =>
        logger.error(`[local-stream] handler error call=${this.callId}: ${err.message}`)
      );
    });
    this.ws.on('close', () => this.cleanup());
    this.ws.on('error', (err) => logger.warn(`[local-stream] ws error call=${this.callId}: ${err.message}`));
  }

  async handleProviderMsg(msg) {
    switch (msg.event) {
      case 'connected': return;
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
          } else if (callKnown) {
            this.wtVerified = true;
          } else {
            logger.warn(`[local-stream] auth failed on start for call=${this.callId}, closing`);
            try { this.ws.close(4003, 'unauthorized'); } catch {}
            this.cleanup();
            return;
          }
        }
        logger.info(`[local-stream] START call=${this.callId} provider=${this.provider} stream=${this.streamSid} in=${this.inEncoding}@${this.inSampleRate}Hz`);
        await this.speakGreeting();
        return;
      case 'media':
        if (this.processing) return;
        this.handleAudioFrame(Buffer.from(msg.media.payload, 'base64'));
        return;
      case 'dtmf': return;
      case 'stop':
        logger.info(`[local-stream] STOP call=${this.callId}`);
        this.cleanup();
        return;
      case 'mark': return;
      case 'clear':
        this.processing = false;
        return;
    }
  }

  bindCallIdFromStart(msg) {
    const start = msg.start || {};
    const provCallSid = start.callSid || start.call_sid;
    const customParams = start.customParameters || start.custom_parameters || start.custom_param || {};
    if (!this.callId || /^unknown-/.test(this.callId)) {
      const fromParam = customParams.callId || customParams.call_id;
      if (fromParam) this.callId = String(fromParam);
      else if (provCallSid) {
        const mapped = getCallIdBySid(provCallSid);
        this.callId = mapped || `provider-${provCallSid}`;
      } else {
        this.callId = `unknown-${Date.now()}`;
      }
    }
    const m = getCallMeta(this.callId);
    if (m) this.meta = m;
    this.systemPrompt = this.buildSystemPrompt();
  }

  detectProtocol(msg) {
    const start = msg.start || {};
    this.streamSid = start.streamSid || start.stream_sid || msg.streamSid || msg.stream_sid || null;
    const fmt = start.mediaFormat || start.media_format || {};
    const encRaw = String(fmt.encoding || '').toLowerCase();
    const sampleRate = parseInt(fmt.sample_rate || fmt.sampleRate || 8000, 10) || 8000;
    if (encRaw.includes('mulaw') || encRaw.includes('ulaw')) {
      this.provider = 'twilio';
      this.inEncoding = 'mulaw'; this.outEncoding = 'mulaw';
    } else {
      this.provider = 'exotel';
      this.inEncoding = 'pcm16'; this.outEncoding = 'pcm16';
    }
    this.inSampleRate  = sampleRate;
    this.outSampleRate = sampleRate;
  }

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
    // Barge-in — if the agent is currently speaking and the caller starts
    // speaking, mark the session so the TTS streamer aborts mid-utterance.
    if (!isSilent && this.speaking) {
      this.barge = true;
    }
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

  // ─── Engine fallback chain ─────────────────────────────────────────────────
  // Per-agent override wins over the global default. Agents can declare their
  // own chain (e.g. premium agents → 'local,elevenlabs', cheap agents →
  // 'local'); falls back to settings.engineFallbackChain, then 'local,sarvam'.
  fallbackChain() {
    const s = getSettingsSync();
    const fromAgent = this.agent && (this.agent.engineFallbackChain || this.agent.fallbackChain);
    const raw = (fromAgent || s.engineFallbackChain || 'local,sarvam').toString();
    return raw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  }

  async sttWithFallback(wav) {
    for (const eng of this.fallbackChain()) {
      try {
        if (eng === 'local')  return await localApi.stt(wav, { languageCode: this.langCode() });
        if (eng === 'sarvam' && sarvamApi) return await sarvamApi.stt(wav, { languageCode: this.langCode() });
      } catch (e) {
        logger.warn(`[local-stream] STT engine=${eng} failed call=${this.callId}: ${e.message}`);
      }
    }
    return { transcript: '' };
  }

  async chatWithFallback(messages) {
    for (const eng of this.fallbackChain()) {
      try {
        if (eng === 'local')  return await localApi.chat(messages);
        if (eng === 'sarvam' && sarvamApi) return await sarvamApi.chat(messages);
      } catch (e) {
        logger.warn(`[local-stream] chat engine=${eng} failed call=${this.callId}: ${e.message}`);
      }
    }
    return 'மன்னிக்கவும், ஒரு சிறிய தொழில்நுட்பக் கோளாறு. திரும்ப சொல்ல முடியுமா?';
  }

  /**
   * Streamed chat — yields completed sentences as the LLM produces tokens, so
   * TTS for the first sentence starts before the LLM has finished generating
   * the rest. Falls back to non-streaming chat if streaming fails.
   *
   * onSentence is called once per finished sentence with the sentence text;
   * the returned promise resolves to the full reply string.
   */
  async chatStreamSentences(messages, onSentence) {
    // Sentence boundary: '.', '!', '?' or Tamil danda '।' '॥' or newline.
    const SENT_RE = /[.!?।॥\n]+/;
    let buffer = '';
    let full   = '';
    try {
      const reply = await localApi.chatStream(messages, {
        onToken: async (tok) => {
          if (this.barge) return; // user started talking; abandon
          buffer += tok;
          full   += tok;
          while (true) {
            const m = buffer.match(SENT_RE);
            if (!m) break;
            const idx = m.index + m[0].length;
            const sentence = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx);
            if (sentence) { try { await onSentence(sentence); } catch {} }
          }
        },
      });
      // Flush any trailing fragment as the final sentence.
      const tail = (buffer || '').trim();
      if (tail && !this.barge) { try { await onSentence(tail); } catch {} }
      return reply || full;
    } catch (e) {
      logger.warn(`[local-stream] chat stream failed call=${this.callId}: ${e.message} — falling back to non-stream`);
      const reply = await this.chatWithFallback(messages);
      if (reply && !this.barge) { try { await onSentence(reply); } catch {} }
      return reply;
    }
  }

  async ttsWithFallback(text, targetSr) {
    const lang = this.langCode();
    // Per-call voice + style overrides (campaigns/customers can carry their own).
    const meta = this.meta || {};
    const overrideVoice       = meta.localTtsVoice || meta.voiceId || null;
    const overrideDescription = meta.localVoiceDescription || meta.voiceDescription || null;
    for (const eng of this.fallbackChain()) {
      try {
        if (eng === 'local') {
          const pcm = await localApi.tts(text, {
            languageCode: lang,
            sampleRate: targetSr,
            voice: overrideVoice || undefined,
            description: overrideDescription || undefined,
          });
          return { pcm, sampleRate: targetSr };
        }
        if (eng === 'sarvam' && sarvamApi) {
          const s = getSettingsSync();
          const wav = await sarvamApi.tts(text, {
            speaker: s.sarvamVoice || 'meera',
            model:   s.sarvamTtsModel || 'bulbul:v2',
            languageCode: lang,
            sampleRate: targetSr,
          });
          return wavToPcm16(wav);
        }
      } catch (e) {
        logger.warn(`[local-stream] TTS engine=${eng} failed call=${this.callId}: ${e.message}`);
      }
    }
    return null;
  }

  async processTurn(pcm8k) {
    this.processing = true;
    try {
      const wav = pcm16ToWav(pcm8k, 8000);
      let userText = '';
      try {
        const r = await this.sttWithFallback(wav);
        userText = (r.transcript || '').trim();
      } catch (e) { logger.warn(`[local-stream] STT chain failed: ${e.message}`); }
      if (!userText) { this.processing = false; return; }

      logger.info(`[local-stream] ${this.callId} USER: ${userText}`);
      this.history.push({ role: 'user', content: userText });
      this.persistTranscript('user', userText).catch(() => {});

      const sysPrompt = (this.systemPrompt || '').trim();
      const msgs = [];
      if (sysPrompt) msgs.push({ role: 'system', content: sysPrompt });
      msgs.push(...this.history.slice(-12));

      // Streamed: synth + send TTS sentence-by-sentence as the LLM produces
      // them. First-audio latency drops from "wait for full reply" to "wait
      // for first sentence boundary" — typically <500ms after STT returns.
      this.barge = false;
      let reply = '';
      try {
        reply = await this.chatStreamSentences(msgs, async (sentence) => {
          if (this.barge || this.closed) return;
          await this.speak(sentence);
        });
      } catch (e) {
        logger.warn(`[local-stream] streamed chat failed: ${e.message}`);
      }
      reply = (reply || '').trim() || 'மன்னிக்கவும், கேட்கவில்லை. திரும்ப சொல்ல முடியுமா?';

      logger.info(`[local-stream] ${this.callId} BOT : ${reply}`);
      this.history.push({ role: 'assistant', content: reply });
      this.persistTranscript('assistant', reply).catch(() => {});
    } finally {
      this.processing = false;
      this.barge = false;
    }
  }

  async speakGreeting() {
    const s = getSettingsSync();
    const meta = this.meta || {};
    const customerName = meta.customerName || 'வாடிக்கையாளர்';
    const rawGreeting = (meta.localGreeting || s.localGreeting || s.sarvamGreeting || '').trim();
    const greeting = (rawGreeting || `வணக்கம் ${customerName}, நான் சமுத்ரா. ${s.companyName || 'Automystics'} சார்பாக அழைக்கிறேன். உங்களுக்கு பேச நேரம் இருக்கிறதா?`)
      .replace(/\{\{\s*customer_name\s*\}\}/gi, customerName)
      .replace(/\{\{\s*company_name\s*\}\}/gi, s.companyName || 'Automystics');
    this.history.push({ role: 'assistant', content: greeting });
    this.persistTranscript('assistant', greeting).catch(() => {});
    await this.speak(greeting);
  }

  async speak(text) {
    const targetSr = this.outSampleRate || 8000;
    const result = await this.ttsWithFallback(text, targetSr);
    if (!result) return;
    const { pcm, sampleRate } = result;
    const pcmTarget = sampleRate === targetSr ? pcm : resamplePcm16(pcm, sampleRate, targetSr);

    const samplesPerFrame  = (targetSr * FRAME_MS) / 1000;
    const bytesPerFrameOut = this.outEncoding === 'mulaw' ? samplesPerFrame : samplesPerFrame * 2;
    const pcmBytesPerFrame = samplesPerFrame * 2;

    this.speaking = true;
    for (let i = 0; i < pcmTarget.length && !this.closed && !this.barge; i += pcmBytesPerFrame) {
      const slicePcm = pcmTarget.slice(i, i + pcmBytesPerFrame);
      const padded   = slicePcm.length === pcmBytesPerFrame
        ? slicePcm
        : Buffer.concat([slicePcm, Buffer.alloc(pcmBytesPerFrame - slicePcm.length, 0)]);
      const frame = this.outEncoding === 'mulaw' ? pcm16ToMuLaw(padded) : padded;
      const out = frame.length === bytesPerFrameOut
        ? frame
        : Buffer.concat([frame, Buffer.alloc(Math.max(0, bytesPerFrameOut - frame.length), this.outEncoding === 'mulaw' ? 0xff : 0)]);
      this.sendMedia(out);
      await sleep(FRAME_MS);
    }
    this.speaking = false;
    if (this.barge) {
      // Tell provider to drop any audio still in its outbound buffer so the
      // caller experiences true barge-in and not "AI keeps talking after I
      // started speaking".
      try {
        const clear = this.provider === 'exotel'
          ? { event: 'clear', stream_sid: this.streamSid || undefined }
          : { event: 'clear', streamSid:  this.streamSid || undefined };
        if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(clear));
      } catch {}
    }
    this.sendMark('end-of-utterance');
  }

  sendMedia(audioFrame) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const payload = audioFrame.toString('base64');
    const msg = this.provider === 'exotel'
      ? { event: 'media', stream_sid: this.streamSid || undefined, media: { payload } }
      : { event: 'media', streamSid:  this.streamSid || undefined, media: { payload } };
    this.ws.send(JSON.stringify(msg));
  }

  sendMark(name) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const msg = this.provider === 'exotel'
      ? { event: 'mark', stream_sid: this.streamSid || undefined, mark: { name } }
      : { event: 'mark', streamSid:  this.streamSid || undefined, mark: { name } };
    try { this.ws.send(JSON.stringify(msg)); } catch {}
  }

  langCode() {
    return getSettingsSync().localLanguageCode || getSettingsSync().sarvamLanguageCode || 'ta-IN';
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

module.exports = { init, getWss, activeCallCount };
