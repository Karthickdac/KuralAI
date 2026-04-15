import React, { useState, useEffect, useCallback } from 'react';
import { superadminApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './SuperAdminUsage.module.css';

export default function SuperAdminUsage() {
  const [usage, setUsage] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ orgId: '', from: '', to: '' });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (filters.orgId) params.orgId = filters.orgId;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to + (filters.to ? 'T23:59:59' : '');

      const [usageRes, orgsRes] = await Promise.all([
        superadminApi.usage(params),
        superadminApi.organizations(),
      ]);
      setUsage(usageRes.data);
      setOrgs(orgsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (filters.orgId) params.orgId = filters.orgId;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const { data } = await superadminApi.usageExport(params);
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `usage_export_${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + (err.message || 'Unknown error'));
    }
    setExporting(false);
  };

  const totals = usage.reduce((acc, row) => ({
    totalCalls: acc.totalCalls + row.totalCalls,
    completedCalls: acc.completedCalls + row.completedCalls,
    failedCalls: acc.failedCalls + row.failedCalls,
    totalMinutes: acc.totalMinutes + parseFloat(row.totalMinutes || 0),
  }), { totalCalls: 0, completedCalls: 0, failedCalls: 0, totalMinutes: 0 });

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <div className={styles.pageTitle}>Usage & Analytics</div>
            <div className={styles.pageSub}>Monitor call usage across all organizations</div>
          </div>
          <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.filterBar}>
            <div className={styles.filterGroup}>
              <label>Organization</label>
              <select className={styles.input} value={filters.orgId} onChange={e => setFilters(f => ({ ...f, orgId: e.target.value }))}>
                <option value="">All Organizations</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label>From</label>
              <input className={styles.input} type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
            </div>
            <div className={styles.filterGroup}>
              <label>To</label>
              <input className={styles.input} type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
            </div>
            <button className={styles.resetBtn} onClick={() => setFilters({ orgId: '', from: '', to: '' })}>Reset</button>
          </div>

          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Total Calls</div>
              <div className={styles.kpiValue}>{totals.totalCalls.toLocaleString('en-IN')}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Completed</div>
              <div className={styles.kpiValue + ' ' + styles.green}>{totals.completedCalls.toLocaleString('en-IN')}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Failed</div>
              <div className={styles.kpiValue + ' ' + styles.red}>{totals.failedCalls.toLocaleString('en-IN')}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Total Minutes</div>
              <div className={styles.kpiValue}>{totals.totalMinutes.toFixed(1)}</div>
            </div>
          </div>

          {error && <div className={styles.errorBanner}>{error} <button onClick={load}>Retry</button></div>}

          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : usage.length === 0 ? (
            <div className={styles.empty}>No usage data found for the selected filters.</div>
          ) : (
            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <span>Organization</span>
                <span>Total Calls</span>
                <span>Completed</span>
                <span>Failed</span>
                <span>Minutes Used</span>
                <span>Success Rate</span>
              </div>
              {usage.map((row, i) => {
                const successRate = row.totalCalls > 0
                  ? ((row.completedCalls / row.totalCalls) * 100).toFixed(1)
                  : '0.0';
                return (
                  <div key={i} className={styles.tableRow}>
                    <span className={styles.orgCell}>
                      <div className={styles.orgAvatar}>{row.organization.name?.[0]?.toUpperCase()}</div>
                      <div>
                        <div className={styles.orgName}>{row.organization.name}</div>
                      </div>
                    </span>
                    <span>{row.totalCalls}</span>
                    <span className={styles.green}>{row.completedCalls}</span>
                    <span className={styles.red}>{row.failedCalls}</span>
                    <span>{parseFloat(row.totalMinutes).toFixed(1)}</span>
                    <span>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${successRate}%` }} />
                      </div>
                      <span className={styles.rateText}>{successRate}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
