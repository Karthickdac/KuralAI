/**
 * Speech Service
 * Speech-to-Text: OpenAI Whisper (Tamil-accurate)
 * Text-to-Speech: Azure Neural TTS (Tamil Neural Voice)
 */

const OpenAI = require('openai');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { uploadAudioToS3, getSignedUrl } = require('./s3Service');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    let fileStream;

    if (Buffer.isBuffer(audioData)) {
      // Write buffer to temp file (Whisper API needs a file)
      const tempPath = path.join('/tmp', `kuralai_stt_${uuidv4()}.${format}`);
      fs.writeFileSync(tempPath, audioData);
      fileStream = fs.createReadStream(tempPath);

      // Cleanup temp file after use
      setTimeout(() => fs.unlink(tempPath, () => {}), 5000);
    } else {
      // Assume it's a file path
      fileStream = fs.createReadStream(audioData);
    }

    const response = await openai.audio.transcriptions.create({
      file: fileStream,
      model: process.env.OPENAI_WHISPER_MODEL || 'whisper-1',
      language: 'ta',        // Force Tamil language for accuracy
      response_format: 'verbose_json', // Get word-level timestamps & confidence
      temperature: 0.0,      // Low temperature for deterministic output
      prompt: 'வணக்கம். இது தமிழ் உரையாடல்.', // Tamil context hint improves accuracy
    });

    const processingTime = Date.now() - startTime;
    logger.info(`STT completed in ${processingTime}ms: "${response.text}"`);

    // Whisper verbose_json returns segments with avg_logprob for confidence
    let confidence = 0.9; // Default
    if (response.segments && response.segments.length > 0) {
      // Convert log probability to 0-1 confidence score
      const avgLogprob = response.segments.reduce((sum, s) => sum + s.avg_logprob, 0) / response.segments.length;
      confidence = Math.min(1.0, Math.max(0.0, 1 + avgLogprob / 5));
    }

    return {
      text: response.text.trim(),
      confidence,
      language: response.language,
      processingTimeMs: processingTime,
    };

  } catch (error) {
    logger.error('STT error:', error.message);
    throw new Error(`Speech transcription failed: ${error.message}`);
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
 * Convert Tamil text to speech using Azure Neural TTS
 * @param {string} text - Tamil text to synthesize
 * @param {string} outputPath - Optional: where to save audio file
 * @returns {Object} { audioBuffer, duration, s3Url }
 */
async function synthesizeSpeech(text, outputPath = null) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // Azure Speech SDK configuration
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY,
      process.env.AZURE_SPEECH_REGION
    );

    // Tamil Neural Voice - Natural sounding
    speechConfig.speechSynthesisVoiceName = process.env.AZURE_SPEECH_VOICE || 'ta-IN-PallaviNeural';
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    // Use push stream to get audio in memory
    const pullStream = sdk.AudioOutputStream.createPullStream();
    const audioConfig = sdk.AudioConfig.fromStreamOutput(pullStream);

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    // Use SSML for better Tamil pronunciation control
    const ssml = buildTamilSSML(text);

    synthesizer.speakSsmlAsync(
      ssml,
      async (result) => {
        synthesizer.close();

        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const audioBuffer = Buffer.from(result.audioData);
          const processingTime = Date.now() - startTime;

          logger.info(`TTS completed in ${processingTime}ms for ${text.length} chars`);

          // Upload to S3 for serving via Twilio
          const s3Key = `${process.env.S3_TTS_PREFIX || 'tts-cache/'}${uuidv4()}.mp3`;
          const s3Url = await uploadAudioToS3(audioBuffer, s3Key, 'audio/mpeg');
          const signedUrl = await getSignedUrl(s3Key, 3600); // 1 hour expiry

          resolve({
            audioBuffer,
            s3Url,
            playableUrl: signedUrl, // Pre-signed URL for Twilio to play
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
 * Build SSML markup for natural Tamil speech
 * Handles prosody, pauses, and pronunciation hints
 */
function buildTamilSSML(text) {
  // Escape XML special characters
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ta-IN">
  <voice name="${process.env.AZURE_SPEECH_VOICE || 'ta-IN-PallaviNeural'}">
    <prosody rate="0.95" pitch="+0Hz" volume="loud">
      ${escaped}
    </prosody>
  </voice>
</speak>`.trim();
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
  const s3Key = `${process.env.S3_TTS_PREFIX || 'tts-cache/'}fallback_${uuidv4()}.mp3`;
  const s3Url = await uploadAudioToS3(audioBuffer, s3Key, 'audio/mpeg');
  const playableUrl = await getSignedUrl(s3Key, 3600);

  return { audioBuffer, s3Url, playableUrl };
}

module.exports = {
  transcribeAudio,
  transcribeFromUrl,
  synthesizeSpeech,
  synthesizeSpeechFallback,
};
