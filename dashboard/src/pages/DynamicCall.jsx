import React, { useState, useEffect, useRef, useCallback } from 'react';
import { dynamicCallApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Customers.module.css';

function Modal({ title, onClose, children, wide }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${wide ? styles.modalWide : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BulkProgressModal({ rows, onClose, onDone }) {
  const [items, setItems] = useState(() => rows.map(r => ({ ...r, status: 'pending', error: null })));
  const cancelRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      for (let i = 0; i < items.length; i++) {
        if (cancelRef.current || !mounted) break;
        setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'calling' } : it));
        try {
          await dynamicCallApi.call(items[i].id);
          if (!mounted) return;
          setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'queued' } : it));
        } catch (e) {
          if (!mounted) return;
          setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'failed', error: e?.response?.data?.error || e.message } : it));
        }
        if (i < items.length - 1) await new Promise(r => setTimeout(r, 2500));
      }
      if (mounted) onDone?.();
    })();
    return () => { mounted = false; cancelRef.current = true; };
  }, []); // eslint-disable-line

  const counts = items.reduce((a, it) => { a[it.status] = (a[it.status] || 0) + 1; return a; }, {});

  return (
    <Modal title={`Bulk Calling (${items.length})`} onClose={onClose} wide>
      <div style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 13 }}>
          <span>Queued: <b>{counts.queued || 0}</b></span>
          <span>Calling: <b>{counts.calling || 0}</b></span>
          <span>Failed: <b style={{ color: 'var(--danger-text)' }}>{counts.failed || 0}</b></span>
          <span>Pending: <b>{counts.pending || 0}</b></span>
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{it.name || '—'} <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{it.phone}</span></span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                background: it.status === 'queued' ? 'var(--success-bg)' : it.status === 'calling' ? 'var(--info-bg)' : it.status === 'failed' ? 'var(--danger-bg)' : '#F1F5F9',
                color: it.status === 'queued' ? 'var(--success-text)' : it.status === 'calling' ? 'var(--info-text)' : it.status === 'failed' ? 'var(--danger-text)' : '#64748B',
              }}>
                {it.status}{it.error ? `: ${it.error.slice(0, 40)}` : ''}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={() => { cancelRef.current = true; onClose(); }} className={styles.btnSecondary}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

