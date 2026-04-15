# KuralAI — Enterprise Tamil AI Voice Calling System

## Overview
KuralAI is a multi-tenant SaaS platform for AI-powered Tamil voice calling. Agent persona **சமுத்ரா** handles chit fund customer calls — due reminders, lottery participation, and payment follow-ups. Built with GPT-4o, ElevenLabs/Azure TTS, Twilio telephony, Razorpay payments, and a full analytics dashboard.

## Architecture
- **Frontend**: React (CRA) enterprise dashboard on port 5000
- **Backend**: Node.js/Express API on port 3000
- **Database**: PostgreSQL (Replit built-in)
- **Real-time**: WebSockets (ws)
- **Auth**: JWT with bcryptjs

## External Services Required
- **OpenAI**: GPT-4o (LLM) + Whisper (STT) — set `OPENAI_API_KEY`
- **Telephony** (choose one, configurable in Settings → Telephony):
  - **Twilio** (default): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
  - **Exotel**: `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_PHONE_NUMBER`
  - `EXOTEL_WEBHOOK_TOKEN` — shared secret appended to all webhook URLs (both providers)
- **TTS** (choose one, configurable in Settings → AI & Voice):
  - **Azure Neural TTS** (default): `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`
  - **ElevenLabs**: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` — model `eleven_multilingual_v2`
- **AWS S3** (optional): Audio file storage — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`

## Settings Storage
All application settings are stored as a single JSONB row in the `app_settings` PostgreSQL table (`key='main'`). On every write, `config/app-settings.json` is also updated for backward compatibility with service modules that read the file directly. On first boot, any existing file settings are automatically migrated to the DB.

Key files:
- `src/models/AppSetting.js` — Sequelize model (table: `app_settings`)
- `src/routes/settings.routes.js` — REST API (GET/PUT `/api/settings`)
- `src/config/database.js` — registers model + runs migration on startup

## Telephony Architecture
Provider-agnostic facade at `src/services/telephonyService.js`. Reads `telephonyProvider` from settings and routes to the appropriate provider:
- `src/services/exotelService.js` — Exotel (ExoML, Indian telephony)
- `src/services/twilioService.js` — Twilio (TwiML, global, trial-friendly, uses axios directly — no twilio npm package)

All call code (`conversationEngine`, `webhookController`, `callController`) imports from the facade only.

## Startup
Single workflow `Start application` runs `bash start.sh` which:
1. Starts backend (Node.js) on port 3000 in background
2. Starts frontend (React CRA) on port 5000 (HOST=0.0.0.0 for Replit proxy)

## Default Admin Credentials
- **Super Admin**: superadmin@kuralai.com / KuralAI@Super123 (platform-level management)
- **Tenant Admin**: admin@automystic.com / ChangeMe@123 (existing tenant admin)

## Multi-Tenant SaaS Architecture
KuralAI is a multi-tenant SaaS platform. Each tenant (organization) has isolated data scoped by `organizationId`.

### Tenant Models (src/models/)
- `Organization.js` — tenant entity (name, slug, email, phone, logo, settings JSONB)
- `Plan.js` — subscription plans (Starter ₹999, Growth ₹2,999, Business ₹7,999, Enterprise ₹19,999/month)
- `Subscription.js` — org↔plan binding with period tracking & Razorpay integration
- `CreditBalance.js` — per-org credit minutes (totalMinutes, usedMinutes, reservedMinutes)
- `CreditTransaction.js` — audit log of all credit operations (usage, recharge, plan_credit, adjustment)
- `ModuleAccess.js` — per-org module toggles (campaigns, crm_integration, api_config, reports, simulator, templates, call_recording, bulk_import)

### User Roles
- `superadmin` — platform-wide access, manages all orgs, plans, credits, modules
- `admin` — org-level admin, manages own tenant data
- `viewer` — read-only access within their org

### SaaS Routes
- `GET/POST/PUT /api/superadmin/organizations` — org CRUD
- `POST /api/superadmin/organizations/:id/assign-plan` — plan assignment
- `POST /api/superadmin/organizations/:id/add-credits` — manual credit adjustment
- `PUT /api/superadmin/organizations/:orgId/modules` — module toggles
- `GET /api/superadmin/dashboard` — platform KPIs
- `GET /api/superadmin/usage` — per-org usage stats
- `GET /api/superadmin/usage/export` — CSV export
- `GET /api/payments/plans` — list active plans
- `POST /api/payments/create-order` — Razorpay order creation
- `POST /api/payments/verify` — payment verification
- `GET /api/payments/balance|transactions|subscription` — tenant billing data

