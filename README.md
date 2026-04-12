# KuralAI — Tamil AI Voice Calling System
### by Automystic

A production-ready, real-time AI voice calling system that speaks and understands Tamil naturally.

---

## Architecture Overview

```
Outgoing Call Request
       │
       ▼
  Call Controller ──► PostgreSQL (call record)
       │
       ▼
  Twilio API (initiateCall)
       │
  [User picks up]
       │
       ▼
  Twilio Webhook ──► /webhook/call/answer
       │
       ▼
  Conversation Engine
  ┌────────────────────────────────────────┐
  │  Play greeting (Azure TTS)             │
  │       ↓                                │
  │  Gather speech (Twilio)                │
  │       ↓                                │
  │  Whisper STT (Tamil)                   │
  │       ↓                                │
  │  Intent Detection (GPT-4o)             │
  │       ↓                                │
  │  Response Generation (GPT-4o)          │
  │       ↓                                │
  │  Azure Neural TTS → S3 → Pre-signed URL│
  │       ↓                                │
  │  Twilio plays audio → repeat loop      │
  └────────────────────────────────────────┘
       │
   [End condition]
       │
  ┌────┴────────────────────┐
  │ End normally            │ Escalate to human
  │ Play goodbye            │ Transfer to agent phone
  └─────────────────────────┘
```

## Folder Structure

```
kuralai/
├── src/
│   ├── server.js                    # Express app + bootstrap
│   ├── config/
│   │   ├── database.js              # PostgreSQL / Sequelize
│   │   └── tamilPrompts.js          # All Tamil AI prompts
│   ├── models/
│   │   ├── Call.js                  # Call records
│   │   ├── Transcript.js            # Conversation turns
│   │   ├── CallLog.js               # Event log
│   │   └── User.js                  # Dashboard users
│   ├── controllers/
│   │   ├── callController.js        # Call initiation & management
│   │   └── webhookController.js     # Twilio webhook handlers
│   ├── services/
│   │   ├── conversationEngine.js    # Core conversation loop
│   │   ├── aiService.js             # LLM + intent detection
│   │   ├── speechService.js         # Whisper STT + Azure TTS
│   │   ├── twilioService.js         # Twilio API + TwiML
│   │   ├── s3Service.js             # Audio file storage
│   │   ├── escalationService.js     # Human escalation webhook
│   │   └── retryScheduler.js        # Cron job for retries
│   ├── routes/
│   │   ├── call.routes.js
│   │   ├── transcript.routes.js
│   │   ├── log.routes.js
│   │   ├── auth.routes.js
│   │   ├── dashboard.routes.js
│   │   └── webhook.routes.js
│   ├── middleware/
│   │   ├── auth.js                  # JWT authentication
│   │   └── validate.js              # Request validation
│   ├── websocket/
│   │   └── wsServer.js              # Real-time dashboard updates
│   └── utils/
│       └── logger.js                # Winston logging
├── dashboard/                       # React dashboard UI
├── scripts/
│   ├── migrate.js                   # Run DB migrations
│   └── seed.js                      # Create admin user
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── docs/
│   └── API.md                       # Full API reference
├── .env.example
└── package.json
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- AWS account (S3)
- Twilio account
- OpenAI API key
- Azure Cognitive Services (Speech)
- A public HTTPS URL (use ngrok for local dev)

---

## Setup Instructions

### 1. Clone & Install

```bash
git clone https://github.com/automystic/kuralai.git
cd kuralai
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your actual credentials
nano .env
```

### 3. Setup PostgreSQL

```bash
# Create database
psql -U postgres -c "CREATE DATABASE kuralai;"
psql -U postgres -c "CREATE USER kuralai_user WITH PASSWORD 'your_pass';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE kuralai TO kuralai_user;"

# Run migrations (creates all tables)
npm run migrate

# Create admin user
npm run seed
```

### 4. Setup AWS S3

```bash
# Create S3 bucket (replace region as needed)
aws s3 mb s3://kuralai-audio-storage --region ap-south-1

# Set bucket policy (block public access, private)
aws s3api put-public-access-block \
  --bucket kuralai-audio-storage \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 5. Configure Twilio