export default function DynamicCall() {
  const [schema, setSchema] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [modal, setModal] = useState(null); // 'import' | 'delete-all' | 'bulk' | null
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [callingId, setCallingId] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dynamicCallApi.list();
      setSchema(res.data.schema);
      setRows(res.data.rows || []);
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.name || '').toLowerCase().includes(q)
      || (r.phone || '').toLowerCase().includes(q)
      || JSON.stringify(r.data || {}).toLowerCase().includes(q);
  });

  function toggleCheck(id) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (checkedIds.size === filtered.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(filtered.map(r => r.id)));
  }

  async function handleImport(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Please choose a file');
    setImporting(true); setError(''); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tableName', file.name.replace(/\.(csv|xlsx?|tsv)$/i, ''));
      const res = await dynamicCallApi.import(fd);
      setImportResult(res.data);
      await load();
      setTimeout(() => { setModal(null); setImportResult(null); }, 1500);
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setImporting(false); }
  }

  async function handleDeleteAll() {
    try {
      await dynamicCallApi.deleteAll();
      setCheckedIds(new Set());
      await load();
      setModal(null);
    } catch (e) { setError(e?.response?.data?.error || e.message); }
  }

  async function handleDeleteRow(id) {
    if (!window.confirm('Delete this row?')) return;
    try { await dynamicCallApi.deleteRow(id); await load(); }
    catch (e) { setError(e?.response?.data?.error || e.message); }
  }

  async function handleCall(row) {
    setCallingId(row.id); setError('');
    try { await dynamicCallApi.call(row.id); }
    catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setCallingId(null); }
  }

  const checkedRows = rows.filter(r => checkedIds.has(r.id));

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Dynamic Call</h1>
            <p className={styles.subtitle}>
              {schema ? `${schema.tableName} • ${rows.length} rows • ${schema.columns.length} columns` : 'Import a CSV or Excel file to start calling'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {checkedIds.size > 0 && (
              <button className={styles.btnPrimary} onClick={() => setModal('bulk')}>
                Call {checkedIds.size} Selected
              </button>
            )}
            <button className={styles.btnSecondary} onClick={() => { setModal('import'); setError(''); setImportResult(null); }}>
              Import File
            </button>
            {schema && (
              <button className={styles.btnDanger} onClick={() => setModal('delete-all')}>
                Delete Table
              </button>
            )}
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {!schema ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ marginBottom: 16 }}>No table imported yet.</p>
            <button className={styles.btnPrimary} onClick={() => setModal('import')}>Import CSV / Excel</button>
            <p style={{ marginTop: 24, fontSize: 12 }}>
              Tip: include columns named <b>phone</b> (or <b>mobile</b>) and <b>name</b>.
              All other columns become dynamic variables in ElevenLabs.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <input
                type="text" placeholder="Search rows…" value={search}
                onChange={e => setSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.tableWrapper} style={{ overflowX: 'auto' }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <input type="checkbox"
                          checked={filtered.length > 0 && checkedIds.size === filtered.length}
                          onChange={toggleAll} />
                      </th>
                      <th style={{ width: 40 }}>#</th>
                      {schema.columns.map(c => (
                        <th key={c} style={{ whiteSpace: 'nowrap' }}>
                          {c}
                          {c === schema.phoneColumn && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--primary)' }}>📞</span>}
                          {c === schema.nameColumn && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--primary)' }}>👤</span>}
                        </th>
                      ))}
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={schema.columns.length + 3} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No matching rows</td></tr>
                    ) : filtered.map((r, i) => (
                      <tr key={r.id}>
                        <td><input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => toggleCheck(r.id)} /></td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                        {schema.columns.map(c => (
                          <td key={c} style={{ fontSize: 13, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(r.data?.[c] ?? '')}>
                            {String(r.data?.[c] ?? '')}
                          </td>
                        ))}
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            className={styles.btnIcon}
                            disabled={!r.phone || callingId === r.id}
                            onClick={() => handleCall(r)}
                            title={r.phone ? 'Call' : 'No valid phone'}
                            style={{ marginRight: 4 }}
                          >
                            {callingId === r.id ? '…' : '📞'}
                          </button>
                          <button
                            className={styles.btnIcon}
                            onClick={() => handleDeleteRow(r.id)}
                            title="Delete row"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {modal === 'import' && (
          <Modal title="Import CSV / Excel" onClose={() => setModal(null)}>
            <form onSubmit={handleImport} style={{ padding: '16px 24px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Importing will <b>replace</b> the existing dynamic table. Supported formats: .csv, .xlsx, .xls
              </p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv" required
                style={{ display: 'block', marginBottom: 16 }} />
              {importResult && (
                <div style={{ background: 'var(--success-bg)', color: 'var(--success-text)', padding: 12, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                  ✓ Imported {importResult.imported} rows • {importResult.columns.length} columns
                  <br/>Phone: <b>{importResult.phoneColumn}</b> • Name: <b>{importResult.nameColumn}</b>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className={styles.btnSecondary} onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary} disabled={importing}>
                  {importing ? 'Importing…' : 'Import'}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {modal === 'delete-all' && (
          <Modal title="Delete Entire Table?" onClose={() => setModal(null)}>
            <div style={{ padding: '16px 24px' }}>
              <p style={{ fontSize: 14, marginBottom: 16 }}>
                This will permanently remove all <b>{rows.length}</b> rows and the table schema. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className={styles.btnSecondary} onClick={() => setModal(null)}>Cancel</button>
                <button className={styles.btnDanger} onClick={handleDeleteAll}>Delete Table</button>
              </div>
            </div>
          </Modal>
        )}

        {modal === 'bulk' && (
          <BulkProgressModal
            rows={checkedRows}
            onClose={() => setModal(null)}
            onDone={() => {}}
          />
        )}
      </main>
    </div>
  );
}
