/**
 * Audio codec helpers for Twilio Media Streams (μ-law 8kHz) ↔ PCM16 WAV.
 * Pure JS, no native deps.
 */

// μ-law decode: 1 byte → 1 PCM16 sample (signed int16)
function muLawDecodeSample(byte) {
  byte = ~byte & 0xff;
  const sign = (byte & 0x80) ? -1 : 1;
  const exp = (byte >> 4) & 0x07;
  const mant = byte & 0x0f;
  let sample = ((mant << 4) + 0x08) << exp;
  sample -= 0x84;
  return sign * sample;
}

// μ-law encode: 1 PCM16 sample → 1 byte
function muLawEncodeSample(sample) {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = sample < 0 ? 0x80 : 0;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exp = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exp > 0; exp--, mask >>= 1) {}
  const mant = (sample >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mant) & 0xff;
}

// μ-law buffer (N bytes) → PCM16 buffer (N*2 bytes, little-endian)
function muLawToPcm16(mulaw) {
  const out = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    out.writeInt16LE(muLawDecodeSample(mulaw[i]), i * 2);
  }
  return out;
}

// PCM16 buffer → μ-law buffer
function pcm16ToMuLaw(pcm) {
  const samples = pcm.length / 2;
  const out = Buffer.alloc(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = muLawEncodeSample(pcm.readInt16LE(i * 2));
  }
  return out;
}

// Wrap a PCM16 mono buffer in a minimal WAV container
function pcm16ToWav(pcm, sampleRate = 8000) {
  const buf = Buffer.alloc(44 + pcm.length);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + pcm.length, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);            // PCM
  buf.writeUInt16LE(1, 22);            // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(pcm.length, 40);
  pcm.copy(buf, 44);
  return buf;
}

// Extract PCM16 mono samples + sampleRate from a WAV buffer
function wavToPcm16(wav) {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') {
    return { pcm: wav, sampleRate: 8000 };
  }
  const sampleRate = wav.readUInt32LE(24);
  const channels   = wav.readUInt16LE(22);
  const bitsPerSample = wav.readUInt16LE(34);
  for (let i = 12; i < wav.length - 8; ) {
    const id = wav.toString('ascii', i, i + 4);
    const size = wav.readUInt32LE(i + 4);
    if (id === 'data') {
      let pcm = wav.slice(i + 8, i + 8 + size);
      if (bitsPerSample === 16 && channels > 1) {
        pcm = downmixToMono(pcm, channels);
      }
      return { pcm, sampleRate };
    }
    i += 8 + size;
  }
  return { pcm: wav.slice(44), sampleRate };
}

function downmixToMono(pcm, channels) {
  const frames = pcm.length / 2 / channels;
  const out = Buffer.alloc(frames * 2);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += pcm.readInt16LE((f * channels + c) * 2);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / channels))), f * 2);
  }
  return out;
}

// Simple linear resampler for PCM16 mono. Good enough for voice.
function resamplePcm16(pcm, srIn, srOut) {
  if (srIn === srOut) return pcm;
  const inSamples  = pcm.length / 2;
  const outSamples = Math.round((inSamples * srOut) / srIn);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const srcF = (i * srIn) / srOut;
    const i0 = Math.floor(srcF);
    const i1 = Math.min(i0 + 1, inSamples - 1);
    const frac = srcF - i0;
    const s0 = pcm.readInt16LE(i0 * 2);
    const s1 = pcm.readInt16LE(i1 * 2);
    out.writeInt16LE(Math.round(s0 + (s1 - s0) * frac), i * 2);
  }
  return out;
}

// Mean absolute amplitude of a PCM16 buffer — simple energy proxy for VAD.
function pcm16Energy(pcm) {
  if (!pcm.length) return 0;
  let sum = 0;
  const samples = pcm.length / 2;
  for (let i = 0; i < samples; i++) sum += Math.abs(pcm.readInt16LE(i * 2));
  return sum / samples;
}

module.exports = {
  muLawToPcm16,
  pcm16ToMuLaw,
  pcm16ToWav,
  wavToPcm16,
  resamplePcm16,
  pcm16Energy,
};
