import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import styles from './Login.module.css';

export default function Login() {
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await login(form.email, form.password);
    if (ok) navigate('/');
  };

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.leftContent}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
              </svg>
            </div>
            <span className={styles.brandName}>KuralAI</span>
          </div>
          <h1 className={styles.tagline}>Enterprise Tamil AI<br/>Voice Platform</h1>
          <p className={styles.description}>Automate outbound call campaigns, analyse conversations, and escalate intelligently — all in Tamil.</p>
          <div className={styles.features}>
            {['GPT-4o Tamil conversations', 'ElevenLabs & Azure TTS', 'Real-time analytics', 'Twilio call infrastructure'].map(f => (
              <div key={f} className={styles.feature}>
                <span className={styles.featureCheck}>✓</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.heading}>Welcome back</h2>
            <p className={styles.subheading}>Sign in to your KuralAI dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Email address</label>
              <input
                type="email"
                className={styles.input}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@automystic.com"
                required
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                type="password"
                className={styles.input}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? (
                <span className={styles.btnLoading}>
                  <span className={styles.spinner} /> Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <p className={styles.footer}>by <strong>Automystic</strong> · KuralAI v1.0</p>
        </div>
      </div>
    </div>
  );
}
