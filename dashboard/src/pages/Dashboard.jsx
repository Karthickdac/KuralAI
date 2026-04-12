import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { dashboardApi, callsApi } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import Sidebar from '../components/Sidebar';
import CallRow from '../components/CallRow';
import InitiateCallModal from '../components/InitiateCallModal';
import styles from './Dashboard.module.css';

const INTENT_LABELS = {
  order_status: 'ஆர்டர் நிலை', delivery_time: 'டெலிவரி நேரம்',
  complaint: 'புகார் பதிவு', product_info: 'தயாரிப்பு தகவல்',
  general_greeting: 'பொதுவான', human_request: 'மனித ஊழியர்', unknown: 'தெரியாத',
};

const PIE_COLORS = ['#4F46E5', '#DC2626', '#D97706', '#059669', '#7C3AED'];

const WS_ICONS = {
  CALL_COMPLETED: '✓', CALL_STARTED: '→', CALL_ESCALATED: '⚠',
  CALL_RETRY_SCHEDULED: '↻', INBOUND_CALL_RECEIVED: '←', TURN_COMPLETED: '◎',
};

const WS_COLORS = {
  CALL_COMPLETED: 'var(--success-text)', CALL_ESCALATED: 'var(--warning-text)',
  INBOUND_CALL_RECEIVED: 'var(--info-text)', CALL_STARTED: 'var(--primary)',
};

