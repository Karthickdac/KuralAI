# KuralAI — Enterprise Tamil AI Voice Calling System

## Overview
KuralAI is a real-time AI voice calling platform that speaks and understands Tamil naturally. Built for enterprise outbound call campaigns with GPT-4o, Azure Neural TTS, Exotel telephony, and a full analytics dashboard.

## Architecture
- **Frontend**: React (CRA) enterprise dashboard on port 5000
- **Backend**: Node.js/Express API on port 3000
- **Database**: PostgreSQL (Replit built-in)
- **Real-time**: WebSockets (ws)
- **Auth**: JWT with bcryptjs

## External Services Required
- **OpenAI**: GPT-4o (LLM) + Whisper (STT) — set `OPENAI_API_KEY`
- **Azure Cognitive Services**: Tamil Neural TTS — set `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`
- **Exotel**: Outbound/inbound calling + webhooks
  - `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`
  - `EXOTEL_PHONE_NUMBER` — ExoPhone in E.164 format (e.g. +918XXXXXXXXX)
  - `EXOTEL_WEBHOOK_TOKEN` — long random secret appended to all webhook URLs
- **AWS S3**: Audio file storage — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`

## Startup
Single workflow `Start application` runs `bash start.sh` which:
1. Starts backend (Node.js) on port 3000 in background
2. Starts frontend (React CRA) on port 5000 (HOST=0.0.0.0 for Replit proxy)

## Default Admin Credentials
- Email: admin@automystic.com
- Password: ChangeMe@123

## Design System
CSS variables defined in `dashboard/src/global.css`:
- Sidebar: `--sidebar-bg: #0F172A` (dark navy), `--sidebar-width: 240px`
- Primary: `--primary: #4F46E5` (indigo)
- Page background: `--page-bg: #F1F5F9`
- Full token set: text, border, shadow, radius, status colours (success/warning/danger/info/purple)

## Frontend Pages & Components
- **Shared**: `Sidebar.jsx` + `Sidebar.module.css` — shared across all pages (uses `useWebSocket` for live dot)
- `/login` — `Login.jsx` — enterprise split-panel (dark navy left, form right)
- `/` — `Dashboard.jsx` — 5 KPI cards, area chart, donut chart, intent bar, live WS activity, recent calls table
- `/calls` — `Calls.jsx` — paginated table, status/date filters, CSV export
- `/calls/:id` — `CallDetail.jsx` — transcript bubbles, event logs, recording player, export
- `/workflows` — `Workflows.jsx` — call campaign management (create/edit/start/pause/delete, AI script, schedule)
- `/reports` — `Reports.jsx` — period tabs (7/14/30/90d), 5 KPI cards, volume chart, outcome pie, intent bar, summary table, CSV export
- `/users` — `Users.jsx` — CRUD user management with modal
- `/settings` — `Settings.jsx` — grouped settings sections (call behaviour, retry, AI/voice, escalation)

## API Routes
- `POST /api/auth/login` / `GET /api/auth/me`
- `POST /api/calls/initiate`, `GET /api/calls`, `GET /api/calls/export` (CSV)
- `GET /api/calls/:id/status`, `GET /api/transcripts/:callId`, `GET /api/logs/:callId`
- `GET /api/dashboard/stats|intents|calls/timeline|recent-calls`
- `GET/POST/PUT/DELETE /api/users` (admin only)
- `GET/PUT /api/settings` — stored in `config/app-settings.json`
- `GET/POST/PUT/DELETE /api/workflows` — stored in `config/workflows.json`
- `POST /webhook/voice|status|recording`
- `WS /ws?token=<jwt>` — real-time call events

## Key Files
- `src/server.js` — Backend entry point
- `src/config/database.js` — PostgreSQL config
- `src/services/exotelService.js` — Exotel outbound calling + ExoML
- `src/services/aiService.js` — OpenAI GPT-4o integration
- `src/services/speechService.js` — Whisper STT + Azure TTS
- `src/routes/workflow.routes.js` — Workflow CRUD routes
- `dashboard/src/api/client.js` — Axios API client (proxied to port 3000)
- `dashboard/src/global.css` — CSS design token system
- `dashboard/src/components/Sidebar.jsx` — Shared navigation component
- `start.sh` — Combined startup script
- `scripts/seed.js` — Seeds admin user into DB

## Proxy Configuration
`dashboard/src/setupProxy.js` proxies `/api`, `/webhook`, `/health`, `/ws` (ws:true) to port 3000.

## Environment Variables
Set in Replit Secrets:
- `PORT=3000` (backend)
- `JWT_SECRET` (authentication)
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (auto-set by Replit DB)
- External API keys added by user

## Notable Technical Decisions
- Exotel replaces Twilio — ExoML XML-based, `<Gather input="speech" language="ta-in">` for Tamil STT
- Webhook URLs include `?wt=<EXOTEL_WEBHOOK_TOKEN>` for security
- Services are lazy-initialized to allow startup without API credentials
- WebSocket URL uses `window.location.host` dynamically (works behind Replit proxy)
- Settings and workflows stored in `config/*.json` (file-based, no extra DB tables needed)
- `express trust proxy` should be set to `true` to suppress rate-limiter X-Forwarded-For warning
