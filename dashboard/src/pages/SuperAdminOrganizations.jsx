import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { superadminApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './SuperAdminOrganizations.module.css';

const ALL_MODULES = [
  'campaigns', 'crm_integration', 'api_config', 'reports',
  'simulator', 'templates', 'call_recording', 'bulk_import',
];

export default function SuperAdminOrganizations() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [creditForm, setCreditForm] = useState({ minutes: 0, description: '' });
  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', role: 'admin' });
  const [tab, setTab] = useState('details');

  const load = useCallback(async () => {
    setLoading(true);
    const [orgsRes, plansRes] = await Promise.all([
      superadminApi.organizations(),
      superadminApi.plans(),
    ]);
    setOrgs(orgsRes.data);
    setPlans(plansRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadOrgDetail = async (id) => {
    const { data } = await superadminApi.getOrg(id);
    setSelectedOrg(data);
    setTab('details');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    await superadminApi.createOrg(form);
    setShowCreate(false);
    setForm({ name: '', email: '', phone: '' });
    load();
  };

  const handleAssignPlan = async (orgId, planId) => {
    await superadminApi.assignPlan(orgId, planId);
    loadOrgDetail(orgId);
    load();
  };

  const handleAddCredits = async (orgId) => {
    await superadminApi.addCredits(orgId, creditForm.minutes, creditForm.description);
    setCreditForm({ minutes: 0, description: '' });
    loadOrgDetail(orgId);
    load();
  };

  const handleCreateUser = async (orgId) => {
    await superadminApi.createOrgUser(orgId, userForm);
    setUserForm({ email: '', password: '', name: '', role: 'admin' });
    loadOrgDetail(orgId);
  };

  const handleModuleToggle = async (orgId, moduleName, current) => {
    const modules = { [moduleName]: !current };
    await superadminApi.updateModules(orgId, modules);
    loadOrgDetail(orgId);
  };

  if (selectedOrg) {
    const moduleMap = {};
    (selectedOrg.modules || []).forEach(m => { moduleMap[m.moduleName] = m.isEnabled; });

    return (
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <div className={styles.header}>
            <div>
              <button className={styles.backBtn} onClick={() => setSelectedOrg(null)}>&larr; Back</button>
              <div className={styles.pageTitle}>{selectedOrg.name}</div>
              <div className={styles.pageSub}>{selectedOrg.slug} &middot; {selectedOrg.email}</div>
            </div>
          </div>
          <div className={styles.content}>
            <div className={styles.tabs}>
              {['details', 'modules', 'credits', 'users'].map(t => (
                <button key={t} className={`${styles.tab} ${tab === t ? styles.activeTab : ''}`} onClick={() => setTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <div className={styles.detailGrid}>
                <div className={styles.card}>
                  <h4>Current Plan</h4>
                  <div className={styles.planName}>{selectedOrg.subscription?.plan?.name || 'No Plan'}</div>
                  <div className={styles.selectGroup}>
                    <label>Assign Plan:</label>
                    <div className={styles.planOptions}>
                      {plans.map(p => (
                        <button key={p.id} className={styles.planOption} onClick={() => handleAssignPlan(selectedOrg.id, p.id)}>
                          {p.name} — ₹{p.price}/{p.billingCycle}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={styles.card}>
                  <h4>Credit Balance</h4>
                  <div className={styles.creditStat}>
                    <span className={styles.bigNum}>{selectedOrg.creditBalance?.totalMinutes?.toFixed(1) || 0}</span>
                    <span className={styles.unit}>total min</span>
                  </div>
                  <div className={styles.creditRow}>
                    <span>Used: {selectedOrg.creditBalance?.usedMinutes?.toFixed(1) || 0} min</span>
                    <span>Available: {Math.max(0, (selectedOrg.creditBalance?.totalMinutes || 0) - (selectedOrg.creditBalance?.usedMinutes || 0) - (selectedOrg.creditBalance?.reservedMinutes || 0)).toFixed(1)} min</span>
                  </div>
                </div>
              </div>
            )}

            {tab === 'modules' && (
              <div className={styles.moduleGrid}>
                {ALL_MODULES.map(mod => (
                  <div key={mod} className={styles.moduleCard}>
                    <div className={styles.moduleName}>{mod.replace(/_/g, ' ')}</div>
                    <label className={styles.toggle}>
                      <input type="checkbox" checked={!!moduleMap[mod]} onChange={() => handleModuleToggle(selectedOrg.id, mod, !!moduleMap[mod])} />
                      <span className={styles.slider} />
                    </label>
                  </div>
                ))}
              </div>
            )}

            {tab === 'credits' && (
              <div className={styles.card}>
                <h4>Add Credits</h4>
                <div className={styles.formRow}>
                  <input type="number" placeholder="Minutes" value={creditForm.minutes} onChange={e => setCreditForm(f => ({ ...f, minutes: Number(e.target.value) }))} className={styles.input} />
                  <input type="text" placeholder="Description" value={creditForm.description} onChange={e => setCreditForm(f => ({ ...f, description: e.target.value }))} className={styles.input} />
                  <button className={styles.primaryBtn} onClick={() => handleAddCredits(selectedOrg.id)}>Add</button>
                </div>
              </div>
            )}

            {tab === 'users' && (
              <div>
                <div className={styles.card}>
                  <h4>Create User</h4>
                  <div className={styles.formRow}>
                    <input placeholder="Name" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} className={styles.input} />
                    <input placeholder="Email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} className={styles.input} />
                    <input placeholder="Password" type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} className={styles.input} />
                    <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))} className={styles.input}>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button className={styles.primaryBtn} onClick={() => handleCreateUser(selectedOrg.id)}>Create</button>
                  </div>
                </div>
                <div className={styles.table} style={{ marginTop: 16 }}>
                  <div className={styles.tableHeader}>
                    <span>Name</span><span>Email</span><span>Role</span>
                  </div>
                  {(selectedOrg.users || []).map(u => (
                    <div key={u.id} className={styles.tableRow}>
                      <span>{u.name}</span><span>{u.email}</span><span>{u.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
            <div className={styles.pageTitle}>Organizations</div>
            <div className={styles.pageSub}>Manage tenant organizations</div>
          </div>
          <button className={styles.primaryBtn} onClick={() => setShowCreate(true)}>+ New Organization</button>
        </div>
        <div className={styles.content}>
          {showCreate && (
            <form onSubmit={handleCreate} className={styles.createForm}>
              <input placeholder="Organization Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={styles.input} required />
              <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={styles.input} required />
              <input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={styles.input} />
              <div className={styles.formActions}>
                <button type="submit" className={styles.primaryBtn}>Create</button>
                <button type="button" className={styles.secondaryBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          )}

          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : (
            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <span>Organization</span><span>Plan</span><span>Users</span><span>Credits</span><span>Status</span>
              </div>
              {orgs.map(org => (
                <div key={org.id} className={styles.tableRow} onClick={() => loadOrgDetail(org.id)}>
                  <span className={styles.orgName}>
                    <div className={styles.orgAvatar}>{org.name?.[0]?.toUpperCase()}</div>
                    <div>
                      <div>{org.name}</div>
                      <div className={styles.slug}>{org.slug}</div>
                    </div>
                  </span>
                  <span className={styles.planBadge}>{org.currentPlan}</span>
                  <span>{org.userCount}</span>
                  <span>{org.creditBalance ? `${org.creditBalance.availableMinutes.toFixed(1)} min` : '—'}</span>
                  <span>
                    <span className={`${styles.statusDot} ${org.isActive ? styles.active : styles.inactive}`} />
                    {org.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
              {orgs.length === 0 && <div className={styles.empty}>No organizations yet</div>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
