import React, { useState, useEffect, useCallback } from 'react';
import { campaignsApi, customersApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Campaigns.module.css';

const TYPE_LABELS = {
  due_reminder: 'Due Reminder',
  lottery_participation: 'Lottery',
  payment_followup: 'Payment Follow-up',
  custom: 'Custom',
};

const STATUS_OPTIONS = ['', 'draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'];

function Modal({ title, onClose, children }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    name: '', type: 'due_reminder', concurrency: 1,
    customerIds: [], scheduledAt: '', recordCalls: true, callbackUrl: '', engine: 'kuralai',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailCalls, setDetailCalls] = useState([]);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const { data } = await campaignsApi.list(params);
      setCampaigns(data.campaigns);
    } catch (err) {
      console.error(err);
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  useEffect(() => {
    let interval;
    if (campaigns.some(c => c.status === 'running')) {
      interval = setInterval(fetchCampaigns, 5000);
    }
    return () => clearInterval(interval);
  }, [campaigns, fetchCampaigns]);

  async function loadCustomers() {
    try {
      const { data } = await customersApi.list();
      setCustomers(data.customers || data);
    } catch (err) {
      console.error(err);
    }
  }

  function openCreate() {
    setForm({ name: '', type: 'due_reminder', concurrency: 1, customerIds: [], scheduledAt: '', recordCalls: true, callbackUrl: '', engine: 'kuralai' });
    loadCustomers();
    setShowCreate(true);
  }

  function toggleCustomer(id) {
    setForm(prev => ({
      ...prev,
      customerIds: prev.customerIds.includes(id)
        ? prev.customerIds.filter(c => c !== id)
        : [...prev.customerIds, id],
    }));
  }

  function selectAll() {
    setForm(prev => ({
      ...prev,
      customerIds: prev.customerIds.length === customers.length ? [] : customers.map(c => c.id),
    }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name || !form.customerIds.length) return;
    setSubmitting(true);
    try {
      const payload = { ...form, concurrency: parseInt(form.concurrency) || 1 };
      if (!payload.scheduledAt) delete payload.scheduledAt;
      if (!payload.callbackUrl) delete payload.callbackUrl;
      await campaignsApi.create(payload);
      setShowCreate(false);
      fetchCampaigns();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStart(id) {
    try {
      await campaignsApi.start(id);
      fetchCampaigns();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  }

  async function handlePause(id) {
    try {
      await campaignsApi.pause(id);
      fetchCampaigns();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  }

  async function handleResume(id) {
    try {
      await campaignsApi.resume(id);
      fetchCampaigns();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this campaign?')) return;
    try {
      await campaignsApi.remove(id);
      fetchCampaigns();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  }

  async function openDetail(id) {
    try {
      const { data } = await campaignsApi.get(id);
      setDetail(data.campaign);
      setDetailCalls(data.calls || []);
      setShowDetail(id);
    } catch (err) {
      console.error(err);
    }
  }

  function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Campaigns</h1>
            <p className={styles.pageSub}>Create and manage bulk calling campaigns with concurrent dialing</p>
          </div>
          <button className={styles.createBtn} onClick={openCreate}>+ New Campaign</button>
        </div>

        <div className={styles.filters}>
          <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Concurrency</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32 }}>Loading...</td></tr>
              ) : campaigns.length === 0 ? (
                <tr><td colSpan={7} className={styles.empty}>No campaigns yet. Create one to start calling.</td></tr>
              ) : campaigns.map(c => (
                <tr key={c.id}>
                  <td>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--primary)', fontSize: 13 }} onClick={() => openDetail(c.id)}>
                      {c.name}
                    </button>
                  </td>
                  <td>{TYPE_LABELS[c.type] || c.type}</td>
                  <td><span className={`${styles.badge} ${styles[c.status]}`}>{c.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className={styles.progressBar} style={{ width: 80 }}>
                        <div className={styles.progressFill} style={{ width: `${c.totalCalls ? (c.completedCalls / c.totalCalls * 100) : 0}%` }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.completedCalls || 0}/{c.totalCalls}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{c.concurrency}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(c.createdAt)}</td>
                  <td>
                    <div className={styles.actions}>
                      {c.status === 'draft' && (
                        <button className={`${styles.actionBtn} ${styles.startBtn}`} onClick={() => handleStart(c.id)}>Start</button>
                      )}
                      {c.status === 'running' && (
                        <button className={`${styles.actionBtn} ${styles.pauseBtn}`} onClick={() => handlePause(c.id)}>Pause</button>
                      )}
                      {c.status === 'paused' && (
                        <button className={`${styles.actionBtn} ${styles.resumeBtn}`} onClick={() => handleResume(c.id)}>Resume</button>
                      )}
                      {['draft', 'paused', 'cancelled'].includes(c.status) && (
                        <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDelete(c.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showCreate && (
          <Modal title="Create Campaign" onClose={() => setShowCreate(false)}>
            <form className={styles.modalBody} onSubmit={handleCreate}>
              <Field label="Campaign Name">
                <input className={styles.input} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. May Due Reminder Batch 1" required />
              </Field>

              <div className={styles.row}>
                <Field label="Type">
                  <select className={styles.select} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Concurrency (1-50)">
                  <input className={styles.input} type="number" min={1} max={50} value={form.concurrency} onChange={e => setForm(p => ({ ...p, concurrency: e.target.value }))} />
                </Field>
              </div>

              <Field label="Schedule (optional)">
                <input className={styles.input} type="datetime-local" value={form.scheduledAt} onChange={e => setForm(p => ({ ...p, scheduledAt: e.target.value }))} />
              </Field>

              <div className={styles.checkRow}>
                <input type="checkbox" checked={form.recordCalls} onChange={e => setForm(p => ({ ...p, recordCalls: e.target.checked }))} id="recordCalls" />
                <label htmlFor="recordCalls">Record all calls</label>
              </div>

              <Field label="Voice Engine" hint="KuralAI = scripted engine (default). ElevenLabs = Conversational AI agent (Samuthra) — requires Agent ID + Phone Number ID in Settings.">
                <select className={styles.input} value={form.engine} onChange={e => setForm(p => ({ ...p, engine: e.target.value }))}>
                  <option value="kuralai">KuralAI Scripted Engine (default)</option>
                  <option value="elevenlabs">ElevenLabs Conversational AI (Samuthra)</option>
                </select>
              </Field>

              <Field label="Callback URL (optional - push recordings to external system)">
                <input className={styles.input} value={form.callbackUrl} onChange={e => setForm(p => ({ ...p, callbackUrl: e.target.value }))} placeholder="https://your-crm.com/api/webhooks/calls" />
              </Field>

              <Field label={`Select Customers (${form.customerIds.length} selected)`}>
                <div style={{ marginBottom: 6 }}>
                  <button type="button" className={styles.actionBtn} onClick={selectAll} style={{ fontSize: 11 }}>
                    {form.customerIds.length === customers.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className={styles.customerList}>
                  {customers.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading customers...</div>
                  ) : customers.map(c => (
                    <div key={c.id} className={styles.customerItem} onClick={() => toggleCustomer(c.id)}>
                      <input type="checkbox" checked={form.customerIds.includes(c.id)} readOnly style={{ accentColor: 'var(--primary)' }} />
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{c.phone}</span>
                    </div>
                  ))}
                </div>
              </Field>

              <button type="submit" className={styles.submitBtn} disabled={submitting || !form.name || !form.customerIds.length}>
                {submitting ? 'Creating...' : `Create Campaign (${form.customerIds.length} customers)`}
              </button>
            </form>
          </Modal>
        )}

        {showDetail && detail && (
          <Modal title={detail.name} onClose={() => setShowDetail(null)}>
            <div className={styles.modalBody}>
              <div className={styles.detailGrid}>
                <div className={styles.detailCard}>
                  <div className={styles.detailLabel}>Status</div>
                  <div className={styles.detailValue}>
                    <span className={`${styles.badge} ${styles[detail.status]}`}>{detail.status}</span>
                  </div>
                </div>
                <div className={styles.detailCard}>
                  <div className={styles.detailLabel}>Total</div>
                  <div className={styles.detailValue}>{detail.totalCalls}</div>
                </div>
                <div className={styles.detailCard}>
                  <div className={styles.detailLabel}>Completed</div>
                  <div className={styles.detailValue}>{detail.completedCalls}</div>
                </div>
                <div className={styles.detailCard}>
                  <div className={styles.detailLabel}>Failed</div>
                  <div className={styles.detailValue}>{detail.failedCalls}</div>
                </div>
                <div className={styles.detailCard}>
                  <div className={styles.detailLabel}>Concurrency</div>
                  <div className={styles.detailValue}>{detail.concurrency}</div>
                </div>
                <div className={styles.detailCard}>
                  <div className={styles.detailLabel}>Recording</div>
                  <div className={styles.detailValue}>{detail.recordCalls ? 'On' : 'Off'}</div>
                </div>
              </div>

              <div className={styles.progressBar} style={{ marginBottom: 16, height: 8 }}>
                <div className={styles.progressFill} style={{ width: `${detail.totalCalls ? (detail.completedCalls / detail.totalCalls * 100) : 0}%` }} />
              </div>

              {detail.startedAt && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Started: {formatDate(detail.startedAt)}
                </div>
              )}
              {detail.completedAt && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Completed: {formatDate(detail.completedAt)}
                </div>
              )}
              {detail.callbackUrl && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Callback: {detail.callbackUrl}
                </div>
              )}

              {detailCalls.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Call Results</h3>
                  <div className={styles.tableCard}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Phone</th>
                          <th>Status</th>
                          <th>Duration</th>
                          <th>Recording</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailCalls.map(call => (
                          <tr key={call.id}>
                            <td>{call.toPhone}</td>
                            <td><span className={`${styles.badge} ${call.status === 'completed' ? styles.completed : call.status === 'failed' ? styles.cancelled : styles.running}`}>{call.status}</span></td>
                            <td>{call.duration ? `${call.duration}s` : '-'}</td>
                            <td>
                              {call.recordingUrl ? (
                                <a href={`/api/calls/${call.id}/recording/stream`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: 12 }}>Play</a>
                              ) : '-'}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(call.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}
