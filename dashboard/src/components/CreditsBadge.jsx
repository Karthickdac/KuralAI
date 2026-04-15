import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentsApi } from '../api/client';
import { useAuth } from '../hooks/useAuth';

const BADGE_STYLE = {
  position: 'fixed',
  top: 12,
  right: 16,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '6px 14px 6px 10px',
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  transition: 'box-shadow 0.15s',
  fontFamily: 'inherit',
};

const ICON_WRAP = {
  width: 28,
  height: 28,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const MINS_STYLE = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text-primary)',
  lineHeight: 1,
};

const LABEL_STYLE = {
  fontSize: 10,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  lineHeight: 1,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

export default function CreditsBadge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    let mounted = true;
    const fetch = async () => {
      try {
        const res = await paymentsApi.balance();
        if (mounted) setBalance(res.data);
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 120000);
    const onFocus = () => fetch();
    window.addEventListener('focus', onFocus);
    return () => { mounted = false; clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [user]);

  if (!user || user.role === 'superadmin' || !balance) return null;

  const available = Math.max(0, (balance.totalMinutes || 0) - (balance.usedMinutes || 0) - (balance.reservedMinutes || 0));
  const isLow = available < 20;
  const isEmpty = available <= 0;

  const bg = isEmpty ? '#fef2f2' : isLow ? '#fffbeb' : 'rgba(16, 185, 129, 0.06)';
  const iconBg = isEmpty ? '#ef4444' : isLow ? '#f59e0b' : '#10b981';
  const color = isEmpty ? '#dc2626' : isLow ? '#d97706' : 'var(--text-primary)';

  return (
    <div
      style={{ ...BADGE_STYLE, background: bg }}
      onClick={() => navigate('/billing')}
      title="Click to manage billing & credits"
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'}
    >
      <div style={{ ...ICON_WRAP, background: iconBg }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ ...MINS_STYLE, color }}>{available.toLocaleString('en-IN')} min</span>
        <span style={LABEL_STYLE}>credits left</span>
      </div>
    </div>
  );
}
