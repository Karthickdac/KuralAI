import React, { useState, useEffect, useCallback } from 'react';
import { superadminApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './SuperAdminRevenue.module.css';

export default function SuperAdminRevenue() {
  const [stats, setStats] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, orgsRes] = await Promise.all([
        superadminApi.dashboard(),
        superadminApi.organizations(),
      ]);
      setStats(dashRes.data);
      setOrgs(orgsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeSubscribers = orgs.filter(o => o.subscriptionStatus === 'active');
  const noPlans = orgs.filter(o => o.currentPlan === 'No Plan');
  const totalCreditsAvailable = orgs.reduce((sum, o) => sum + (o.creditBalance?.availableMinutes || 0), 0);
  const totalCreditsUsed = orgs.reduce((sum, o) => {
    if (!o.creditBalance) return sum;
    return sum + (o.creditBalance.totalMinutes - o.creditBalance.availableMinutes);
  }, 0);

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <div className={styles.pageTitle}>Revenue & Billing</div>
            <div className={styles.pageSub}>Financial overview across all tenants</div>
          </div>
        </div>

        <div className={styles.content}>
          {error && <div className={styles.errorBanner}>{error} <button onClick={load}>Retry</button></div>}

          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : (
            <>
              <div className={styles.kpiRow}>
                <div className={`${styles.kpiCard} ${styles.revenue}`}>
                  <div className={styles.kpiLabel}>Total Revenue</div>
                  <div className={styles.kpiValue}>₹{(stats?.totalRevenue || 0).toLocaleString('en-IN')}</div>
                  <div className={styles.kpiSub}>All time collected</div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Active Subscriptions</div>
                  <div className={styles.kpiValue}>{activeSubscribers.length}</div>
                  <div className={styles.kpiSub}>of {orgs.length} organizations</div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>No Plan</div>
                  <div className={styles.kpiValue}>{noPlans.length}</div>
                  <div className={styles.kpiSub}>organizations without a plan</div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Credits Outstanding</div>
                  <div className={styles.kpiValue}>{totalCreditsAvailable.toFixed(0)} min</div>
                  <div className={styles.kpiSub}>{totalCreditsUsed.toFixed(0)} min consumed</div>
                </div>
              </div>

              <div className={styles.section}>
                <h3>Organization Breakdown</h3>
                <div className={styles.table}>
                  <div className={styles.tableHeader}>
                    <span>Organization</span>
                    <span>Plan</span>
                    <span>Status</span>
                    <span>Credits Available</span>
                    <span>Credits Used</span>
                    <span>Users</span>
                  </div>
                  {orgs.map(org => (
                    <div key={org.id} className={styles.tableRow}>
                      <span className={styles.orgCell}>
                        <div className={styles.orgAvatar}>{org.name?.[0]?.toUpperCase()}</div>
                        <div>
                          <div className={styles.orgName}>{org.name}</div>
                          <div className={styles.slug}>{org.slug}</div>
                        </div>
                      </span>
                      <span>
                        <span className={`${styles.planBadge} ${org.currentPlan === 'No Plan' ? styles.noPlan : ''}`}>
                          {org.currentPlan}
                        </span>
                      </span>
                      <span>
                        <span className={`${styles.statusDot} ${org.isActive ? styles.active : styles.inactiveDot}`} />
                        {org.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span>{org.creditBalance ? `${org.creditBalance.availableMinutes.toFixed(1)} min` : '—'}</span>
                      <span>{org.creditBalance ? `${(org.creditBalance.totalMinutes - org.creditBalance.availableMinutes).toFixed(1)} min` : '—'}</span>
                      <span>{org.userCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
