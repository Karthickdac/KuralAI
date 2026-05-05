/**
 * KuralAI Local Inference HTTP/SSE client.
 *
 * Talks to the self-hosted GPU box (inference-server/) over HTTP. Endpoints:
 *   GET  /health         — readiness + per-engine state
 *   POST /stt            — multipart audio in, transcript JSON out
 *   POST /llm/chat       — JSON in, SSE stream of tokens out
 *   POST /tts            — JSON in, raw PCM16 mono bytes out
 *
 * All calls read base URL + bearer token from settings (`localInferenceUrl`,
 * `localInferenceToken`). Falls back to env (LOCAL_INFERENCE_URL / TOKEN) for
 * CLI use.
 */

const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');
const { getSettingsSync } = require('./settingsService');

function cfg() {
  const s = getSettingsSync();
  const baseUrl = (s.localInferenceUrl || process.env.LOCAL_INFERENCE_URL || '').replace(/\/$/, '');
  const token   =  s.localInferenceToken || process.env.LOCAL_INFERENCE_TOKEN || '';
  return { baseUrl, token };
}

function authHeaders(extra = {}) {
  const { token } = cfg();
  const h = { ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function isConfigured() {
  return !!cfg().baseUrl;
}

/**
 * Probe the inference server. Returns { ok, ready, engines, error }.
 * Cached for 10s to make it cheap to call from the dispatcher hot path.
 */
let _healthCache = { ts: 0, value: null };
async function health({ force = false, timeoutMs = 4000 } = {}) {
  const { baseUrl } = cfg();
  if (!baseUrl) return { ok: false, ready: false, error: 'localInferenceUrl not configured' };
  if (!force && _healthCache.value && (Date.now() - _healthCache.ts) < 10_000) {
    return _healthCache.value;
  }
  try {
    const resp = await axios.get(`${baseUrl}/health`, {
      headers: authHeaders(),
      timeout: timeoutMs,
      validateStatus: () => true,
    });
    const data = resp.data || {};
    const value = {
      ok: resp.status >= 200 && resp.status < 500,
      ready: resp.status === 200 && data.ready === true,
      status: resp.status,
      engines: data.engines || {},
      uptimeSeconds: data.uptime_seconds || 0,
    };
    _healthCache = { ts: Date.now(), value };
    return value;
  } catch (e) {
    const value = { ok: false, ready: false, error: e.message };
    _healthCache = { ts: Date.now(), value };
    return value;
  }
}

/**
 * Speech-to-text. Accepts a WAV buffer, returns { transcript, languageCode }.
 */
async function stt(wavBuffer, { languageCode = 'ta-IN', model } = {}) {
  const { baseUrl } = cfg();
  if (!baseUrl) throw new Error('Local inference URL not configured');

  const s = getSettingsSync();
  const sttModel = model || s.localSttModel || 'whisper-large-v3';

  const fd = new FormData();
  fd.append('file', wavBuffer, { filename: 'turn.wav', contentType: 'audio/wav' });
  fd.append('model', sttModel);
  fd.append('language', (languageCode || 'auto').split('-')[0]); // ta-IN → ta

  const resp = await axios.post(`${baseUrl}/stt`, fd, {
    headers: authHeaders(fd.getHeaders()),
    timeout: 30_000,
    maxBodyLength: Infinity,
  });
  return {
    transcript:    resp.data?.transcript || '',
    languageCode:  resp.data?.language || languageCode,
    durationMs:    resp.data?.duration_ms || 0,
  };
}

/**
 * Streaming chat. Calls onToken for each delta as it arrives. Returns the full
 * concatenated reply when the stream finishes.
 *
 * The inference server sends SSE in the form `data: <token>\n\n` and `data:
 * [DONE]\n\n` to terminate.
 */
async function chatStream(messages, { model, temperature = 0.4, maxTokens = 256, onToken } = {}) {
  const { baseUrl } = cfg();
  if (!baseUrl) throw new Error('Local inference URL not configured');
  const s = getSettingsSync();
  const llmModel = model || s.localLlmModel || 'qwen2.5:7b-instruct';

  const resp = await axios.post(
    `${baseUrl}/llm/chat`,
    { messages, model: llmModel, temperature, max_tokens: maxTokens },
    {
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
      timeout: 60_000,
      responseType: 'stream',
    }
  );

  return new Promise((resolve, reject) => {
    let full = '';
    let buf = '';
    resp.data.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const evt = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const m = evt.match(/^data:\s?(.*)$/m);
        if (!m) continue;
        const payload = m[1];
        if (payload === '[DONE]') return; // stream end will fire 'end'
        full += payload;
        if (onToken) try { onToken(payload, full); } catch {}
      }
    });
    resp.data.on('end',   () => resolve(full));
    resp.data.on('error', (e) => reject(e));
  });
}

