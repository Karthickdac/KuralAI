import React, { useState, useEffect, useCallback } from 'react';
import { superadminApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './SuperAdminPlans.module.css';

const EMPTY_PLAN = {
  name: '', slug: '', description: '', price: 0, billingCycle: 'monthly',
  creditMinutes: 0, maxWorkflows: 3, maxCustomers: 100, maxCampaigns: 5,
  maxUsersPerOrg: 3, features: {}, sortOrder: 0, isActive: true,
};

const FEATURE_LIST = [
  { key: 'callRecording', label: 'Call Recording' },
  { key: 'reports', label: 'Reports' },
  { key: 'simulator', label: 'Simulator' },
  { key: 'crmIntegration', label: 'CRM Integration' },
  { key: 'templates', label: 'Templates' },
  { key: 'prioritySupport', label: 'Priority Support' },
  { key: 'apiConfig', label: 'API Access' },
  { key: 'bulkImport', label: 'Bulk Import' },
  { key: 'customPrompts', label: 'Custom Prompts' },
  { key: 'dedicatedSupport', label: 'Dedicated Support' },
  { key: 'sla', label: 'SLA' },
  { key: 'whiteLabel', label: 'White Label' },
];

export default function SuperAdminPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_PLAN });
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await superadminApi.plans();
      setPlans(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing('new');
    setForm({ ...EMPTY_PLAN });
  };

  const openEdit = (plan) => {
    setEditing(plan.id);
    setForm({ ...plan });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing === 'new') {
        const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await superadminApi.createPlan({ ...form, slug });
      } else {
        await superadminApi.updatePlan(editing, form);
      }
      setEditing(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
    setSaving(false);
  };

  const handleToggleActive = async (plan) => {
    const action = plan.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} the "${plan.name}" plan?`)) return;
    try {
      await superadminApi.updatePlan(plan.id, { isActive: !plan.isActive });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update plan');
    }
  };

  const toggleFeature = (key) => {
    setForm(f => ({
      ...f,
      features: { ...f.features, [key]: !f.features[key] },
    }));
  };

  const updateField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <div className={styles.pageTitle}>Plan Management</div>
            <div className={styles.pageSub}>Create and manage subscription plans</div>
          </div>
          <button className={styles.primaryBtn} onClick={openCreate}>+ New Plan</button>
        </div>

        <div className={styles.content}>
          {editing !== null && (
            <div className={styles.formCard}>
              <h3>{editing === 'new' ? 'Create Plan' : 'Edit Plan'}</h3>
              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <label>Plan Name</label>
                  <input className={styles.input} value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="e.g. Professional" />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Slug</label>
                  <input className={styles.input} value={form.slug} onChange={e => updateField('slug', e.target.value)} placeholder="auto-generated if empty" />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Price (₹)</label>
                  <input className={styles.input} type="number" value={form.price} onChange={e => updateField('price', Number(e.target.value))} />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Billing Cycle</label>
                  <select className={styles.input} value={form.billingCycle} onChange={e => updateField('billingCycle', e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label>Credit Minutes</label>
                  <input className={styles.input} type="number" value={form.creditMinutes} onChange={e => updateField('creditMinutes', Number(e.target.value))} />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Sort Order</label>
                  <input className={styles.input} type="number" value={form.sortOrder} onChange={e => updateField('sortOrder', Number(e.target.value))} />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Max Customers</label>
                  <input className={styles.input} type="number" value={form.maxCustomers} onChange={e => updateField('maxCustomers', Number(e.target.value))} />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Max Campaigns</label>
                  <input className={styles.input} type="number" value={form.maxCampaigns} onChange={e => updateField('maxCampaigns', Number(e.target.value))} />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Max Workflows</label>
                  <input className={styles.input} type="number" value={form.maxWorkflows} onChange={e => updateField('maxWorkflows', Number(e.target.value))} />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Max Users per Org</label>
                  <input className={styles.input} type="number" value={form.maxUsersPerOrg} onChange={e => updateField('maxUsersPerOrg', Number(e.target.value))} />
                </div>
                <div className={styles.fieldGroupFull}>
                  <label>Description</label>
                  <textarea className={styles.textarea} value={form.description || ''} onChange={e => updateField('description', e.target.value)} rows={2} />
                </div>
                <div className={styles.fieldGroupFull}>
                  <label>Features</label>
                  <div className={styles.featureGrid}>
                    {FEATURE_LIST.map(f => (
                      <label key={f.key} className={styles.featureCheck}>
                        <input type="checkbox" checked={!!form.features[f.key]} onChange={() => toggleFeature(f.key)} />
                        <span>{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className={styles.fieldGroupFull}>
                  <label className={styles.featureCheck}>
                    <input type="checkbox" checked={form.isActive} onChange={e => updateField('isActive', e.target.checked)} />
                    <span>Active</span>
                  </label>
                </div>
              </div>
              <div className={styles.formActions}>
                <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : editing === 'new' ? 'Create Plan' : 'Save Changes'}
                </button>
                <button className={styles.secondaryBtn} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          )}

          {error && <div className={styles.errorBanner}>{error} <button onClick={load}>Retry</button></div>}

          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : (
            <div className={styles.planGrid}>
              {plans.map(plan => (
                <div key={plan.id} className={`${styles.planCard} ${!plan.isActive ? styles.inactive : ''}`}>
                  <div className={styles.planHeader}>
                    <div className={styles.planName}>{plan.name}</div>
                    {!plan.isActive && <span className={styles.inactiveBadge}>Inactive</span>}
                  </div>
                  <div className={styles.planPrice}>₹{plan.price.toLocaleString('en-IN')}<span>/{plan.billingCycle}</span></div>
                  <div className={styles.planDesc}>{plan.description}</div>
                  <div className={styles.planMeta}>
                    <div><strong>{plan.creditMinutes.toLocaleString('en-IN')}</strong> min/mo</div>
                    <div><strong>{plan.maxCustomers.toLocaleString('en-IN')}</strong> customers</div>
                    <div><strong>{plan.maxCampaigns}</strong> campaigns</div>
                    <div><strong>{plan.maxWorkflows}</strong> workflows</div>
                    <div><strong>{plan.maxUsersPerOrg}</strong> users</div>
                  </div>
                  <div className={styles.planFeatures}>
                    {Object.entries(plan.features || {}).filter(([, v]) => v).map(([k]) => (
                      <span key={k} className={styles.featureBadge}>{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    ))}
                  </div>
                  <div className={styles.cardActions}>
                    <button className={styles.editBtn} onClick={() => openEdit(plan)}>Edit</button>
                    <button className={styles.deleteBtn} onClick={() => handleToggleActive(plan)}>
                      {plan.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
