/**
 * Speech Service
 * Speech-to-Text: OpenAI Whisper (Tamil-accurate)
 * Text-to-Speech: Azure Neural TTS (Tamil Neural Voice) OR ElevenLabs multilingual
 */

const OpenAI = require('openai');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { uploadAudioToS3, getSignedUrl } = require('./s3Service');

// ─── Local audio temp dir (fallback when S3 not configured) ───────────────────
const LOCAL_AUDIO_DIR = path.join('/tmp', 'kuralai-audio');
if (!fs.existsSync(LOCAL_AUDIO_DIR)) fs.mkdirSync(LOCAL_AUDIO_DIR, { recursive: true });

function isS3Configured() {
  try {
    const sf = path.join(__dirname, '../../config/app-settings.json');
    if (fs.existsSync(sf)) {
      const s = JSON.parse(fs.readFileSync(sf, 'utf-8'));
      if (s.awsAccessKeyId && s.awsSecretAccessKey && s.s3BucketName) return true;
    }
  } catch {}
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET_NAME);
}

async function storeAudioLocally(audioBuffer, filename) {
  const filePath = path.join(LOCAL_AUDIO_DIR, filename);
  fs.writeFileSync(filePath, audioBuffer);
  // Schedule cleanup after 2 hours
  setTimeout(() => fs.unlink(filePath, () => {}), 2 * 60 * 60 * 1000);

  let appUrl = process.env.APP_URL || '';
  try {
    const sf = path.join(__dirname, '../../config/app-settings.json');
    if (fs.existsSync(sf)) {
      const s = JSON.parse(fs.readFileSync(sf, 'utf-8'));
      if (s.appUrl) appUrl = s.appUrl;
    }
  } catch {}
  appUrl = appUrl.replace(/\/$/, '');
  const playableUrl = `${appUrl}/audio/${filename}`;
  return { localPath: filePath, playableUrl };
}

const SETTINGS_FILE_STT = path.join(__dirname, '../../config/app-settings.json');

function readAppSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE_STT)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE_STT, 'utf-8'));
    }
  } catch {}
  return {};
}

function getTtsProvider() {
  const s = readAppSettings();
  return s.ttsProvider || process.env.TTS_PROVIDER || 'azure';
}

function getElevenLabsConfig() {
  const s = readAppSettings();
  return {
    apiKey:  s.elevenLabsApiKey  || process.env.ELEVENLABS_API_KEY  || '',
    voiceId: s.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
    modelId: s.elevenLabsModelId || 'eleven_flash_v2_5',
  };
}

function getOpenAIKey() {
  try {
    if (fs.existsSync(SETTINGS_FILE_STT)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE_STT, 'utf-8'));
      if (s.openaiApiKey && s.openaiApiKey.length > 20) return s.openaiApiKey;
    }
  } catch {}
  return process.env.OPENAI_API_KEY || 'placeholder';
}

let _openai = null;
let _openaiKey = null;
function getOpenAI() {
  const key = getOpenAIKey();
  if (!_openai || key !== _openaiKey) {
    _openai = new OpenAI({ apiKey: key });
    _openaiKey = key;
  }
  return _openai;
}
const openai = new Proxy({}, { get(_, prop) { return getOpenAI()[prop]; } });

// ─── Speech-to-Text (STT) ──────────────────────────────────────────────────────

/**
 * Transcribe audio to Tamil text using OpenAI Whisper
 * @param {Buffer|string} audioData - Audio buffer or file path
 * @param {string} format - Audio format (wav, mp3, ogg, webm)
 * @returns {Object} { text, confidence, language }
 */
