import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { dashboardApi, callsListApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Reports.module.css';

const INTENT_LABELS = {
  order_status: 'ஆர்டர் நிலை', delivery_time: 'டெலிவரி நேரம்',
  complaint: 'புகார் பதிவு', product_info: 'தயாரிப்பு தகவல்',
  general_greeting: 'பொதுவான', human_request: 'மனித ஊழியர்', unknown: 'தெரியாத',
};

const PIE_COLORS = ['#059669', '#DC2626', '#D97706', '#0284C7', '#7C3AED'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', boxShadow:'var(--shadow-md)', fontSize:12 }}>
      {label && <p style={{ color:'var(--text-muted)', marginBottom:6 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || 'var(--text-primary)', fontWeight:600 }}>{p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</p>
      ))}
    </div>
  );
};

function MetricCard({ label, value, sub, color, icon }) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricTop}>
        <div className={styles.metricIcon} style={{ background: color + '15', color }}>{icon}</div>
        <span className={styles.metricLabel}>{label}</span>
      </div>
      <div className={styles.metricValue}>{value}</div>
      {sub && <div className={styles.metricSub}>{sub}</div>}
    </div>
  );
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [intents, setIntents] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, i, t] = await Promise.all([
        dashboardApi.stats(days), dashboardApi.intents(days), dashboardApi.timeline(days),
      ]);
      setStats(s.data.stats);
      setIntents(i.data.intents);
      setTimeline(t.data.timeline);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleExport() {
    setExporting(true);
    try {
      const { data } = await callsListApi.exportCsv({});
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = `kuralai-report-${days}d-${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  const fmtDur = (s) => s ? `${Math.floor(s / 60)}m ${s % 60}s` : '—';

  const outcomeData = stats ? [
    { name: 'Completed', value: stats.completedCalls },
    { name: 'Failed', value: stats.failedCalls },
    { name: 'Escalated', value: stats.escalatedCalls },
    { name: 'Other', value: Math.max(0, stats.totalCalls - stats.completedCalls - stats.failedCalls - stats.escalatedCalls) },
  ].filter(d => d.value > 0) : [];

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Reports & Analytics</h1>
            <p className={styles.pageSub}>In-depth performance metrics for your Tamil AI calls</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.periodTabs}>
              {[7, 14, 30, 90].map(d => (
                <button
                  key={d}
                  className={`${styles.periodTab} ${days === d ? styles.periodTabActive : ''}`}
                  onClick={() => setDays(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} /><p>Generating report...</p>
          </div>
        ) : (
          <>
            {/* Metrics */}
            <div className={styles.metricsGrid}>
              <MetricCard label="Total Calls" value={stats?.totalCalls?.toLocaleString() ?? '—'}
                sub={`${days}-day period`} color="#059669"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>}
              />
              <MetricCard label="Success Rate" value={`${stats?.successRate ?? 0}%`}
                sub={`${stats?.completedCalls ?? 0} completed`} color="#059669"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              />
              <MetricCard label="Avg Duration" value={fmtDur(stats?.avgDurationSeconds)}
                sub="Per connected call" color="#2563EB"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
              />
              <MetricCard label="Escalation Rate" value={stats?.totalCalls > 0 ? `${Math.round((stats.escalatedCalls / stats.totalCalls) * 100)}%` : '—'}
                sub={`${stats?.escalatedCalls ?? 0} escalated`} color="#D97706"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}
              />
              <MetricCard label="Failure Rate" value={stats?.totalCalls > 0 ? `${Math.round((stats.failedCalls / stats.totalCalls) * 100)}%` : '—'}
                sub={`${stats?.failedCalls ?? 0} failed`} color="#DC2626"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
              />
            </div>

            {/* Volume chart */}
            <div className={styles.chartCard}>
              <div className={styles.chartHead}>
                <h3 className={styles.chartTitle}>Call Volume Over Time</h3>
                <span className={styles.chartSub}>Daily totals vs. completions for the last {days} days</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="repTotalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="repCompGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="total" stroke="#059669" strokeWidth={2} fill="url(#repTotalGrad)" name="Total" dot={false} />
                  <Area type="monotone" dataKey="completed" stroke="#059669" strokeWidth={2} fill="url(#repCompGrad)" name="Completed" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Two-col charts */}
            <div className={styles.twoCol}>
              <div className={styles.chartCard}>
                <div className={styles.chartHead}>
                  <h3 className={styles.chartTitle}>Call Outcomes</h3>
                  <span className={styles.chartSub}>Distribution by final status</span>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={outcomeData} cx="50%" cy="50%" innerRadius={65} outerRadius={90} dataKey="value" paddingAngle={2}>
                      {outcomeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.chartCard}>
                <div className={styles.chartHead}>
                  <h3 className={styles.chartTitle}>Top Intents (Tamil)</h3>
                  <span className={styles.chartSub}>Most frequent customer conversation topics</span>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={intents.map(i => ({ ...i, label: INTENT_LABELS[i.intent] || i.intent }))}
                    layout="vertical" margin={{ left: 10, right: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} width={120} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} name="Calls" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Summary table */}
            <div className={styles.summaryCard}>
              <div className={styles.chartHead}>
                <h3 className={styles.chartTitle}>Period Summary</h3>
                <span className={styles.chartSub}>All metrics for the selected {days}-day window</span>
              </div>
              <div className={styles.summaryGrid}>
                {[
                  { label: 'Total Calls Made', value: stats?.totalCalls?.toLocaleString() },
                  { label: 'Calls Completed', value: stats?.completedCalls?.toLocaleString() },
                  { label: 'Calls Failed', value: stats?.failedCalls?.toLocaleString() },
                  { label: 'Calls Escalated', value: stats?.escalatedCalls?.toLocaleString() },
                  { label: 'Success Rate', value: `${stats?.successRate ?? 0}%` },
                  { label: 'Average Duration', value: fmtDur(stats?.avgDurationSeconds) },
                ].map(({ label, value }) => (
                  <div key={label} className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>{label}</span>
                    <span className={styles.summaryValue}>{value ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
