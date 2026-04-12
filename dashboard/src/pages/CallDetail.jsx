/**
 * Call Detail Page
 * Shows full transcript, event log, and call metadata.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { transcriptsApi, logsApi, callsApi } from '../api/client';
import styles from './CallDetail.module.css';

const STATUS_COLORS = {
  completed: '#EAF3DE',
  failed: '#FCEBEB',
  'no-answer': '#FAEEDA',
  escalated: '#EEEDFE',
  'in-progress': '#E6F1FB',
  default: '#F1EFE8',
};

const STATUS_TEXT = {
  completed: '#3B6D11',
  failed: '#A32D2D',
  'no-answer': '#854F0B',
  escalated: '#534AB7',
  'in-progress': '#185FA5',
  default: '#5F5E5A',
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
        const [t, l] = await Promise.all([
          transcriptsApi.get(callId),
          logsApi.get(callId),
        ]);
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

  const fmtDuration = (s) => s ? `${Math.floor(s / 60)}m ${s % 60}s` : '—';
  const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—';
  const statusBg = (s) => STATUS_COLORS[s] || STATUS_COLORS.default;
  const statusColor = (s) => STATUS_TEXT[s] || STATUS_TEXT.default;

  if (loading) return <div className={styles.loading}>Loading call details...</div>;
  if (!call) return <div className={styles.loading}>Call not found.</div>;

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>← Back</button>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Call Details</h1>
          <div className={styles.phone}>{call.toPhone}</div>
        </div>
        <span
          className={styles.statusPill}
          style={{ background: statusBg(call.status), color: statusColor(call.status) }}
        >
          {call.status}
        </span>
      </div>

      {/* Metadata */}
      <div className={styles.metaGrid}>
        <div className={styles.metaItem}><span>Duration</span><strong>{fmtDuration(call.duration)}</strong></div>
        <div className={styles.metaItem}><span>Started</span><strong>{fmtDate(call.createdAt)}</strong></div>
        <div className={styles.metaItem}><span>Direction</span><strong>{call.direction || 'outbound'}</strong></div>
        <div className={styles.metaItem}><span>Escalated</span><strong>{call.escalated ? 'Yes' : 'No'}</strong></div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === 'transcript' ? styles.tabActive : ''}`} onClick={() => setActiveTab('transcript')}>
          Transcript ({transcript.length} turns)
        </button>
        <button className={`${styles.tab} ${activeTab === 'logs' ? styles.tabActive : ''}`} onClick={() => setActiveTab('logs')}>
          Event Logs ({logs.length})
        </button>
      </div>

      {/* Transcript view */}
      {activeTab === 'transcript' && (
        <div className={styles.transcript}>
          {transcript.length === 0 && <div className={styles.empty}>No transcript available.</div>}
          {transcript.map((turn) => (
            <div
              key={turn.id}
              className={`${styles.bubble} ${turn.speaker === 'ai' ? styles.aiBubble : styles.userBubble}`}
            >
              <div className={styles.bubbleHeader}>
                <span className={styles.speaker}>{turn.speaker === 'ai' ? 'KuralAI' : 'User'}</span>
                {turn.intent && (
                  <span className={styles.intentTag}>{turn.intent}</span>
                )}
                {turn.confidence != null && (
                  <span className={styles.confidence}>{(turn.confidence * 100).toFixed(0)}%</span>
                )}
              </div>
              <div className={styles.bubbleText}>{turn.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Event logs */}
      {activeTab === 'logs' && (
        <div className={styles.logList}>
          {logs.map((log) => (
            <div key={log.id} className={`${styles.logRow} ${styles[`log_${log.level}`]}`}>
              <div className={styles.logEvent}>{log.event}</div>
              <div className={styles.logMsg}>{log.message}</div>
              <div className={styles.logTime}>{new Date(log.createdAt).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
