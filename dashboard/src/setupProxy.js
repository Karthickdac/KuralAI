/**
 * CRA Dev Proxy — routes /api, /webhook, /ws to the Express backend on :3000
 * Also proxies WebSocket connections so the live activity feed works.
 */

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = 'http://localhost:3000';
  const opts = { target, changeOrigin: true, logLevel: 'silent' };

  app.use('/api', createProxyMiddleware(opts));
  app.use('/webhook', createProxyMiddleware(opts));
  app.use('/health', createProxyMiddleware(opts));
  app.use('/ws', createProxyMiddleware({ ...opts, ws: true }));
};