1. Go to [Twilio Console](https://console.twilio.com)
2. Buy a phone number with Voice capability
3. Set the following in your `.env`:
   - `TWILIO_ACCOUNT_SID` — from Console Dashboard
   - `TWILIO_AUTH_TOKEN` — from Console Dashboard
   - `TWILIO_PHONE_NUMBER` — your purchased number (E.164: +1xxxxxxxxxx)
4. For local testing, expose your server using ngrok:
   ```bash
   ngrok http 3000
   # Copy the https URL → set as APP_URL in .env
   ```

### 6. Configure Azure Speech

1. Go to [Azure Portal](https://portal.azure.com)
2. Create a **Cognitive Services → Speech** resource
3. Copy the **Key** and **Region** to `.env`
4. Available Tamil voices:
   - `ta-IN-PallaviNeural` — Female (recommended)
   - `ta-IN-ValluvarNeural` — Male

### 7. Start the Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

---

## Docker Deployment

```bash
# Local dev with Docker
cd docker
docker compose up -d postgres
docker compose up backend

# With ngrok for Twilio testing
docker compose --profile dev up
```

---

## AWS Production Deployment

### Option A: EC2 + PM2

```bash
# On EC2 (Ubuntu 22.04, t3.medium recommended)
sudo apt update && sudo apt install -y nodejs npm postgresql-client

git clone https://github.com/automystic/kuralai.git
cd kuralai && npm install

npm install -g pm2
pm2 start src/server.js --name kuralai
pm2 startup && pm2 save
```

### Option B: ECS (Docker)

```bash
# Build and push to ECR
aws ecr create-repository --repository-name kuralai
docker build -f docker/Dockerfile -t kuralai .
docker tag kuralai:latest YOUR_ECR_URI/kuralai:latest
docker push YOUR_ECR_URI/kuralai:latest

# Deploy via ECS task definition (set env vars as ECS secrets)
```

### Required IAM Permissions for EC2/ECS role:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::kuralai-audio-storage/*"
}
```

---

## Twilio Configuration Details

### Setting Webhook URLs

After deploying (or using ngrok), set these in Twilio Console → Phone Numbers → Your Number:
- This is handled automatically via the `initiateCall()` function using your `APP_URL`

### Testing Locally with ngrok

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok
ngrok http 3000

# Set in .env
APP_URL=https://abc123.ngrok.io
```

### Test a Call

```bash
# 1. Login to get token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@automystic.com","password":"ChangeMe@123"}' \
  | jq -r '.token')

# 2. Initiate call
curl -X POST http://localhost:3000/api/calls/initiate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"toPhone":"+919876543210","metadata":{"customerName":"Test User"}}'
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | ✅ | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | ✅ | Twilio auth secret |
| `TWILIO_PHONE_NUMBER` | ✅ | Your Twilio phone number |
| `OPENAI_API_KEY` | ✅ | OpenAI API key (GPT-4o + Whisper) |
| `AZURE_SPEECH_KEY` | ✅ | Azure Speech API key |
| `AZURE_SPEECH_REGION` | ✅ | Azure region (e.g. eastus) |
| `DB_HOST` | ✅ | PostgreSQL host |
| `AWS_ACCESS_KEY_ID` | ✅ | AWS credentials for S3 |
| `S3_BUCKET_NAME` | ✅ | S3 bucket for audio files |
| `JWT_SECRET` | ✅ | Secret for dashboard auth |
| `APP_URL` | ✅ | Public HTTPS URL for Twilio webhooks |
| `ESCALATION_WEBHOOK_URL` | ⬜ | CRM webhook for human escalation |
| `ESCALATION_PHONE` | ⬜ | Phone number to transfer escalated calls |
| `MAX_CALL_DURATION_SECONDS` | ⬜ | Default: 300 (5 minutes) |
| `CALL_RETRY_ATTEMPTS` | ⬜ | Default: 3 |

---

## Sample Tamil Conversation Flow

```
AI:   வணக்கம்! நான் KuralAI. உங்களுக்கு எப்படி உதவலாம்?
      (Hello! I'm KuralAI. How can I help you?)

User: என்னோட ஆர்டர் எங்கே இருக்கு?
      (Where is my order?)

AI:   உங்கள் ஆர்டர் எண்ணை சொல்லுங்களா? அதை பார்த்து சொல்கிறேன்.
      (Can you tell me your order number? I'll check that for you.)

User: ORD 2024 ஒன்னு பதினஞ்சு ஆயிரம்
      (ORD 2024 one fifteen thousand)

AI:   உங்கள் ஆர்டர் இப்போது பேக்கிங் நிலையில் உள்ளது. நாளைக்குள் டெலிவரி ஆகும்.
      (Your order is currently being packed. It will be delivered by tomorrow.)

User: சரி, நன்றி
      (Okay, thank you)

AI:   நன்றி! வேறு ஏதாவது உதவி தேவையென்றால் மீண்டும் அழைக்கவும். வணக்கம்!
      (Thank you! If you need any more help, please call again. Goodbye!)
```

---

## Security Checklist

- [ ] Change default admin password after first login
- [ ] Set strong `JWT_SECRET` (32+ chars, random)
- [ ] Enable `DB_SSL=true` in production (AWS RDS)
- [ ] Use IAM roles instead of access keys on EC2/ECS
- [ ] Enable S3 bucket versioning and encryption
- [ ] Set `NODE_ENV=production`
- [ ] Configure ALLOWED_ORIGINS with your exact domain
- [ ] Enable Twilio webhook signature validation
- [ ] Rotate API keys quarterly

---

## Monitoring

Logs are written to:
- Console (colorized)
- `logs/kuralai.log` (all levels, rotated at 10MB)
- `logs/error.log` (errors only)

For production, ship logs to CloudWatch:
```bash
npm install winston-cloudwatch
# Add CloudWatch transport to src/utils/logger.js
```
