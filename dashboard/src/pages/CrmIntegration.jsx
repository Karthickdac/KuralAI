import React, { useState, useEffect, useCallback } from 'react';
import { crmApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './CrmIntegration.module.css';

function SampleCard({ title, badge, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen || false);
  return (
    <div className={styles.card}>
      <button className={styles.sampleToggle} onClick={() => setOpen(o => !o)}>
        <span className={`${styles.sampleToggleIcon} ${open ? styles.sampleToggleIconOpen : ''}`}>&#9654;</span>
        {title}
        {badge && <span className={styles.cardBadge}>{badge}</span>}
      </button>
      {open && <div className={styles.sampleBody}>{children}</div>}
    </div>
  );
}

function ConfigSection({ config, setConfig, onSave, saving, saved }) {
  function handleChange(key, value) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>CRM Fetch — Pull Customer Data</span>
          <span className={styles.cardBadge}>Inbound</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.gridFull}`}>
              <label className={styles.label}>CRM Endpoint URL</label>
              <p className={styles.hint}>The URL your CRM exposes to list customer data (e.g. https://yourcrm.com/api/customers)</p>
              <input className={styles.input} value={config.crmFetchUrl || ''} onChange={e => handleChange('crmFetchUrl', e.target.value)} placeholder="https://your-crm.com/api/customers" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>HTTP Method</label>
              <select className={styles.select} value={config.crmFetchMethod || 'GET'} onChange={e => handleChange('crmFetchMethod', e.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Custom Headers (JSON)</label>
              <p className={styles.hint}>e.g. {`{"Authorization": "Bearer xxx"}`}</p>
              <textarea className={styles.textarea} value={config.crmFetchHeaders || ''} onChange={e => handleChange('crmFetchHeaders', e.target.value)} placeholder='{"Authorization": "Bearer your-token"}' rows={2} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>CRM Push — Send Recordings & Transcripts</span>
          <span className={styles.cardBadge}>Outbound</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.gridFull}`}>
              <label className={styles.label}>Push Endpoint URL</label>
              <p className={styles.hint}>KuralAI will POST call recording URLs and transcripts to this endpoint</p>
              <input className={styles.input} value={config.crmPushUrl || ''} onChange={e => handleChange('crmPushUrl', e.target.value)} placeholder="https://your-crm.com/api/call-recordings" />
            </div>
            <div className={`${styles.field} ${styles.gridFull}`}>
              <label className={styles.label}>Custom Headers (JSON)</label>
              <textarea className={styles.textarea} value={config.crmPushHeaders || ''} onChange={e => handleChange('crmPushHeaders', e.target.value)} placeholder='{"Authorization": "Bearer your-token"}' rows={2} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.btnRow}>
        <button className={styles.btnPrimary} onClick={onSave} disabled={saving}>
          {saving ? <><span className={styles.spinner} /> Saving…</> : 'Save Configuration'}
        </button>
        {saved && <span className={styles.savedBadge}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Saved
        </span>}
      </div>

      <SampleCard title="Expected CRM Response Format" badge="Inbound Reference">
        <div className={styles.sampleSection}>
          <span className={`${styles.sampleLabel} ${styles.sampleLabelIn}`}>Your CRM should return</span>
          <pre className={styles.samplePre}>{`{
  "customers": [
    {
      "name": "ரமேஷ்",
      "phone": "+919876543210",
      "email": "ramesh@example.com",
      "chit": {
        "chitGroup": "CG-2024-A",
        "chitValue": 500000,
        "dueAmount": 18750,
        "totalDues": 40,
        "completedDues": 12,
        "nextDueDate": "மே 7"
      }
    },
    {
      "name": "கார்த்திக்",
      "phone": "7358337470",
      "chit": {
        "chitGroup": "CG-2024-C",
        "chitValue": 1000000,
        "dueAmount": 37500,
        "totalDues": 40,
        "completedDues": 1,
        "nextDueDate": "மே 5"
      }
    }
  ]
}`}</pre>
          <p className={styles.sampleNote}>
            <strong>Accepted wrappers:</strong> root array <code>[ ]</code>, or object with key <code>customers</code>, <code>data</code>, or <code>results</code>.<br />
            <strong>Phone field:</strong> <code>phone</code>, <code>mobile</code>, <code>phoneNumber</code>, or <code>contact</code>. 10-digit numbers are auto-prefixed with +91.<br />
            <strong>Name field:</strong> <code>name</code>, <code>customerName</code>, or <code>fullName</code>.<br />
            <strong>Chit details:</strong> nested under <code>chit</code>, <code>chitAccount</code>, or <code>account</code>. All chit fields are optional.
          </p>
        </div>
      </SampleCard>

      <SampleCard title="Recording Push Payload" badge="Outbound Reference">
        <div className={styles.sampleSection}>
          <span className={`${styles.sampleLabel} ${styles.sampleLabelOut}`}>KuralAI sends this to your CRM</span>
          <pre className={styles.samplePre}>{`{
  "callId": "ae4660e6-3a1d-4410-a817-d16726073a0c",
  "phone": "+917358337470",
  "customerName": "கார்த்திக்",
  "status": "completed",
  "duration": 113,
  "recordingUrl": "https://your-domain.com/api/calls/<callId>/recording/stream",
  "recordingSid": "RE10bcc57ae18866036031139ff3336b0d",
  "callType": "due_reminder",
  "transcript": [
    {
      "role": "assistant",
      "text": "வணக்கம் கார்த்திக், ஆட்டோமிஸ்டிக் சிட் ஃபண்ட்ஸ்...",
      "intent": null,
      "turnNumber": 1
    },
    {
      "role": "user",
      "text": "சொல்லுங்க",
      "intent": "identity_confirm",
      "turnNumber": 2
    },
    {
      "role": "assistant",
      "text": "CG-2024-C சிட் குரூப்ல உங்க தவணை ₹37,500...",
      "intent": null,
      "turnNumber": 3
    }
  ],
  "startedAt": "2026-04-13T15:29:38.254Z",
  "endedAt": "2026-04-13T15:31:44.782Z",
  "metadata": {
    "chitGroup": "CG-2024-C",
    "chitValue": "10,00,000",
    "dueAmount": "37,500",
    "currentDue": 2,
    "totalDues": 40
  }
}`}</pre>
          <p className={styles.sampleNote}>
            <strong>recordingUrl:</strong> Public proxy URL — your CRM can access the audio without Twilio credentials.<br />
            <strong>transcript:</strong> Full conversation turns with detected customer intents (e.g. <code>identity_confirm</code>, <code>already_paid</code>, <code>callback_request</code>).<br />
            <strong>metadata:</strong> All chit fund details passed during the original call.
          </p>
        </div>
      </SampleCard>
    </>
  );
}

