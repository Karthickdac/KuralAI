import React, { useState, useEffect, useRef, useCallback } from 'react';
import { workflowsApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Workflows.module.css';

const SCHEDULE_LABELS = {
  manual: 'Manual', daily: 'Daily', weekly: 'Weekly', 'one-time': 'One-time',
};

const STATUS_CONFIG = {
  draft:    { label: 'Draft',    bg: '#F1F5F9',              color: '#64748B' },
  active:   { label: 'Active',   bg: 'var(--success-bg)',    color: 'var(--success-text)' },
  paused:   { label: 'Paused',   bg: 'var(--warning-bg)',    color: 'var(--warning-text)' },
  completed:{ label: 'Done',     bg: 'var(--primary-light)', color: 'var(--primary-text)' },
};

/* ─── Script Preview Hook ──────────────────────────────────────────────── */
function useScriptPreview() {
  const [playing, setPlaying] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [progress, setProgress] = useState(0); // 0-1
  const utterRef = useRef(null);
  const progressTimer = useRef(null);
  const startTime = useRef(0);
  const duration = useRef(0);

  // Load voices (may be async on Chrome)
  useEffect(() => {
    function loadVoices() {
      const all = window.speechSynthesis?.getVoices() || [];
      const tamil = all.filter(v => v.lang.startsWith('ta'));
      const available = tamil.length > 0 ? tamil : all.slice(0, 5);
      setVoices(available);
      if (!selectedVoice && available.length > 0) setSelectedVoice(available[0]);
    }
    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
  }, []); // eslint-disable-line

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    clearInterval(progressTimer.current);
    setPlaying(false);
    setProgress(0);
  }, []);

  const play = useCallback((text) => {
    if (!text?.trim()) return;
    if (playing) { stop(); return; }

    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utter.voice = selectedVoice;
    utter.lang = 'ta-IN';
    utter.rate = 0.88;
    utter.pitch = 1.05;
    utterRef.current = utter;

    // Estimate duration by word count (~120wpm for TTS)
    const words = text.trim().split(/\s+/).length;
    duration.current = (words / 120) * 60 * 1000; // ms

    utter.onstart = () => {
      setPlaying(true);
      setProgress(0);
      startTime.current = Date.now();
      progressTimer.current = setInterval(() => {
        const elapsed = Date.now() - startTime.current;
        setProgress(Math.min(elapsed / duration.current, 0.99));
      }, 80);
    };

    const finish = () => {
      clearInterval(progressTimer.current);
      setPlaying(false);
      setProgress(0);
    };

    utter.onend = finish;
    utter.onerror = finish;

    window.speechSynthesis.speak(utter);
  }, [playing, selectedVoice, stop]);

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return { playing, voices, selectedVoice, setSelectedVoice, progress, play, stop };
}

