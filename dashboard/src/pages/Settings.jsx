import React, { useState, useEffect } from 'react';
import { settingsApi, workflowsApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Settings.module.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const AZURE_VOICE_OPTIONS = [
  { value: 'ta-IN-PallaviNeural', label: 'Pallavi (Female)' },
  { value: 'ta-IN-ValluvarNeural', label: 'Valluvar (Male)' },
];

const ELEVENLABS_VOICE_PRESETS = [
  { value: 'mGboHvCVOXWYeFL8KTR0', label: 'யாழினி (Yazhini) — Tamil Female' },
  { value: 'ewhDNMMyMBipnXXTYPwy', label: 'சமுத்ரா (Samuthra) — Tamil Female' },
  { value: 'yt40uMsmnhVftG8ngHsz', label: 'அஸ்வின் (Ashwin) — Tamil Male' },
  { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel — calm, professional (Female)' },
  { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella — soft, warm (Female)' },
  { value: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh — deep, assured (Male)' },
  { value: 'ErXwobaYiN019PkySvjV', label: 'Antoni — warm, friendly (Male)' },
  { value: 'custom', label: 'Custom Voice ID…' },
];

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster, lower cost)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
];

const CREDENTIAL_KEYS = [
  'exotelSid', 'exotelApiKey', 'exotelApiToken', 'exotelWebhookToken',
  'twilioAccountSid', 'twilioAuthToken',
  'openaiApiKey', 'azureSpeechKey', 'awsAccessKeyId', 'awsSecretAccessKey',
  'elevenLabsApiKey', 'razorpayKeyId', 'razorpayKeySecret', 'elevenlabsToolKey',
  'localInferenceToken',
];

const NAV_ITEMS = [
  { id: 'telephony', label: 'Telephony',   icon: '📞' },
  { id: 'ai',        label: 'AI & Voice',  icon: '🤖' },
  { id: 'local',     label: 'Local Engine', icon: '🖥️' },
  { id: 'payment',   label: 'Payment Gateway', icon: '💳' },
  { id: 'storage',   label: 'Storage',     icon: '🗄️' },
  { id: 'behaviour', label: 'Behaviour',   icon: '⚙️' },
  { id: 'escalation',label: 'Escalation',  icon: '↗️' },
  { id: 'inbound',   label: 'Inbound',     icon: '📲' },
  { id: 'api',       label: 'API Access',  icon: '🔑' },
];

// ── Reusable UI atoms ──────────────────────────────────────────────────────────

function Field({ label, hint, children, wide }) {
  return (
    <div className={`${styles.field} ${wide ? styles.fieldWide : ''}`}>
      <label className={styles.label}>{label}</label>
      {hint && <p className={styles.hint}>{hint}</p>}
      {children}
    </div>
  );
}

function SecretInput({ value, onChange, placeholder, name, alreadySaved }) {
  const [show, setShow] = useState(false);
  const showSavedBadge = alreadySaved && !value;
  return (
    <div className={styles.secretWrap}>
      <input
        className={styles.input}
        type={show ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={alreadySaved ? 'Leave blank to keep existing value' : (placeholder || 'Enter value')}
        autoComplete="new-password"
        style={{ paddingRight: showSavedBadge ? 74 : 36 }}
      />
      <button type="button" className={styles.secretToggle} onClick={() => setShow(s => !s)} title={show ? 'Hide' : 'Show'}>
        {show ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </button>
      {showSavedBadge && <span className={styles.secretSet}>✓ Saved</span>}
    </div>
  );
}

function Card({ label, badge, optional, children }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardHeadLabel}>{label}</span>
        {badge && <span className={`${styles.cardHeadBadge} ${optional ? styles.cardHeadBadgeOptional : ''}`}>{badge}</span>}
      </div>
      <div className={styles.cardBody}>{children}</div>
    </div>
  );
}

function ProviderCard({ icon, bgClass, name, hint, active, onClick }) {
  return (
    <button type="button" className={`${styles.providerCard} ${active ? styles.providerCardActive : ''}`} onClick={onClick}>
      <div className={`${styles.providerLogo} ${bgClass}`}>{icon}</div>
      <div className={styles.providerInfo}>
        <div className={styles.providerName}>{name}</div>
        <div className={styles.providerHint}>{hint}</div>
      </div>
    </button>
  );
}

function WebhookUrls({ provider, appUrl, token }) {
  const base = (appUrl || 'https://your-domain.com').replace(/\/$/, '');
  const wt   = token ? `?wt=${token}` : '?wt=<token>';

  const urls = provider === 'twilio'
    ? [
        { label: 'Answer',      url: `${base}/webhook/call/answer${wt}` },
        { label: 'Status',      url: `${base}/webhook/call/status${wt}` },
        { label: 'Incoming',    url: `${base}/webhook/call/incoming${wt}` },
      ]
    : [
        { label: 'Voice',       url: `${base}/webhook/voice${wt}` },
        { label: 'Answer',      url: `${base}/webhook/call/answer${wt}` },
        { label: 'Status',      url: `${base}/webhook/call/status${wt}` },
        { label: 'Recording',   url: `${base}/webhook/recording/status${wt}` },
        { label: 'Incoming',    url: `${base}/webhook/call/incoming${wt}` },
      ];

  function copy(text) { navigator.clipboard.writeText(text).catch(() => {}); }

  return (
    <div className={styles.webhookBox}>
      <div className={styles.webhookBoxTitle}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        Paste these URLs in your {provider === 'twilio' ? 'Twilio Console → Phone Numbers → Webhooks' : 'Exotel Dashboard → Campaign settings'}
      </div>
      {urls.map(({ label, url }) => (
        <div key={label} className={styles.webhookRow}>
          <span className={styles.webhookLabel}>{label}</span>
          <code className={styles.webhookUrl}>{url}</code>
          <button type="button" className={styles.copyBtn} onClick={() => copy(url)} title="Copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Section renderers ──────────────────────────────────────────────────────────

function TelephonySection({ s, savedCreds, onChange }) {
  const provider = s.telephonyProvider || 'exotel';
  return (
    <>
      <h2 className={styles.sectionTitle}>Telephony</h2>
      <p className={styles.sectionSub}>Choose your calling provider and enter the credentials.</p>

      <div className={styles.providerRow}>
        <ProviderCard
          icon="E" bgClass={styles.providerLogoExotel}
          name="Exotel" hint="Indian telephony"
          active={provider === 'exotel'}
          onClick={() => onChange('telephonyProvider', 'exotel')}
        />
        <ProviderCard
          icon="T" bgClass={styles.providerLogoTwilio}
          name="Twilio" hint="Global, trial-friendly"
          active={provider === 'twilio'}
          onClick={() => onChange('telephonyProvider', 'twilio')}
        />
      </div>

      {provider === 'exotel' && (
        <Card label="Exotel Credentials" badge="Required">
          <div className={styles.grid}>
            <Field label="Account SID" hint="Settings → API Keys in Exotel Dashboard">
              <SecretInput name="exotelSid" value={s.exotelSid || ''} onChange={e => onChange('exotelSid', e.target.value)} placeholder="Your Exotel Account SID" alreadySaved={savedCreds.has('exotelSid')} />
            </Field>
            <Field label="API Key" hint="Settings → API Keys in Exotel Dashboard">
              <SecretInput name="exotelApiKey" value={s.exotelApiKey || ''} onChange={e => onChange('exotelApiKey', e.target.value)} placeholder="Exotel API Key" alreadySaved={savedCreds.has('exotelApiKey')} />
            </Field>
            <Field label="API Token" hint="Settings → API Keys in Exotel Dashboard">
              <SecretInput name="exotelApiToken" value={s.exotelApiToken || ''} onChange={e => onChange('exotelApiToken', e.target.value)} placeholder="Exotel API Token" alreadySaved={savedCreds.has('exotelApiToken')} />
            </Field>
            <Field label="ExoPhone Number" hint="Virtual number in E.164 format (e.g. +918XXXXXXXXX)">
              <input className={styles.input} value={s.exotelPhoneNumber || ''} onChange={e => onChange('exotelPhoneNumber', e.target.value)} placeholder="+918XXXXXXXXX" />
            </Field>
            <Field label="App URL" hint="Public URL of this server — used to build webhook URLs" wide>
              <input className={styles.input} value={s.appUrl || ''} onChange={e => onChange('appUrl', e.target.value)} placeholder="https://your-app.replit.app" />
            </Field>
            <Field label="Webhook Token" hint="Secret string appended to all webhook URLs" wide>
              <SecretInput name="exotelWebhookToken" value={s.exotelWebhookToken || ''} onChange={e => onChange('exotelWebhookToken', e.target.value)} placeholder="e.g. kural-wh-secret-abc123xyz" alreadySaved={savedCreds.has('exotelWebhookToken')} />
            </Field>
          </div>
          <WebhookUrls provider="exotel" appUrl={s.appUrl} token={s.exotelWebhookToken} />
        </Card>
      )}

      {provider === 'twilio' && (
        <Card label="Twilio Credentials" badge="Required">
          <div className={styles.grid}>
            <Field label="Account SID" hint="From console.twilio.com → Dashboard (starts with AC…)">
              <SecretInput name="twilioAccountSid" value={s.twilioAccountSid || ''} onChange={e => onChange('twilioAccountSid', e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" alreadySaved={savedCreds.has('twilioAccountSid')} />
            </Field>
            <Field label="Auth Token" hint="From console.twilio.com → Dashboard (below Account SID)">
              <SecretInput name="twilioAuthToken" value={s.twilioAuthToken || ''} onChange={e => onChange('twilioAuthToken', e.target.value)} placeholder="Your Twilio Auth Token" alreadySaved={savedCreds.has('twilioAuthToken')} />
            </Field>
            <Field label="Twilio Phone Number" hint="Your Twilio number in E.164 format (e.g. +1XXXXXXXXXX)">
              <input className={styles.input} value={s.twilioPhoneNumber || ''} onChange={e => onChange('twilioPhoneNumber', e.target.value)} placeholder="+1XXXXXXXXXX" />
            </Field>
            <Field label="App URL" hint="Public URL of this server — used to build webhook URLs">
              <input className={styles.input} value={s.appUrl || ''} onChange={e => onChange('appUrl', e.target.value)} placeholder="https://your-app.replit.app" />
            </Field>
            <Field label="Webhook Token" hint="Secret appended to all webhook URLs for security" wide>
              <SecretInput name="exotelWebhookToken" value={s.exotelWebhookToken || ''} onChange={e => onChange('exotelWebhookToken', e.target.value)} placeholder="e.g. kural-wh-secret-abc123xyz" alreadySaved={savedCreds.has('exotelWebhookToken')} />
            </Field>
          </div>
          <WebhookUrls provider="twilio" appUrl={s.appUrl} token={s.exotelWebhookToken} />
        </Card>
      )}
    </>
  );
}

function AiVoiceSection({ s, savedCreds, onChange, elVoicePreset, setElVoicePreset }) {
  return (
    <>
      <h2 className={styles.sectionTitle}>AI & Voice</h2>
      <p className={styles.sectionSub}>Configure language model and text-to-speech provider.</p>

      <Card label="OpenAI" badge="Required">
        <div className={styles.grid}>
          <Field label="API Key" hint="From platform.openai.com → API Keys">
            <SecretInput name="openaiApiKey" value={s.openaiApiKey || ''} onChange={e => onChange('openaiApiKey', e.target.value)} placeholder="sk-..." alreadySaved={savedCreds.has('openaiApiKey')} />
          </Field>
          <Field label="Model" hint="Language model for Tamil conversation">
            <select className={styles.input} value={s.openaiModel || 'gpt-4o'} onChange={e => onChange('openaiModel', e.target.value)}>
              {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card label="Default Voice Engine" badge="Routes all outbound calls">
        <div className={styles.grid}>
          <Field label="Default Voice Engine" hint="Applies to ALL outbound calls (Campaigns + customer Call buttons + bulk + retries). Per-campaign overrides still work.">
            <select className={styles.input} value={s.defaultEngine || 'kuralai'} onChange={e => onChange('defaultEngine', e.target.value)}>
              <option value="local">Local — Self-hosted KuralAI inference (Tamil-first)</option>
              <option value="kuralai">KuralAI Scripted Engine</option>
              <option value="elevenlabs">ElevenLabs Conversational AI (Samuthra)</option>
              <option value="sarvam">Sarvam.ai Conversational (Indian voices)</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card label="Text-to-Speech" badge="Required">
        <div className={styles.providerRow}>
          <ProviderCard
            icon="A" bgClass={styles.providerLogoAzure}
            name="Azure Neural TTS" hint="Tamil native voices"
            active={(s.ttsProvider || 'azure') === 'azure'}
            onClick={() => onChange('ttsProvider', 'azure')}
          />
          <ProviderCard
            icon="E" bgClass={styles.providerLogoEllabs}
            name="ElevenLabs" hint="Highly natural, multilingual"
            active={s.ttsProvider === 'elevenlabs'}
            onClick={() => onChange('ttsProvider', 'elevenlabs')}
          />
        </div>

        {(s.ttsProvider || 'azure') === 'azure' && (
          <div className={styles.grid}>
            <Field label="Azure Speech Key" hint="Azure Portal → Speech resource → Keys and Endpoint">
              <SecretInput name="azureSpeechKey" value={s.azureSpeechKey || ''} onChange={e => onChange('azureSpeechKey', e.target.value)} placeholder="Azure Speech subscription key" alreadySaved={savedCreds.has('azureSpeechKey')} />
            </Field>
            <Field label="Region" hint="e.g. centralindia, eastus, southeastasia">
              <input className={styles.input} value={s.azureSpeechRegion || ''} onChange={e => onChange('azureSpeechRegion', e.target.value)} placeholder="e.g. centralindia" />
            </Field>
            <Field label="Tamil Voice" hint="Azure Neural TTS voice">
              <select className={styles.input} value={s.azureSpeechVoice || 'ta-IN-PallaviNeural'} onChange={e => onChange('azureSpeechVoice', e.target.value)}>
                {AZURE_VOICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
        )}

        {s.ttsProvider === 'elevenlabs' && (
          <div className={styles.grid}>
            <Field label="ElevenLabs API Key" hint="elevenlabs.io → Profile → API Key">
              <SecretInput name="elevenLabsApiKey" value={s.elevenLabsApiKey || ''} onChange={e => onChange('elevenLabsApiKey', e.target.value)} placeholder="sk_..." alreadySaved={savedCreds.has('elevenLabsApiKey')} />
            </Field>
            <Field label="Conversational Agent ID" hint="ElevenLabs → Conversational AI → Agent → settings → Agent ID (only needed for the ElevenLabs engine)">
              <input className={styles.input} value={s.elevenlabsAgentId || ''} onChange={e => onChange('elevenlabsAgentId', e.target.value)} placeholder="agent_xxxxxxxxxxxxxxxxxxxxxxxx" />
            </Field>
            <Field label="Agent Phone Number ID" hint="ElevenLabs → Phone Numbers → your imported Twilio number → ID">
              <input className={styles.input} value={s.elevenlabsAgentPhoneNumberId || ''} onChange={e => onChange('elevenlabsAgentPhoneNumberId', e.target.value)} placeholder="phnum_xxxxxxxxxxxxxxxxxxxxxxxx" />
            </Field>
            <Field label="Tool Webhook Key" hint="X-API-Key value used in the 7 ElevenLabs tools — must match what tools send to /api/elevenlabs/tools/*">
              <SecretInput name="elevenlabsToolKey" value={s.elevenlabsToolKey || ''} onChange={e => onChange('elevenlabsToolKey', e.target.value)} placeholder="kuralai_automystics" alreadySaved={savedCreds.has('elevenlabsToolKey')} />
            </Field>
            <Field label="Post-Call Webhook URL (read-only)" hint="Configure this in ElevenLabs → Workspace Settings → Webhooks → Add → paste this URL → enable post_call_transcription event">
              <input className={styles.input} readOnly value={`${window.location.origin}/api/elevenlabs/webhooks/post-call`} onClick={e => e.target.select()} />
            </Field>
            <Field label="Webhook Secret (optional)" hint="If you set a secret in ElevenLabs webhook config, paste it here. Leave blank to skip signature verification.">
              <SecretInput name="elevenlabsWebhookSecret" value={s.elevenlabsWebhookSecret || ''} onChange={e => onChange('elevenlabsWebhookSecret', e.target.value)} placeholder="whsec_..." alreadySaved={savedCreds.has('elevenlabsWebhookSecret')} />
            </Field>
            <Field label="Voice Preset" hint="Pick a built-in voice or enter a custom Voice ID">
              <select className={styles.input} value={elVoicePreset} onChange={e => {
                const v = e.target.value;
                setElVoicePreset(v);
                if (v !== 'custom') onChange('elevenLabsVoiceId', v);
              }}>
                {ELEVENLABS_VOICE_PRESETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field
              label={elVoicePreset === 'custom' ? 'Custom Voice ID' : 'Voice ID'}
              hint={elVoicePreset === 'custom' ? 'Paste the Voice ID from your ElevenLabs voice library' : 'Auto-filled from preset above'}
            >
              <input
                className={styles.input}
                value={s.elevenLabsVoiceId || ''}
                onChange={e => { setElVoicePreset('custom'); onChange('elevenLabsVoiceId', e.target.value); }}
                placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                readOnly={elVoicePreset !== 'custom'}
              />
            </Field>
            <Field label="Model" hint="eleven_flash_v2_5 — ultra-low latency, supports Tamil + 32 languages">
              <input className={styles.input} value="eleven_flash_v2_5" readOnly />
            </Field>
          </div>
        )}
      </Card>

      <Card label="Sarvam.ai Conversational" badge="Indian voices · STT + LLM + TTS">
        <p className={styles.cardSub}>
          End-to-end Indian-language conversational engine. Twilio dials the customer, audio bridges over a Media Stream,
          and Sarvam handles speech-to-text, the chat brain, and text-to-speech. Set <b>Default Voice Engine</b> above
          to <b>Sarvam.ai</b> to route all outbound calls through it (or pick it on a per-campaign basis).
        </p>
        <div className={styles.grid}>
          <Field label="Sarvam API Key" hint="dashboard.sarvam.ai → API Keys">
            <SecretInput name="sarvamApiKey" value={s.sarvamApiKey || ''} onChange={e => onChange('sarvamApiKey', e.target.value)} placeholder="sk_..." alreadySaved={savedCreds.has('sarvamApiKey')} />
          </Field>
          <Field label="Language" hint="BCP-47 code; ta-IN, hi-IN, en-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, or-IN">
            <select className={styles.input} value={s.sarvamLanguageCode || 'ta-IN'} onChange={e => onChange('sarvamLanguageCode', e.target.value)}>
              <option value="ta-IN">தமிழ் (ta-IN)</option>
              <option value="hi-IN">हिन्दी (hi-IN)</option>
              <option value="en-IN">English – India (en-IN)</option>
              <option value="te-IN">తెలుగు (te-IN)</option>
              <option value="kn-IN">ಕನ್ನಡ (kn-IN)</option>
              <option value="ml-IN">മലയാളം (ml-IN)</option>
              <option value="mr-IN">मराठी (mr-IN)</option>
              <option value="gu-IN">ગુજરાતી (gu-IN)</option>
              <option value="bn-IN">বাংলা (bn-IN)</option>
              <option value="pa-IN">ਪੰਜਾਬੀ (pa-IN)</option>
              <option value="or-IN">ଓଡ଼ିଆ (or-IN)</option>
            </select>
          </Field>
          <Field label="Voice (Speaker)" hint="Bulbul speakers: meera, pavithra, maitreyi, arvind, amol, amartya, diya, neel, misha, vian, arjun, maya">
            <select className={styles.input} value={s.sarvamVoice || 'meera'} onChange={e => onChange('sarvamVoice', e.target.value)}>
              <option value="meera">Meera (female, warm)</option>
              <option value="pavithra">Pavithra (female)</option>
              <option value="maitreyi">Maitreyi (female)</option>
              <option value="diya">Diya (female)</option>
              <option value="misha">Misha (female)</option>
              <option value="maya">Maya (female)</option>
              <option value="arvind">Arvind (male)</option>
              <option value="amol">Amol (male)</option>
              <option value="amartya">Amartya (male)</option>
              <option value="neel">Neel (male)</option>
              <option value="vian">Vian (male)</option>
              <option value="arjun">Arjun (male)</option>
            </select>
          </Field>
          <Field label="TTS Model" hint="bulbul:v3 recommended (highest quality). bulbul:v2 is cheaper.">
            <select className={styles.input} value={s.sarvamTtsModel || 'bulbul:v3'} onChange={e => onChange('sarvamTtsModel', e.target.value)}>
              <option value="bulbul:v3">bulbul:v3 (premium · ₹30/10K chars)</option>
              <option value="bulbul:v2">bulbul:v2 (standard · ₹15/10K chars)</option>
            </select>
          </Field>
          <Field label="STT Model" hint="saarika:v2 (default) — Sarvam's Indian-language ASR">
            <input className={styles.input} value={s.sarvamSttModel || 'saarika:v2'} onChange={e => onChange('sarvamSttModel', e.target.value)} placeholder="saarika:v2" />
          </Field>
          <Field label="Chat Model" hint="sarvam-m (default) — Sarvam's Indian LLM. Or any OpenAI-compatible model exposed via Sarvam.">
            <input className={styles.input} value={s.sarvamChatModel || 'sarvam-m'} onChange={e => onChange('sarvamChatModel', e.target.value)} placeholder="sarvam-m" />
          </Field>
          <Field label="Greeting (optional)" hint="First sentence the agent speaks. Supports {{customer_name}}. Leave blank for default.">
            <textarea className={styles.input} rows={2} value={s.sarvamGreeting || ''} onChange={e => onChange('sarvamGreeting', e.target.value)} placeholder="வணக்கம் {{customer_name}}, நான் சமுத்ரா..." />
          </Field>
          <Field label="System Prompt (optional)" hint="Agent's behaviour. Supports {{customer_name}}, {{company_name}}, {{services}}, {{office_hours}}, {{support_number}}, {{purpose}}, {{custom_fields}}. Leave blank for default Tamil prompt.">
            <textarea className={styles.input} rows={6} value={s.sarvamSystemPrompt || ''} onChange={e => onChange('sarvamSystemPrompt', e.target.value)} placeholder="நீங்கள் சமுத்ரா — {{company_name}}-ன் தமிழ் AI உதவியாளர்..." />
          </Field>
          <Field
            label="Exotel Voicebot App ID"
            hint={'ONLY needed if Telephony Provider = Exotel. In Exotel dashboard → App Bazaar → create a new App with a Voicebot Applet pointing to wss://<your-app-url>/sarvam-stream, then paste that App ID here.'}
          >
            <input className={styles.input} value={s.exotelSarvamAppId || ''} onChange={e => onChange('exotelSarvamAppId', e.target.value)} placeholder="e.g. 1234567 or full http://my.exotel.com/.../start_voice/1234567" />
          </Field>
        </div>
      </Card>
    </>
  );
}

// Shared in-memory voice cache so the picker and the Voice Lab stay in sync.
const _voiceCache = { voices: [], ts: 0, listeners: new Set() };
async function refreshVoices() {
  try {
    const res = await fetch('/webhook/local-voices');
    const j = await res.json();
    _voiceCache.voices = j.voices || [];
  } catch {
    _voiceCache.voices = [];
  }
  _voiceCache.ts = Date.now();
  for (const fn of _voiceCache.listeners) try { fn(_voiceCache.voices); } catch {}
}
function useVoiceCatalogue() {
  const [voices, setVoices] = useState(_voiceCache.voices);
  useEffect(() => {
    _voiceCache.listeners.add(setVoices);
    if (Date.now() - _voiceCache.ts > 5000) refreshVoices();
    return () => { _voiceCache.listeners.delete(setVoices); };
  }, []);
  return [voices, refreshVoices];
}

function VoicePicker({ value, onChange }) {
  const [voices] = useVoiceCatalogue();
  const known = voices.find(v => v.id === value);
  return (
    <select className={styles.input} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">— Select a voice —</option>
      {voices.map(v => (
        <option key={v.id} value={v.id}>
          {v.displayName} · {v.language || 'ta'} · {v.gender || 'unknown'}{v.builtin ? '' : ' (cloned)'}
        </option>
      ))}
      {value && !known && <option value={value}>{value} (not on server)</option>}
    </select>
  );
}

function VoiceLab({ token }) {
  const [voices, reload] = useVoiceCatalogue();
  const [voiceId, setVoiceId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [language, setLanguage] = useState('ta');
  const [gender, setGender] = useState('female');
  const [description, setDescription] = useState(
    'A warm, professional female speaker delivers her words clearly and naturally in Tamil with a friendly, conversational tone, moderate pace, and very high studio audio quality with no background noise.'
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewing, setPreviewing] = useState('');

  async function clone(e) {
    e.preventDefault();
    if (!token)   { setMsg('Set Webhook Token in Telephony first — required to save voices.'); return; }
    if (!description.trim()) { setMsg('Write a voice style description.'); return; }
    if (!voiceId) { setMsg('Enter a voice ID (e.g. priya-tamil-warm).'); return; }
    setBusy(true); setMsg('');
    try {
      const fd = new FormData();
      fd.append('voiceId', voiceId);
      fd.append('displayName', displayName || voiceId);
      fd.append('language', language);
      fd.append('gender', gender);
      fd.append('description', description);
      const r = await fetch(`/webhook/local-voices?wt=${encodeURIComponent(token)}`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(`✓ Saved "${j.voice?.displayName || voiceId}"`);
      setVoiceId(''); setDisplayName('');
      await reload();
    } catch (err) {
      setMsg(`✗ ${err.message}`);
    } finally { setBusy(false); }
  }

  async function remove(id) {
    if (!token) { setMsg('Set Webhook Token first.'); return; }
    if (!window.confirm(`Delete voice "${id}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/webhook/local-voices/${encodeURIComponent(id)}?wt=${encodeURIComponent(token)}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(`✓ Deleted "${id}"`);
      await reload();
    } catch (err) { setMsg(`✗ ${err.message}`); }
    finally { setBusy(false); }
  }

  async function preview(id, opts = {}) {
    setPreviewing(id); setMsg('');
    try {
      const r = await fetch('/webhook/local-voices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: id,
          text: 'வணக்கம், நான் உங்கள் தமிழ் AI உதவியாளர். நான் எப்படி உதவலாம்?',
          description: opts.description || undefined,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) { setMsg(`✗ Preview failed: ${err.message}`); }
    finally { setPreviewing(''); }
  }

  return (
    <Card label="Voice Lab" badge="100% open-source · prompt-driven voices">
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Describe the voice in plain English ("warm female Tamil speaker, slow expressive delivery, professional
        studio quality") and Indic-Parler-TTS (Apache 2.0) synthesises it. Modify any voice anytime by editing
        the prompt — no re-recording, no proprietary services. Per-campaign override: set <code>localTtsVoice</code>
        and/or <code>localVoiceDescription</code> in campaign metadata.
      </p>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Available Voices ({voices.length})
        </div>
        {voices.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>
            No voices yet. Clone your first voice below — or drop reference WAVs into <code>inference-server/voices/</code> on the GPU box.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {voices.map(v => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {v.displayName}
                    <span style={{ marginLeft: 8, padding: '1px 6px', fontSize: 10, fontWeight: 500, borderRadius: 4, background: '#DBEAFE', color: '#1E40AF' }}>
                      PARLER
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {v.id} · {v.language} · {v.gender}{v.durationSeconds ? ` · ${v.durationSeconds}s` : ''}
                    {v.builtin ? ' · built-in' : ''}
                  </div>
                  {v.description && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic', lineHeight: 1.4 }}>
                      "{v.description.length > 140 ? v.description.slice(0, 140) + '…' : v.description}"
                    </div>
                  )}
                </div>
                <button type="button" className={styles.copyBtn} onClick={() => preview(v.id)} disabled={!!previewing} style={{ fontSize: 11 }}>
                  {previewing === v.id ? 'Synthing…' : '▶ Preview'}
                </button>
                {!v.builtin && (
                  <button type="button" className={styles.copyBtn} onClick={() => remove(v.id)} disabled={busy} style={{ fontSize: 11, color: '#DC2626' }}>
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {previewUrl && (
          <div style={{ marginTop: 10 }}>
            <audio controls autoPlay src={previewUrl} style={{ width: '100%' }} />
          </div>
        )}
      </div>

      <form onSubmit={clone} style={{ background: '#F8FAFC', border: '1.5px dashed var(--border)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Add a New Voice (prompt-driven)
        </div>
        <div className={styles.grid}>
          <Field label="Voice ID" hint="Lowercase, no spaces. Used as the API identifier.">
            <input className={styles.input} value={voiceId} onChange={e => setVoiceId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="priya-tamil-warm" />
          </Field>
          <Field label="Display Name" hint="Shown in the dropdown.">
            <input className={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Priya — Warm Tamil Female" />
          </Field>
          <Field label="Language">
            <select className={styles.input} value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="ta">Tamil</option>
              <option value="hi">Hindi</option>
              <option value="en">English</option>
              <option value="te">Telugu</option>
              <option value="kn">Kannada</option>
              <option value="ml">Malayalam</option>
            </select>
          </Field>
          <Field label="Gender">
            <select className={styles.input} value={gender} onChange={e => setGender(e.target.value)}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
          <Field
            label="Voice Style Prompt (required)"
            hint='Describe pace, tone, gender, pitch, recording quality. Example: "A warm female Tamil speaker, slow expressive delivery, slightly breathy, professional studio recording with no background noise."'
            wide
          >
            <textarea className={styles.input} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="A warm, professional female Tamil speaker, moderate pace, friendly tone, very high studio audio quality." />
          </Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button type="submit" className={styles.saveBtn} disabled={busy} style={{ padding: '8px 18px', fontSize: 13 }}>
            {busy ? 'Saving…' : 'Create Voice'}
          </button>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✓') ? '#16A34A' : '#DC2626' }}>{msg}</span>}
        </div>
      </form>
    </Card>
  );
}

function LocalEngineSection({ s, savedCreds, onChange }) {
  const [health, setHealth] = useState(null);
  const [probing, setProbing] = useState(false);

  async function probe() {
    setProbing(true);
    try {
      const res = await fetch('/webhook/local-health');
      setHealth(await res.json());
    } catch (e) {
      setHealth({ ok: false, error: e.message });
    }
    setProbing(false);
  }

  useEffect(() => { probe(); /* eslint-disable-next-line */ }, []);

  const stateColor = (st) =>
    st === 'ready' ? '#16A34A' : st === 'loading' ? '#D97706' : '#DC2626';

  return (
    <>
      <h2 className={styles.sectionTitle}>Local Engine — Self-Hosted Inference</h2>
      <p className={styles.sectionSub}>
        Run your own STT + LLM + TTS on a GPU box (RTX 4090 / A10 / L4 recommended). Tamil-first quality on par with
        ElevenLabs, no per-minute API cost, full control over the voice and prompt. Sarvam / ElevenLabs remain
        available as automatic fallbacks for any call where your inference server is degraded.
      </p>

      <Card label="Inference Server Connection" badge="Required">
        <div className={styles.grid}>
          <Field label="Inference URL" hint="Public HTTPS URL of your GPU inference server (the FastAPI service in /inference-server). Example: https://gpu.your-domain.com:8800" wide>
            <input className={styles.input} value={s.localInferenceUrl || ''} onChange={e => onChange('localInferenceUrl', e.target.value)} placeholder="https://gpu.your-domain.com:8800" />
          </Field>
          <Field label="Bearer Token" hint="Set the same value as KURALAI_INFERENCE_TOKEN on the GPU box. Leave blank if your server has no auth." wide>
            <SecretInput name="localInferenceToken" value={s.localInferenceToken || ''} onChange={e => onChange('localInferenceToken', e.target.value)} placeholder="Optional bearer token" alreadySaved={savedCreds.has('localInferenceToken')} />
          </Field>
        </div>

        <div className={styles.webhookBox} style={{ marginTop: 14 }}>
          <div className={styles.webhookBoxTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Inference Server Health</span>
            <button type="button" className={styles.copyBtn} onClick={probe} disabled={probing} style={{ fontSize: 11, padding: '2px 10px' }}>
              {probing ? 'Probing…' : 'Refresh'}
            </button>
          </div>
          {!health ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Checking…</div>
          ) : !health.ok ? (
            <div style={{ fontSize: 12, color: '#DC2626', padding: '6px 0' }}>
              ✗ Cannot reach inference server: {health.error || `status ${health.status}`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: health.ready ? '#16A34A' : '#D97706' }}>
                {health.ready ? '✓ All engines ready' : '⚠ Some engines still loading'}
                {health.uptimeSeconds ? <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>uptime {Math.round(health.uptimeSeconds / 60)} min</span> : null}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                  · {Number(health.concurrentCalls || 0)} live call{Number(health.concurrentCalls || 0) === 1 ? '' : 's'}
                </span>
              </div>
              {Object.entries(health.engines || {}).map(([name, eng]) => (
                <div key={name} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                  <span style={{ minWidth: 36, fontFamily: 'monospace', textTransform: 'uppercase' }}>{name}</span>
                  <span style={{ color: stateColor(eng.state), fontWeight: 600 }}>{eng.state}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{eng.model || ''}</span>
                  {eng.error && <span style={{ color: '#DC2626' }}>· {eng.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card label="Models & Voice" badge="Tamil-first">
        <div className={styles.grid}>
          <Field label="Speech-to-Text Model" hint="whisper-large-v3 = best Tamil quality (10 GB VRAM). Use whisper-medium / small or indic-conformer for lower-VRAM boxes.">
            <select className={styles.input} value={s.localSttModel || 'whisper-large-v3'} onChange={e => onChange('localSttModel', e.target.value)}>
              <option value="whisper-large-v3">whisper-large-v3 (recommended)</option>
              <option value="whisper-medium">whisper-medium</option>
              <option value="whisper-small">whisper-small (low VRAM)</option>
              <option value="indic-conformer">AI4Bharat IndicConformer (Tamil-only)</option>
            </select>
          </Field>
          <Field label="Language Model" hint="Qwen2.5-7B is the recommended default — strong Tamil + tight instruction following at 14 GB VRAM.">
            <select className={styles.input} value={s.localLlmModel || 'qwen2.5:7b-instruct'} onChange={e => onChange('localLlmModel', e.target.value)}>
              <option value="qwen2.5:7b-instruct">Qwen2.5-7B-Instruct (recommended)</option>
              <option value="qwen2.5:14b-instruct">Qwen2.5-14B-Instruct (better, more VRAM)</option>
              <option value="llama3.1:8b-instruct">Llama-3.1-8B-Instruct</option>
              <option value="gemma2:9b-instruct">Gemma2-9B-Instruct</option>
            </select>
          </Field>
          <Field label="TTS Model" hint="Indic-Parler-TTS (Apache 2.0) — premium, prompt-driven, fully open-source.">
            <select className={styles.input} value={s.localTtsModel || 'indic-parler-tts'} onChange={e => onChange('localTtsModel', e.target.value)}>
              <option value="indic-parler-tts">AI4Bharat Indic-Parler-TTS (Apache 2.0)</option>
              <option value="parler-tts-mini-v1">Parler-TTS Mini v1 (Apache 2.0)</option>
              <option value="parler-tts-large-v1">Parler-TTS Large v1 (Apache 2.0)</option>
            </select>
          </Field>
          <Field label="TTS Voice" hint="Pick from your inference server's voice catalogue. Add new voices below in the Voice Lab.">
            <VoicePicker value={s.localTtsVoice || ''} onChange={(v) => onChange('localTtsVoice', v)} />
          </Field>
          <Field label="Voice Style Prompt" hint="Plain-language description that steers Parler-TTS: pace, tone, gender, pitch, recording quality. Modify the voice without re-recording anything." wide>
            <textarea
              className={styles.input}
              rows={3}
              value={s.localVoiceDescription || ''}
              onChange={e => onChange('localVoiceDescription', e.target.value)}
              placeholder="A warm, professional female speaker delivers her words clearly and naturally in Tamil with a friendly, conversational tone, moderate pace, and very high studio audio quality with no background noise."
            />
          </Field>
          <Field label="Conversation Mode" hint="Free-form = no pre-defined flow, the LLM handles the conversation organically (recommended for general voice agents). Guided = layer scripts/workflows on top.">
            <select className={styles.input} value={s.localConversationMode || 'freeform'} onChange={e => onChange('localConversationMode', e.target.value)}>
              <option value="freeform">Free-form (no scripted flow)</option>
              <option value="guided">Guided (use call workflows)</option>
            </select>
          </Field>
          <Field label="Language" hint="BCP-47 code for STT/TTS hints. ta-IN is Tamil; the engine will still transcribe English mixed in.">
            <select className={styles.input} value={s.localLanguageCode || 'ta-IN'} onChange={e => onChange('localLanguageCode', e.target.value)}>
              <option value="ta-IN">தமிழ் (ta-IN)</option>
              <option value="hi-IN">हिन्दी (hi-IN)</option>
              <option value="en-IN">English – India (en-IN)</option>
              <option value="te-IN">తెలుగు (te-IN)</option>
              <option value="kn-IN">ಕನ್ನಡ (kn-IN)</option>
              <option value="ml-IN">മലയാളം (ml-IN)</option>
            </select>
          </Field>
          <Field label="Greeting (optional)" hint="First sentence the agent speaks. Supports {{customer_name}}. Falls back to the Sarvam greeting if blank.">
            <textarea className={styles.input} rows={2} value={s.localGreeting || ''} onChange={e => onChange('localGreeting', e.target.value)} placeholder="வணக்கம் {{customer_name}}, நான் சமுத்ரா..." />
          </Field>
          <Field label="System Prompt (optional)" hint="Agent's behaviour. Supports {{customer_name}}, {{company_name}}, {{services}}, {{office_hours}}, {{support_number}}, {{purpose}}, {{custom_fields}}. Falls back to the Sarvam prompt if blank." wide>
            <textarea className={styles.input} rows={6} value={s.localSystemPrompt || ''} onChange={e => onChange('localSystemPrompt', e.target.value)} placeholder="நீங்கள் சமுத்ரா — {{company_name}}-ன் தமிழ் AI உதவியாளர்..." />
          </Field>
          <Field label="Engine Fallback Chain" hint="Comma-separated. Order matters. If the local engine fails (per-call OR per-turn) we try the next engine. Example: local,sarvam,elevenlabs" wide>
            <input className={styles.input} value={s.engineFallbackChain || 'local,sarvam'} onChange={e => onChange('engineFallbackChain', e.target.value)} placeholder="local,sarvam" />
          </Field>
          <Field
            label="Exotel Voicebot App ID (Local)"
            hint="ONLY needed if Telephony Provider = Exotel. Create an Exotel App with a Voicebot Applet pointing to wss://<your-app-url>/local-stream and paste that App ID here."
            wide
          >
            <input className={styles.input} value={s.exotelLocalAppId || ''} onChange={e => onChange('exotelLocalAppId', e.target.value)} placeholder="e.g. 1234567" />
          </Field>
        </div>
      </Card>

      <VoiceLab token={s.webhookToken || s.exotelWebhookToken || ''} />

      <Card label="Deployment Runbook" badge="Read me first">
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>Provision a GPU box (24 GB+ VRAM recommended).</li>
          <li>Clone the repo, <code>cd inference-server</code>.</li>
          <li>Generate a token: <code>echo "KURALAI_INFERENCE_TOKEN=$(openssl rand -hex 32)" &gt; .env</code></li>
          <li>Boot: <code>docker compose up -d</code> (first run pulls models — 5–15 min).</li>
          <li>Tail logs until you see <code>all engines ready</code>: <code>docker compose logs -f inference</code></li>
          <li>Paste the URL + token above and click <strong>Refresh</strong> to verify.</li>
          <li>Set <strong>Default Voice Engine</strong> = Local in the AI &amp; Voice tab.</li>
        </ol>
      </Card>
    </>
  );
}

function PaymentGatewaySection({ s, savedCreds, onChange }) {
  return (
    <>
      <h2 className={styles.sectionTitle}>Payment Gateway</h2>
      <p className={styles.sectionSub}>Configure Razorpay to accept subscription and credit recharge payments from tenants.</p>

      <Card label="Razorpay" badge="Required for Billing">
        <div className={styles.grid}>
          <Field label="Key ID" hint="Dashboard → Settings → API Keys (starts with rzp_live_ or rzp_test_)">
            <SecretInput name="razorpayKeyId" value={s.razorpayKeyId || ''} onChange={e => onChange('razorpayKeyId', e.target.value)} placeholder="rzp_live_XXXXXXXXXXXXXX" alreadySaved={savedCreds.has('razorpayKeyId')} />
          </Field>
          <Field label="Key Secret" hint="Dashboard → Settings → API Keys (shown once during creation)">
            <SecretInput name="razorpayKeySecret" value={s.razorpayKeySecret || ''} onChange={e => onChange('razorpayKeySecret', e.target.value)} placeholder="Razorpay Key Secret" alreadySaved={savedCreds.has('razorpayKeySecret')} />
          </Field>
        </div>
      </Card>

      <Card label="Pricing Configuration" badge="Editable">
        <div className={styles.grid}>
          <Field label="Recharge Rate (₹ per minute)" hint="Per-minute rate charged for pay-as-you-go credit recharge">
            <input className={styles.input} type="number" min="1" step="0.5" value={s.rechargeRatePerMinute || 15} onChange={e => onChange('rechargeRatePerMinute', Number(e.target.value))} />
          </Field>
          <Field label="Payment Currency" hint="All payments are processed in Indian Rupees">
            <input className={styles.input} value="INR (₹)" readOnly />
          </Field>
        </div>
        <div className={styles.webhookBox} style={{ marginTop: 12 }}>
          <div className={styles.webhookBoxTitle}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Razorpay Setup Steps
          </div>
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <li>Create a Razorpay account at <a href="https://dashboard.razorpay.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>dashboard.razorpay.com</a></li>
            <li>Go to Settings &rarr; API Keys &rarr; Generate Key</li>
            <li>Copy the Key ID and Key Secret and paste them above</li>
            <li>For production, use <strong>Live mode</strong> keys (rzp_live_...)</li>
            <li>For testing, use <strong>Test mode</strong> keys (rzp_test_...)</li>
          </ol>
        </div>
      </Card>
    </>
  );
}

function StorageSection({ s, savedCreds, onChange }) {
  return (
    <>
      <h2 className={styles.sectionTitle}>Storage</h2>
      <p className={styles.sectionSub}>Store call recordings in Amazon S3. Leave blank to skip.</p>
      <Card label="AWS S3" badge="Optional" optional>
        <div className={styles.grid}>
          <Field label="Access Key ID">
            <SecretInput name="awsAccessKeyId" value={s.awsAccessKeyId || ''} onChange={e => onChange('awsAccessKeyId', e.target.value)} placeholder="AKIA..." alreadySaved={savedCreds.has('awsAccessKeyId')} />
          </Field>
          <Field label="Secret Access Key">
            <SecretInput name="awsSecretAccessKey" value={s.awsSecretAccessKey || ''} onChange={e => onChange('awsSecretAccessKey', e.target.value)} placeholder="Secret access key" alreadySaved={savedCreds.has('awsSecretAccessKey')} />
          </Field>
          <Field label="Bucket Name">
            <input className={styles.input} value={s.s3BucketName || ''} onChange={e => onChange('s3BucketName', e.target.value)} placeholder="kuralai-recordings" />
          </Field>
          <Field label="AWS Region">
            <input className={styles.input} value={s.awsRegion || ''} onChange={e => onChange('awsRegion', e.target.value)} placeholder="ap-south-1" />
          </Field>
        </div>
      </Card>
    </>
  );
}

function BehaviourSection({ s, onChange }) {
  return (
    <>
      <h2 className={styles.sectionTitle}>Behaviour</h2>
      <p className={styles.sectionSub}>Call duration, silence handling, and retry logic.</p>
      <Card label="Call Timing">
        <div className={styles.grid}>
          <Field label="Max Call Duration (seconds)" hint="Maximum length of a single AI call">
            <input className={styles.input} type="number" min={30} max={1800} value={s.maxCallDurationSeconds || 300} onChange={e => onChange('maxCallDurationSeconds', parseInt(e.target.value))} />
          </Field>
          <Field label="Silence Timeout (seconds)" hint="Wait time before treating silence as end of speech">
            <input className={styles.input} type="number" min={1} max={30} value={s.silenceTimeoutSeconds || 5} onChange={e => onChange('silenceTimeoutSeconds', parseInt(e.target.value))} />
          </Field>
        </div>
      </Card>
      <Card label="Retry Logic">
        <div className={styles.grid}>
          <Field label="Max Retry Attempts" hint="Times to retry an unanswered or failed call">
            <input className={styles.input} type="number" min={0} max={10} value={s.callRetryAttempts || 3} onChange={e => onChange('callRetryAttempts', parseInt(e.target.value))} />
          </Field>
          <Field label="Retry Delay (seconds)" hint="Seconds to wait between retry attempts">
            <input className={styles.input} type="number" min={10} max={3600} value={s.callRetryDelaySeconds || 60} onChange={e => onChange('callRetryDelaySeconds', parseInt(e.target.value))} />
          </Field>
        </div>
      </Card>
    </>
  );
}

function EscalationSection({ s, onChange }) {
  return (
    <>
      <h2 className={styles.sectionTitle}>Escalation</h2>
      <p className={styles.sectionSub}>Configure how calls are transferred to human agents when needed.</p>
      <Card label="Human Escalation" badge="Optional" optional>
        <div className={styles.grid}>
          <Field label="Escalation Phone Number" hint="Number to transfer the call to when a human is requested">
            <input className={styles.input} value={s.escalationPhone || ''} onChange={e => onChange('escalationPhone', e.target.value)} placeholder="+91XXXXXXXXXX" />
          </Field>
          <Field label="Escalation Webhook URL" hint="CRM webhook triggered when a call is escalated">
            <input className={styles.input} value={s.escalationWebhookUrl || ''} onChange={e => onChange('escalationWebhookUrl', e.target.value)} placeholder="https://your-crm.com/webhook/escalate" />
          </Field>
        </div>
      </Card>
    </>
  );
}

function ApiSection({ s, onChange }) {
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey]         = useState('');
  const appUrl = (s.appUrl || 'https://your-app.replit.app').replace(/\/$/, '');

  async function handleGenerate() {
    setGenerating(true);
    setNewKey('');
    try {
      const res = await fetch('/api/settings/generate-api-key', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('kuralai_token')}` },
      });
      const data = await res.json();
      if (data.success) {
        setNewKey(data.apiKey);
        onChange('apiKey', data.apiKey);
      }
    } catch {}
    setGenerating(false);
  }

  const endpoints = [
    { method: 'GET',  path: '/api/external/v1/customers',                      desc: 'List all customers with chit details' },
    { method: 'GET',  path: '/api/external/v1/customers/:id',                  desc: 'Get customer by UUID' },
    { method: 'GET',  path: '/api/external/v1/customers/phone/:phone',         desc: 'Get customer by phone number' },
    { method: 'POST', path: '/api/external/v1/customers',                      desc: 'Create a new customer' },
    { method: 'PUT',  path: '/api/external/v1/customers/:id',                  desc: 'Update customer name, phone, notes, chit' },
    { method: 'POST', path: '/api/external/v1/customers/upsert',               desc: 'Create or update by phone (CRM sync)' },
    { method: 'GET',  path: '/api/external/v1/customers/:id/calls',            desc: 'Get recent call history for customer' },
  ];

  const methodColor = { GET: '#2563EB', POST: '#059669', PUT: '#D97706', DELETE: '#DC2626' };

  return (
    <>
      <h2 className={styles.sectionTitle}>API Access</h2>
      <p className={styles.sectionSub}>Connect your chit fund software to sync customer data automatically.</p>

      <Card label="API Key" badge="External Access">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className={styles.hint} style={{ margin: 0 }}>
            Use the API key to read and update customers from any external system — no login required.
            Pass it as <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>X-API-Key</code> header
            or <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>?apiKey=</code> query param.
          </p>

          {newKey ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 6, padding: '10px 14px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <code style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#15803D', wordBreak: 'break-all' }}>{newKey}</code>
              <button type="button" className={styles.copyBtn} onClick={() => navigator.clipboard.writeText(newKey)} title="Copy">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, padding: '9px 12px', background: '#F8FAFC', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, color: s.apiKey ? 'var(--text-muted)' : 'var(--text-muted)', fontStyle: s.apiKey ? 'normal' : 'italic' }}>
                {s.apiKey ? '••••••••••••  (key saved — regenerate to reveal)' : 'No API key generated yet'}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className={styles.saveBtn} style={{ padding: '8px 20px', fontSize: 13 }} onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : (s.apiKey ? 'Regenerate Key' : 'Generate API Key')}
            </button>
            {s.apiKey && !newKey && <span style={{ fontSize: 12, color: 'var(--success-text)' }}>✓ Key is active</span>}
          </div>
        </div>
      </Card>

      <Card label="Available Endpoints" badge={`Base: ${appUrl}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {endpoints.map((ep, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < endpoints.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: '#fff', background: methodColor[ep.method] || '#6B7280', padding: '2px 6px', borderRadius: 3, minWidth: 38, textAlign: 'center', flexShrink: 0 }}>{ep.method}</span>
              <code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', flex: 1, wordBreak: 'break-all' }}>{ep.path}</code>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, maxWidth: 200, textAlign: 'right' }}>{ep.desc}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, background: '#F8FAFC', border: '1.5px solid var(--border)', borderRadius: 6, padding: '10px 14px' }}>
          <p style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Example:</strong><br/>
            curl {appUrl}/api/external/v1/customers \<br/>
            {'  '}-H "X-API-Key: {'<your-key>'}"
          </p>
        </div>
      </Card>
    </>
  );
}

function InboundSection({ s, workflows, onChange }) {
  return (
    <>
      <h2 className={styles.sectionTitle}>Inbound Calls</h2>
      <p className={styles.sectionSub}>When a customer calls your number, the system runs the selected workflow automatically.</p>
      <Card label="Inbound Routing" badge="Auto-trigger">
        <div className={styles.grid}>
          <Field label="Inbound Workflow" hint="Q&A script flow that runs when a customer dials your number" wide>
            <select className={styles.input} value={s.inboundWorkflowId || ''} onChange={e => onChange('inboundWorkflowId', e.target.value)}>
              <option value="">Auto-detect (first active workflow with Q&A script)</option>
              {workflows.map(wf => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}
                  {wf.scriptFlow?.enabled ? ` — Q&A (${wf.scriptFlow.steps?.length || 0} steps)` : ' — Free-form AI'}
                  {wf.status === 'active' ? ' ✓ Active' : ` · ${wf.status}`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {s.appUrl && (
          <div className={styles.webhookBox} style={{ marginTop: 16 }}>
            <div className={styles.webhookBoxTitle}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              Paste this in your {(s.telephonyProvider || 'exotel') === 'twilio' ? 'Twilio Console → Phone Numbers → Incoming webhook' : 'Exotel Console → ExoPhones → Your Number → Incoming Webhook'}
            </div>
            <div className={styles.webhookRow}>
              <span className={styles.webhookLabel}>Incoming</span>
              <code className={styles.webhookUrl}>
                {`${(s.appUrl || '').replace(/\/$/, '')}/webhook/call/incoming${s.exotelWebhookToken ? `?wt=${s.exotelWebhookToken}` : ''}`}
              </code>
              <button type="button" className={styles.copyBtn} onClick={() => navigator.clipboard.writeText(`${(s.appUrl || '').replace(/\/$/, '')}/webhook/call/incoming${s.exotelWebhookToken ? `?wt=${s.exotelWebhookToken}` : ''}`)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Settings() {
  const [settings, setSettings]       = useState(null);
  const [savedCreds, setSavedCreds]   = useState(new Set());
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [error, setError]             = useState('');
  const [workflows, setWorkflows]     = useState([]);
  const [activeSection, setActive]    = useState('telephony');
  const [elVoicePreset, setElVoicePreset] = useState('21m00Tcm4TlvDq8ikWAM');

  useEffect(() => {
    Promise.all([
      settingsApi.get(),
      workflowsApi.list().catch(() => ({ data: { workflows: [] } })),
    ]).then(([sRes, wfRes]) => {
      const s = { ...(sRes?.data?.settings || {}) };
      const alreadySaved = new Set();
      for (const key of CREDENTIAL_KEYS) {
        if (s[key] && /^•+$/.test(s[key])) {
          alreadySaved.add(key);
          s[key] = '';
        }
      }
      setSavedCreds(alreadySaved);
      setSettings(s);
      setWorkflows(wfRes?.data?.workflows || []);
      const knownPreset = ELEVENLABS_VOICE_PRESETS.find(p => p.value === (s.elevenLabsVoiceId || '') && p.value !== 'custom');
      setElVoicePreset(knownPreset ? knownPreset.value : 'custom');
    })
    .catch(() => { setError('Failed to load settings'); setSettings({}); })
    .finally(() => setLoading(false));
  }, []);

  function handleChange(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await settingsApi.update(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading settings…</p>
          </div>
        </main>
      </div>
    );
  }

  function renderSection() {
    const props = { s: settings, savedCreds, onChange: handleChange };
    switch (activeSection) {
      case 'telephony':  return <TelephonySection  {...props} />;
      case 'ai':         return <AiVoiceSection    {...props} elVoicePreset={elVoicePreset} setElVoicePreset={setElVoicePreset} />;
      case 'local':      return <LocalEngineSection {...props} />;
      case 'payment':    return <PaymentGatewaySection {...props} />;
      case 'storage':    return <StorageSection    {...props} />;
      case 'behaviour':  return <BehaviourSection  {...props} />;
      case 'escalation': return <EscalationSection {...props} />;
      case 'inbound':    return <InboundSection    {...props} workflows={workflows} />;
      case 'api':        return <ApiSection        {...props} />;
      default:           return null;
    }
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Settings</h1>
            <p className={styles.pageSub}>Configure KuralAI — telephony, AI, voice, storage and behaviour</p>
          </div>
          {saved && (
            <div className={styles.savedBadge}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
            </div>
          )}
        </div>

        <div className={styles.body}>
          {/* ── Sidebar nav ── */}
          <nav className={styles.nav}>
            {NAV_ITEMS.map((item, i) => (
              <React.Fragment key={item.id}>
                {i === 4 && <div className={styles.navDivider} />}
                <button
                  type="button"
                  className={`${styles.navItem} ${activeSection === item.id ? styles.navActive : ''}`}
                  onClick={() => setActive(item.id)}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {item.label}
                </button>
              </React.Fragment>
            ))}
          </nav>

          {/* ── Content ── */}
          <form className={styles.content} onSubmit={handleSave}>
            {error && <div className={styles.error}>{error}</div>}
            {renderSection()}
            <div className={styles.footer}>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
