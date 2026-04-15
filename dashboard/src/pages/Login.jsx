import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import styles from './Login.module.css';

const INDUSTRIES = [
  'Chit Funds', 'NBFCs & Lending', 'Insurance', 'Healthcare',
  'Real Estate', 'E-commerce', 'Education', 'Logistics'
];

const STATS = [
  { value: '10x', label: 'More Calls / Day', icon: '⚡' },
  { value: '93%', label: 'Answer Rate', icon: '📞' },
  { value: '60%', label: 'Cost Reduction', icon: '💰' },
];

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
        <path d="M19 10v2a7 7 0 01-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
      </svg>
    ),
    title: 'Human-Like Tamil Voice',
    desc: 'Neural voice so natural, customers won\'t know it\'s AI'
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
    title: 'Mass Campaign Engine',
    desc: 'Call hundreds simultaneously with smart retry logic'
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    title: 'Smart Conversations',
    desc: 'Intent detection, sentiment analysis & real-time transcripts'
  },
];

export default function Login() {
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [activeIndustry, setActiveIndustry] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndustry(prev => (prev + 1) % INDUSTRIES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await login(form.email, form.password);
    if (ok) navigate('/');
  };

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.bgOrbs}>
          <div className={styles.orb1}/>
          <div className={styles.orb2}/>
          <div className={styles.orb3}/>
        </div>

        <div className={styles.gridOverlay}/>

        <div className={styles.leftContent}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
            </div>
            <span className={styles.brandName}>KuralAI</span>
            <span className={styles.brandBeta}>Enterprise</span>
          </div>

          <h1 className={styles.tagline}>
            <span className={styles.taglineSmall}>Meet சமுத்ரா (Samuthra)</span>
            Your AI Employee Who<br/>
            <span className={styles.gradient}>Speaks Perfect Tamil</span>
          </h1>

          <p className={styles.description}>
            Deploy an AI voice agent that makes thousands of outbound calls in natural Tamil.
            Collections, reminders, follow-ups, confirmations — running 24/7 without breaks.
          </p>

          <div className={styles.industryRotator}>
            <span className={styles.industryLabel}>Now serving:</span>
            <div className={styles.industrySlider}>
              {INDUSTRIES.map((ind, i) => (
                <span key={ind} className={`${styles.industryItem} ${i === activeIndustry ? styles.industryActive : ''}`}>
                  {ind}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.statsRow}>
            {STATS.map(s => (
              <div key={s.label} className={styles.stat}>
                <span className={styles.statEmoji}>{s.icon}</span>
                <div className={styles.statValue}>{s.value}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className={styles.features}>
            {FEATURES.map(f => (
              <div key={f.title} className={styles.featureCard}>
                <div className={styles.featureIcon}>{f.icon}</div>
                <div>
                  <div className={styles.featureTitle}>{f.title}</div>
                  <div className={styles.featureDesc}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.socialProof}>
            <div className={styles.avatarStack}>
              <div className={styles.avatar} style={{background:'#6366f1'}}>A</div>
              <div className={styles.avatar} style={{background:'#ec4899'}}>B</div>
              <div className={styles.avatar} style={{background:'#f59e0b'}}>C</div>
              <div className={styles.avatar} style={{background:'#10b981'}}>D</div>
              <div className={styles.avatarMore}>+12</div>
            </div>
            <span className={styles.socialText}>Trusted by 16+ businesses across Tamil Nadu</span>
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.loginIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </div>
            <h2 className={styles.heading}>Welcome back</h2>
            <p className={styles.subheading}>Sign in to your KuralAI dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Email address</label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <input
                  type="email"
                  className={styles.input}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@company.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <input
                  type="password"
                  className={styles.input}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? (
                <span className={styles.btnLoading}>
                  <span className={styles.spinner} /> Signing in...
                </span>
              ) : (
                <>
                  Sign in
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </>
              )}
            </button>
          </form>

          <div className={styles.divider}>
            <span>Powered by</span>
          </div>

          <div className={styles.techStack}>
            <div className={styles.techItem}>
              <span className={styles.techDot} style={{background:'#10a37f'}}/>
              GPT-4o
            </div>
            <div className={styles.techItem}>
              <span className={styles.techDot} style={{background:'#8b5cf6'}}/>
              ElevenLabs
            </div>
            <div className={styles.techItem}>
              <span className={styles.techDot} style={{background:'#e11d48'}}/>
              Twilio
            </div>
          </div>

          <p className={styles.footer}>
            An <strong>Automystic</strong> Product
          </p>
        </div>
      </div>
    </div>
  );
}