/* ─── Waveform Animation ───────────────────────────────────────────────── */
function Waveform({ playing }) {
  const bars = [3, 5, 8, 12, 9, 6, 10, 7, 4, 11, 8, 5, 9, 6, 4];
  return (
    <div className={styles.waveform} aria-hidden="true">
      {bars.map((h, i) => (
        <span
          key={i}
          className={styles.waveBar}
          style={{
            height: playing ? `${h + Math.random() * 4}px` : '3px',
            animationDelay: `${i * 0.06}s`,
            animationPlayState: playing ? 'running' : 'paused',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Script Preview Panel ─────────────────────────────────────────────── */
function ScriptPreview({ script }) {
  const { playing, voices, selectedVoice, setSelectedVoice, progress, play, stop } = useScriptPreview();
  const hasTamilVoice = voices.some(v => v.lang.startsWith('ta'));
  const isEmpty = !script?.trim();

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewHeader}>
        <div className={styles.previewTitle}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/>
          </svg>
          Script Preview
        </div>
        {voices.length > 0 && (
          <select
            className={styles.voiceSelect}
            value={selectedVoice?.name || ''}
            onChange={e => {
              const v = voices.find(v => v.name === e.target.value);
              setSelectedVoice(v || null);
            }}
          >
            {voices.map(v => (
              <option key={v.name} value={v.name}>
                {v.name} {v.lang.startsWith('ta') ? '🇮🇳' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {!hasTamilVoice && (
        <div className={styles.voiceWarning}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          No Tamil voice found on this device — using system default. Production calls use Azure Neural TTS (ta-IN).
        </div>
      )}

      <div className={styles.previewBody}>
        {/* Script text preview */}
        <div className={`${styles.scriptPreviewText} ${isEmpty ? styles.scriptEmpty : ''}`}>
          {isEmpty
            ? 'Type your AI script above to preview it…'
            : script}
        </div>

        {/* Progress bar */}
        {playing && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
          </div>
        )}

        {/* Controls */}
        <div className={styles.previewControls}>
          <Waveform playing={playing} />
          <div className={styles.previewBtns}>
            <button
              type="button"
              className={`${styles.playBtn} ${playing ? styles.stopBtn : ''}`}
              disabled={isEmpty}
              onClick={() => playing ? stop() : play(script)}
            >
              {playing ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  Stop
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Play Script
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Workflow Modal ────────────────────────────────────────────────────── */
function WorkflowModal({ onClose, onSaved, editWf }) {
  const [form, setForm] = useState(editWf ? { ...editWf } : {
    name: '', description: '', script: '', schedule: 'manual', scheduleTime: '', targetCount: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      if (editWf) {
        await workflowsApi.update(editWf.id, form);
      } else {
        await workflowsApi.create(form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{editWf ? 'Edit Workflow' : 'New Workflow'}</h2>
            <p className={styles.modalSub}>Configure your Tamil AI call campaign</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Workflow Name *</label>
            <input
              className={styles.input}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Order confirmation campaign"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Description</label>
            <input
              className={styles.input}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this workflow"
            />
          </div>

          {/* Script + live preview side by side */}
          <div className={styles.scriptRow}>
            <div className={styles.field} style={{ flex: 1 }}>
              <label className={styles.label}>AI Script / Prompt</label>
              <p className={styles.hint}>Tamil conversation instructions for the AI agent in this campaign</p>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={form.script}
                onChange={e => setForm(f => ({ ...f, script: e.target.value }))}
                placeholder={`நீங்கள் ஒரு customer service AI.\nவாடகையாளரின் ஆர்டர் நிலையை தமிழில் தெரிவியுங்கள்.\nகேள்விகளுக்கு தெளிவான மற்றும் நட்பான முறையில் பதில் அளியுங்கள்.`}
                rows={6}
              />
            </div>
            <ScriptPreview script={form.script} />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Schedule</label>
              <select
                className={styles.input}
                value={form.schedule}
                onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
              >
                <option value="manual">Manual trigger</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="one-time">One-time</option>
              </select>
            </div>
            {form.schedule !== 'manual' && (
              <div className={styles.field}>
                <label className={styles.label}>Schedule Time</label>
                <input
                  type="time"
                  className={styles.input}
                  value={form.scheduleTime}
                  onChange={e => setForm(f => ({ ...f, scheduleTime: e.target.value }))}
                />
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.label}>Target Call Count</label>
              <input
                type="number"
                min={1}
                className={styles.input}
                value={form.targetCount}
                onChange={e => setForm(f => ({ ...f, targetCount: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : editWf ? 'Save Changes' : 'Create Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Workflows Page ──────────────────────────────────────────────── */
export default function Workflows() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editWf, setEditWf] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  async function fetchWorkflows() {
    setLoading(true);
    try {
      const { data } = await workflowsApi.list();
      setWorkflows(data.workflows);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchWorkflows(); }, []);

  async function handleStatusToggle(wf) {
    const newStatus = wf.status === 'active' ? 'paused' : 'active';
    setUpdatingId(wf.id);
    try {
      await workflowsApi.update(wf.id, { status: newStatus });
      fetchWorkflows();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(wf) {
    if (!window.confirm(`Delete workflow "${wf.name}"? This cannot be undone.`)) return;
    try {
      await workflowsApi.remove(wf.id);
      fetchWorkflows();
    } catch (err) {
      alert('Failed to delete workflow');
    }
  }

  const sc = (s) => STATUS_CONFIG[s] || { label: s, bg: '#F1F5F9', color: '#64748B' };

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Workflows</h1>
            <p className={styles.pageSub}>{workflows.length} configured call campaign{workflows.length !== 1 ? 's' : ''}</p>
          </div>
          <button className={styles.addBtn} onClick={() => { setEditWf(null); setShowModal(true); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Workflow
          </button>
        </div>

        <div className={styles.infoBanner}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, color:'var(--info)' }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Workflows define reusable Tamil AI call campaigns. Write your script, preview it live with audio, then trigger manually or on a schedule.</span>
        </div>

        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} /><p>Loading workflows...</p>
          </div>
        ) : workflows.length === 0 ? (
          <div className={styles.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
            </svg>
            <h3 style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)', marginBottom:6 }}>No workflows yet</h3>
            <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:20 }}>Create your first Tamil AI call campaign workflow</p>
            <button className={styles.addBtn} onClick={() => setShowModal(true)}>+ New Workflow</button>
          </div>
        ) : (
          <div className={styles.wfGrid}>
            {workflows.map(wf => {
              const st = sc(wf.status);
              const successRate = wf.callsTotal > 0 ? Math.round((wf.callsCompleted / wf.callsTotal) * 100) : null;
              return (
                <div key={wf.id} className={styles.wfCard}>
                  <div className={styles.wfCardHead}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div className={styles.wfName}>{wf.name}</div>
                      {wf.description && <div className={styles.wfDesc}>{wf.description}</div>}
                    </div>
                    <span className={styles.statusPill} style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>

                  {wf.script && (
                    <div className={styles.wfScript}>
                      {wf.script.slice(0, 120)}{wf.script.length > 120 ? '...' : ''}
                    </div>
                  )}

                  <div className={styles.wfMeta}>
                    <div className={styles.wfMetaItem}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {SCHEDULE_LABELS[wf.schedule] || wf.schedule}
                      {wf.scheduleTime && ` · ${wf.scheduleTime}`}
                    </div>
                    {wf.targetCount > 0 && (
                      <div className={styles.wfMetaItem}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                        {wf.targetCount} targets
                      </div>
                    )}
                  </div>

                  {wf.callsTotal > 0 && (
                    <div className={styles.wfStats}>
                      <div className={styles.wfStat}>
                        <div className={styles.wfStatVal}>{wf.callsTotal}</div>
                        <div className={styles.wfStatLabel}>Total</div>
                      </div>
                      <div className={styles.wfStat}>
                        <div className={styles.wfStatVal} style={{ color:'var(--success)' }}>{wf.callsCompleted}</div>
                        <div className={styles.wfStatLabel}>Done</div>
                      </div>
                      <div className={styles.wfStat}>
                        <div className={styles.wfStatVal} style={{ color:'var(--danger)' }}>{wf.callsFailed}</div>
                        <div className={styles.wfStatLabel}>Failed</div>
                      </div>
                      {successRate !== null && (
                        <div className={styles.wfStat}>
                          <div className={styles.wfStatVal} style={{ color:'var(--primary)' }}>{successRate}%</div>
                          <div className={styles.wfStatLabel}>Success</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.wfActions}>
                    <button
                      className={`${styles.wfActionBtn} ${wf.status === 'active' ? styles.pauseBtn : styles.startBtn}`}
                      onClick={() => handleStatusToggle(wf)}
                      disabled={updatingId === wf.id || wf.status === 'completed'}
                    >
                      {wf.status === 'active' ? (
                        <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause</>
                      ) : (
                        <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> {wf.status === 'draft' ? 'Start' : 'Resume'}</>
                      )}
                    </button>
                    <button className={styles.wfEditBtn} onClick={() => { setEditWf(wf); setShowModal(true); }}>Edit</button>
                    <button className={styles.wfDeleteBtn} onClick={() => handleDelete(wf)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showModal && (
        <WorkflowModal
          editWf={editWf}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchWorkflows(); }}
        />
      )}
    </div>
  );
}
