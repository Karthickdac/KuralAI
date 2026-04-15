import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import styles from './Sidebar.module.css';

const ICON = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/>
      <rect x="3" y="16" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/>
    </svg>
  ),
  calls: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
    </svg>
  ),
  customers: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
      <circle cx="19" cy="7" r="3"/><path d="M21 21v-1.5a3 3 0 00-2-2.83"/>
    </svg>
  ),
  campaigns: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
  workflows: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
      <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
    </svg>
  ),
  templates: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  reports: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  simulate: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
      <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  ),
  crm: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
    </svg>
  ),
  apiConfig: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  billing: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  orgs: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  superDash: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
};

const TENANT_NAV = [
  {
    items: [
      { key: 'dashboard', label: 'Dashboard', path: '/', icon: ICON.dashboard },
      { key: 'calls', label: 'All Calls', path: '/calls', icon: ICON.calls },
      { key: 'customers', label: 'Customers', path: '/customers', icon: ICON.customers },
    ],
  },
  {
    section: 'Manage',
    items: [
      { key: 'campaigns', label: 'Campaigns', path: '/campaigns', icon: ICON.campaigns },
      { key: 'workflows', label: 'Workflows', path: '/workflows', icon: ICON.workflows },
      { key: 'templates', label: 'Templates', path: '/templates', icon: ICON.templates },
    ],
  },
  {
    section: 'Analyse',
    items: [
      { key: 'reports', label: 'Reports', path: '/reports', icon: ICON.reports },
      { key: 'simulate', label: 'Simulator', path: '/simulate', icon: ICON.simulate },
    ],
  },
  {
    section: 'System',
    items: [
      { key: 'users', label: 'Users', path: '/users', icon: ICON.users },
      { key: 'crm', label: 'CRM', path: '/crm', icon: ICON.crm },
      { key: 'api-config', label: 'API Keys', path: '/api-config', icon: ICON.apiConfig },
      { key: 'billing', label: 'Billing', path: '/billing', icon: ICON.billing },
      { key: 'settings', label: 'Settings', path: '/settings', icon: ICON.settings },
    ],
  },
];

const SUPER_ADMIN_NAV = [
  {
    items: [
      { key: 'super-dashboard', label: 'Platform Overview', path: '/superadmin', icon: ICON.superDash },
      { key: 'organizations', label: 'Organizations', path: '/superadmin/organizations', icon: ICON.orgs },
    ],
  },
  {
    section: 'Tenant View',
    items: [
      { key: 'dashboard', label: 'Dashboard', path: '/', icon: ICON.dashboard },
      { key: 'calls', label: 'All Calls', path: '/calls', icon: ICON.calls },
      { key: 'customers', label: 'Customers', path: '/customers', icon: ICON.customers },
      { key: 'campaigns', label: 'Campaigns', path: '/campaigns', icon: ICON.campaigns },
    ],
  },
  {
    section: 'System',
    items: [
      { key: 'settings', label: 'Settings', path: '/settings', icon: ICON.settings },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { connected } = useWebSocket();
  const [collapsed, setCollapsed] = useState(false);

  const isSuperAdmin = user?.role === 'superadmin';
  const NAV = isSuperAdmin ? SUPER_ADMIN_NAV : TENANT_NAV;

  function isActive(path) {
    if (path === '/' && !isSuperAdmin) return location.pathname === '/';
    if (path === '/superadmin') return location.pathname === '/superadmin';
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  const initials = (user?.name || user?.email || 'A')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const roleLabel = isSuperAdmin ? 'Super Admin' : (user?.role === 'admin' ? 'Administrator' : 'Viewer');

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.topSection}>
        <div className={styles.logo} onClick={() => navigate(isSuperAdmin ? '/superadmin' : '/')}>
          <div className={styles.logoMark}>
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="rgba(255,255,255,0.15)" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M12 7v10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M7.5 9.5L12 12l4.5-2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {!collapsed && (
            <div className={styles.logoText}>
              <span className={styles.logoName}>KuralAI</span>
              <span className={styles.logoBadge}>{isSuperAdmin ? 'ADMIN' : 'PRO'}</span>
            </div>
          )}
        </div>

        <button className={styles.collapseBtn} onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      <nav className={styles.nav}>
        {NAV.map((group, gi) => (
          <div key={gi} className={styles.navGroup}>
            {group.section && !collapsed && (
              <div className={styles.navSection}>{group.section}</div>
            )}
            {group.section && collapsed && <div className={styles.navDivider} />}
            {group.items.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.key}
                  className={`${styles.navItem} ${active ? styles.active : ''}`}
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
                  {active && <span className={styles.activeIndicator} />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.bottom}>
        <div className={styles.statusBar}>
          <span className={`${styles.statusDot} ${connected ? styles.online : styles.offline}`} />
          {!collapsed && (
            <span className={styles.statusText}>{connected ? 'System Online' : 'Reconnecting...'}</span>
          )}
        </div>

        <div className={styles.userCard}>
          <div className={styles.avatar}>{initials}</div>
          {!collapsed && (
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user?.name || 'Admin'}</div>
              <div className={styles.userRole}>{roleLabel}</div>
            </div>
          )}
          <button className={styles.logoutBtn} onClick={logout} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
