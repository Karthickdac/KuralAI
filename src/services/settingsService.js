const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = path.join(__dirname, '../../config/app-settings.json');
const CACHE_TTL = 30000;

let _cache = null;
let _cacheTime = 0;

const DEFAULTS = {
  telephonyProvider: 'twilio',
  exotelSid: '', exotelApiKey: '', exotelApiToken: '',
  exotelPhoneNumber: '', exotelWebhookToken: '',
  appUrl: '',
  twilioAccountSid: '', twilioAuthToken: '', twilioPhoneNumber: '',
  openaiApiKey: '', openaiModel: 'gpt-4o',
  ttsProvider: 'azure',
  azureSpeechKey: '', azureSpeechRegion: '', azureSpeechVoice: 'ta-IN-PallaviNeural',
  elevenLabsApiKey: '', elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
  awsAccessKeyId: '', awsSecretAccessKey: '', s3BucketName: '', awsRegion: '',
  maxCallDurationSeconds: 300,
  callRetryAttempts: 3,
  callRetryDelaySeconds: 60,
  silenceTimeoutSeconds: 5,
  escalationPhone: '', escalationWebhookUrl: '',
  inboundWorkflowId: '',
  apiKey: '',
  razorpayKeyId: '', razorpayKeySecret: '',
  elevenlabsToolKey: '',
  elevenlabsAgentId: '',
  elevenlabsAgentPhoneNumberId: '',
  elevenlabsWebhookSecret: '',
  defaultEngine: 'kuralai',
  // Sarvam.ai conversational engine
  sarvamApiKey: '',
  sarvamLanguageCode: 'ta-IN',
  sarvamVoice: 'anushka',
  sarvamTtsModel: 'bulbul:v2',
  sarvamSttModel: 'saarika:v2.5',
  sarvamChatModel: 'sarvam-m',
  sarvamSystemPrompt: '',
  sarvamGreeting: '',
  exotelSarvamAppId: '',
  // Self-hosted Local inference engine
  localInferenceUrl: '',
  localInferenceToken: '',
  localSttModel: 'whisper-large-v3',
  localLlmModel: 'qwen2.5:7b-instruct',
  // Premium TTS: Indic-Parler-TTS (Apache 2.0). Prompt-driven, fully OSS.
  localTtsModel: 'indic-parler-tts',
  localTtsVoice: 'samuthra-female-tamil',
  // Natural-language voice steering (Parler-TTS). Edit freely — pace, pitch,
  // tone, recording quality are all controllable through this single field.
  localVoiceDescription:
    'A warm, professional female speaker delivers her words clearly and naturally ' +
    'in Tamil with a friendly, conversational tone, moderate pace, and very high ' +
    'studio audio quality with no background noise.',
  localLanguageCode: 'ta-IN',
  // Free-form conversational mode by default — the LLM drives the dialogue
  // rather than following a rigid script. The system prompt below is intentionally
  // minimal; add facts/personas/policies via the Brand fields below as needed.
  localSystemPrompt:
    'நீங்கள் ஒரு இயல்பான, உதவிகரமான, மனிதர் போன்ற தமிழ் AI உரையாடல் முகவர். ' +
    'பயனருடன் வெளிப்படையாக, இயற்கையாக, ஓட்டமாக உரையாடுங்கள் — எந்த scripted flow-ஐயும் பின்பற்ற வேண்டாம். ' +
    'பயனரின் கேள்விகளுக்கு நேரடியாக பதில் சொல்லுங்கள். தேவையானால் தெளிவுபடுத்த கேளுங்கள். ' +
    'பதில்கள் சுருக்கமாக, உரையாடல் தொனியில் இருக்கட்டும்.',
  localGreeting: '',
  // Set to 'guided' if you want to layer flows/scripts on top later. Default
  // 'freeform' = no pre-defined flow, the LLM converses organically.
  localConversationMode: 'freeform',
  exotelLocalAppId: '',
  // Comma-separated engine fallback chain. Default is 'local' only — the
  // self-hosted stack is 100% open-source. Add 'sarvam' or 'elevenlabs' here
  // ONLY if you've explicitly chosen to bring in a proprietary fallback.
  // Default fallback: local-first, then Sarvam if the GPU box is unreachable.
  // This keeps live calls flowing during a GPU outage out of the box;
  // operators can drop Sarvam by setting this to just `'local'`.
  engineFallbackChain: 'local,sarvam',
  companyName: '', servicesList: '', officeHours: '', supportNumber: '', officeAddress: '',
};

function readFromFile() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) };
    }
  } catch {}
  return { ...DEFAULTS };
}

async function getSettings() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;

  try {
    const AppSetting = require('../models/AppSetting');
    const row = await AppSetting.findByPk('main');
    if (row && row.data) {
      _cache = { ...DEFAULTS, ...row.data };
      _cacheTime = now;
      return _cache;
    }
  } catch {}

  _cache = readFromFile();
  _cacheTime = now;
  return _cache;
}

function getSettingsSync() {
  if (_cache && (Date.now() - _cacheTime) < CACHE_TTL) return _cache;
  const settings = readFromFile();
  _cache = settings;
  _cacheTime = Date.now();
  return settings;
}

function clearCache() {
  _cache = null;
  _cacheTime = 0;
}

module.exports = { getSettings, getSettingsSync, clearCache, DEFAULTS };
