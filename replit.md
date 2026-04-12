# KuralAI - Tamil AI Voice Calling System

## Overview
KuralAI is a real-time AI voice calling system designed to speak and understand Tamil naturally. It integrates AI services (LLMs, STT, TTS) with the Twilio telephony provider.

## Architecture
- **Frontend**: React (CRA) dashboard on port 5000
- **Backend**: Node.js/Express API on port 3000
- **Database**: PostgreSQL (Replit built-in)
- **Real-time**: WebSockets (ws)
- **Auth**: JWT with bcryptjs

## External Services Required
- **OpenAI**: GPT-4o (LLM) + Whisper (STT) - set `OPENAI_API_KEY`
- **Azure Cognitive Services**: Tamil Neural TTS - set `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`
- **Exotel**: Outbound/inbound calling + webhooks (replaces Twilio)
  - `EXOTEL_SID` — Account SID from Exotel Dashboard
  - `EXOTEL_API_KEY` — API Key from Exotel Dashboard
  - `EXOTEL_API_TOKEN` — API Token from Exotel Dashboard
  - `EXOTEL_PHONE_NUMBER` — Your ExoPhone in E.164 format (e.g. +918XXXXXXXXX)
  - `EXOTEL_WEBHOOK_TOKEN` — A long random secret appended to all webhook URLs for security
- **AWS S3**: Audio file storage - set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`

## Startup
Single workflow `Start application` runs `bash start.sh` which:
1. Starts backend (Node.js) on port 3000 in background
2. Starts frontend (React CRA) on port 5000 (HOST=0.0.0.0 for Replit proxy)

## Default Admin Credentials
- Email: admin@automystic.com
- Password: ChangeMe@123

## Key Files
- `src/server.js` - Backend entry point
- `src/config/database.js` - PostgreSQL config (uses PGHOST/PGDATABASE/etc from Replit secrets)
- `src/services/twilioService.js` - Twilio integration (lazy-initialized)
- `src/services/aiService.js` - OpenAI GPT-4o integration (lazy-initialized)
- `src/services/speechService.js` - Whisper STT + Azure TTS (lazy-initialized)
- `dashboard/src/api/client.js` - Axios API client (proxied to port 3000)
- `start.sh` - Combined startup script
- `scripts/seed.js` - Seeds admin user into DB

## Frontend Pages
- `/` — Dashboard (stats, charts, recent calls, live WebSocket feed)
- `/calls` — Calls list (paginated, filterable by status/date, CSV export)
- `/calls/:id` — Call detail (transcript, logs, recording player, transcript export)
- `/users` — User management (create/edit/deactivate/delete; admin only)
- `/settings` — App settings form (call behaviour, retries, AI/voice, escalation)

## API Routes
- `POST /api/auth/login` / `GET /api/auth/me`
- `GET/POST /api/calls/initiate`, `GET /api/calls`, `GET /api/calls/export` (CSV)
- `GET /api/calls/:id/status`, `GET /api/calls/:id/transcripts`, `GET /api/logs/:callId`
- `GET /api/dashboard/stats|intents|calls/timeline|recent-calls`
- `GET/POST/PUT/DELETE /api/users` (admin only)
- `GET/PUT /api/settings` — config stored in `config/app-settings.json`
- `POST /webhook/voice|status|recording`
- `WS /ws?token=<jwt>` — real-time call events

## Notable Changes from Original
- Replaced `@azure/cognitiveservices-speech-sdk` with `microsoft-cognitiveservices-speech-sdk` (correct npm package name)
- Made Twilio and OpenAI clients lazy-initialized to allow startup without credentials
- Database sync changed from `alter: true` to `force: false` to avoid PostgreSQL multi-statement alter errors
- Database config updated to fall back to Replit's PGHOST/PGDATABASE/etc env vars
- WebSocket URL uses `window.location.host` dynamically (works behind Replit proxy)
- `dashboard/src/setupProxy.js` proxies `/api`, `/webhook`, `/health`, `/ws` to port 3000
- Settings persisted to `config/app-settings.json` and synced to `process.env` on update
- **Twilio fully replaced by Exotel** — `exotelService.js` handles outbound calls + ExoML, `exotelValidation.js` handles webhook token validation
- Exotel webhook URLs include `?wt=<EXOTEL_WEBHOOK_TOKEN>` for security; set EXOTEL_WEBHOOK_TOKEN to a long random string in production
- Exotel ExoML is XML-based (like TwiML); uses `<Gather input="speech" language="ta-in">` for Tamil speech recognition

## Environment Variables
Set in Replit Secrets/Env Vars:
- `PORT=3000` (backend)
- `JWT_SECRET` (authentication)
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (auto-set by Replit DB)
- External API keys must be added by user (OPENAI_API_KEY, AZURE_SPEECH_KEY, etc.)
