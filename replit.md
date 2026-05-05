# KuralAI
KuralAI is a multi-tenant SaaS platform for AI-powered Tamil voice calling, helping businesses automate customer interactions.

## Run & Operate
To run the application, execute the `start.sh` script.
- `bash start.sh`

Required Environment Variables:
- `PORT=3000` (backend)
- `JWT_SECRET` (authentication)
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (auto-set by Replit DB)
- **OpenAI**: `OPENAI_API_KEY`
- **Twilio**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (or Exotel equivalent)
- **Azure TTS**: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (or ElevenLabs equivalent)
- **AWS S3** (optional): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
- **Razorpay**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- **Local Inference Engine**: `LOCAL_INFERENCE_URL`, `LOCAL_INFERENCE_TOKEN`

## Stack
- **Frontend**: React (Create React App)
- **Backend**: Node.js/Express
- **Database**: PostgreSQL (Sequelize ORM)
- **Real-time**: WebSockets (`ws`)
- **Authentication**: JWT, `bcryptjs`
- **Validation**: _Populate as you build_
- **Build Tool**: CRACO (for React)

## Where things live
- **Backend Entry Point**: `src/server.js`
- **Frontend Entry Point**: `dashboard/src/index.js`
- **Database Configuration**: `src/config/database.js`
- **DB Schema**: `src/models/*.js` (Sequelize models define schema)
- **API Contracts**: Defined in `src/routes/*.js`
- **Application Settings**: `app_settings` table (DB) and `config/app-settings.json` (fallback)
- **Workflow Definitions**: `config/workflows.json`
- **Q&A Templates**: `qa_templates` table
- **Prompt Templates**: `prompt_templates` table
- **CSS Variables/Design Tokens**: `dashboard/src/global.css`
- **Telephony Facade**: `src/services/telephonyService.js`
- **AI Core Logic**: `src/services/aiService.js`, `src/services/speechService.js`
- **Local Inference Server**: `inference-server/`

## Architecture decisions
- **Multi-tenant SaaS**: Data isolation per organization enforced by `tenantScope` middleware.
- **Provider-Agnostic Telephony**: A facade (`telephonyService.js`) abstracts Twilio/Exotel, allowing runtime selection.
- **Dual Settings Storage**: Settings are primarily in PostgreSQL (`app_settings` table) with a file-based fallback (`config/app-settings.json`) for services that directly read files.
- **Layered Intent Detection**: Utilizes exact Q&A matches, keyword detection, and GPT-4o-mini classification for robust intent recognition.
- **Self-Hosted Local Voice Engine**: KuralAI includes an optional, entirely open-source local inference server for STT, LLM, and TTS, enabling on-premise voice AI for reduced latency and cost, with an automatic failover mechanism.

## Product
KuralAI provides an AI voice calling system for businesses, featuring:
- **AI Agent Persona**: Customizable AI agents like "சமுத்ரா" for specific tasks (e.g., chit fund reminders).
- **Multi-Tenant Platform**: Supports multiple organizations with isolated data, users, and billing.
- **Configurable Workflows**: Define call flows for various scenarios (due reminders, lottery participation, payment follow-ups).
- **SaaS Features**: Subscription plans, credit management, module access control, and super-admin capabilities.
- **Analytics Dashboard**: Real-time KPIs, call logs, transcripts, and reporting.
- **CRM Integration**: Fetch customers and push call recordings/transcripts to external CRM systems.
- **API Configuration**: Centralized dashboard to manage and test external service integrations (telephony, AI, TTS, S3).
- **Campaign Management**: Create, run, and monitor automated call campaigns.
- **Local Voice Engine**: Option for self-hosted, open-source STT/LLM/TTS for privacy and cost control.
- **Multi-Agent System**: Create and manage multiple AI agent personas with distinct voices, prompts, and behaviors.

## User preferences
- _Populate as you build_

## Gotchas
- Always run `npm install` in both root and `dashboard/` directories when dependencies change.
- Campaign reports route (`/api/campaigns/reports`) must be placed before `/:id` in `campaign.routes.js` to avoid routing conflicts.
- Credit deduction is 2 minutes per call on initiation; campaigns will auto-pause if credits run out.
- The local voice engine requires a separate GPU host; only its public URL and bearer token are configured in app settings.
- When configuring the local voice engine, ensure the `engineFallbackChain` setting is correctly prioritized (e.g., `'local,sarvam'` for local with Sarvam fallback).

## Pointers
- **Replit Database Documentation**: [https://docs.replit.com/hosting/databases/replit-database](https://docs.replit.com/hosting/databases/replit-database)
- **Twilio TwiML Docs**: [https://www.twilio.com/docs/voice/twiml](https://www.twilio.com/docs/voice/twiml)
- **Exotel ExoML Docs**: [https://developer.exotel.com/docs/exoml/](https://developer.exotel.com/docs/exoml/)
- **OpenAI GPT-4o API**: [https://platform.openai.com/docs/models/gpt-4o](https://platform.openai.com/docs/models/gpt-4o)
- **Azure TTS Docs**: [https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/text-to-speech](https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/text-to-speech)
- **ElevenLabs API Docs**: [https://docs.elevenlabs.io/api-reference/text-to-speech](https://docs.elevenlabs.io/api-reference/text-to-speech)
- **Razorpay API Docs**: [https://razorpay.com/docs/api/](https://razorpay.com/docs/api/)
- **Ollama Docs**: [https://ollama.com/docs](https://ollama.com/docs)
- **Faster-Whisper GitHub**: [https://github.com/guillaumekln/faster-whisper](https://github.com/guillaumekln/faster-whisper)
- **Parler-TTS GitHub**: [https://github.com/huggingface/parler-tts](https://github.com/huggingface/parler-tts)
- **Inference Server README**: `inference-server/README.md`