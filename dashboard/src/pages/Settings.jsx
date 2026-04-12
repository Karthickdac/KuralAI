import React, { useState, useEffect } from 'react';
import { settingsApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Settings.module.css';

const VOICE_OPTIONS = [
  { value: 'ta-IN-PallaviNeural', label: 'Pallavi (Female)' },
  { value: 'ta-IN-ValluvarNeural', label: 'Valluvar (Male)' },
];

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster, lower cost)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
];

// Fields returned as '••••••••' from the API when they have a value
const CREDENTIAL_KEYS = [
  'exotelSid', 'exotelApiKey', 'exotelApiToken', 'exotelWebhookToken',
  'openaiApiKey', 'azureSpeechKey', 'awsAccessKeyId', 'awsSecretAccessKey',
];

/* ─── Reusable section wrapper ─── */
function Section({ title, description, badge, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 className={styles.sectionTitle}>{title}</h2>
            {badge && <span className={styles.badge}>{badge}</span>}
          </div>
          {description && <p className={styles.sectionDesc}>{description}</p>}
        </div>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

/* ─── Field wrapper ─── */
function Field({ label, hint, children, wide }) {
  return (
    <div className={`${styles.field} ${wide ? styles.fieldWide : ''}`}>
      <label className={styles.label}>{label}</label>
      {hint && <p className={styles.hint}>{hint}</p>}
      {children}
    </div>
  );
}

/* ─── Secret input (masked, show/hide toggle) ─── */
function SecretInput({ value, onChange, placeholder, name, alreadySaved }) {
  const [show, setShow] = useState(false);
  const showSavedBadge = alreadySaved && !value; // saved on server, field currently empty
  const showNewBadge   = !alreadySaved && value;  // newly typed
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
      <button
        type="button"
        className={styles.secretToggle}
        onClick={() => setShow(s => !s)}
        title={show ? 'Hide' : 'Show'}
      >
        {show ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
      {showSavedBadge && <span className={styles.secretSet}>✓ Saved</span>}
    </div>
  );
}

/* ─── Webhook URL display ─── */
function WebhookUrls({ appUrl, webhookToken }) {
  const base = appUrl?.replace(/\/$/, '') || 'https://your-domain.com';
  const wt = webhookToken ? `?wt=${webhookToken}` : '?wt=<token>';
  const urls = [
    { label: 'Voice', url: `${base}/webhook/voice${wt}` },
    { label: 'Status', url: `${base}/webhook/status${wt}` },
    { label: 'Recording', url: `${base}/webhook/recording${wt}` },
  ];

  function copy(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className={styles.webhookBox}>
      <div className={styles.webhookTitle}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        Exotel Webhook URLs — paste these into your Exotel campaign settings
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

/* ─── Main component ─── */
export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [savedCreds, setSavedCreds] = useState(new Set()); // keys that already have a value on server
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    settingsApi.get()
      .then(r => {
        const s = { ...r.data.settings };
        const alreadySaved = new Set();
        // Detect which credential fields are already stored on the server
        // The API returns '••••••••' for any field that has a value
        for (const key of CREDENTIAL_KEYS) {
          if (s[key] && /^•+$/.test(s[key])) {
            alreadySaved.add(key);
            s[key] = ''; // Always start as empty so users can't accidentally prepend bullets
          }
        }
        setSavedCreds(alreadySaved);
        setSettings(s);
      })
      .catch(() => setError('Failed to load settings'))
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

  if (loading) {
    return (
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading settings...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Settings</h1>
            <p className={styles.pageSub}>Configure KuralAI behaviour, credentials and integrations</p>
          </div>
          {saved && (
            <div className={styles.savedBadge}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Settings saved
            </div>
          )}
        </div>

        <form onSubmit={handleSave}>
          {error && <div className={styles.error}>{error}</div>}

          {/* ── Exotel API Credentials ───────────────────────────────── */}
          <Section
            title="Exotel API Credentials"
            badge="Required"
            description="Your Exotel account credentials from dashboard.exotel.com → API Keys."
          >
            <div className={styles.grid}>
              <Field label="Account SID" hint="Found under Settings → API Keys in Exotel Dashboard">
                <SecretInput
                  name="exotelSid"
                  value={settings.exotelSid || ''}
                  onChange={e => handleChange('exotelSid', e.target.value)}
                  placeholder="Enter your Exotel Account SID"
                  alreadySaved={savedCreds.has('exotelSid')}
                />
              </Field>
              <Field label="ExoPhone Number" hint="Your virtual number in E.164 format">
                <input
                  className={styles.input}
                  value={settings.exotelPhoneNumber || ''}
                  onChange={e => handleChange('exotelPhoneNumber', e.target.value)}
                  placeholder="+918XXXXXXXXX"
                />
              </Field>
              <Field label="API Key" hint="From Exotel Dashboard → API Keys">
                <SecretInput
                  name="exotelApiKey"
                  value={settings.exotelApiKey || ''}
                  onChange={e => handleChange('exotelApiKey', e.target.value)}
                  placeholder="Enter your Exotel API Key"
                  alreadySaved={savedCreds.has('exotelApiKey')}
                />
              </Field>
              <Field label="API Token" hint="From Exotel Dashboard → API Keys">
                <SecretInput
                  name="exotelApiToken"
                  value={settings.exotelApiToken || ''}
                  onChange={e => handleChange('exotelApiToken', e.target.value)}
                  placeholder="Enter your Exotel API Token"
                  alreadySaved={savedCreds.has('exotelApiToken')}
                />
              </Field>
              <Field label="App URL" hint="Public URL of this server — used to build webhook URLs below" wide>
                <input
                  className={styles.input}
                  value={settings.appUrl || ''}
                  onChange={e => handleChange('appUrl', e.target.value)}
                  placeholder="https://your-app.replit.app"
                />
              </Field>
              <Field label="Webhook Token" hint="A secret string appended to webhook URLs for security — invent any long random value" wide>
                <SecretInput
                  name="exotelWebhookToken"
                  value={settings.exotelWebhookToken || ''}
                  onChange={e => handleChange('exotelWebhookToken', e.target.value)}
                  placeholder="e.g. kural-wh-secret-abc123xyz"
                  alreadySaved={savedCreds.has('exotelWebhookToken')}
                />
              </Field>
            </div>
            <WebhookUrls appUrl={settings.appUrl} webhookToken={settings.exotelWebhookToken} />
          </Section>

          {/* ── OpenAI Credentials ────────────────────────────────────── */}
          <Section
            title="OpenAI API"
            badge="Required"
            description="Used for Tamil conversation generation (GPT-4o) and speech transcription (Whisper)."
          >
            <div className={styles.grid}>
              <Field label="OpenAI API Key" hint="From platform.openai.com → API Keys">
                <SecretInput
                  name="openaiApiKey"
                  value={settings.openaiApiKey || ''}
                  onChange={e => handleChange('openaiApiKey', e.target.value)}
                  placeholder="sk-..."
                  alreadySaved={savedCreds.has('openaiApiKey')}
                />
              </Field>
              <Field label="Model" hint="Language model used for Tamil conversation">
                <select className={styles.input} value={settings.openaiModel || 'gpt-4o'} onChange={e => handleChange('openaiModel', e.target.value)}>
                  {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* ── Azure Speech ─────────────────────────────────────────── */}
          <Section
            title="Azure Speech (TTS)"
            badge="Required"
            description="Tamil Neural TTS voices — from portal.azure.com → Cognitive Services → Speech."
          >
            <div className={styles.grid}>
              <Field label="Azure Speech Key" hint="From Azure Portal → Speech resource → Keys and Endpoint">
                <SecretInput
                  name="azureSpeechKey"
                  value={settings.azureSpeechKey || ''}
                  onChange={e => handleChange('azureSpeechKey', e.target.value)}
                  placeholder="Enter your Azure Speech subscription key"
                  alreadySaved={savedCreds.has('azureSpeechKey')}
                />
              </Field>
              <Field label="Azure Region" hint="e.g. eastus, southeastasia, centralindia">
                <input
                  className={styles.input}
                  value={settings.azureSpeechRegion || ''}
                  onChange={e => handleChange('azureSpeechRegion', e.target.value)}
                  placeholder="e.g. centralindia"
                />
              </Field>
              <Field label="Tamil TTS Voice" hint="Azure Neural TTS voice for Tamil speech synthesis">
                <select className={styles.input} value={settings.azureSpeechVoice || 'ta-IN-PallaviNeural'} onChange={e => handleChange('azureSpeechVoice', e.target.value)}>
                  {VOICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* ── AWS S3 ───────────────────────────────────────────────── */}
          <Section
            title="AWS S3 (Recording Storage)"
            badge="Optional"
            description="Store call recordings in Amazon S3. Leave blank to skip recording storage."
          >
            <div className={styles.grid}>
              <Field label="AWS Access Key ID">
                <SecretInput
                  name="awsAccessKeyId"
                  value={settings.awsAccessKeyId || ''}
                  onChange={e => handleChange('awsAccessKeyId', e.target.value)}
                  placeholder="AKIA..."
                  alreadySaved={savedCreds.has('awsAccessKeyId')}
                />
              </Field>
              <Field label="AWS Secret Access Key">
                <SecretInput
                  name="awsSecretAccessKey"
                  value={settings.awsSecretAccessKey || ''}
                  onChange={e => handleChange('awsSecretAccessKey', e.target.value)}
                  placeholder="Enter AWS secret access key"
                  alreadySaved={savedCreds.has('awsSecretAccessKey')}
                />
              </Field>
              <Field label="S3 Bucket Name" hint="Name of the S3 bucket for audio storage">
                <input
                  className={styles.input}
                  value={settings.s3BucketName || ''}
                  onChange={e => handleChange('s3BucketName', e.target.value)}
                  placeholder="kuralai-recordings"
                />
              </Field>
              <Field label="AWS Region" hint="e.g. ap-south-1, us-east-1">
                <input
                  className={styles.input}
                  value={settings.awsRegion || ''}
                  onChange={e => handleChange('awsRegion', e.target.value)}
                  placeholder="ap-south-1"
                />
              </Field>
            </div>
          </Section>

          {/* ── Call Behaviour ───────────────────────────────────────── */}
          <Section title="Call Behaviour" description="Configure call duration, timeouts and retry logic.">
            <div className={styles.grid}>
              <Field label="Max Call Duration (seconds)" hint="Maximum length of a single AI call">
                <input className={styles.input} type="number" min={30} max={1800} value={settings.maxCallDurationSeconds || 300} onChange={e => handleChange('maxCallDurationSeconds', parseInt(e.target.value))} />
              </Field>
              <Field label="Silence Timeout (seconds)" hint="Wait time before treating silence as end of speech">
                <input className={styles.input} type="number" min={1} max={30} value={settings.silenceTimeoutSeconds || 5} onChange={e => handleChange('silenceTimeoutSeconds', parseInt(e.target.value))} />
              </Field>
              <Field label="Max Retry Attempts" hint="Times to retry an unanswered or failed call">
                <input className={styles.input} type="number" min={0} max={10} value={settings.callRetryAttempts || 3} onChange={e => handleChange('callRetryAttempts', parseInt(e.target.value))} />
              </Field>
              <Field label="Retry Delay (seconds)" hint="Seconds to wait between retry attempts">
                <input className={styles.input} type="number" min={10} max={3600} value={settings.callRetryDelaySeconds || 60} onChange={e => handleChange('callRetryDelaySeconds', parseInt(e.target.value))} />
              </Field>
            </div>
          </Section>

          {/* ── Human Escalation ─────────────────────────────────────── */}
          <Section title="Human Escalation" description="Configure how calls are transferred to human agents.">
            <div className={styles.grid}>
              <Field label="Escalation Phone Number" hint="Number to transfer the call to when human is requested">
                <input className={styles.input} value={settings.escalationPhone || ''} onChange={e => handleChange('escalationPhone', e.target.value)} placeholder="+91XXXXXXXXXX" />
              </Field>
              <Field label="Escalation Webhook URL" hint="CRM webhook triggered when a call is escalated">
                <input className={styles.input} value={settings.escalationWebhookUrl || ''} onChange={e => handleChange('escalationWebhookUrl', e.target.value)} placeholder="https://your-crm.com/webhook/escalate" />
              </Field>
            </div>
          </Section>

          <div className={styles.footer}>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : 'Save All Settings'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
