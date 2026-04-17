const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Call = require('../models/Call');
const logger = require('../utils/logger');

const { getSettingsSync } = require('../services/settingsService');

module.exports = async function recordingStream(req, res) {
  try {
    const call = await Call.findByPk(req.params.callId);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    if (!call.recordingUrl) return res.status(400).json({ error: 'No recording available' });

    let url = call.recordingUrl;

    // ElevenLabs Conversational AI audio - fetched via API with xi-api-key
    if (url.startsWith('elevenlabs://')) {
      const conversationId = url.replace('elevenlabs://', '');
      const s = getSettingsSync();
      const apiKey = s.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      const elUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`;
      try {
        const elResp = await axios.get(elUrl, {
          headers: { 'xi-api-key': apiKey },
          responseType: 'stream',
          timeout: 30000,
        });
        res.set('Content-Type', elResp.headers['content-type'] || 'audio/mpeg');
        if (elResp.headers['content-length']) res.set('Content-Length', elResp.headers['content-length']);
        res.set('Accept-Ranges', 'bytes');
        return elResp.data.pipe(res);
      } catch (e) {
        logger.error(`ElevenLabs audio fetch failed for ${conversationId}: ${e.message}`);
        return res.status(404).json({ error: 'Recording not yet available' });
      }
    }

    if (url.includes('api.twilio.com') && !url.match(/\.\w{2,4}$/)) {
      url = url + '.mp3';
    }

    let authConfig = {};
    try {
      const s = getSettingsSync();
      const sid = s.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
      const token = s.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
      if (sid && token && url.includes('api.twilio.com')) {
        authConfig = { auth: { username: sid, password: token } };
        url = call.recordingUrl.replace(/\.\w{2,4}$/, '');
      }
    } catch {}

    const response = await axios.get(url, {
      ...authConfig,
      responseType: 'stream',
      timeout: 30000,
    });

    res.set('Content-Type', response.headers['content-type'] || 'audio/mpeg');
    if (response.headers['content-length']) res.set('Content-Length', response.headers['content-length']);
    res.set('Accept-Ranges', 'bytes');
    response.data.pipe(res);
  } catch (err) {
    logger.error(`Recording stream failed for call ${req.params.callId}: ${err.message}`);
    try {
      const call = await Call.findByPk(req.params.callId);
      if (call?.recordingUrl) {
        let fallback = call.recordingUrl;
        if (fallback.includes('api.twilio.com') && !fallback.match(/\.\w{2,4}$/)) {
          fallback = fallback + '.mp3';
        }
        return res.redirect(fallback);
      }
    } catch {}
    res.status(500).json({ error: 'Failed to stream recording' });
  }
};
