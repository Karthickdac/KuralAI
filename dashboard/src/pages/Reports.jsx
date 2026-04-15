import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { dashboardApi, callsListApi, campaignsApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './Reports.module.css';

const INTENT_LABELS = {
  order_status: 'ஆர்டர் நிலை', delivery_time: 'டெலிவரி நேரம்',
  complaint: 'புகார் பதிவு', product_info: 'தயாரிப்பு தகவல்',
  general_greeting: 'பொதுவான', human_request: 'மனித ஊழியர்', unknown: 'தெரியாத',
};

const PIE_COLORS = ['#059669', '#DC2626', '#D97706', '#0284C7', '#7C3AED', '#EC4899'];

const TYPE_LABELS = { due_reminder: 'Due Reminder', lottery_participation: 'Lottery', payment_followup: 'Payment Follow-up', custom: 'Custom' };
const STATUS_STYLE = { completed: 'statusCompleted', running: 'statusRunning', paused: 'statusPaused', draft: 'statusDraft', cancelled: 'statusCancelled', scheduled: 'statusScheduled' };

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
  const [tab, setTab] = useState('calls');
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [intents, setIntents] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [campReport, setCampReport] = useState(null);
  const [campLoading, setCampLoading] = useState(false);

  const fetchCalls = useCallback(async () => {
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

  const fetchCampaigns = useCallback(async () => {
    setCampLoading(true);
    try {
      const { data } = await campaignsApi.reportSummary(days);
      setCampReport(data);
    } catch (err) {
      console.error(err);
    } finally {
      setCampLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (tab === 'calls') fetchCalls();
    else fetchCampaigns();
  }, [tab, fetchCalls, fetchCampaigns]);

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
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const outcomeData = stats ? [
    { name: 'Completed', value: stats.completedCalls },
    { name: 'Failed', value: stats.failedCalls },
    { name: 'Escalated', value: stats.escalatedCalls },
    { name: 'Other', value: Math.max(0, stats.totalCalls - stats.completedCalls - stats.failedCalls - stats.escalatedCalls) },
  ].filter(d => d.value > 0) : [];

  const campStatusData = campReport?.totals?.byStatus
    ? Object.entries(campReport.totals.byStatus).map(([name, value]) => ({ name, value }))
    : [];

  const campTypeData = campReport?.totals?.byType
    ? Object.entries(campReport.totals.byType).map(([k, value]) => ({ name: TYPE_LABELS[k] || k, value }))
    : [];

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
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
            {tab === 'calls' && (
              <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            )}
          </div>
        </div>

        <div className={styles.sectionTabs}>
          <button className={`${styles.sectionTab} ${tab === 'calls' ? styles.sectionTabActive : ''}`} onClick={() => setTab('calls')}>
            Call Analytics
          </button>
          <button className={`${styles.sectionTab} ${tab === 'campaigns' ? styles.sectionTabActive : ''}`} onClick={() => setTab('campaigns')}>
            Campaign Reports
          </button>
        </div>

        {tab === 'calls' && (
          <>
            {loading ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner} /><p>Generating report...</p>
              </div>
            ) : (
              <>
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
          </>
        )}

        {tab === 'campaigns' && (
          <>
            {campLoading ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner} /><p>Loading campaign data...</p>
              </div>
            ) : !campReport || campReport.campaigns.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No campaigns found in the last {days} days.</p>
              </div>
            ) : (
              <>
                <div className={styles.metricsGrid}>
                  <MetricCard label="Campaigns" value={campReport.totals.campaigns}
                    sub={`Last ${days} days`} color="#7C3AED"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>}
                  />
                  <MetricCard label="Total Calls" value={campReport.totals.totalCalls.toLocaleString()}
                    sub="Across all campaigns" color="#059669"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>}
                  />
                  <MetricCard label="Answered" value={campReport.totals.answeredCalls.toLocaleString()}
                    sub={campReport.totals.totalCalls > 0 ? `${Math.round((campReport.totals.answeredCalls / campReport.totals.totalCalls) * 100)}% answer rate` : '—'}
                    color="#0284C7"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  />
                  <MetricCard label="Completed" value={campReport.totals.completedCalls.toLocaleString()}
                    sub={campReport.totals.totalCalls > 0 ? `${Math.round((campReport.totals.completedCalls / campReport.totals.totalCalls) * 100)}% completion` : '—'}
                    color="#059669"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                  />
                  <MetricCard label="Failed" value={campReport.totals.failedCalls.toLocaleString()}
                    sub={campReport.totals.totalCalls > 0 ? `${Math.round((campReport.totals.failedCalls / campReport.totals.totalCalls) * 100)}% failure rate` : '—'}
                    color="#DC2626"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
                  />
                </div>

                <div className={styles.twoCol}>
                  <div className={styles.chartCard}>
                    <div className={styles.chartHead}>
                      <h3 className={styles.chartTitle}>Campaign Status</h3>
                      <span className={styles.chartSub}>Distribution by current status</span>
                    </div>
                    {campStatusData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie data={campStatusData} cx="50%" cy="50%" innerRadius={65} outerRadius={90} dataKey="value" paddingAngle={2}>
                            {campStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <div className={styles.emptyState}>No data</div>}
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHead}>
                      <h3 className={styles.chartTitle}>Campaign Types</h3>
                      <span className={styles.chartSub}>Breakdown by campaign category</span>
                    </div>
                    {campTypeData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={campTypeData} margin={{ left: 10, right: 20 }} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                          <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} width={140} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" fill="#7C3AED" radius={[0, 4, 4, 0]} name="Campaigns" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div className={styles.emptyState}>No data</div>}
                  </div>
                </div>

                <div className={styles.chartCard}>
                  <div className={styles.chartHead}>
                    <h3 className={styles.chartTitle}>All Campaigns</h3>
                    <span className={styles.chartSub}>Detailed breakdown of each campaign</span>
                  </div>
                  <table className={styles.campaignTable}>
                    <thead>
                      <tr>
                        <th>Campaign</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Customers</th>
                        <th>Calls</th>
                        <th>Success</th>
                        <th>Progress</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campReport.campaigns.map(c => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}>{c.name}</td>
                          <td>{TYPE_LABELS[c.type] || c.type}</td>
                          <td>
                            <span className={`${styles.statusPill} ${styles[STATUS_STYLE[c.status] || 'statusDraft']}`}>
                              {c.status}
                            </span>
                          </td>
                          <td>{c.customerCount}</td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{c.completedCalls}</span>
                            <span style={{ color: '#94A3B8' }}> / {c.totalCalls}</span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: c.successRate >= 70 ? '#059669' : c.successRate >= 40 ? '#D97706' : '#DC2626' }}>
                              {c.successRate}%
                            </span>
                          </td>
                          <td style={{ minWidth: 100 }}>
                            <div className={styles.progressBar}>
                              <div
                                className={styles.progressFill}
                                style={{
                                  width: `${c.totalCalls > 0 ? Math.round((c.completedCalls / c.totalCalls) * 100) : 0}%`,
                                  background: c.successRate >= 70 ? '#059669' : c.successRate >= 40 ? '#D97706' : '#DC2626',
                                }}
                              />
                            </div>
                          </td>
                          <td style={{ color: '#64748B', fontSize: 12 }}>{fmtDate(c.startedAt || c.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