### Tenant Data Isolation
All core routes enforce tenant scoping via `tenantScope` middleware:
- **Calls** (`call.routes.js`) — list, export, status, retry, recording push all scoped to org
- **Customers** (`customer.routes.js`) — CRUD + preferences scoped to org
- **Campaigns** (`campaign.routes.js`) — CRUD + start/pause/resume scoped to org
- **Dashboard** (`dashboard.routes.js`) — stats, intents, timeline, recent calls scoped to org
- **Users** (`user.routes.js`) — list/create/update/delete scoped to org
- **Transcripts** (`transcript.routes.js`) — access gated by call ownership
- **Logs** (`log.routes.js`) — access gated by call ownership
- **CRM** (`crm.routes.js`) — customer fetch/push operations scoped to org
- Super admin bypasses all scoping and sees all data
- API key auth (`role: 'api'`) bypasses scoping (global key)
- New records (calls, customers, campaigns, users) auto-stamped with `organizationId`

### Middleware Stack
- `src/middleware/tenant.js` — tenantScope (injects organizationId), requireSuperAdmin, requireOrgAccess
- `src/middleware/planLimits.js` — Plan enforcement middleware:
  - `requireActivePlan()` — blocks if no active subscription
  - `checkPlanLimit(resource)` — enforces count limits (customers, campaigns, workflows, users)
  - `requirePlanFeature(featureName)` — gates features by plan (crmIntegration, apiConfig, voiceCloning, etc.)
  - `requireCredits(minutes)` — checks credit balance before calls
  - All middleware skips superadmin and null organizationId; fail-closed on errors (500)
- `src/middleware/moduleAccess.js` — requireModule(name) — blocks disabled features per org

### Plan Enforcement Wiring
- `customer.routes.js` POST → `checkPlanLimit('customers')`
- `campaign.routes.js` POST → `checkPlanLimit('campaigns')`, start → `requireCredits(2)`
- `workflow.routes.js` POST → `checkPlanLimit('workflows')` (org-scoped via organizationId field)
- `user.routes.js` POST → `checkPlanLimit('users')`
- `call.routes.js` initiate/bulk/retry → `requireCredits(2)`
- `crm.routes.js` → `requirePlanFeature('crmIntegration')` (all routes)
- `apiConfig.routes.js` → `requirePlanFeature('apiConfig')` (all routes)
- Credit deduction: 2 min deducted per call in callController and campaignController after successful initiation
- Campaign auto-pauses on insufficient credits with `CAMPAIGN_OUT_OF_CREDITS` WebSocket notification

### Frontend SaaS Pages
- `/superadmin` — Platform overview dashboard (org count, revenue, minutes used)
- `/superadmin/organizations` — Org management with detail view (plan, credits, modules, users)
- `/superadmin/plans` — Plan management (create/edit/activate/deactivate subscription plans)
- `/superadmin/usage` — Usage analytics (per-org call stats, date filters, CSV export)
- `/superadmin/revenue` — Revenue & billing overview (total revenue, subscriptions, credit distribution)
- `/billing` — Tenant billing page (current plan, credit balance, Razorpay recharge ₹15/min, transaction history)

### Payment Gateway
- **Razorpay** (India-focused) — configurable via Settings → Payment Gateway (DB-backed), with env var fallback: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- Credentials read from `app_settings` DB first, then env vars; 30s in-memory cache in payment routes

### Plan Features & Limits
Each plan has these configurable limits (columns on `plans` table):
- `creditMinutes` — included call minutes per billing cycle
- `extraMinuteRate` — ₹ per extra minute after included minutes (Starter ₹10, Growth ₹8, Business ₹6, Enterprise ₹4)
- `maxParallelCalls` — concurrent calls (3/10/50/200)
- `maxAssistants` — AI agent personas (-1 = Unlimited)
- `maxClonedVoices` — voice clones (1/5/10/Unlimited)
- `maxKnowledgebases` — knowledge base limit (0/1/5/Unlimited)
- `maxPhoneNumbers` — own phone numbers (3/10/25/Unlimited)
- `maxWorkflows`, `maxCustomers`, `maxCampaigns`, `maxUsersPerOrg` — other limits
- `recommended` — shows "Best deal" badge on billing page (Business plan)
- `-1` value means Unlimited for any integer limit

