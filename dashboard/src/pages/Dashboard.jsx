/**
 * Dashboard Page - Main analytics and controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { dashboardApi, callsApi } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuth } from '../hooks/useAuth';
import CallRow from '../components/CallRow';
import InitiateCallModal from '../components/InitiateCallModal';
import styles from './Dashboard.module.css';

const INTENT_LABELS = {
  order_status:     'ஆர்டர் நிலை',
  delivery_time:    'டெலிவரி நேரம்',
  complaint:        'புகார் பதிவு',
  product_info:     'தயாரிப்பு தகவல்',
  general_greeting: 'பொதுவான உதவி',
  human_request:    'மனித ஊழியர்',
  unknown:          'தெரியாத',
};

const PIE_COLORS = ['#0F6E56', '#A32D2D', '#854F0B', '#534AB7', '#5F5E5A'];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [intents, setIntents] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [recentCalls, setRecentCalls] = useState([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activity, setActivity] = useState([]);

  // Real-time WebSocket events
  const handleWsMessage = useCallback((event) => {
    setActivity(prev => [
      { ...event, id: Date.now() },
      ...prev.slice(0, 19),
    ]);

    // Refresh recent calls on any call event
    if (['CALL_COMPLETED', 'INBOUND_CALL_RECEIVED', 'CALL_ESCALATED'].includes(event.type)) {
      callsApi.recentCalls(10).then(r => setRecentCalls(r.data.calls)).catch(() => {});
    }
  }, []);

  const { connected } = useWebSocket(handleWsMessage);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, i, t, r] = await Promise.all([
        dashboardApi.stats(days),
        dashboardApi.intents(days),
        dashboardApi.timeline(days * 2),
        dashboardApi.recentCalls(10),
      ]);
      setStats(s.data.stats);
      setIntents(i.data.intents);
      setTimeline(t.data.timeline);
      setRecentCalls(r.data.calls);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pieData = stats ? [
    { name: 'Completed', value: stats.completedCalls },
    { name: 'Failed', value: stats.failedCalls },
    { name: 'Escalated', value: stats.escalatedCalls },
    { name: 'Other', value: Math.max(0, stats.totalCalls - stats.completedCalls - stats.failedCalls - stats.escalatedCalls) },
  ] : [];

  const fmtDuration = (s) => `${Math.floor(s / 60)}m ${s % 60}s`;

  const wsEventLabel = (e) => {
    switch (e.type) {
      case 'CALL_COMPLETED': return `✓ Call completed · ${fmtDuration(e.duration || 0)}`;
      case 'CALL_STARTED': return `→ Call started`;
      case 'CALL_ESCALATED': return `! Escalated · ${e.reason || ''}`;
      case 'CALL_RETRY_SCHEDULED': return `↻ Retry #${e.retryCount} scheduled`;
      case 'INBOUND_CALL_RECEIVED': return `← Inbound call from ${e.from}`;
      case 'TURN_COMPLETED': return `◎ Turn ${e.turn} · ${e.intent}`;
      default: return e.type;
    }
  };

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
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
          <button className={`${styles.navItem} ${styles.active}`}>Dashboard</button>
          <button className={styles.navItem} onClick={() => navigate('/calls')}>All Calls</button>
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.wsStatus}>
            <span className={`${styles.wsDot} ${connected ? styles.wsOn : styles.wsOff}`} />
            {connected ? 'Live' : 'Reconnecting...'}
          </div>
          <div className={styles.userInfo}>
            <div className={styles.userEmail}>{user?.email}</div>
            <button className={styles.logoutBtn} onClick={logout}>Sign out</button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Overview</h1>
            <p className={styles.pageSub}>Tamil AI voice call analytics</p>
          </div>
          <div className={styles.headerActions}>
            <select
              className={styles.daysSelect}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <button className={styles.initiateBtn} onClick={() => setShowModal(true)}>
              + Initiate Call
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingRow}>
            {[1,2,3,4].map(i => <div key={i} className={styles.skeletonCard} />)}
          </div>
        ) : (
          <>
            {/* Metric cards */}
            <div className={styles.metrics}>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>Total Calls</div>
                <div className={styles.metricValue}>{stats?.totalCalls?.toLocaleString()}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>Success Rate</div>
                <div className={styles.metricValue}>{stats?.successRate}%</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>Avg Duration</div>
                <div className={styles.metricValue}>{fmtDuration(stats?.avgDurationSeconds || 0)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>Escalations</div>
                <div className={styles.metricValue}>{stats?.escalatedCalls}</div>
              </div>
            </div>

            {/* Charts row */}
            <div className={styles.chartsRow}>
              {/* Line chart - timeline */}
              <div className={styles.chartCard}>
                <h3 className={styles.cardTitle}>Call volume</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={timeline} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" stroke="#534AB7" strokeWidth={2} dot={false} name="Total" />
                    <Line type="monotone" dataKey="completed" stroke="#0F6E56" strokeWidth={2} dot={false} name="Completed" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Pie chart - outcomes */}
              <div className={styles.chartCard}>
                <h3 className={styles.cardTitle}>Call outcomes</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" nameKey="name">
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => v.toLocaleString()} />
                    <Legend iconType="square" iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Intents + Activity row */}
            <div className={styles.bottomRow}>
              {/* Intents bar chart */}
              <div className={styles.chartCard}>
                <h3 className={styles.cardTitle}>Top intents (Tamil)</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={intents.map(i => ({ ...i, label: INTENT_LABELS[i.intent] || i.intent }))}
                    layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={110} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#534AB7" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Live activity feed */}
              <div className={styles.activityCard}>
                <h3 className={styles.cardTitle}>Live activity</h3>
                <div className={styles.activityList}>
                  {activity.length === 0 && (
                    <div className={styles.activityEmpty}>Waiting for events...</div>
                  )}
                  {activity.map((e) => (
                    <div key={e.id} className={styles.activityItem}>
                      <span className={`${styles.activityDot} ${styles[`dot_${e.type?.split('_')[0]?.toLowerCase()}`]}`} />
                      <div>
                        <div className={styles.activityText}>{wsEventLabel(e)}</div>
                        <div className={styles.activityTime}>{new Date(e.timestamp).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent calls table */}
            <div className={styles.tableCard}>
              <h3 className={styles.cardTitle}>Recent calls</h3>
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
                  {recentCalls.map((call) => (
                    <CallRow key={call.id} call={call} onView={() => navigate(`/calls/${call.id}`)} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {showModal && (
        <InitiateCallModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchData(); }}
        />
      )}
    </div>
  );
}
