import React, { useState, useEffect, useCallback } from 'react';
import { customersApi, callsApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Customers.module.css';

const EMPTY_FORM = { name: '', phone: '', address: '', notes: '' };

function Modal({ title, onClose, children }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
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

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'add' | 'edit' | 'delete' | 'calling'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [callType, setCallType] = useState('due_reminder');

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
    setTimeout(() => setToast(''), 3000);
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setError('');
    setModal('add');
  }

  function openEdit(c) {
    setSelected(c);
    setForm({ name: c.name || '', phone: c.phone || '', address: c.address || '', notes: c.notes || '' });
    setError('');
    setModal('edit');
  }

  function openDelete(c) {
    setSelected(c);
    setModal('delete');
  }

  function openCall(c) {
    setSelected(c);
    setCallType('due_reminder');
    setModal('calling');
  }

  function closeModal() {
    setModal(null);
    setSelected(null);
    setError('');
  }

  function handleFormChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.phone.trim()) { setError('Phone number is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (modal === 'add') {
        await customersApi.create(form);
        showToast('Customer added successfully');
      } else {
        await customersApi.update(selected.id, form);
        showToast('Customer updated successfully');
      }
      closeModal();
      fetchCustomers();
    } catch (e) {
      setError(e.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await customersApi.remove(selected.id);
      showToast('Customer deleted');
      closeModal();
      fetchCustomers();
    } catch (e) {
      setError(e.response?.data?.error || 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

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

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q || (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.address || '').toLowerCase().includes(q);
  });

  const CALL_TYPES = [
    { value: 'due_reminder', label: 'Due Reminder' },
    { value: 'lottery', label: 'Lottery Participation' },
    { value: 'withdrawal', label: 'Premature Withdrawal' },
    { value: 'general', label: 'General' },
  ];

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
          <button className={styles.addBtn} onClick={openAdd}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Customer
          </button>
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

        {/* Grid Table */}
        <div className={styles.tableCard}>
          {loading ? (
            <div className={styles.centerState}>
              <div className={styles.spinner} />
              <p>Loading customers...</p>
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
                  <th style={{ paddingLeft: 20 }}>#</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Notes</th>
                  <th>Added</th>
                  <th style={{ paddingRight: 16, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} className={styles.row}>
                    <td style={{ paddingLeft: 20 }}>
                      <span className={styles.index}>{i + 1}</span>
                    </td>
                    <td>
                      <div className={styles.nameCell}>
                        <div className={styles.avatar}>{(c.name || '?').trim()[0]}</div>
                        <span className={styles.name}>{c.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.phone}>{c.phone}</span>
                    </td>
                    <td>
                      <span className={styles.address}>{c.address || <em className={styles.none}>—</em>}</span>
                    </td>
                    <td>
                      <span className={styles.notes}>{c.notes ? (c.notes.length > 40 ? c.notes.slice(0, 40) + '…' : c.notes) : <em className={styles.none}>—</em>}</span>
                    </td>
                    <td>
                      <span className={styles.date}>
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </td>
                    <td style={{ paddingRight: 16 }}>
                      <div className={styles.actions}>
                        <button className={styles.callBtn} onClick={() => openCall(c)} title="Initiate call">
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
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
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

        {/* Add / Edit Modal */}
        {(modal === 'add' || modal === 'edit') && (
          <Modal title={modal === 'add' ? 'Add Customer' : 'Edit Customer'} onClose={closeModal}>
            <div className={styles.modalBody}>
              <Field label="Full Name *">
                <input
                  className={styles.input}
                  placeholder="e.g. ரமேஷ் குமார்"
                  value={form.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                />
              </Field>
              <Field label="Phone Number *">
                <input
                  className={styles.input}
                  placeholder="+919876543210"
                  value={form.phone}
                  onChange={e => handleFormChange('phone', e.target.value)}
                />
              </Field>
              <Field label="Address">
                <input
                  className={styles.input}
                  placeholder="e.g. அண்ணா நகர், சென்னை"
                  value={form.address}
                  onChange={e => handleFormChange('address', e.target.value)}
                />
              </Field>
              <Field label="Notes">
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="Any notes about this customer..."
                  value={form.notes}
                  onChange={e => handleFormChange('notes', e.target.value)}
                />
              </Field>
              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal} disabled={saving}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : modal === 'add' ? 'Add Customer' : 'Save Changes'}
              </button>
            </div>
          </Modal>
        )}

        {/* Delete Confirmation */}
        {modal === 'delete' && selected && (
          <Modal title="Delete Customer" onClose={closeModal}>
            <div className={styles.modalBody}>
              <p className={styles.deleteText}>
                Are you sure you want to delete <strong>{selected.name}</strong> ({selected.phone})?
                This cannot be undone.
              </p>
              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeModal} disabled={saving}>Cancel</button>
              <button className={styles.deleteBtn} onClick={handleDelete} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </Modal>
        )}

        {/* Call Modal */}
        {modal === 'calling' && selected && (
          <Modal title="Initiate Call" onClose={closeModal}>
            <div className={styles.modalBody}>
              <div className={styles.callTarget}>
                <div className={styles.callAvatar}>{(selected.name || '?').trim()[0]}</div>
                <div>
                  <div className={styles.callName}>{selected.name}</div>
                  <div className={styles.callPhone}>{selected.phone}</div>
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
                {saving ? 'Calling...' : 'Start Call'}
              </button>
            </div>
          </Modal>
        )}

        {/* Toast */}
        {toast && <div className={styles.toast}>{toast}</div>}
      </main>
    </div>
  );
}
