import React from 'react';

const STATUS_STYLES = {
  completed:    { bg: 'var(--success-bg)', color: 'var(--success-text)' },
  failed:       { bg: 'var(--danger-bg)',  color: 'var(--danger-text)' },
  'no-answer':  { bg: 'var(--warning-bg)', color: 'var(--warning-text)' },
  busy:         { bg: 'var(--warning-bg)', color: 'var(--warning-text)' },
  'in-progress':{ bg: 'var(--info-bg)',    color: 'var(--info-text)' },
  answered:     { bg: 'var(--info-bg)',    color: 'var(--info-text)' },
  queued:       { bg: 'var(--purple-bg)',  color: 'var(--purple-text)' },
  ringing:      { bg: 'var(--info-bg)',    color: 'var(--info-text)' },
  default:      { bg: '#F1F5F9',           color: '#64748B' },
};

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.default;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '3px 9px',
      borderRadius: 999, background: s.bg, color: s.color,
      textTransform: 'capitalize', letterSpacing: '0.01em',
    }}>
      {status}
    </span>
  );
}

function fmtDuration(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function CallRow({ call, onView }) {
  return (
    <tr style={{ transition: 'background 0.1s' }}
      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 16 }}>
        {call.toPhone?.replace(/(\d{5})(\d{5})$/, '$1 •••••')}
      </td>
      <td>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
          background: call.direction === 'inbound' ? '#EFF6FF' : '#F5F3FF',
          color: call.direction === 'inbound' ? '#1D4ED8' : '#6D28D9',
        }}>
          {call.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
        </span>
      </td>
      <td><StatusPill status={call.status} /></td>
      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmtDuration(call.duration)}</td>
      <td>
        {call.escalated
          ? <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger-text)', background: 'var(--danger-bg)', padding: '2px 8px', borderRadius: 4 }}>Escalated</span>
          : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{timeAgo(call.createdAt)}</td>
      <td style={{ paddingRight: 16 }}>
        <button
          onClick={onView}
          style={{
            fontSize: 12, fontWeight: 500, color: 'var(--primary)',
            background: 'var(--primary-light)', border: 'none',
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            transition: 'background 0.12s',
          }}
        >
          View →
        </button>
      </td>
    </tr>
  );
}
