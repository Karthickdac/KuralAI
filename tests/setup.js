/**
 * Global Test Setup
 * Sets environment variables and configures mocks before all tests run.
 */

// ── Environment Variables ───────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.SKIP_TWILIO_VALIDATION = 'true'; // Bypass signature check in tests
process.env.PORT = '3001';
process.env.JWT_SECRET = 'test_jwt_secret_min_32_chars_padded_here';
process.env.JWT_EXPIRES_IN = '1h';

// Database (SQLite in-memory for tests — override Sequelize dialect in db config)
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

// External services — all mocked, never hit real APIs in tests
process.env.TWILIO_ACCOUNT_SID = 'ACtest00000000000000000000000000000';
process.env.TWILIO_AUTH_TOKEN = 'test_auth_token_00000000000000000000';
process.env.TWILIO_PHONE_NUMBER = '+15005550006'; // Twilio magic test number
process.env.OPENAI_API_KEY = 'sk-test-00000000000000000000000000000000';
process.env.OPENAI_MODEL = 'gpt-4o';
process.env.AZURE_SPEECH_KEY = 'test_azure_key_00000000000000000000';
process.env.AZURE_SPEECH_REGION = 'eastus';
process.env.AZURE_SPEECH_VOICE = 'ta-IN-PallaviNeural';
process.env.AWS_ACCESS_KEY_ID = 'AKIATESTKEY00000000';
process.env.AWS_SECRET_ACCESS_KEY = 'test_secret_0000000000000000000000000000';
process.env.AWS_REGION = 'ap-south-1';
process.env.S3_BUCKET_NAME = 'kuralai-test-bucket';
process.env.S3_TTS_PREFIX = 'tts-cache/';
process.env.APP_URL = 'http://localhost:3001';
process.env.MAX_CALL_DURATION_SECONDS = '300';
process.env.CALL_RETRY_ATTEMPTS = '3';
process.env.CALL_RETRY_DELAY_SECONDS = '60';
process.env.SILENCE_TIMEOUT_SECONDS = '5';
process.env.ESCALATION_WEBHOOK_URL = 'http://localhost:9999/escalate';
process.env.ESCALATION_PHONE = '+15005550006';

// ── Global Mocks ────────────────────────────────────────────────────────────────

// Mock winston logger to suppress noise during tests
jest.mock('./src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
}));

// Mock Twilio client — never make real API calls
jest.mock('twilio', () => {
  const mockCall = {
    sid: 'CAtest000000000000000000000000000001',
    status: 'queued',
    to: '+919876543210',
    from: '+15005550006',
  };

  const mockClient = {
    calls: {
      create: jest.fn().mockResolvedValue(mockCall),
    },
    recordings: jest.fn(() => ({
      fetch: jest.fn().mockResolvedValue({ uri: '/2010-04-01/Accounts/AC.../Recordings/RE.json', duration: '120', status: 'completed' }),
    })),
    validateRequest: jest.fn().mockReturnValue(true),
  };

  // Also expose static validateRequest on the constructor
  const TwilioConstructor = jest.fn(() => mockClient);
  TwilioConstructor.validateRequest = jest.fn().mockReturnValue(true);
  TwilioConstructor.twiml = {
    VoiceResponse: jest.fn().mockImplementation(() => ({
      pause: jest.fn().mockReturnThis(),
      say: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
      gather: jest.fn().mockReturnValue({
        play: jest.fn().mockReturnThis(),
        say: jest.fn().mockReturnThis(),
      }),
      play: jest.fn().mockReturnThis(),
      hangup: jest.fn().mockReturnThis(),
      dial: jest.fn().mockReturnValue({ number: jest.fn().mockReturnThis() }),
      toString: jest.fn().mockReturnValue('<Response></Response>'),
    })),
  };

  return TwilioConstructor;
});

// Mock OpenAI — return predictable Tamil intent JSON
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                response: 'உங்கள் ஆர்டர் வழியில் உள்ளது.',
                intent: 'order_status',
                confidence: 0.92,
                action: 'continue',
                data: {},
              }),
            },
          }],
        }),
      },
    },
    audio: {
      transcriptions: {
        create: jest.fn().mockResolvedValue({
          text: 'என்னோட ஆர்டர் எங்கே இருக்கு',
          language: 'ta',
          segments: [{ avg_logprob: -0.2 }],
        }),
      },
      speech: {
        create: jest.fn().mockResolvedValue({
          arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-audio-data')),
        }),
      },
    },
  }));
});

// Mock Azure Speech SDK — never call real Azure
jest.mock('microsoft-cognitiveservices-speech-sdk', () => ({
  SpeechConfig: {
    fromSubscription: jest.fn().mockReturnValue({
      speechSynthesisVoiceName: '',
      speechSynthesisOutputFormat: '',
    }),
  },
  AudioConfig: {
    fromStreamOutput: jest.fn().mockReturnValue({}),
  },
  AudioOutputStream: {
    createPullStream: jest.fn().mockReturnValue({}),
  },
  SpeechSynthesizer: jest.fn().mockImplementation(() => ({
    speakSsmlAsync: jest.fn((ssml, onSuccess) => {
      onSuccess({
        reason: 1, // SynthesizingAudioCompleted = 1
        audioData: Buffer.from('fake-tts-audio'),
        audioDuration: 30000000, // 3 seconds
      });
    }),
    close: jest.fn(),
  })),
  SpeechSynthesisOutputFormat: { Audio16Khz32KBitRateMonoMp3: 'mp3' },
  ResultReason: { SynthesizingAudioCompleted: 1 },
}));

// Mock AWS S3 — never upload real files
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Body: { [Symbol.asyncIterator]: jest.fn().mockReturnValue({ next: jest.fn().mockResolvedValue({ done: true }) }) } }),
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/kuralai-test-bucket/tts-cache/test.mp3?X-Amz-Signature=fake'),
}));

// Mock WebSocket notifier — tests don't need a real WS server
jest.mock('./src/websocket/wsServer', () => ({
  initWebSocket: jest.fn(),
  notifyDashboard: jest.fn().mockResolvedValue(undefined),
}));

// Mock node-cron — don't run real schedulers in tests
jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

// Mock axios for escalation webhook
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ status: 200 }),
  get: jest.fn().mockResolvedValue({ data: Buffer.from('audio'), headers: { 'content-type': 'audio/wav' } }),
}));
