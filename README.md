# KuralAI — Enterprise Tamil AI Voice Calling SaaS
### by Automystic

A multi-tenant SaaS platform for AI-powered Tamil voice calling. Agent persona **சமுத்ரா** handles chit fund customer calls — due reminders, lottery participation, and payment follow-ups.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  React Dashboard (port 5000)                        │
│  ├── Tenant Admin: campaigns, calls, reports, CRM   │
│  └── Super Admin: orgs, plans, usage, revenue       │
└──────────────────┬──────────────────────────────────┘
                   │ proxy (/api, /webhook, /ws)
┌──────────────────▼──────────────────────────────────┐
│  Express API (port 3000)                            │
│  ├── Auth (JWT) + Tenant Scoping                    │
│  ├── Plan Enforcement + Credit Metering             │
│  ├── Conversation Engine (GPT-4o + Tamil NLP)       │
│  ├── Telephony (Twilio TwiML)                       │
│  ├── TTS (ElevenLabs / Azure Neural)                │
│  └── Razorpay Payments                              │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  PostgreSQL                                         │
│  ├── Multi-tenant data (org-scoped)                 │
│  ├── Plans, subscriptions, credit balances          │
│  └── Calls, transcripts, campaigns, customers       │
└─────────────────────────────────────────────────────┘
```

## Folder Structure

```
kuralai/
├── src/
│   ├── server.js
│   ├── config/
│   │   ├── database.js
│   │   └── tamilPrompts.js
│   ├── models/          (16 Sequelize models)
│   ├── controllers/
│   ├── services/
│   ├── routes/
│   ├── middleware/
│   ├── websocket/
│   └── utils/
├── dashboard/           (React CRA)
│   └── src/
│       ├── pages/       (20 pages)
│       ├── components/
│       ├── hooks/
│       └── api/
├── config/
│   ├── app-settings.json
│   └── workflows.json
├── scripts/
│   ├── migrate.js
│   └── seed.js
└── start.sh
```

## External Services

| Service | Purpose | Config |
|---------|---------|--------|
| Twilio | Telephony — primary (Exotel available as fallback) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| OpenAI | GPT-4o (LLM) + Whisper (STT) | `OPENAI_API_KEY` |
| ElevenLabs | Tamil TTS (primary) | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| Azure Speech | Tamil TTS (fallback) | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| Razorpay | Payment gateway | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| AWS S3 | Audio file storage (optional) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` |

## Subscription Plans (30% gross margin)

| Plan | Price/mo | Minutes | Extra/min |
|------|----------|---------|-----------|
| Starter | ₹999 | 115 | ₹10 |
| Growth | ₹2,999 | 350 | ₹8 |
| Business | ₹7,999 | 930 | ₹6 |
| Enterprise | ₹19,999 | 2,300 | ₹4 |

## Quick Start

```bash
bash start.sh
```

Default credentials:
- **Super Admin**: superadmin@kuralai.com / KuralAI@Super123
- **Tenant Admin**: admin@automystic.com / ChangeMe@123

## API Reference

See `docs/API.md` for full API documentation with cURL examples.