function FetchSection({ config }) {
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleFetch() {
    setFetching(true);
    setResult(null);
    setError('');
    try {
      const res = await crmApi.fetchCustomers();
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Fetch failed');
    } finally {
      setFetching(false);
    }
  }

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Fetch Customer Data from CRM</span>
        </div>
        <div className={styles.cardBody}>
          {!config.crmFetchUrl ? (
            <div className={`${styles.alert} ${styles.alertInfo}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Configure the CRM Fetch URL in the Configuration tab first.
            </div>
          ) : (
            <>
              <p className={styles.hint} style={{ marginBottom: 12 }}>
                Fetch from: <strong>{config.crmFetchUrl}</strong>
              </p>
              <p className={styles.hint} style={{ marginBottom: 12 }}>
                This will pull customer data from your CRM and create or update records in KuralAI.
                The CRM response should return an array of customers with <code>phone</code>, <code>name</code>, and optionally <code>chit</code> fields.
              </p>
              <button className={styles.btnPrimary} onClick={handleFetch} disabled={fetching}>
                {fetching ? (
                  <><span className={styles.spinner} /> Fetching…</>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                    Fetch Customers
                  </>
                )}
              </button>
            </>
          )}

          {error && (
            <div className={`${styles.alert} ${styles.alertError}`} style={{ marginTop: 14 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {error}
            </div>
          )}

          {result && (
            <div className={`${styles.alert} ${styles.alertSuccess}`} style={{ marginTop: 14, flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Fetch completed successfully
              </div>
              <div className={styles.resultStats}>
                <span className={`${styles.stat} ${styles.statBlue}`}>{result.fetched} fetched</span>
                <span className={`${styles.stat} ${styles.statGreen}`}>{result.created} created</span>
                <span className={`${styles.stat} ${styles.statBlue}`}>{result.updated} updated</span>
                {result.skipped > 0 && <span className={`${styles.stat} ${styles.statGray}`}>{result.skipped} skipped</span>}
                {result.errors?.length > 0 && <span className={`${styles.stat} ${styles.statRed}`}>{result.errors.length} errors</span>}
              </div>
            </div>
          )}
        </div>
      </div>

    </>
  );
}

function PushSection({ config }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState({});
  const [pushingAll, setPushingAll] = useState(false);
  const [alert, setAlert] = useState(null);
  const [filter, setFilter] = useState('all');

  const loadCalls = useCallback(async () => {
    try {
      const params = {};
      if (filter === 'pending') params.pushed = 'false';
      else if (filter === 'pushed') params.pushed = 'true';
      const res = await crmApi.getCalls(params);
      setCalls(res.data.calls || []);
    } catch {} finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { setLoading(true); loadCalls(); }, [loadCalls]);

  async function handlePush(callId) {
    setPushing(prev => ({ ...prev, [callId]: true }));
    setAlert(null);
    try {
      await crmApi.pushRecording(callId);
      setAlert({ type: 'success', text: `Recording pushed successfully for call ${callId.slice(0, 8)}…` });
      loadCalls();
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || 'Push failed' });
    } finally {
      setPushing(prev => ({ ...prev, [callId]: false }));
    }
  }

  async function handlePushAll() {
    setPushingAll(true);
    setAlert(null);
    try {
      const res = await crmApi.pushAll();
      const d = res.data;
      setAlert({ type: 'success', text: `Bulk push complete: ${d.pushed} pushed, ${d.failed} failed out of ${d.total}` });
      loadCalls();
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || 'Bulk push failed' });
    } finally {
      setPushingAll(false);
    }
  }

  const pendingCount = calls.filter(c => c.recordingUrl && !c.hasPushed).length;

  return (
    <>
      {!config.crmPushUrl && (
        <div className={`${styles.alert} ${styles.alertInfo}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Configure the Push URL in the Configuration tab to enable recording push.
        </div>
      )}

      {alert && (
        <div className={`${styles.alert} ${alert.type === 'success' ? styles.alertSuccess : styles.alertError}`}>
          {alert.text}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Call Recordings</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className={styles.select} value={filter} onChange={e => setFilter(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }}>
              <option value="all">All with recordings</option>
              <option value="pending">Pending push</option>
              <option value="pushed">Already pushed</option>
            </select>
            {config.crmPushUrl && pendingCount > 0 && (
              <button className={styles.btnSm} onClick={handlePushAll} disabled={pushingAll}>
                {pushingAll ? <><span className={styles.spinner} style={{ width: 10, height: 10 }} /> Pushing…</> : `Push All (${pendingCount})`}
              </button>
            )}
          </div>
        </div>
        <div className={styles.cardBody} style={{ padding: 0 }}>
          {loading ? (
            <div className={styles.loadingState}><div className={styles.loadSpinner} /><p>Loading calls…</p></div>
          ) : calls.length === 0 ? (
            <div className={styles.emptyState}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              No call recordings found
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Date</th>
                  <th>Push Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {calls.map(call => (
                  <tr key={call.id}>
                    <td>{call.customerName || <span className={styles.muted}>Unknown</span>}</td>
                    <td className={styles.phoneMono}>{call.toPhone}</td>
                    <td><span className={`${styles.badge} ${call.status === 'completed' ? styles.badgeOk : styles.badgePending}`}>{call.status}</span></td>
                    <td>{call.duration ? `${call.duration}s` : '—'}</td>
                    <td className={styles.muted}>{new Date(call.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      {!call.recordingUrl ? (
                        <span className={`${styles.badge} ${styles.badgeNone}`}>No recording</span>
                      ) : call.hasPushed ? (
                        <span className={`${styles.badge} ${styles.badgeOk}`}>Pushed</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgePending}`}>Pending</span>
                      )}
                    </td>
                    <td>
                      {call.recordingUrl && !call.hasPushed && config.crmPushUrl && (
                        <button className={styles.btnSm} onClick={() => handlePush(call.id)} disabled={pushing[call.id]}>
                          {pushing[call.id] ? <span className={styles.spinner} style={{ width: 10, height: 10 }} /> : 'Push'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

export default function CrmIntegration() {
  const [activeTab, setActiveTab] = useState('config');
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    crmApi.getConfig()
      .then(res => setConfig(res.data.config || {}))
      .catch(err => {
        if (err.response?.status === 403) setError('Admin access required');
        else setError('Failed to load CRM configuration');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await crmApi.saveConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <div className={styles.loadingState}><div className={styles.loadSpinner} /><p>Loading CRM integration…</p></div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>CRM Integration</h1>
            <p className={styles.pageSub}>Sync customer data and push call recordings to your chit fund CRM</p>
          </div>
        </div>

        {error && (
          <div className={`${styles.alert} ${styles.alertError}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            {error}
          </div>
        )}

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === 'config' ? styles.tabActive : ''}`} onClick={() => setActiveTab('config')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            Configuration
          </button>
          <button className={`${styles.tab} ${activeTab === 'fetch' ? styles.tabActive : ''}`} onClick={() => setActiveTab('fetch')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            Fetch Customers
          </button>
          <button className={`${styles.tab} ${activeTab === 'push' ? styles.tabActive : ''}`} onClick={() => setActiveTab('push')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Push Recordings
          </button>
        </div>

        {activeTab === 'config' && <ConfigSection config={config} setConfig={setConfig} onSave={handleSave} saving={saving} saved={saved} />}
        {activeTab === 'fetch' && <FetchSection config={config} />}
        {activeTab === 'push' && <PushSection config={config} />}
      </main>
    </div>
  );
}
