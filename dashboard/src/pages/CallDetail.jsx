import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { transcriptsApi, logsApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './CallDetail.module.css';

const STATUS_CONFIG = {
  completed:    { bg: 'var(--success-bg)', color: 'var(--success-text)' },
  failed:       { bg: 'var(--danger-bg)',  color: 'var(--danger-text)' },
  'no-answer':  { bg: 'var(--warning-bg)', color: 'var(--warning-text)' },
  escalated:    { bg: 'var(--purple-bg)',  color: 'var(--purple-text)' },
  'in-progress':{ bg: 'var(--info-bg)',    color: 'var(--info-text)' },
  default:      { bg: '#F1F5F9',           color: '#64748B' },
};

const LOG_CONFIG = {
  info:  { bg: 'var(--card-bg)',    border: 'var(--border)', dot: 'var(--info)' },
  warn:  { bg: 'var(--warning-bg)', border: 'rgba(217,119,6,0.2)', dot: 'var(--warning)' },
  error: { bg: 'var(--danger-bg)',  border: 'rgba(220,38,38,0.2)', dot: 'var(--danger)' },
};

export default function CallDetail() {
  const { callId } = useParams();
  const navigate = useNavigate();
  const [call, setCall] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('transcript');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [t, l] = await Promise.all([transcriptsApi.get(callId), logsApi.get(callId)]);
        setCall(t.data.call);
        setTranscript(t.data.transcript);
        setLogs(l.data.logs);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [callId]);

  const fmtDur = (s) => s ? `${Math.floor(s / 60)}m ${s % 60}s` : '—';
  const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—';
  const sc = (s) => STATUS_CONFIG[s] || STATUS_CONFIG.default;

  function handleExport() {
    if (!transcript.length) return;
    const lines = transcript.map(t => `[${t.speaker.toUpperCase()}]${t.intent ? ` (${t.intent})` : ''}: ${t.text}`).join('\n');
    const meta = `Call ID: ${callId}\nPhone: ${call.toPhone}\nStatus: ${call.status}\nDuration: ${fmtDur(call.duration)}\nDate: ${fmtDate(call.createdAt)}\n\n`;
    const blob = new Blob([meta + lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `transcript-${callId}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <div className={styles.loadingState}>
            <div className={styles.spinner} /><p>Loading call details...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!call) {
    return (
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <div className={styles.loadingState}><p>Call not found.</p></div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        {/* Top bar */}
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back to calls
          </button>
          {transcript.length > 0 && (
            <button className={styles.exportBtn} onClick={handleExport}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Transcript
            </button>
          )}
        </div>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Call Details</h1>
            <div className={styles.phone}>{call.toPhone}</div>
          </div>
          <span className={styles.statusPill} style={{ background: sc(call.status).bg, color: sc(call.status).color }}>
            {call.status}
          </span>
        </div>

        {/* Metadata grid */}
        <div className={styles.metaGrid}>
          {[
            { label: 'Duration', value: fmtDur(call.duration) },
            { label: 'Started', value: fmtDate(call.createdAt) },
            { label: 'Direction', value: call.direction || 'outbound' },
            { label: 'Escalated', value: call.escalated ? 'Yes' : 'No' },
          ].map(({ label, value }) => (
            <div key={label} className={styles.metaItem}>
              <span className={styles.metaLabel}>{label}</span>
              <span className={styles.metaValue}>{value}</span>
            </div>
          ))}
        </div>

        {/* Recording */}
        {call.recordingUrl && (
          <div className={styles.recordingCard}>
            <div className={styles.recordingLabel}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight:6 }}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
              Call Recording
            </div>
            <audio controls src={call.recordingUrl} className={styles.audio} />
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === 'transcript' ? styles.tabActive : ''}`} onClick={() => setActiveTab('transcript')}>
            Transcript
            <span className={styles.tabBadge}>{transcript.length}</span>
          </button>
          <button className={`${styles.tab} ${activeTab === 'logs' ? styles.tabActive : ''}`} onClick={() => setActiveTab('logs')}>
            Event Logs
            <span className={styles.tabBadge}>{logs.length}</span>
          </button>
        </div>

        {/* Transcript */}
        {activeTab === 'transcript' && (
          <div className={styles.transcript}>
            {transcript.length === 0 && <div className={styles.empty}>No transcript available for this call.</div>}
            {transcript.map((turn) => (
              <div key={turn.id} className={`${styles.bubble} ${turn.speaker === 'ai' ? styles.aiBubble : styles.userBubble}`}>
                <div className={styles.bubbleMeta}>
                  <span className={styles.speaker}>{turn.speaker === 'ai' ? 'KuralAI' : 'Customer'}</span>
                  {turn.intent && <span className={styles.intentTag}>{turn.intent}</span>}
                  {turn.confidence != null && <span className={styles.confidence}>{(turn.confidence * 100).toFixed(0)}% confidence</span>}
                </div>
                <div className={styles.bubbleText}>{turn.text}</div>
              </div>
            ))}
          </div>
        )}

        {/* Logs */}
        {activeTab === 'logs' && (
          <div className={styles.logList}>
            {logs.length === 0 && <div className={styles.empty}>No event logs for this call.</div>}
            {logs.map((log) => {
              const lc = LOG_CONFIG[log.level] || LOG_CONFIG.info;
              return (
                <div key={log.id} className={styles.logRow} style={{ background: lc.bg, borderColor: lc.border }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: lc.dot, flexShrink:0, marginTop:4 }} />
                  <div>
                    <div className={styles.logEvent}>{log.event}</div>
                    <div className={styles.logMsg}>{log.message}</div>
                  </div>
                  <div className={styles.logTime}>{new Date(log.createdAt).toLocaleTimeString()}</div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
