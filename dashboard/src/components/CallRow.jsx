import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { settingsApi } from '../api/client';

// Module-level cache so we fetch the FX rate only once across all rows
let _rate = 83.5;
let _ratePromise = null;
function loadRate() {
  if (!_ratePromise) {
    _ratePromise = settingsApi.get()
      .then(res => { _rate = parseFloat(res?.data?.usdToInrRate) || 83.5; return _rate; })
      .catch(() => _rate);
  }
  return _ratePromise;
}
function useInrRate() {
  const [rate, setRate] = useState(_rate);
  useEffect(() => { loadRate().then(setRate); }, []);
  return rate;
}

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

function RecordingPlayer({ callId }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);

  const src = `/api/calls/${callId}/recording/stream`;

  const pausedByOtherRef = useRef(false);

  useEffect(() => {
    const handler = (e) => {
      const audio = audioRef.current;
      if (audio && e.detail !== audio && !audio.paused) {
        pausedByOtherRef.current = true;
        audio.pause();
        setProgress(0);
        setCurrentTime(0);
        setPlaying(false);
      }
    };
    window.addEventListener('kuralai-audio-play', handler);
    return () => window.removeEventListener('kuralai-audio-play', handler);
  }, []);

  function togglePlay(e) {
    e.stopPropagation();
    if (error) {
      setError(false);
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      if (pausedByOtherRef.current) {
        audio.currentTime = 0;
        pausedByOtherRef.current = false;
      }
      window.dispatchEvent(new CustomEvent('kuralai-audio-play', { detail: audio }));
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
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onError={() => {
          if (!pausedByOtherRef.current) setError(true);
        }}
      />
      <button
        onClick={togglePlay}
        title={playing ? 'Pause' : 'Play recording'}
        style={{
          width: 26, height: 26, borderRadius: '50%', border: 'none',
          background: playing ? 'var(--primary)' : 'var(--primary-light)',
          color: playing ? '#fff' : 'var(--primary)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'all 0.15s',
        }}
      >
        {playing ? (
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

function inr(n) {
  if (n == null || isNaN(n)) return null;
  return `\u20B9${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function fmtElCost(cost, rate) {
  if (!cost) return null;
  const usd = cost.totalUsd ?? cost.llmPriceUsd;
  if (usd != null) return inr(usd * rate);
  if (cost.credits != null) return `${Math.round(cost.credits).toLocaleString()} cr`;
  return null;
}

function fmtTwCost(tw, rate) {
  if (!tw || tw.price == null) return null;
  const usd = tw.priceUnit === 'USD' ? Number(tw.price) : Number(tw.price);
  return inr(usd * rate);
}

export default function CallRow({ call, onView }) {
  const { user } = useAuth();
  const rate = useInrRate();
  const isSuperAdmin = user?.role === 'superadmin';
  const hasRecording = !!call.recordingUrl;
  const elCost = call.metadata?.elevenlabs?.cost;
  const twCost = call.metadata?.twilio;
  const elLabel = isSuperAdmin ? fmtElCost(elCost, rate) : null;
  const twLabel = isSuperAdmin ? fmtTwCost(twCost, rate) : null;
  const totalUsd = (elCost?.totalUsd || elCost?.llmPriceUsd || 0) + (twCost?.price || 0);
  const totalLabel = isSuperAdmin && totalUsd > 0 ? inr(totalUsd * rate) : null;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          {totalLabel && (
            <span
              title={`Total cost (super admin only)${elLabel ? `\nElevenLabs: ${elLabel}` : ''}${twLabel ? `\nTwilio: ${twLabel}` : ''}`}
              style={{
                fontSize: 11, fontWeight: 700, color: '#065F46',
                background: '#D1FAE5', border: '1px solid #A7F3D0',
                padding: '3px 8px', borderRadius: 6, fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap',
              }}
            >
              {totalLabel}
            </span>
          )}
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
        </div>
      </td>
    </tr>
  );
}