async function transcribeAudio(audioData, format = 'wav') {
  const startTime = Date.now();

  try {
    // Build a buffer regardless of input type
    const buffer = Buffer.isBuffer(audioData) ? audioData : fs.readFileSync(audioData);

    const mimeMap = {
      webm: 'audio/webm',
      mp4:  'audio/mp4',
      ogg:  'audio/ogg',
      wav:  'audio/wav',
      mp3:  'audio/mpeg',
      m4a:  'audio/mp4',
    };
    const mimeType = mimeMap[format] || 'audio/webm';

    // Use axios + form-data directly — the OpenAI SDK's undici-based fetch
    // fails for multipart binary uploads in some environments (Connection error).
    const form = new FormData();
    form.append('file', buffer, { filename: `recording.${format}`, contentType: mimeType });
    form.append('model', 'whisper-1');
    form.append('language', 'ta');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    form.append('prompt', 'வணக்கம். இது தமிழ் உரையாடல்.');

    const apiKey = getOpenAIKey();
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...form.getHeaders(),
        },
        timeout: 60000,
      }
    );

    const processingTime = Date.now() - startTime;
    const text = response.data.text?.trim() || '';
    logger.info(`STT completed in ${processingTime}ms: "${text}"`);

    return {
      text,
      confidence: 0.9,
      language: 'ta',
      processingTimeMs: processingTime,
    };

  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    logger.error('STT error:', msg);
    throw new Error(`Speech transcription failed: ${msg}`);
  }
}

/**
 * Transcribe audio from a URL (e.g., Twilio recording URL)
 */
async function transcribeFromUrl(audioUrl, authUser, authPass) {
  // Download the audio first
  const response = await axios.get(audioUrl, {
    responseType: 'arraybuffer',
    auth: authUser && authPass ? { username: authUser, password: authPass } : undefined,
  });

  const buffer = Buffer.from(response.data);
  const contentType = response.headers['content-type'] || 'audio/wav';
  const format = contentType.includes('mp3') ? 'mp3' : 'wav';

  return transcribeAudio(buffer, format);
}

// ─── Text-to-Speech (TTS) ──────────────────────────────────────────────────────

/**
 * Convert Tamil text to speech — routes to ElevenLabs or Azure based on ttsProvider setting.
 * @param {string} text - Tamil text to synthesize
 * @param {string} outputPath - Optional: where to save audio file (Azure only)
 * @returns {Object} { audioBuffer, duration, s3Url, playableUrl }
 */
async function synthesizeSpeech(text, outputPath = null) {
  const { tamilizeText } = require('../utils/tamilNumbers');
  const spokenText = tamilizeText(text);
  const provider = getTtsProvider();
  if (provider === 'elevenlabs') {
    return synthesizeSpeechElevenLabs(spokenText);
  }
  return synthesizeSpeechAzure(spokenText, outputPath);
}

async function synthesizeSpeechAzure(text, outputPath = null) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // Read credentials — settings file takes priority over env vars
    let _azureKey = process.env.AZURE_SPEECH_KEY;
    let _azureRegion = process.env.AZURE_SPEECH_REGION;
    let _azureVoice = process.env.AZURE_SPEECH_VOICE;
    try {
      const _sf = path.join(__dirname, '../../config/app-settings.json');
      if (fs.existsSync(_sf)) {
        const _s = JSON.parse(fs.readFileSync(_sf, 'utf-8'));
        if (_s.azureSpeechKey)    _azureKey    = _s.azureSpeechKey;
        if (_s.azureSpeechRegion) _azureRegion = _s.azureSpeechRegion;
        if (_s.azureSpeechVoice)  _azureVoice  = _s.azureSpeechVoice;
      }
    } catch {}

    // Azure Speech SDK configuration
    const speechConfig = sdk.SpeechConfig.fromSubscription(_azureKey, _azureRegion);

    // Tamil Neural Voice - Natural sounding
    speechConfig.speechSynthesisVoiceName = _azureVoice || 'ta-IN-PallaviNeural';
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    // Use push stream to get audio in memory
    const pullStream = sdk.AudioOutputStream.createPullStream();
    const audioConfig = sdk.AudioConfig.fromStreamOutput(pullStream);

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    // Use SSML for better Tamil pronunciation control — pass voice explicitly
    const ssml = buildTamilSSML(text, _azureVoice || 'ta-IN-PallaviNeural');

    synthesizer.speakSsmlAsync(
      ssml,
      async (result) => {
        synthesizer.close();

        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const audioBuffer = Buffer.from(result.audioData);
          const processingTime = Date.now() - startTime;

          logger.info(`TTS completed in ${processingTime}ms for ${text.length} chars`);

          // Upload to S3 if configured, otherwise serve locally
          let s3Url = null;
          let playableUrl = null;
          const audioFilename = `${uuidv4()}.mp3`;
          if (isS3Configured()) {
            const s3Key = `${process.env.S3_TTS_PREFIX || 'tts-cache/'}${audioFilename}`;
            s3Url = await uploadAudioToS3(audioBuffer, s3Key, 'audio/mpeg');
            playableUrl = await getSignedUrl(s3Key, 3600);
          } else {
            const local = await storeAudioLocally(audioBuffer, audioFilename);
            playableUrl = local.playableUrl;
            logger.debug(`Audio served locally: ${playableUrl}`);
          }

          resolve({
            audioBuffer,
            s3Url,
            playableUrl,
            duration: result.audioDuration / 10000000, // Convert to seconds
            processingTimeMs: processingTime,
          });
        } else {
          const error = result.errorDetails || 'Azure TTS synthesis failed';
          logger.error('TTS error:', error);
          reject(new Error(error));
        }
      },
      (error) => {
        synthesizer.close();
        logger.error('TTS synthesis error:', error);
        reject(new Error(error));
      }
    );
  });
}

