/**
 * WebSocket Server
 * Pushes real-time call events to the dashboard
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

let wss = null;
const clients = new Set();

function initWebSocket(server) {
  wss = new WebSocket.Server({
    server,
    path: '/ws',
    // Disable per-message deflate. nginx in front double-handles compression
    // and browsers were dropping frames with "Invalid frame header" / "RSV1 must be clear".
    perMessageDeflate: false,
  });

  wss.on('connection', (ws, req) => {
    // Authenticate WebSocket connection via token in query
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    try {
      jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      ws.close(4003, 'Invalid token');
      return;
    }

    clients.add(ws);
    logger.info(`Dashboard WebSocket connected. Total clients: ${clients.size}`);

    ws.on('close', () => {
      clients.delete(ws);
      logger.debug(`Dashboard WebSocket disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error:', err.message);
      clients.delete(ws);
    });

    // Send heartbeat
    ws.send(JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() }));
  });

  // Heartbeat to keep connections alive
  setInterval(() => {
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clients.delete(ws);
      }
    });
  }, 30000);
}

/**
 * Broadcast an event to all connected dashboard clients
 */
async function notifyDashboard(event) {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  });

  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

module.exports = { initWebSocket, notifyDashboard };