Feature flags in `features` JSONB:
- `voiceGenderSelection`, `voiceCloning`, `slangCustomization` — voice features
- `midCallTools`, `knowledgebases` — advanced features
- `callRecording`, `reports`, `simulator`, `crmIntegration`, `templates`, `prioritySupport`, `apiConfig`, `bulkImport`, `customPrompts`, `dedicatedSupport`, `sla`, `whiteLabel`

Auto-migration for all plan columns in `migratePlanColumns()` in `database.js`
- Plan purchase: select → create order → Razorpay checkout → verify → activate subscription + credit minutes
- Credit recharge: select minutes → create order → pay → add minutes

## Design System
CSS variables defined in `dashboard/src/global.css`:
- Sidebar: Dark gradient collapsible sidebar (260px expanded, 72px collapsed) with glowing active indicators
- Primary: `--primary: #059669` (emerald), accent `#10B981`
- Page background: `--page-bg: #F1F5F9`
- Full token set: text, border, shadow, radius, status colours (success/warning/danger/info/purple)

### Page Visual Identity
- **Dashboard** (`Dashboard.module.css`): Dark command-center header with gradient (`#0c1222` → `#1a3a2a`), glass-style header buttons, body content uses per-section `margin: 0 32px` for spacing. Responsive breakpoints at 1100px and 768px.
- **Reports** (`Reports.module.css`): Clean white analytics surface with `#F8FAFC` background, navy/slate accents (`#0F172A` for active tabs), no dark header. Responsive breakpoints at 1100px and 768px.
- **Login**: Deep green gradient split-panel design.

## Frontend Pages & Components
- **Shared**: `Sidebar.jsx` + `Sidebar.module.css` — shared across all pages (uses `useWebSocket` for live dot)
- `/login` — `Login.jsx` — enterprise split-panel (dark navy left, form right)
- `/` — `Dashboard.jsx` — 5 KPI cards, area chart, donut chart, intent bar, live WS activity, recent calls table
- `/calls` — `Calls.jsx` — paginated table, status/date filters, CSV export
- `/calls/:id` — `CallDetail.jsx` — transcript bubbles, event logs, recording player, export
- `/workflows` — `Workflows.jsx` — call campaign management with redesigned UX: "How It Works" guide, visual flow mini-map, template variable chips, color-coded branch actions, step reordering, inline help text throughout
- `/reports` — `Reports.jsx` — period tabs (7/14/30/90d), 5 KPI cards, volume chart, outcome pie, intent bar, summary table, CSV export
- `/users` — `Users.jsx` — CRUD user management with modal
- `/settings` — `Settings.jsx` — grouped settings sections (call behaviour, retry, AI/voice, escalation)
- `/simulate` — `Simulate.jsx` — customer selector + chit panel + live call simulation with Web Speech API (ta-IN)
- `/templates` — `Templates.jsx` — full CRUD for Q&A pairs and system prompts stored in PostgreSQL

## Database Tables
- `calls`, `transcripts`, `call_logs` — call data
- `users` — dashboard users
- `customers` — seeded with ரமேஷ் (+919876543210), சுரேஷ் (+919876543211), பிரியா (+919876543212)
- `chit_accounts` — 6 accounts (2 per customer, isPrimary flag)
- `qa_templates` — Q&A pairs (intent, phraseKeywords, tokenKeywords, minScore, responses, action, sortOrder) — editable via /templates
- `prompt_templates` — system prompts (GREETING, FALLBACK_*, ESCALATION, GOODBYE etc.) — editable via /templates

## Template Variables (available in {{var}} syntax)
`{{customerName}}`, `{{chitValue}}`, `{{dueAmount}}`, `{{currentDue}}`, `{{completedDues}}`, `{{pendingDues}}`, `{{totalDues}}`, `{{nextDueDate}}`, `{{withdrawalAmount}}`, `{{otherChitDues}}`, `{{chitGroup}}`, `{{familyJamin}}`, `{{otherJamin}}`, `{{chequeLeaf}}`

## Campaign Module
- **Model**: `src/models/Campaign.js` — id, name, type, status (draft/scheduled/running/paused/completed/cancelled), customerIds, callIds, concurrency (1-10), totalCalls, completedCalls, failedCalls, recordCalls, callbackUrl, workflowId
- **Controller**: `src/controllers/campaignController.js` — CRUD + start/pause/resume + concurrent execution via Promise.all batches
- **Routes**: `src/routes/campaign.routes.js` — `/api/campaigns`
- **Frontend**: `dashboard/src/pages/Campaigns.jsx` — campaign list, create modal (name, type, customers, concurrency, schedule, callback URL), live progress, call details

