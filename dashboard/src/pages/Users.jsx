/**
 * Users Page — Admin user management
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersApi } from '../api/client';
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
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{editUser ? 'Edit User' : 'Add User'}</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}
          <label className={styles.label}>Full Name
            <input className={styles.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </label>
          <label className={styles.label}>Email
            <input className={styles.input} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required disabled={!!editUser} />
          </label>
          <label className={styles.label}>Role
            <select className={styles.input} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className={styles.label}>{editUser ? 'New Password (leave blank to keep)' : 'Password'}
            <input className={styles.input} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={8} required={!editUser} />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Users() {
  const navigate = useNavigate();
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
    } catch (err) {
      console.error(err);
    }
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
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <div className={styles.logoIcon}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <div>
            <div className={styles.logoName}>KuralAI</div>
            <div className={styles.logoBy}>by Automystic</div>
          </div>
        </div>
        <nav className={styles.nav}>
          <button className={styles.navItem} onClick={() => navigate('/')}>Dashboard</button>
          <button className={styles.navItem} onClick={() => navigate('/calls')}>All Calls</button>
          <button className={`${styles.navItem} ${styles.active}`}>Users</button>
          <button className={styles.navItem} onClick={() => navigate('/settings')}>Settings</button>
        </nav>
      </aside>

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>User Management</h1>
            <p className={styles.pageSub}>{users.length} user{users.length !== 1 ? 's' : ''}</p>
          </div>
          <button className={styles.addBtn} onClick={() => { setEditUser(null); setShowModal(true); }}>
            + Add User
          </button>
        </div>

        <div className={styles.tableCard}>
          {loading ? (
            <div className={styles.loadingMsg}>Loading users...</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td className={styles.nameCell}>{user.name}</td>
                    <td className={styles.emailCell}>{user.email}</td>
                    <td>
                      <span className={`${styles.rolePill} ${user.role === 'admin' ? styles.roleAdmin : styles.roleViewer}`}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`${styles.statusToggle} ${user.isActive ? styles.statusActive : styles.statusInactive}`}
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className={styles.dateCell}>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className={styles.actions}>
                      <button className={styles.editBtn} onClick={() => { setEditUser(user); setShowModal(true); }}>Edit</button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(user)}
                        disabled={deleting === user.id}
                      >
                        {deleting === user.id ? '...' : 'Delete'}
                      </button>
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
