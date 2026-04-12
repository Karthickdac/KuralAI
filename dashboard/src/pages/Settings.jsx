/**
 * Settings Page — Configure KuralAI application settings
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../api/client';
import styles from './Settings.module.css';

const VOICE_OPTIONS = [
  { value: 'ta-IN-PallaviNeural', label: 'Pallavi (Female)' },
  { value: 'ta-IN-ValluvarNeural', label: 'Valluvar (Male)' },
];

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
];

function Field({ label, hint, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {hint && <p className={styles.hint}>{hint}</p>}
      {children}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
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
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.loadingPage}>Loading settings...</div>;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className={styles.logoIcon}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <div>
            <div className={styles.logoName}>KuralAI</div>
            <div className={styles.logoBy}>by Automystic</div>
          </div>
        </div>
        <nav className={styles.nav}>
          <button className={styles.navItem} onClick={() => navigate('/')}>Dashboard</button>
          <button className={styles.navItem} onClick={() => navigate('/calls')}>All Calls</button>
          <button className={styles.navItem} onClick={() => navigate('/users')}>Users</button>
          <button className={`${styles.navItem} ${styles.active}`}>Settings</button>
        </nav>
      </aside>

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Settings</h1>
            <p className={styles.pageSub}>Configure KuralAI behaviour and integrations</p>
          </div>
          {saved && <span className={styles.savedBadge}>✓ Saved</span>}
        </div>

        <form onSubmit={handleSave}>
          {error && <div className={styles.error}>{error}</div>}

          {/* Call Behaviour */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Call Behaviour</h2>
            <div className={styles.grid}>
              <Field label="App URL" hint="Public URL of this server (used by Twilio webhooks)">
                <input
                  className={styles.input}
                  value={settings.appUrl || ''}
                  onChange={e => handleChange('appUrl', e.target.value)}
                  placeholder="https://your-domain.com"
                />
              </Field>
              <Field label="Exotel ExoPhone Number" hint="Your Exotel virtual number in E.164 format">
                <input
                  className={styles.input}
                  value={settings.exotelPhoneNumber || ''}
                  onChange={e => handleChange('exotelPhoneNumber', e.target.value)}
                  placeholder="+918XXXXXXXXX"
                />
              </Field>
              <Field label="Max Call Duration (seconds)" hint="Maximum length of a single call">
                <input
                  className={styles.input}
                  type="number"
                  min={30}
                  max={1800}
                  value={settings.maxCallDurationSeconds || 300}
                  onChange={e => handleChange('maxCallDurationSeconds', parseInt(e.target.value))}
                />
              </Field>
              <Field label="Silence Timeout (seconds)" hint="How long to wait before treating silence as a timeout">
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={30}
                  value={settings.silenceTimeoutSeconds || 5}
                  onChange={e => handleChange('silenceTimeoutSeconds', parseInt(e.target.value))}
                />
              </Field>
            </div>
          </div>

          {/* Retry Settings */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Retry Settings</h2>
            <div className={styles.grid}>
              <Field label="Max Retry Attempts" hint="Number of times to retry an unanswered call">
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={10}
                  value={settings.callRetryAttempts || 3}
                  onChange={e => handleChange('callRetryAttempts', parseInt(e.target.value))}
                />
              </Field>
              <Field label="Retry Delay (seconds)" hint="Wait time between retry attempts">
                <input
                  className={styles.input}
                  type="number"
                  min={10}
                  max={3600}
                  value={settings.callRetryDelaySeconds || 60}
                  onChange={e => handleChange('callRetryDelaySeconds', parseInt(e.target.value))}
                />
              </Field>
            </div>
          </div>

          {/* AI & Voice */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>AI & Voice</h2>
            <div className={styles.grid}>
              <Field label="OpenAI Model" hint="LLM used for Tamil conversation generation">
                <select
                  className={styles.input}
                  value={settings.openaiModel || 'gpt-4o'}
                  onChange={e => handleChange('openaiModel', e.target.value)}
                >
                  {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Tamil Voice" hint="Azure Neural TTS voice for Tamil speech">
                <select
                  className={styles.input}
                  value={settings.azureSpeechVoice || 'ta-IN-PallaviNeural'}
                  onChange={e => handleChange('azureSpeechVoice', e.target.value)}
                >
                  {VOICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* Escalation */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Human Escalation</h2>
            <div className={styles.grid}>
              <Field label="Escalation Phone Number" hint="Phone number to transfer calls to a human agent">
                <input
                  className={styles.input}
                  value={settings.escalationPhone || ''}
                  onChange={e => handleChange('escalationPhone', e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                />
              </Field>
              <Field label="Escalation Webhook URL" hint="CRM webhook to notify when a call is escalated">
                <input
                  className={styles.input}
                  value={settings.escalationWebhookUrl || ''}
                  onChange={e => handleChange('escalationWebhookUrl', e.target.value)}
                  placeholder="https://your-crm.com/webhook/escalate"
                />
              </Field>
            </div>
          </div>

          <div className={styles.formFooter}>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