/**
 * Non-streaming chat convenience wrapper.
 */
async function chat(messages, opts = {}) {
  return chatStream(messages, opts);
}

/**
 * Text-to-speech. Returns a PCM16 mono Buffer at the requested sample rate
 * (default 8 kHz so it can stream straight into Twilio Media Streams).
 */
async function tts(text, { voice, languageCode = 'ta-IN', model, sampleRate = 8000, description } = {}) {
  const { baseUrl } = cfg();
  if (!baseUrl) throw new Error('Local inference URL not configured');
  const s = getSettingsSync();
  const ttsVoice = voice || s.localTtsVoice  || 'samuthra-female-tamil';
  const ttsModel = model || s.localTtsModel  || 'indic-parler-tts';
  // Style description (Parler-TTS): explicit param > settings global default.
  const ttsDescription = description ?? s.localVoiceDescription ?? null;

  const resp = await axios.post(
    `${baseUrl}/tts`,
    {
      text,
      voice: ttsVoice,
      language: (languageCode || 'ta-IN').split('-')[0],
      model: ttsModel,
      sample_rate: sampleRate,
      description: ttsDescription,
    },
    {
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      timeout: 60_000,
      responseType: 'arraybuffer',
    }
  );
  return Buffer.from(resp.data);
}

/**
 * List voices available on the inference server (built-in + user-cloned).
 * Each voice has { id, displayName, language, gender, durationSeconds, ... }.
 */
async function listVoices() {
  const { baseUrl } = cfg();
  if (!baseUrl) return [];
  const resp = await axios.get(`${baseUrl}/voices`, {
    headers: authHeaders(),
    timeout: 8000,
    validateStatus: () => true,
  });
  if (resp.status !== 200) return [];
  return resp.data?.voices || [];
}

/**
 * Clone a voice. Uploads a reference WAV (6–10 s clean speech recommended) and
 * registers it under `voiceId`. Returns the saved voice metadata.
 */
async function cloneVoice({ voiceId, wavBuffer, displayName = '', language = 'ta', gender = 'unknown' }) {
  const { baseUrl } = cfg();
  if (!baseUrl) throw new Error('Local inference URL not configured');
  if (!wavBuffer || !wavBuffer.length) throw new Error('Reference audio is empty');

  const fd = new FormData();
  fd.append('file', wavBuffer, { filename: `${voiceId}.wav`, contentType: 'audio/wav' });
  fd.append('voice_id', voiceId);
  fd.append('display_name', displayName);
  fd.append('language', language);
  fd.append('gender', gender);

  const resp = await axios.post(`${baseUrl}/voices`, fd, {
    headers: authHeaders(fd.getHeaders()),
    timeout: 60_000,
    maxBodyLength: Infinity,
  });
  return resp.data?.voice || null;
}

async function deleteVoice(voiceId) {
  const { baseUrl } = cfg();
  if (!baseUrl) throw new Error('Local inference URL not configured');
  await axios.delete(`${baseUrl}/voices/${encodeURIComponent(voiceId)}`, {
    headers: authHeaders(),
    timeout: 10_000,
  });
  return { deleted: voiceId };
}

/**
 * Generate a short audio preview as a playable WAV (includes header) so the
 * dashboard can audition voices via an <audio> tag.
 */
async function previewVoice({ text, voice, languageCode = 'ta-IN', model, sampleRate = 22050 }) {
  const { baseUrl } = cfg();
  if (!baseUrl) throw new Error('Local inference URL not configured');
  const s = getSettingsSync();
  const ttsModel = model || s.localTtsModel || 'xtts-v2';
  const resp = await axios.post(
    `${baseUrl}/tts/preview`,
    {
      text,
      voice,
      language: (languageCode || 'ta-IN').split('-')[0],
      model: ttsModel,
      sample_rate: sampleRate,
    },
    {
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      timeout: 60_000,
      responseType: 'arraybuffer',
    }
  );
  return Buffer.from(resp.data);
}

module.exports = {
  isConfigured, health,
  stt, chat, chatStream, tts,
  listVoices, cloneVoice, deleteVoice, previewVoice,
};