/**
 * Build SSML for natural Tamil speech.
 * Keeps markup minimal — Tamil neural voices sound best with clean prosody only.
 * mstts:express-as styles are NOT supported by ta-IN voices and degrade quality.
 * @param {string} text
 * @param {string} [voiceName] — explicit voice; falls back to env / default
 */
function buildTamilSSML(text, voiceName) {
  voiceName = voiceName || process.env.AZURE_SPEECH_VOICE || 'ta-IN-PallaviNeural';

  // Escape XML special characters in the raw text only
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Split on sentence endings and insert 300ms breaks — matches the user's SSML style.
  // Keeps sentences clearly separated for the Madurai cadence feel.
  const withBreaks = escaped
    .replace(/([!?।])\s+/g, '$1\n')
    .replace(/\.\s+(?=[^\d])/g, '.\n')   // period break, but not inside numbers
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .join('\n      <break time="300ms"/>\n      ');

  // Per-gender prosody tuning (Madurai mass style).
  // Male  (Valluvar): rate=0.95, pitch=+2% — bold, confident, clear Madurai cadence
  // Female (Pallavi): rate=0.97, pitch=+5% — warm, professional, slightly brighter tone
  // mstts:express-as is NOT supported by ta-IN voices — plain prosody only.
  const isMale = /valluvar/i.test(voiceName);
  const rate   = isMale ? '0.95' : '0.97';
  const pitch  = isMale ? '+2%'  : '+5%';

  return `<speak version="1.0" xml:lang="ta-IN" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="${voiceName}">
    <prosody rate="${rate}" pitch="${pitch}">
      ${withBreaks}
    </prosody>
  </voice>
</speak>`;
}

// In-memory TTS cache: "<voiceId>::<text>" → { playableUrl, cachedAt }
// Key includes voiceId so changing the voice immediately invalidates old entries.
const _ttsCache = new Map();
const _TTS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function _ttsCacheKey(voiceId, text) {
  return `${voiceId || 'default'}::${text}`;
}

function _getTtsCached(voiceId, text) {
  const key = _ttsCacheKey(voiceId, text);
  const entry = _ttsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > _TTS_CACHE_TTL_MS) {
    _ttsCache.delete(key);
    return null;
  }
  return entry;
}

function _setTtsCache(voiceId, text, playableUrl) {
  if (_ttsCache.size > 200) {
    const oldest = [..._ttsCache.entries()].sort((a,b) => a[1].cachedAt - b[1].cachedAt)[0];
    if (oldest) _ttsCache.delete(oldest[0]);
  }
  _ttsCache.set(_ttsCacheKey(voiceId, text), { playableUrl, cachedAt: Date.now() });
}

