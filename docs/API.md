# KuralAI API Reference
## Example API Requests (cURL + Postman)

Base URL: `https://yourdomain.com`

---

## 1. Authentication

### Login
```bash
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@automystic.com",
    "password": "ChangeMe@123"
  }'
```
**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "uuid", "email": "admin@automystic.com", "role": "admin" }
}
```

---

## 2. Initiate Outgoing Call

```bash
curl -X POST https://yourdomain.com/api/calls/initiate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toPhone": "+919876543210",
    "metadata": {
      "customerName": "ராஜேஷ் குமார்",
      "orderId": "ORD-20240115-001",
      "customerId": "CUST-12345"
    },
    "maxRetries": 3
  }'
```
**Response:**
```json
{
  "success": true,
  "callId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "queued",
  "toPhone": "+919876543210"
}
```

---

## 3. Get Call Status

```bash
curl -X GET https://yourdomain.com/api/calls/CALL_ID/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
**Response:**
```json
{
  "success": true,
  "call": {
    "id": "a1b2c3d4-...",
    "callSid": "CAxxxxxx",
    "toPhone": "+919876543210",
    "status": "completed",
    "duration": 134,
    "escalated": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "startedAt": "2024-01-15T10:30:05.000Z",
    "endedAt": "2024-01-15T10:32:19.000Z"
  }
}
```

---

## 4. List Calls (with filters)

```bash
# All calls, page 1
curl -X GET "https://yourdomain.com/api/calls?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Filter by status
curl -X GET "https://yourdomain.com/api/calls?status=completed&page=1" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Filter by date range
curl -X GET "https://yourdomain.com/api/calls?fromDate=2024-01-01&toDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 5. Get Call Transcript

```bash
curl -X GET https://yourdomain.com/api/transcripts/CALL_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
**Response:**
```json
{
  "success": true,
  "call": { "id": "...", "toPhone": "+91...", "status": "completed", "duration": 134 },
  "transcript": [
    {
      "turnNumber": 0,
      "speaker": "ai",
      "text": "வணக்கம்! நான் KuralAI. Automystic-இன் உதவியாளர். உங்களுக்கு எப்படி உதவலாம்?",
      "intent": "greeting",
      "confidence": 1.0
    },
    {
      "turnNumber": 1,
      "speaker": "user",
      "text": "என்னோட ஆர்டர் எங்கே இருக்கு?",
      "intent": "order_status",
      "confidence": 0.94
    },
    {
      "turnNumber": 2,
      "speaker": "ai",
      "text": "உங்கள் ஆர்டர் எண்ணை சொல்லுங்களா? அதை பார்த்து சொல்கிறேன்.",
      "intent": "order_status",
      "confidence": 0.94
    }
  ]
}
```

---

## 6. Get Call Logs

```bash
curl -X GET https://yourdomain.com/api/logs/CALL_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
**Response:**
```json
{
  "success": true,
  "logs": [
    { "event": "call_answered", "level": "info", "message": "User answered the call", "createdAt": "..." },
    { "event": "stt_completed", "level": "info", "message": "Transcribed: \"என்னோட ஆர்டர் எங்கே இருக்கு?\"", "data": { "confidence": 0.91 } },
    { "event": "intent_detected", "level": "info", "message": "Intent: order_status", "data": { "confidence": 0.94 } },
    { "event": "tts_generated", "level": "info", "message": "TTS audio created", "data": { "duration": 3.2 } }
  ]
}
```

---

## 7. Retry a Failed Call

```bash
curl -X POST https://yourdomain.com/api/calls/CALL_ID/retry \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 8. Dashboard Stats

```bash
# Last 7 days summary
curl -X GET "https://yourdomain.com/api/dashboard/stats?days=7" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Top intents
curl -X GET "https://yourdomain.com/api/dashboard/intents?days=7" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Call timeline
curl -X GET "https://yourdomain.com/api/dashboard/calls/timeline?days=14" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 9. Health Check (no auth)

```bash
curl https://yourdomain.com/health
```
**Response:**
```json
{ "status": "ok", "service": "KuralAI", "version": "1.0.0", "timestamp": "2024-01-15T10:00:00.000Z" }
```

---

## Twilio Webhook URLs (configure in Twilio console)

| Event | URL |
|-------|-----|
| Call Answer | `POST https://yourdomain.com/webhook/call/answer?callId={id}` |
| Speech Input | `POST https://yourdomain.com/webhook/call/speech?callId={id}&turn={n}` |
| Silence Timeout | `POST https://yourdomain.com/webhook/call/silence?callId={id}&turn={n}` |
| Call Status | `POST https://yourdomain.com/webhook/call/status?callId={id}` |
| AMD Result | `POST https://yourdomain.com/webhook/call/amd?callId={id}` |
| Recording | `POST https://yourdomain.com/webhook/recording/status` |
