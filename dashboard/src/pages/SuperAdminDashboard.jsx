import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { superadminApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './SuperAdminDashboard.module.css';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      superadminApi.dashboard().then(r => setStats(r.data)),
      superadminApi.organizations().then(r => setOrgs(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <div className={styles.pageTitle}>Super Admin Dashboard</div>
            <div className={styles.pageSub}>Platform overview and management</div>
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : (
            <>
              <div className={styles.kpiRow}>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Organizations</div>
                  <div className={styles.kpiValue}>{stats?.totalOrgs || 0}</div>
                  <div className={styles.kpiSub}>{stats?.activeOrgs || 0} active</div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Total Users</div>
                  <div className={styles.kpiValue}>{stats?.totalUsers || 0}</div>
                  <div className={styles.kpiSub}>across all orgs</div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Total Calls</div>
                  <div className={styles.kpiValue}>{stats?.totalCalls || 0}</div>
                  <div className={styles.kpiSub}>all time</div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Minutes Used</div>
                  <div className={styles.kpiValue}>{stats?.totalMinutesUsed || '0.00'}</div>
                  <div className={styles.kpiSub}>total consumption</div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Revenue</div>
                  <div className={styles.kpiValue}>₹{(stats?.totalRevenue || 0).toLocaleString('en-IN')}</div>
                  <div className={styles.kpiSub}>total collected</div>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3>Organizations</h3>
                  <button className={styles.primaryBtn} onClick={() => navigate('/superadmin/organizations')}>
                    Manage Organizations
                  </button>
                </div>

                <div className={styles.table}>
                  <div className={styles.tableHeader}>
                    <span>Organization</span>
                    <span>Plan</span>
                    <span>Users</span>
                    <span>Credits</span>
                    <span>Status</span>
                  </div>
                  {orgs.length === 0 ? (
                    <div className={styles.empty}>No organizations yet. Create one to get started.</div>
                  ) : (
                    orgs.slice(0, 10).map(org => (
                      <div
                        key={org.id}
                        className={styles.tableRow}
                        onClick={() => navigate(`/superadmin/organizations/${org.id}`)}
                      >
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
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
