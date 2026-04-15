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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
            </div>
            <span className={styles.brandName}>KuralAI</span>
          </div>

          <h1 className={styles.tagline}>AI Voice Agents<br/>That Speak Tamil<br/>Like Your Best Employee</h1>
          <p className={styles.description}>Automate thousands of outbound calls in natural, human-like Tamil. Collections, reminders, confirmations, follow-ups — handled intelligently, 24/7, without hiring a single extra person.</p>

          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <div className={styles.statValue}>10x</div>
              <div className={styles.statLabel}>More Calls / Day</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>93%</div>
              <div className={styles.statLabel}>Answer Rate</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>60%</div>
              <div className={styles.statLabel}>Cost Savings</div>
            </div>
          </div>

          <div className={styles.useCases}>
            <div className={styles.useCaseLabel}>Built for every industry</div>
            <div className={styles.useCaseTags}>
              <span className={styles.tag}>Chit Funds</span>
              <span className={styles.tag}>NBFCs & Lending</span>
              <span className={styles.tag}>Insurance</span>
              <span className={styles.tag}>Healthcare</span>
              <span className={styles.tag}>Real Estate</span>
              <span className={styles.tag}>E-commerce</span>
              <span className={styles.tag}>Education</span>
              <span className={styles.tag}>Logistics</span>
            </div>
          </div>

          <div className={styles.features}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              </div>
              <div>
                <div className={styles.featureTitle}>Human-Like Tamil Voice</div>
                <div className={styles.featureDesc}>Powered by GPT-4o and neural TTS. Customers think they're speaking to a real person.</div>
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <div>
                <div className={styles.featureTitle}>Mass Campaign Engine</div>
                <div className={styles.featureDesc}>Call hundreds simultaneously. Auto-retry failures. Track every conversation in real time.</div>
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <div>
                <div className={styles.featureTitle}>Smart Analytics</div>
                <div className={styles.featureDesc}>Intent detection, sentiment analysis, call recordings, and exportable reports — all in one dashboard.</div>
              </div>
            </div>
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
                placeholder="you@company.com"
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
                placeholder="Enter your password"
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

          <div className={styles.rightFooter}>
            <p className={styles.footer}>Powered by <strong>Automystic</strong></p>
            <div className={styles.techBadges}>
              <span className={styles.techBadge}>GPT-4o</span>
              <span className={styles.techBadge}>ElevenLabs</span>
              <span className={styles.techBadge}>Twilio</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
