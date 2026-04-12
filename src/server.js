/**
 * KuralAI - Main Server Entry Point
 * Tamil AI Voice Calling System by Automystic
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { initDatabase } = require('./config/database');
const { initWebSocket } = require('./websocket/wsServer');
const { startRetryScheduler } = require('./services/retryScheduler');

// Route imports
const callRoutes = require('./routes/call.routes');
const transcriptRoutes = require('./routes/transcript.routes');
const logRoutes = require('./routes/log.routes');
const webhookRoutes = require('./routes/webhook.routes');
const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const userRoutes = require('./routes/user.routes');
const settingsRoutes = require('./routes/settings.routes');
const workflowRoutes = require('./routes/workflow.routes');
const ttsRoutes = require('./routes/tts.routes');

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1); // Trust Replit proxy for correct IP in rate-limiter

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for webhook compatibility
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path.startsWith('/webhook'), // Exotel webhooks exempt
});
app.use('/api/', limiter);

// ─── Body Parsers ──────────────────────────────────────────────────────────────
// Exotel webhooks send application/x-www-form-urlencoded — parse before JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// ─── Request Logging ───────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'KuralAI',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/tts', ttsRoutes);

// Exotel webhooks (no JWT - validated by shared webhook token)
app.use('/webhook', webhookRoutes);

// ─── Local Audio File Serving (fallback when S3 not configured) ────────────────
const _localAudioDir = require('path').join('/tmp', 'kuralai-audio');
if (!require('fs').existsSync(_localAudioDir)) require('fs').mkdirSync(_localAudioDir, { recursive: true });
app.get('/audio/:filename', (req, res) => {
  const _fs = require('fs');
  const _path = require('path');
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
  const filePath = _path.join(_localAudioDir, filename);
  logger.info(`AUDIO FETCH: ${filename} from ip=${req.ip} ua="${req.headers['user-agent'] || 'none'}"`);
  if (!_fs.existsSync(filePath)) {
    logger.warn(`AUDIO NOT FOUND: ${filename}`);
    return res.status(404).json({ error: 'Audio file not found' });
  }
  const stat = _fs.statSync(filePath);
  const ext = _path.extname(filename).toLowerCase();
  const contentType = ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(filePath);
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    // Initialize PostgreSQL
    await initDatabase();
    logger.info('✅ Database connected');

    // Initialize WebSocket server (for real-time dashboard updates)
    initWebSocket(server);
    logger.info('✅ WebSocket server initialized');

    // Start call retry scheduler (cron job)
    startRetryScheduler();
    logger.info('✅ Retry scheduler started');

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`🚀 KuralAI server running on port ${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV}`);
      logger.info(`   App URL: ${process.env.APP_URL}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

module.exports = { app, server };
