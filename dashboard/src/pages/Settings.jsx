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

function Section({ title, description, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description && <p className={styles.sectionDesc}>{description}</p>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children, wide }) {
  return (
    <div className={`${styles.field} ${wide ? styles.fieldWide : ''}`}>
      <label className={styles.label}>{label}</label>
      {hint && <p className={styles.hint}>{hint}</p>}
      {children}
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    settingsApi.get()
      .then(r => setSettings(r.data.settings))
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
            <p className={styles.pageSub}>Configure KuralAI behaviour and integrations</p>
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

          <Section title="Call Behaviour" description="Configure how calls are initiated and managed.">
            <div className={styles.grid}>
              <Field label="App URL" hint="Public URL of this server used by Exotel webhooks">
                <input className={styles.input} value={settings.appUrl || ''} onChange={e => handleChange('appUrl', e.target.value)} placeholder="https://your-domain.com" />
              </Field>
              <Field label="Exotel ExoPhone Number" hint="Your virtual number in E.164 format">
                <input className={styles.input} value={settings.exotelPhoneNumber || ''} onChange={e => handleChange('exotelPhoneNumber', e.target.value)} placeholder="+918XXXXXXXXX" />
              </Field>
              <Field label="Max Call Duration (seconds)" hint="Maximum length of a single AI call">
                <input className={styles.input} type="number" min={30} max={1800} value={settings.maxCallDurationSeconds || 300} onChange={e => handleChange('maxCallDurationSeconds', parseInt(e.target.value))} />
              </Field>
              <Field label="Silence Timeout (seconds)" hint="Wait time before treating silence as timeout">
                <input className={styles.input} type="number" min={1} max={30} value={settings.silenceTimeoutSeconds || 5} onChange={e => handleChange('silenceTimeoutSeconds', parseInt(e.target.value))} />
              </Field>
            </div>
          </Section>

          <Section title="Retry Settings" description="Control how failed or unanswered calls are retried.">
            <div className={styles.grid}>
              <Field label="Max Retry Attempts" hint="Times to retry an unanswered or failed call">
                <input className={styles.input} type="number" min={0} max={10} value={settings.callRetryAttempts || 3} onChange={e => handleChange('callRetryAttempts', parseInt(e.target.value))} />
              </Field>
              <Field label="Retry Delay (seconds)" hint="Seconds to wait between retry attempts">
                <input className={styles.input} type="number" min={10} max={3600} value={settings.callRetryDelaySeconds || 60} onChange={e => handleChange('callRetryDelaySeconds', parseInt(e.target.value))} />
              </Field>
            </div>
          </Section>

          <Section title="AI & Voice" description="Configure the language model and Tamil TTS voice.">
            <div className={styles.grid}>
              <Field label="OpenAI Model" hint="LLM used for Tamil conversation generation">
                <select className={styles.input} value={settings.openaiModel || 'gpt-4o'} onChange={e => handleChange('openaiModel', e.target.value)}>
                  {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Tamil TTS Voice" hint="Azure Neural TTS voice for Tamil speech synthesis">
                <select className={styles.input} value={settings.azureSpeechVoice || 'ta-IN-PallaviNeural'} onChange={e => handleChange('azureSpeechVoice', e.target.value)}>
                  {VOICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Human Escalation" description="Configure how calls are escalated to human agents.">
            <div className={styles.grid}>
              <Field label="Escalation Phone Number" hint="Transfer number for human agent escalation">
                <input className={styles.input} value={settings.escalationPhone || ''} onChange={e => handleChange('escalationPhone', e.target.value)} placeholder="+91XXXXXXXXXX" />
              </Field>
              <Field label="Escalation Webhook URL" hint="CRM webhook triggered on escalation">
                <input className={styles.input} value={settings.escalationWebhookUrl || ''} onChange={e => handleChange('escalationWebhookUrl', e.target.value)} placeholder="https://your-crm.com/webhook/escalate" />
              </Field>
            </div>
          </Section>

          <div className={styles.footer}>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
