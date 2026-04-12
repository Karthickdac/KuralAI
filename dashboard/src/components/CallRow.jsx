/**
 * CallRow - Table row for a single call record
 */

import React from 'react';

const STATUS_STYLES = {
  completed:   { bg: '#EAF3DE', color: '#3B6D11' },
  failed:      { bg: '#FCEBEB', color: '#A32D2D' },
  'no-answer': { bg: '#FAEEDA', color: '#854F0B' },
  busy:        { bg: '#FAEEDA', color: '#854F0B' },
  'in-progress':{ bg: '#E6F1FB', color: '#185FA5' },
  answered:    { bg: '#E6F1FB', color: '#185FA5' },
  queued:      { bg: '#EEEDFE', color: '#534AB7' },
  default:     { bg: '#F1EFE8', color: '#5F5E5A' },
};

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.default;
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 500,
      padding: '3px 9px',
      borderRadius: 12,
      background: s.bg,
      color: s.color,
    }}>
      {status}
    </span>
  );
}

function fmtDuration(s) {
  if (!s) return '—';
  return `${Math.floor(s / 60)}m ${s % 60}s`;
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
    <tr>
      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
        {call.toPhone?.replace(/(\d{5})(\d{5})$/, '$1*****')}
      </td>
      <td style={{ fontSize: 12, color: '#888780' }}>
        {call.direction || 'outbound'}
      </td>
      <td><StatusPill status={call.status} /></td>
      <td>{fmtDuration(call.duration)}</td>
      <td>
        {call.escalated
          ? <span style={{ fontSize: 11, color: '#A32D2D', fontWeight: 500 }}>Yes</span>
          : <span style={{ fontSize: 11, color: '#888780' }}>No</span>}
      </td>
      <td style={{ fontSize: 12, color: '#888780' }}>{timeAgo(call.createdAt)}</td>
      <td>
        <button
          onClick={onView}
          style={{ fontSize: 12, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          View →
        </button>
      </td>
    </tr>
  );
}
