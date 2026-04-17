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
  defaultEngine: 'kuralai',
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
