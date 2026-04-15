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

          <h1 className={styles.tagline}>Your AI Employee<br/>Who Speaks Tamil<br/>Like Family</h1>
          <p className={styles.description}>Stop chasing dues manually. Let Samuthra, your AI voice agent, call every customer personally in natural Tamil — collecting dues, confirming lottery participation, and handling follow-ups 24/7.</p>

          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <div className={styles.statValue}>10x</div>
              <div className={styles.statLabel}>Faster Collections</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>93%</div>
              <div className={styles.statLabel}>Answer Rate</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>24/7</div>
              <div className={styles.statLabel}>Always Available</div>
            </div>
          </div>

          <div className={styles.features}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              </div>
              <div>
                <div className={styles.featureTitle}>Natural Tamil Voice</div>
                <div className={styles.featureDesc}>Sounds human, not robotic. Customers feel like they're talking to a real person.</div>
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M16 8l-4 4-4-4"/><path d="M12 12v6"/></svg>
              </div>
              <div>
                <div className={styles.featureTitle}>Smart Due Collection</div>
                <div className={styles.featureDesc}>Knows each customer's chit value, dues, and history. Personalised conversations every time.</div>
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <div>
                <div className={styles.featureTitle}>Campaign Automation</div>
                <div className={styles.featureDesc}>Call 100s of customers simultaneously. Auto-retry missed calls. Zero manual effort.</div>
              </div>
            </div>
          </div>

          <div className={styles.testimonial}>
            <p className={styles.testimonialText}>"Reduced our collection calls from 3 staff working full-time to just Samuthra handling everything automatically."</p>
            <div className={styles.testimonialAuthor}>— Chit Fund Manager, Chennai</div>
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