/**
 * Clear the entire in-memory TTS cache.
 * Call this whenever the voice ID or TTS settings change.
 */
function clearTtsCache() {
  const size = _ttsCache.size;
  _ttsCache.clear();
  logger.info(`TTS cache cleared (${size} entries removed)`);
}

/**
 * Convert Tamil text to speech using ElevenLabs Flash v2.5
 * @param {string} text - Tamil text to synthesize
 * @returns {Object} { audioBuffer, playableUrl, duration, processingTimeMs }
 */
async function synthesizeSpeechElevenLabs(text) {
  const startTime = Date.now();
  const cfg = getElevenLabsConfig();

  // Return cached audio for identical text + voice (saves ~1-1.5s per repeated phrase)
  const cached = _getTtsCached(cfg.voiceId, text);
  if (cached) {
    logger.info(`ElevenLabs TTS cache hit in ${Date.now() - startTime}ms for ${text.length} chars`);
    return { audioBuffer: null, s3Url: null, playableUrl: cached.playableUrl, duration: null, processingTimeMs: 0 };
  }

  if (!cfg.apiKey) throw new Error('ElevenLabs API key is not configured. Add it in Settings.');
  if (!cfg.voiceId) throw new Error('ElevenLabs Voice ID is not configured. Add it in Settings.');

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}`;

  const response = await axios.post(
    endpoint,
    {
      text,
      model_id: cfg.modelId,
      voice_settings: {
        stability: 0.50,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        'xi-api-key': cfg.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      responseType: 'arraybuffer',
      timeout: 30000,
    }
  );

  const audioBuffer = Buffer.from(response.data);
  const processingTime = Date.now() - startTime;
  logger.info(`ElevenLabs TTS completed in ${processingTime}ms for ${text.length} chars`);

  const audioFilename = `el_${uuidv4()}.mp3`;
  let s3Url = null;
  let playableUrl = null;

  if (isS3Configured()) {
    const s3Key = `${process.env.S3_TTS_PREFIX || 'tts-cache/'}${audioFilename}`;
    s3Url = await uploadAudioToS3(audioBuffer, s3Key, 'audio/mpeg');
    playableUrl = await getSignedUrl(s3Key, 3600);
  } else {
    const local = await storeAudioLocally(audioBuffer, audioFilename);
    playableUrl = local.playableUrl;
    logger.debug(`ElevenLabs audio served locally: ${playableUrl}`);
  }

  _setTtsCache(cfg.voiceId, text, playableUrl);
  return { audioBuffer, s3Url, playableUrl, duration: null, processingTimeMs: processingTime };
}

/**
 * Fallback TTS using OpenAI (for when Azure is unavailable)
 * Note: OpenAI TTS doesn't support Tamil natively, use only as last resort
 */
async function synthesizeSpeechFallback(text) {
  logger.warn('Using OpenAI TTS fallback - Tamil quality will be limited');

  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: 'nova',
    input: text,
    response_format: 'mp3',
    speed: 0.9,
  });

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const audioFilename = `fallback_${uuidv4()}.mp3`;
  let s3Url = null;
  let playableUrl = null;
  if (isS3Configured()) {
    const s3Key = `${process.env.S3_TTS_PREFIX || 'tts-cache/'}${audioFilename}`;
    s3Url = await uploadAudioToS3(audioBuffer, s3Key, 'audio/mpeg');
    playableUrl = await getSignedUrl(s3Key, 3600);
  } else {
    const local = await storeAudioLocally(audioBuffer, audioFilename);
    playableUrl = local.playableUrl;
  }

  return { audioBuffer, s3Url, playableUrl };
}

module.exports = {
  transcribeAudio,
  transcribeFromUrl,
  synthesizeSpeech,
  synthesizeSpeechElevenLabs,
  synthesizeSpeechFallback,
  buildTamilSSML,
  getTtsProvider,
  getElevenLabsConfig,
  clearTtsCache,
};
