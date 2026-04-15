import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentsApi } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import styles from './CreditsBadge.module.css';

export default function CreditsBadge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    let mounted = true;
    const load = async () => {
      try {
        const res = await paymentsApi.balance();
        if (mounted) setBalance(res.data);
      } catch {}
    };
    load();
    const interval = setInterval(load, 120000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { mounted = false; clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [user]);

  if (!user || user.role === 'superadmin' || !balance) return null;

  const available = Math.max(0, (balance.totalMinutes || 0) - (balance.usedMinutes || 0) - (balance.reservedMinutes || 0));
  const isLow = available < 20;
  const isEmpty = available <= 0;

  const badgeBg = isEmpty ? '#DC2626' : isLow ? '#D97706' : '#059669';
  const badgeShadow = isEmpty
    ? '0 2px 10px rgba(220,38,38,0.35)'
    : isLow
    ? '0 2px 10px rgba(217,119,6,0.35)'
    : '0 2px 10px rgba(5,150,105,0.3)';

  return (
    <div
      className={styles.badge}
      onClick={() => navigate('/billing')}
      title="Click to manage billing & credits"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: badgeBg,
        boxShadow: hover ? badgeShadow.replace('0.3', '0.5').replace('0.35', '0.55') : badgeShadow,
      }}
    >
      <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
      </svg>
      <span className={styles.minutes}>
        {available.toLocaleString('en-IN')} min
      </span>
      <span className={styles.label}>
        left
      </span>
    </div>
  );
}
