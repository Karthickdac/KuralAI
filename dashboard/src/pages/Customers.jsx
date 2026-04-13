import React, { useState, useEffect, useCallback, useRef } from 'react';
import { customersApi, callsApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Customers.module.css';

const EMPTY_FORM = { name: '', phone: '', address: '', notes: '' };

const CALL_TYPES = [
  { value: 'due_reminder',  label: 'Due Reminder' },
  { value: 'lottery',       label: 'Lottery Participation' },
  { value: 'withdrawal',    label: 'Premature Withdrawal' },
  { value: 'general',       label: 'General' },
];

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

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function ChitBadge({ customer }) {
  if (!customer?.chits?.length && !customer?.chitGroup) return null;
  const g = customer.chitGroup || customer.chits?.[0]?.chitGroup;
  const v = customer.chitValue || customer.chits?.[0]?.chitValue;
  const due = customer.dueAmount || customer.chits?.[0]?.dueAmount;
  if (!g && !v) return null;
  return (
    <div className={styles.chitBadge}>
      {g && <span className={styles.chitGroup}>{g}</span>}
      {v && <span className={styles.chitVal}>₹{typeof v === 'number' ? v.toLocaleString('en-IN') : v}</span>}
      {due && <span className={styles.chitDue}>Due: ₹{typeof due === 'number' ? due.toLocaleString('en-IN') : due}</span>}
    </div>
  );
}

// ── Bulk Progress Modal ───────────────────────────────────────────────────────
function BulkProgressModal({ customers, callType, onClose, onDone }) {
  const [items, setItems] = useState(() =>
    customers.map(c => ({ ...c, status: 'pending', error: null }))
  );
  const [idx, setIdx]       = useState(0);
  const [running, setRunning] = useState(true);
  const abortRef = useRef(false);

  const label = CALL_TYPES.find(t => t.value === callType)?.label || callType;

  useEffect(() => {
    if (!running) return;
    let i = 0;

    const fire = async () => {
      while (i < customers.length) {
        if (abortRef.current) break;
        const c = customers[i];

        setIdx(i);
        setItems(prev => prev.map((it, ix) => ix === i ? { ...it, status: 'calling' } : it));

        try {
          await callsApi.initiate(c.phone, { customerName: c.name, callType });
          setItems(prev => prev.map((it, ix) => ix === i ? { ...it, status: 'queued' } : it));
        } catch (e) {
          setItems(prev => prev.map((it, ix) => ix === i ? { ...it, status: 'failed', error: e.response?.data?.error || 'Failed' } : it));
        }

        i++;
        if (i < customers.length && !abortRef.current) {
          await new Promise(r => setTimeout(r, 2500));
        }
      }
      setRunning(false);
      setIdx(customers.length);
      onDone && onDone();
    };

    fire();
    return () => { abortRef.current = true; };
  }, []);

  const done     = items.filter(it => it.status === 'queued').length;
  const failed   = items.filter(it => it.status === 'failed').length;
  const pending  = items.filter(it => it.status === 'pending').length;

  return (
    <Modal title={`Bulk Call — ${label}`} onClose={running ? undefined : onClose} wide>
      <div className={styles.modalBody}>
        <div className={styles.bulkProgress}>
          <div className={styles.bulkProgressBar}>
            <div
              className={styles.bulkProgressFill}
              style={{ width: `${((done + failed) / customers.length) * 100}%` }}
            />
          </div>
          <div className={styles.bulkProgressStats}>
            <span className={styles.bpStatQueued}>{done} queued</span>
            {failed > 0 && <span className={styles.bpStatFailed}>{failed} failed</span>}
            {pending > 0 && <span className={styles.bpStatPending}>{pending} pending</span>}
            <span className={styles.bpTotal}>{done + failed} / {customers.length}</span>
          </div>
        </div>

        <div className={styles.bulkList}>
          {items.map((it, i) => (
            <div key={it.id} className={`${styles.bulkItem} ${styles['bulkItem_' + it.status]}`}>
              <div className={styles.bulkItemLeft}>
                <div className={styles.avatar}>{(it.name || '?')[0]}</div>
                <div>
                  <div className={styles.bulkItemName}>{it.name}</div>
                  <div className={styles.bulkItemPhone}>{it.phone}</div>
                </div>
              </div>
              <div className={styles.bulkItemStatus}>
                {it.status === 'pending'  && <span className={styles.statusPending}>Waiting…</span>}
                {it.status === 'calling'  && <span className={styles.statusCalling}><span className={styles.pulse}/> Calling…</span>}
                {it.status === 'queued'   && <span className={styles.statusQueued}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Queued
                </span>}
                {it.status === 'failed'   && <span className={styles.statusFailed}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  {it.error || 'Failed'}
                </span>}
              </div>
            </div>
          ))}
        </div>

        {!running && (
          <div className={styles.bulkDone}>
            {failed === 0
              ? `All ${done} calls queued successfully.`
              : `${done} calls queued, ${failed} failed.`}
          </div>
        )}
      </div>
      <div className={styles.modalFooter}>
        {running
          ? <span className={styles.bulkRunning}>Calling {idx + 1} of {customers.length}…</span>
          : <button className={styles.saveBtn} onClick={onClose}>Done</button>
        }
      </div>
    </Modal>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Customers() {
  const [customers, setCustomers]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [modal, setModal]           = useState(null);
  const [selected, setSelected]     = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [toast, setToast]           = useState('');
  const [callType, setCallType]     = useState('due_reminder');

  // Multi-select for bulk calls
  const [checkedIds, setCheckedIds] = useState(new Set());

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await customersApi.list();
      setCustomers(data.customers || data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  function openAdd()      { setForm(EMPTY_FORM); setError(''); setModal('add'); }
  function openEdit(c)    { setSelected(c); setForm({ name: c.name || '', phone: c.phone || '', address: c.address || '', notes: c.notes || '' }); setError(''); setModal('edit'); }
  function openDelete(c)  { setSelected(c); setModal('delete'); }
  function openCall(c)    { setSelected(c); setCallType('due_reminder'); setError(''); setModal('calling'); }
  function openBulk()     { setCallType('due_reminder'); setModal('bulk'); }
  function closeModal()   { setModal(null); setSelected(null); setError(''); }

  // ── Checkbox logic ──────────────────────────────────────────────────────────
  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q || (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.address || '').toLowerCase().includes(q);
  });

  const allFilteredChecked = filtered.length > 0 && filtered.every(c => checkedIds.has(c.id));
  const someChecked = checkedIds.size > 0;

  function toggleAll() {
    if (allFilteredChecked) {
      setCheckedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.delete(c.id));
        return next;
      });
    } else {
      setCheckedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(c => next.add(c.id));
        return next;
      });
    }
  }

  function toggleOne(id) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Individual call ─────────────────────────────────────────────────────────
  async function handleCall() {
    setSaving(true);
    try {
      await callsApi.initiate(selected.phone, { customerName: selected.name, callType });
      showToast(`Call initiated to ${selected.name}`);
      closeModal();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to initiate call');
    } finally {
      setSaving(false);
    }
  }

  // ── Save / Delete ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.phone.trim()) { setError('Phone number is required'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'add') {
        await customersApi.create(form);
        showToast('Customer added successfully');
      } else {
        await customersApi.update(selected.id, form);
        showToast('Customer updated successfully');
      }
      closeModal(); fetchCustomers();
    } catch (e) {
      setError(e.response?.data?.error || 'Something went wrong. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await customersApi.remove(selected.id);
      showToast('Customer deleted');
      closeModal(); fetchCustomers();
    } catch (e) {
      setError(e.response?.data?.error || 'Delete failed');
    } finally { setSaving(false); }
  }

  const selectedCustomers = customers.filter(c => checkedIds.has(c.id));

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Customers</h1>
            <p className={styles.pageSub}>{customers.length} total customers</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {someChecked && (
              <button className={styles.bulkCallBtn} onClick={openBulk}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                </svg>
                Call {checkedIds.size} Selected
              </button>
            )}
            <button className={styles.addBtn} onClick={openAdd}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Customer
            </button>
          </div>
        </div>

        {/* Search */}
        <div className={styles.searchBar}>
          <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search by name, phone or address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Table */}
        <div className={styles.tableCard}>
          {loading ? (
            <div className={styles.centerState}>
              <div className={styles.spinner}/>
              <p>Loading customers…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.centerState}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
              <p>{search ? 'No customers match your search.' : 'No customers yet. Click "Add Customer" to get started.'}</p>
              {search && <button className={styles.clearBtn} onClick={() => setSearch('')}>Clear search</button>}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 40, paddingLeft: 16 }}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={allFilteredChecked}
                      onChange={toggleAll}
                      title="Select all"
                    />
                  </th>
                  <th style={{ paddingLeft: 8 }}>#</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Chit Info</th>
                  <th>Address</th>
                  <th>Added</th>
                  <th style={{ paddingRight: 16, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} className={`${styles.row} ${checkedIds.has(c.id) ? styles.rowChecked : ''}`}>
                    <td style={{ paddingLeft: 16 }}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={checkedIds.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                      />
                    </td>
                    <td style={{ paddingLeft: 8 }}>
                      <span className={styles.index}>{i + 1}</span>
                    </td>
                    <td>
                      <div className={styles.nameCell}>
                        <div className={styles.avatar}>{(c.name || '?').trim()[0]}</div>
                        <div>
                          <span className={styles.name}>{c.name}</span>
                          {c.notes && <div className={styles.noteInline}>{c.notes.length > 30 ? c.notes.slice(0, 30) + '…' : c.notes}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.phone}>{c.phone}</span>
                    </td>
                    <td>
                      <ChitBadge customer={c} />
                    </td>
                    <td>
                      <span className={styles.address}>{c.address || <em className={styles.none}>—</em>}</span>
                    </td>
                    <td>
                      <span className={styles.date}>
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </td>
                    <td style={{ paddingRight: 16 }}>
                      <div className={styles.actions}>
                        <button className={styles.callBtn} onClick={() => openCall(c)} title="Call this customer">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                          </svg>
                          Call
                        </button>
                        <button className={styles.iconBtn} onClick={() => openEdit(c)} title="Edit">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => openDelete(c)} title="Delete">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
        {(modal === 'add' || modal === 'edit') && (
          <Modal title={modal === 'add' ? 'Add Customer' : 'Edit Customer'} onClose={closeModal}>
            <div className={styles.modalBody}>
              <Field label="Full Name *">
                <input className={styles.input} placeholder="e.g. ரமேஷ் குமார்" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}/>
              </Field>
              <Field label="Phone Number *">
                <input className={styles.input} placeholder="+919876543210" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}/>
              </Field>
              <Field label="Address">
                <input className={styles.input} placeholder="e.g. அண்ணா நகர், சென்னை" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}/>
              </Field>
              <Field label="Notes">
                <textarea className={styles.textarea} rows={3} placeholder="Any notes about this customer..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
              </Field>
              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal} disabled={saving}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : modal === 'add' ? 'Add Customer' : 'Save Changes'}
              </button>
            </div>
          </Modal>
        )}

        {/* ── Delete Modal ─────────────────────────────────────────────────── */}
        {modal === 'delete' && selected && (
          <Modal title="Delete Customer" onClose={closeModal}>
            <div className={styles.modalBody}>
              <p className={styles.deleteText}>
                Are you sure you want to delete <strong>{selected.name}</strong> ({selected.phone})? This cannot be undone.
              </p>
              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal} disabled={saving}>Cancel</button>
              <button className={styles.deleteBtn} onClick={handleDelete} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </Modal>
        )}

        {/* ── Individual Call Modal ────────────────────────────────────────── */}
        {modal === 'calling' && selected && (
          <Modal title="Call Customer" onClose={closeModal}>
            <div className={styles.modalBody}>
              <div className={styles.callTarget}>
                <div className={styles.callAvatar}>{(selected.name || '?').trim()[0]}</div>
                <div style={{ flex: 1 }}>
                  <div className={styles.callName}>{selected.name}</div>
                  <div className={styles.callPhone}>{selected.phone}</div>
                  <ChitBadge customer={selected} />
                </div>
              </div>
              <Field label="Call Type">
                <select className={styles.input} value={callType} onChange={e => setCallType(e.target.value)}>
                  {CALL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal} disabled={saving}>Cancel</button>
              <button className={styles.callConfirmBtn} onClick={handleCall} disabled={saving}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                </svg>
                {saving ? 'Calling…' : 'Start Call'}
              </button>
            </div>
          </Modal>
        )}

        {/* ── Bulk Call Modal ──────────────────────────────────────────────── */}
        {modal === 'bulk' && (
          <Modal title={`Bulk Call — ${checkedIds.size} Customer${checkedIds.size !== 1 ? 's' : ''}`} onClose={closeModal}>
            <div className={styles.modalBody}>
              <div className={styles.bulkSummary}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                </svg>
                <span>Calling <strong>{checkedIds.size}</strong> customers one by one with a 2.5 second gap between each.</span>
              </div>
              <div className={styles.bulkPreviewList}>
                {selectedCustomers.slice(0, 6).map(c => (
                  <div key={c.id} className={styles.bulkPreviewItem}>
                    <div className={styles.avatar} style={{ width: 26, height: 26, fontSize: 11 }}>{(c.name || '?')[0]}</div>
                    <span className={styles.bulkPreviewName}>{c.name}</span>
                    <span className={styles.bulkPreviewPhone}>{c.phone}</span>
                  </div>
                ))}
                {selectedCustomers.length > 6 && (
                  <div className={styles.bulkPreviewMore}>+{selectedCustomers.length - 6} more</div>
                )}
              </div>
              <Field label="Call Type">
                <select className={styles.input} value={callType} onChange={e => setCallType(e.target.value)}>
                  {CALL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
              <button
                className={styles.callConfirmBtn}
                onClick={() => setModal('bulkProgress')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                </svg>
                Start Calling All
              </button>
            </div>
          </Modal>
        )}

        {/* ── Bulk Progress Modal ──────────────────────────────────────────── */}
        {modal === 'bulkProgress' && (
          <BulkProgressModal
            customers={selectedCustomers}
            callType={callType}
            onClose={() => { closeModal(); setCheckedIds(new Set()); showToast('Bulk calls completed'); }}
            onDone={() => showToast('All calls dispatched')}
          />
        )}

        {/* Toast */}
        {toast && <div className={styles.toast}>{toast}</div>}
      </main>
    </div>
  );
}