## Workflow Conversation Flows
Three pre-built script flows in `config/workflows.json`:
- **due_reminder**: Greeting → Identity → Due info → Lottery invite → Goodbye
- **lottery_participation**: Greeting → Identity → Lottery invite → Due reminder → Goodbye
- **payment_followup**: Greeting → Identity → Payment status → Other questions → Goodbye

Each flow uses the `scriptEngine.js` to branch based on customer responses (keyword match + GPT-4o semantic classification fallback). Campaign type auto-maps to workflow ID.

## Call Recording & API Push
- Twilio `Record=true` enabled by default
- `RecordingStatusCallback` webhook saves recording URL to Call model
- `POST /api/calls/:id/recording/push` — push recording + transcript to external system
- Auto-push: when `callbackUrl` is set (campaign/call metadata), webhook auto-POSTs payload on recording ready

## Intent Detection (27 intents)
seat_due_status, premature_withdrawal, jamin_documents, payment_complaint, reduce_calls, no_office_calls, lottery_participation, lottery_decline, identity_confirm, identity_deny, already_paid, callback_request, payment_date_inquiry, chit_value_inquiry, payment_mode, human_request, end_call, partial_payment, whatsapp_request, chit_completion, angry_customer, caller_identity, nominee_inquiry, profit_inquiry, account_summary, repeat_request, appreciation

## Conversation Engine Architecture
Multi-layer intent detection pipeline:
1. **Q&A Exact Match** — 26 hardcoded Q&A pairs with phrase/token keyword scoring (phraseKeywords → 3pts, tokenKeywords → 1pt, multi-phrase bonus)
2. **Keyword Detection** — Fast keyword-based pre-detection against `TAMIL_KEYWORDS` map (no API call)
3. **GPT-4o-mini Classification** — Semantic intent detection with few-shot examples for ambiguous cases
4. **GPT-4o Response Generation** — Context-aware response with 5-exchange conversation history

### Speech Normalization (dual-layer)
- `normalizeTamilSpeech()` in scriptEngine.js — Romanized Tamil→Tamil script (80+ patterns: "katturen"→"கட்டுறேன்", "vendaam"→"வேண்டாம்", etc.)
- `normalizeForQA()` in aiService.js — Same phonetic mappings for Q&A matching consistency

