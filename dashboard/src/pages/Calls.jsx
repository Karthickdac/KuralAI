import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { callsListApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import CallRow from '../components/CallRow';
import styles from './Calls.module.css';

const STATUS_OPTIONS = ['initiated','queued','ringing','answered','in-progress','completed','failed','busy','no-answer','canceled'];

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
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
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
      a.href = url; a.download = `kuralai-calls-${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>All Calls</h1>
            <p className={styles.pageSub}>{pagination.total.toLocaleString()} total records</p>
          </div>
          <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Status</label>
            <select className={styles.filterSelect} value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ textTransform:'capitalize' }}>{s}</option>)}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>From</label>
            <input type="date" className={styles.filterSelect} value={filters.fromDate} onChange={e => handleFilterChange('fromDate', e.target.value)} />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>To</label>
            <input type="date" className={styles.filterSelect} value={filters.toDate} onChange={e => handleFilterChange('toDate', e.target.value)} />
          </div>
          <button className={styles.clearBtn} onClick={() => setFilters({ status:'', fromDate:'', toDate:'', page:1, limit:25 })}>
            Clear filters
          </button>
        </div>

        {/* Table */}
        <div className={styles.tableCard}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Loading calls...</p>
            </div>
          ) : calls.length === 0 ? (
            <div className={styles.emptyState}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
              </svg>
              <p>No calls found matching the current filters.</p>
              <button className={styles.clearBtn} onClick={() => setFilters({ status:'', fromDate:'', toDate:'', page:1, limit:25 })}>
                Clear filters
              </button>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16 }}>Phone</th>
                  <th>Direction</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Escalated</th>
                  <th>Time</th>
                  <th style={{ paddingRight: 16 }}></th>
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
            <button className={styles.pageBtn} disabled={filters.page <= 1} onClick={() => setFilters(p => ({ ...p, page: p.page - 1 }))}>
              ← Previous
            </button>
            <span className={styles.pageInfo}>Page {filters.page} of {pagination.totalPages}</span>
            <button className={styles.pageBtn} disabled={filters.page >= pagination.totalPages} onClick={() => setFilters(p => ({ ...p, page: p.page + 1 }))}>
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
