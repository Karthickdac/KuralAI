/**
 * Thin Sarvam.ai REST client — STT, Chat, TTS.
 * Reads API key from settings or env (SARVAM_API_KEY).
 */

const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');
const { getSettingsSync } = require('./settingsService');

const SARVAM_BASE = 'https://api.sarvam.ai';

function getKey() {
  const s = getSettingsSync();
  return s.sarvamApiKey || process.env.SARVAM_API_KEY || '';
}

function authHeaders(extra = {}) {
  const key = getKey();
  if (!key) throw new Error('Sarvam API key not configured (set sarvamApiKey in Settings)');
  return { 'api-subscription-key': key, ...extra };
}

/**
 * Speech-to-Text. Accepts a WAV buffer.
 * Returns { transcript, languageCode }.
 */
async function stt(wavBuffer, { languageCode = 'ta-IN', model = 'saarika:v2.5' } = {}) {
  const fd = new FormData();
  fd.append('file', wavBuffer, { filename: 'turn.wav', contentType: 'audio/wav' });
  fd.append('model', model);
  fd.append('language_code', languageCode);

  const resp = await axios.post(`${SARVAM_BASE}/speech-to-text`, fd, {
    headers: authHeaders(fd.getHeaders()),
    timeout: 20000,
    maxBodyLength: Infinity,
  });
  const data = resp.data || {};
  return {
    transcript: data.transcript || '',
    languageCode: data.language_code || languageCode,
  };
}

/**
 * Chat completion (OpenAI-compatible).
 * messages = [{role:'system'|'user'|'assistant', content:'...'}]
 */
async function chat(messages, { model = 'sarvam-m', temperature = 0.4, maxTokens = 800 } = {}) {
  const resp = await axios.post(
    `${SARVAM_BASE}/v1/chat/completions`,
    {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: 'low',
    },
    {
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      timeout: 25000,
    }
  );
  const choice = resp.data?.choices?.[0]?.message?.content || '';
  return choice.trim();
}

/**
 * Text-to-Speech. Returns a PCM16 mono WAV Buffer at the requested sample rate.
 */
async function tts(text, {
  languageCode = 'ta-IN',
  speaker = 'meera',
  model = 'bulbul:v2',
  sampleRate = 8000,
  pitch = 0,
  pace = 1.0,
  loudness = 1.0,
} = {}) {
  // Sarvam TTS has a per-input length cap (~500 chars). Chunk if needed.
  const chunks = chunkText(text, 480);
  const audios = [];
  // bulbul:v3 (and v3-beta) do NOT accept pitch/loudness — Sarvam returns 400.
  const isV3 = /^bulbul:v3/i.test(model);
  for (const chunk of chunks) {
    const payload = {
      inputs: [chunk],
      target_language_code: languageCode,
      speaker,
      model,
      speech_sample_rate: sampleRate,
      pace,
      enable_preprocessing: true,
    };
    if (!isV3) {
      payload.pitch = pitch;
      payload.loudness = loudness;
    }
    const resp = await axios.post(
      `${SARVAM_BASE}/text-to-speech`,
      payload,
      {
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        timeout: 30000,
      }
    );
    const b64 = resp.data?.audios?.[0];
    if (b64) audios.push(Buffer.from(b64, 'base64'));
  }
  if (!audios.length) throw new Error('Sarvam TTS returned no audio');
  return concatWav(audios);
}

function chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const out = [];
  const sentences = text.split(/(?<=[.!?।。!?])\s+/);
  let buf = '';
  for (const s of sentences) {
    if ((buf + ' ' + s).trim().length > maxLen && buf) {
      out.push(buf.trim());
      buf = s;
    } else {
      buf = (buf + ' ' + s).trim();
    }
  }
  if (buf) out.push(buf);
  return out;
}

// Concatenate multiple WAV buffers (assumes identical format) by stitching the data chunks.
function concatWav(wavs) {
  if (wavs.length === 1) return wavs[0];
  const { wavToPcm16, pcm16ToWav } = require('../utils/audioCodec');
  let sampleRate = 8000;
  const pcms = wavs.map(w => {
    const { pcm, sampleRate: sr } = wavToPcm16(w);
    sampleRate = sr;
    return pcm;
  });
  return pcm16ToWav(Buffer.concat(pcms), sampleRate);
}

module.exports = { stt, chat, tts };