function KpiCard({ label, value, sub, icon, color }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>{label}</span>
        <div className={styles.kpiIcon} style={{ background: color + '18', color }}>
          {icon}
        </div>
      </div>
      <div className={styles.kpiValue}>{value}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', boxShadow:'var(--shadow-md)', fontSize:12 }}>
      <p style={{ color:'var(--text-muted)', marginBottom:6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, fontWeight:600 }}>{p.name}: {p.value?.toLocaleString()}</p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [intents, setIntents] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [recentCalls, setRecentCalls] = useState([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activity, setActivity] = useState([]);

  const activityCounter = React.useRef(0);
  const handleWsMessage = useCallback((event) => {
    activityCounter.current += 1;
    setActivity(prev => [{ ...event, _key: activityCounter.current }, ...prev.slice(0, 24)]);
    if (['CALL_COMPLETED', 'INBOUND_CALL_RECEIVED', 'CALL_ESCALATED'].includes(event.type)) {
      callsApi.recentCalls(10).then(r => setRecentCalls(r.data.calls)).catch(() => {});
    }
  }, []);

  useWebSocket(handleWsMessage);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, i, t, r] = await Promise.all([
        dashboardApi.stats(days), dashboardApi.intents(days),
        dashboardApi.timeline(days * 2), dashboardApi.recentCalls(10),
      ]);
      setStats(s.data.stats);
      setIntents(i.data.intents);
      setTimeline(t.data.timeline);
      setRecentCalls(r.data.calls);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pieData = stats ? [
    { name: 'Completed', value: stats.completedCalls },
    { name: 'Failed', value: stats.failedCalls },
    { name: 'Escalated', value: stats.escalatedCalls },
    { name: 'Pending', value: Math.max(0, stats.totalCalls - stats.completedCalls - stats.failedCalls - stats.escalatedCalls) },
  ].filter(d => d.value > 0) : [];

  const fmtDur = (s) => s ? `${Math.floor(s / 60)}m ${s % 60}s` : '—';
  const wsLabel = (e) => {
    switch (e.type) {
      case 'CALL_COMPLETED': return `Call completed · ${fmtDur(e.duration)}`;
      case 'CALL_STARTED': return `Call started`;
      case 'CALL_ESCALATED': return `Escalated · ${e.reason || 'human requested'}`;
      case 'CALL_RETRY_SCHEDULED': return `Retry #${e.retryCount} scheduled`;
      case 'INBOUND_CALL_RECEIVED': return `Inbound from ${e.from}`;
      case 'TURN_COMPLETED': return `Turn ${e.turn} · ${e.intent || 'unknown'}`;
      default: return e.type;
    }
  };

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Overview</h1>
            <p className={styles.pageSub}>Tamil AI voice call analytics</p>
          </div>
          <div className={styles.headerActions}>
            <select className={styles.periodSelect} value={days} onChange={e => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <button className={styles.primaryBtn} onClick={fetchData}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
              Refresh
            </button>
            <button className={styles.accentBtn} onClick={() => setShowModal(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Call
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.skeletonGrid}>
            {[1,2,3,4,5].map(i => <div key={i} className={styles.skeletonCard} />)}
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className={styles.kpiGrid}>
              <KpiCard label="Total Calls" value={stats?.totalCalls?.toLocaleString() ?? '—'}
                sub={`Last ${days} days`} color="#4F46E5"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>}
              />
              <KpiCard label="Success Rate" value={`${stats?.successRate ?? 0}%`}
                sub={`${stats?.completedCalls ?? 0} completed`} color="#059669"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              />
              <KpiCard label="Avg Duration" value={fmtDur(stats?.avgDurationSeconds ?? 0)}
                sub="Per connected call" color="#2563EB"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
              />
              <KpiCard label="Escalations" value={stats?.escalatedCalls ?? '—'}
                sub="Human transfers" color="#D97706"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}
              />
              <KpiCard label="Failed Calls" value={stats?.failedCalls ?? '—'}
                sub="No answer / error" color="#DC2626"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              />
            </div>

            {/* Charts row */}
            <div className={styles.chartsRow}>
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <h3 className={styles.cardTitle}>Call Volume</h3>
                  <span className={styles.chartBadge}>{days}d trend</span>
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={timeline} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="total" stroke="#4F46E5" strokeWidth={2} fill="url(#totalGrad)" name="Total" dot={false} />
                    <Area type="monotone" dataKey="completed" stroke="#059669" strokeWidth={2} fill="url(#completedGrad)" name="Completed" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <h3 className={styles.cardTitle}>Call Outcomes</h3>
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="value" nameKey="name" paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => v.toLocaleString()} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Intents + Activity */}
            <div className={styles.bottomRow}>
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <h3 className={styles.cardTitle}>Top Intents (Tamil)</h3>
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart
                    data={intents.map(i => ({ ...i, label: INTENT_LABELS[i.intent] || i.intent }))}
                    layout="vertical" margin={{ left: 10, right: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11.5, fill: '#475569' }} tickLine={false} axisLine={false} width={110} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#4F46E5" radius={[0, 4, 4, 0]} name="Calls" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className={`${styles.chartCard} ${styles.activityCard}`}>
                <div className={styles.chartHeader}>
                  <h3 className={styles.cardTitle}>Live Activity</h3>
                  <span className={styles.liveTag}>
                    <span className={styles.livePulse} />
                    Live
                  </span>
                </div>
                <div className={styles.activityList}>
                  {activity.length === 0 && (
                    <div className={styles.emptyFeed}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom:8 }}>
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <p>Waiting for call events...</p>
                    </div>
                  )}
                  {activity.map((e) => (
                    <div key={e._key} className={styles.activityItem}>
                      <div className={styles.activityIcon} style={{ color: WS_COLORS[e.type] || 'var(--text-muted)' }}>
                        {WS_ICONS[e.type] || '·'}
                      </div>
                      <div className={styles.activityBody}>
                        <div className={styles.activityText}>{wsLabel(e)}</div>
                        <div className={styles.activityTime}>{new Date(e.timestamp || Date.now()).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent calls */}
            <div className={styles.tableCard}>
              <div className={styles.tableHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Recent Calls</h3>
                </div>
                <button className={styles.linkBtn} onClick={() => navigate('/calls')}>
                  View all calls →
                </button>
              </div>
              <div className={styles.tableWrapper}>
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
                    {recentCalls.length === 0
                      ? <tr><td colSpan={7} style={{ textAlign:'center', padding:'32px 0', color:'var(--text-muted)', fontSize:13 }}>No calls yet</td></tr>
                      : recentCalls.map(call => (
                          <CallRow key={call.id} call={call} onView={() => navigate(`/calls/${call.id}`)} />
                        ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {showModal && (
        <InitiateCallModal onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); fetchData(); }} />
      )}
    </div>
  );
}
