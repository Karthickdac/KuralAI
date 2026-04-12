import React, { useState, useEffect } from 'react';
import { usersApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Users.module.css';

function UserModal({ onClose, onSaved, editUser }) {
  const [form, setForm] = useState(
    editUser
      ? { name: editUser.name, email: editUser.email, role: editUser.role, password: '' }
      : { name: '', email: '', role: 'viewer', password: '' }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { name: form.name, email: form.email, role: form.role };
      if (form.password) payload.password = form.password;
      if (editUser) {
        await usersApi.update(editUser.id, payload);
      } else {
        if (!form.password) { setError('Password is required'); setSaving(false); return; }
        await usersApi.create({ ...payload, password: form.password });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{editUser ? 'Edit User' : 'Add New User'}</h2>
            <p className={styles.modalSub}>{editUser ? `Editing ${editUser.email}` : 'Create a new dashboard user'}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.field}>
            <label className={styles.label}>Full Name</label>
            <input className={styles.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Enter full name" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input className={styles.input} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required disabled={!!editUser} placeholder="user@example.com" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Role</label>
            <select className={styles.input} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="viewer">Viewer — read-only access</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
            <input className={styles.input} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={8} required={!editUser} placeholder="Min 8 characters" />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data } = await usersApi.list();
      setUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleToggleActive(user) {
    try {
      await usersApi.update(user.id, { isActive: !user.isActive });
      fetchUsers();
    } catch (err) { console.error(err); }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    setDeleting(user.id);
    try {
      await usersApi.remove(user.id);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>User Management</h1>
            <p className={styles.pageSub}>{users.length} user{users.length !== 1 ? 's' : ''} with dashboard access</p>
          </div>
          <button className={styles.addBtn} onClick={() => { setEditUser(null); setShowModal(true); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add User
          </button>
        </div>

        <div className={styles.tableCard}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No users found.</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 20 }}>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ paddingRight: 20 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ paddingLeft: 20 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--primary)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
                          {(user.name || user.email).slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13, color:'var(--text-primary)' }}>{user.name || '—'}</div>
                          <div style={{ fontSize:12, color:'var(--text-muted)' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.rolePill} ${user.role === 'admin' ? styles.roleAdmin : styles.roleViewer}`}>
                        {user.role === 'admin' ? 'Admin' : 'Viewer'}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`${styles.statusBtn} ${user.isActive ? styles.statusActive : styles.statusInactive}`}
                        onClick={() => handleToggleActive(user)}
                      >
                        <span className={styles.statusDot} />
                        {user.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td style={{ fontSize:12, color:'var(--text-muted)' }}>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ paddingRight: 20 }}>
                      <div className={styles.actions}>
                        <button className={styles.editBtn} onClick={() => { setEditUser(user); setShowModal(true); }}>
                          Edit
                        </button>
                        <button className={styles.deleteBtn} onClick={() => handleDelete(user)} disabled={deleting === user.id}>
                          {deleting === user.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showModal && (
        <UserModal
          editUser={editUser}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchUsers(); }}
        />
      )}
    </div>
  );
}
