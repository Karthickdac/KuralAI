import React, { useState, useRef } from 'react';

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
  if (!s) return '\u2014';
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

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let activeAudio = null;

function RecordingPlayer({ callId }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);

  const src = `/api/calls/${callId}/recording/stream`;

  function togglePlay(e) {
    e.stopPropagation();
    if (error) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      activeAudio = null;
    } else {
      if (activeAudio && activeAudio !== audio) {
        activeAudio.pause();
      }
      activeAudio = audio;
      audio.play().catch(() => setError(true));
    }
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setCurrentTime(audio.currentTime);
    setProgress((audio.currentTime / audio.duration) * 100);
  }

  function handleSeek(e) {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = pct * audio.duration;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }} onClick={e => e.stopPropagation()}>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); activeAudio = null; }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onError={() => setError(true)}
      />
      <button
        onClick={togglePlay}
        title={error ? 'Recording unavailable' : playing ? 'Pause' : 'Play recording'}
        style={{
          width: 26, height: 26, borderRadius: '50%', border: 'none',
          background: error ? '#F1F5F9' : playing ? 'var(--primary)' : 'var(--primary-light)',
          color: error ? '#94A3B8' : playing ? '#fff' : 'var(--primary)',
          cursor: error ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'all 0.15s',
        }}
      >
        {error ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : playing ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="3" width="5" height="18" rx="1"/><rect x="14" y="3" width="5" height="18" rx="1"/>
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,3 20,12 6,21"/>
          </svg>
        )}
      </button>
      {!error && (playing || progress > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <div
            onClick={handleSeek}
            style={{
              height: 4, background: '#E2E8F0', borderRadius: 2,
              cursor: 'pointer', position: 'relative',
            }}
          >
            <div style={{
              height: '100%', background: 'var(--primary)', borderRadius: 2,
              width: `${progress}%`, transition: 'width 0.1s linear',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1 }}>
            {fmtTime(currentTime)}{duration > 0 && ` / ${fmtTime(duration)}`}
          </span>
        </div>
      )}
    </div>
  );
}

export default function CallRow({ call, onView }) {
  const hasRecording = !!call.recordingUrl;

  return (
    <tr style={{ transition: 'background 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 16 }}>
        {call.toPhone?.replace(/(\d{5})(\d{5})$/, '$1 \u2022\u2022\u2022\u2022\u2022')}
      </td>
      <td>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
          background: call.direction === 'inbound' ? '#EFF6FF' : '#F5F3FF',
          color: call.direction === 'inbound' ? '#1D4ED8' : '#6D28D9',
        }}>
          {call.direction === 'inbound' ? '\u2193 Inbound' : '\u2191 Outbound'}
        </span>
      </td>
      <td><StatusPill status={call.status} /></td>
      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmtDuration(call.duration)}</td>
      <td>
        {hasRecording ? (
          <RecordingPlayer callId={call.id} />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>\u2014</span>
        )}
      </td>
      <td>
        {call.escalated
          ? <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger-text)', background: 'var(--danger-bg)', padding: '2px 8px', borderRadius: 4 }}>Escalated</span>
          : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>\u2014</span>}
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
          View \u2192
        </button>
      </td>
    </tr>
  );
}