### Script Flow Intelligence
- Branch priority: specific intents (wrong person, busy, complaints) checked BEFORE generic affirmatives
- Out-of-scope handling: When customer asks something not in workflow branches, falls back to AI Q&A engine (doesn't consume retry count)
- Context-aware GPT classifier: Includes agent's last question in prompt for better interpretation
- Multi-intent support: GPT picks the MORE SPECIFIC/ACTIONABLE branch when customer says two things

### Silence Handling (progressive)
1. First silence: "ஹலோ சார்? கேக்குறீங்களா?"
2. Second silence: Context-aware "சார்? Line-ல இருக்கீங்களா? உங்க {{chitValue}} சீட் due பற்றி பேசுறேன் சார்."
3. Third silence: Graceful end with "network issue-ஆ இருக்கலாம், அப்புறம் call பண்றோம்"

### Emotional Intelligence
- Angry/frustrated → acknowledge first, then address concern
- Hesitant → encouraging, offer alternatives (partial payment, callback)
- Rushed → brief, offer callback
- Confused → patient re-explanation

## CRM Integration Module
- **Page**: `/crm` — 3-tab dashboard (Configuration, Fetch Customers, Push Recordings)
- **Backend**: `src/routes/crm.routes.js` — `/api/crm/*`
  - `GET /config` + `PUT /config` — CRM URL settings (fetch URL, push URL, headers)
  - `POST /fetch-customers` — pull customer data from external CRM, upsert into KuralAI
  - `GET /calls` — list calls with recordings and push status
  - `POST /push-recording/:callId` — push single call recording + transcript to CRM
  - `POST /push-all` — bulk push all unpushed recordings
- **Frontend**: `dashboard/src/pages/CrmIntegration.jsx` + `CrmIntegration.module.css`
- **Settings keys**: `crmFetchUrl`, `crmFetchMethod`, `crmFetchHeaders`, `crmPushUrl`, `crmPushHeaders`
- CRM response format auto-detected: root array, `{customers:[]}`, `{data:[]}`, or `{results:[]}`
- Push payload includes: callId, phone, status, duration, recordingUrl, full transcript array, timestamps
- Push status tracked in `call.metadata.recordingPushedAt`

## API Config Module
- **Page**: `/api-config` — dedicated dashboard page showing all external service integrations
- **Backend**: `src/routes/apiConfig.routes.js` — `GET /api/api-config/status` + `POST /api/api-config/test/:serviceId`
- **Frontend**: `dashboard/src/pages/ApiConfig.jsx` + `ApiConfig.module.css`
- Shows 4 service cards: Telephony (Twilio/Exotel), OpenAI, TTS (ElevenLabs/Azure), AWS S3
- Each card shows masked credentials, configuration status, and a "Test Connection" button
- "Test All" button runs connectivity tests for all configured services in parallel
- Summary bar shows configured/connected/failed/untested counts + external API key status
- Admin-only access (requireAdmin middleware)

## API Routes
- `POST /api/auth/login` / `GET /api/auth/me`
- `POST /api/calls/initiate`, `GET /api/calls`, `GET /api/calls/export` (CSV)
- `GET /api/calls/:id/status`, `GET /api/transcripts/:callId`, `GET /api/logs/:callId`
- `POST /api/calls/:id/recording/push` — push recording to external system
- `GET /api/dashboard/stats|intents|calls/timeline|recent-calls`
- `GET/POST/PUT/DELETE /api/users` (admin only)
- `GET/PUT /api/settings` — stored in `config/app-settings.json`
- `GET/POST/PUT/DELETE /api/workflows` — stored in `config/workflows.json`
- `GET/POST/PUT/DELETE /api/templates/qa` — Q&A pair templates (stored in DB)
- `GET/POST/PUT/DELETE /api/templates/prompts` — system prompt templates (stored in DB)
- `GET /api/customers`, `GET /api/customers/:id` — customer list + chit metadata
- `GET/POST/PUT/DELETE /api/campaigns` — campaign CRUD
- `POST /api/campaigns/:id/start|pause|resume` — campaign lifecycle
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

## Customer Preference Capture (New)
When a call ends (naturally or via hang-up), the system automatically scans the transcript for detected intents and saves key customer preferences to the `customers.preferences` JSONB column:

| Intent detected | Preference saved |
|---|---|
| `lottery_participation` | `lotteryConfirmed: true` + timestamp |
| `no_office_calls` | `doNotCallOffice: true` + timestamp |
| `reduce_calls` | `preferSingleCaller: true` + timestamp |
| `payment_complaint` | `paymentIssueReported: true` + timestamp |
| `premature_withdrawal` | `withdrawalInterest: true` + timestamp |

- `src/services/preferenceService.js` — extraction + CRUD
- `PATCH /api/customers/:id/preferences` — set a key
- `DELETE /api/customers/:id/preferences/:key` — clear a key
- Preferences shown as colored badges in Simulator (CustomerCard) and ChitPanel, with a clear button
- Simulator automatically refreshes customer card after call ends to show updated preferences

## Workflow Builder — Q&A Import (New)
In the Workflows Q&A Script tab, the "Add from Q&A" button opens a picker that shows all available Q&A intents. Selecting one creates a pre-filled workflow step with:
- Default agent question for that intent (in Tamil)
- Branch expected phrases pre-filled from top 5 phraseKeywords
- Branch agent response from first Q&A response
- Correct action (continue / end_call)

## Notable Technical Decisions
- Twilio is the primary telephony provider (TwiML); Exotel available as legacy fallback via `telephonyService.js` facade
- Services are lazy-initialized to allow startup without API credentials
- WebSocket URL uses `window.location.host` dynamically (works behind Replit proxy)
- Settings stored in `app_settings` DB table with file-based fallback (`config/*.json`)
- Workflows stored in `config/workflows.json` (file-based)
- `express trust proxy` set to `true` for rate-limiter behind proxy
- ElevenLabs voice `ewhDNMMyMBipnXXTYPwy` (Samuthra) is the active TTS; Azure `ta-IN-PallaviNeural` as fallback
- Credit deduction: 2 min per call on initiation; campaigns auto-pause when credits run out
- CreditsBadge component (top-right) polls every 2min + on window focus; color-coded green/amber/red
- Campaign reports route placed BEFORE `/:id` in campaign.routes.js to avoid UUID validation conflict
