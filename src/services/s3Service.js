/**
 * S3 Service
 * Upload/download audio files, get pre-signed URLs for Twilio playback
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../utils/logger');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME;

/**
 * Upload audio buffer to S3
 * @param {Buffer} audioBuffer - Audio data
 * @param {string} key - S3 object key
 * @param {string} contentType - MIME type
 * @returns {string} S3 URL (s3://bucket/key)
 */
async function uploadAudioToS3(audioBuffer, key, contentType = 'audio/mpeg') {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: audioBuffer,
    ContentType: contentType,
    ServerSideEncryption: 'AES256', // Encrypt at rest
    Metadata: {
      service: 'kuralai',
      uploadedAt: new Date().toISOString(),
    },
  }));

  logger.debug(`Audio uploaded to S3: s3://${BUCKET}/${key}`);
  return `s3://${BUCKET}/${key}`;
}

/**
 * Generate a pre-signed URL for Twilio to play audio
 * @param {string} key - S3 object key
 * @param {number} expiresIn - Seconds until URL expires (default: 3600)
 */
async function getSignedUrl(key, expiresIn = 3600) {
  // Handle s3:// URIs
  const s3Key = key.startsWith('s3://') ? key.replace(`s3://${BUCKET}/`, '') : key;

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
  });

  const url = await awsGetSignedUrl(s3, command, { expiresIn });
  return url;
}

/**
 * Download audio from S3 as a buffer
 */
async function downloadAudio(key) {
  const s3Key = key.startsWith('s3://') ? key.replace(`s3://${BUCKET}/`, '') : key;

  const response = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
  }));

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Delete an audio file from S3
 */
async function deleteAudio(key) {
  const s3Key = key.startsWith('s3://') ? key.replace(`s3://${BUCKET}/`, '') : key;

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
  }));

  logger.debug(`Deleted from S3: ${s3Key}`);
}

module.exports = {
  uploadAudioToS3,
  getSignedUrl,
  downloadAudio,
  deleteAudio,
};
