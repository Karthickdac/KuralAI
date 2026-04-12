/**
 * Calls Page — Full paginated, filterable list of all calls with CSV export
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { callsListApi } from '../api/client';
import CallRow from '../components/CallRow';
import styles from './Calls.module.css';

const STATUS_OPTIONS = ['', 'initiated', 'queued', 'ringing', 'answered', 'in-progress', 'completed', 'failed', 'busy', 'no-answer', 'canceled'];

export default function Calls() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [filters, setFilters] = useState({ status: '', fromDate: '', toDate: '', page: 1, limit: 25 });

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: filters.page, limit: filters.limit };
      if (filters.status) params.status = filters.status;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;

      const { data } = await callsListApi.list(params);
      setCalls(data.calls);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to fetch calls:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  }

  function handlePage(newPage) {
    setFilters(prev => ({ ...prev, page: newPage }));
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;

      const { data } = await callsListApi.exportCsv(params);
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kuralai-calls-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
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
          <button className={`${styles.navItem} ${styles.active}`}>All Calls</button>
          <button className={styles.navItem} onClick={() => navigate('/users')}>Users</button>
          <button className={styles.navItem} onClick={() => navigate('/settings')}>Settings</button>
        </nav>
      </aside>

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>All Calls</h1>
            <p className={styles.pageSub}>{pagination.total.toLocaleString()} total records</p>
          </div>
          <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : '↓ Export CSV'}
          </button>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <select
            className={styles.filterSelect}
            value={filters.status}
            onChange={e => handleFilterChange('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className={styles.dateRange}>
            <input
              type="date"
              className={styles.dateInput}
              value={filters.fromDate}
              onChange={e => handleFilterChange('fromDate', e.target.value)}
              placeholder="From date"
            />
            <span className={styles.dateSep}>–</span>
            <input
              type="date"
              className={styles.dateInput}
              value={filters.toDate}
              onChange={e => handleFilterChange('toDate', e.target.value)}
              placeholder="To date"
            />
          </div>

          <button className={styles.clearBtn} onClick={() => setFilters({ status: '', fromDate: '', toDate: '', page: 1, limit: 25 })}>
            Clear
          </button>
        </div>

        {/* Table */}
        <div className={styles.tableCard}>
          {loading ? (
            <div className={styles.loadingMsg}>Loading calls...</div>
          ) : calls.length === 0 ? (
            <div className={styles.emptyMsg}>No calls found matching the filters.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Direction</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Escalated</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {calls.map(call => (
                  <CallRow key={call.id} call={call} onView={() => navigate(`/calls/${call.id}`)} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              disabled={filters.page <= 1}
              onClick={() => handlePage(filters.page - 1)}
            >
              ← Previous
            </button>
            <span className={styles.pageInfo}>
              Page {filters.page} of {pagination.totalPages}
            </span>
            <button
              className={styles.pageBtn}
              disabled={filters.page >= pagination.totalPages}
              onClick={() => handlePage(filters.page + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
