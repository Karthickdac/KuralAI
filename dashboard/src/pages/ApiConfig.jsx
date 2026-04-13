import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiConfigApi } from '../api/client';
import Sidebar from '../components/Sidebar';
import styles from './ApiConfig.module.css';

const ICON_MAP = {
  telephony: { cls: styles.iconTelephony, letter: 'T' },
  openai:    { cls: styles.iconAI,        letter: 'AI' },
  tts:       { cls: styles.iconVoice,     letter: 'V' },
  s3:        { cls: styles.iconStorage,   letter: 'S3' },
};

function ServiceCard({ service, testResult, testing, onTest }) {
  const icon = ICON_MAP[service.id] || { cls: styles.iconAI, letter: '?' };
  const result = testResult;

  let dotClass = styles.dotUnknown;
  if (testing) dotClass = styles.dotTesting;
  else if (result?.status === 'ok') dotClass = styles.dotOk;
  else if (result?.status === 'error') dotClass = styles.dotError;

  return (
    <div className={styles.serviceCard}>
      <div className={styles.cardHeader}>
        <div className={`${styles.iconWrap} ${icon.cls}`}>{icon.letter}</div>
        <div>
          <div className={styles.cardTitle}>{service.name}</div>
          <div className={styles.cardCategory}>{service.category}{service.optional ? ' (Optional)' : ''}</div>
        </div>
        <div className={`${styles.statusDot} ${dotClass}`} />
      </div>

      <div className={styles.cardBody}>
        {service.configured ? (
          <>
            {Object.entries(service.fields).map(([key, val]) => (
              <div key={key} className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{formatLabel(key)}</span>
                <span className={styles.fieldValue}>{val || '—'}</span>
              </div>
            ))}
          </>
        ) : (
          <div className={styles.notConfigured}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Not configured
          </div>
        )}

        {result && !testing && (
          <div className={`${styles.resultBox} ${result.status === 'ok' ? styles.resultOk : styles.resultError}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {result.status === 'ok' ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              )}
              <span>{result.message}</span>
              {result.latencyMs != null && <span className={styles.latency}>{result.latencyMs}ms</span>}
            </div>
            {result.details && (
              <div className={styles.detailGrid}>
                {Object.entries(result.details).map(([k, v]) => (
                  <span key={k} className={styles.detailItem}><strong>{formatLabel(k)}:</strong> {Array.isArray(v) ? v.join(', ') : String(v)}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.cardFooter}>
        <button className={styles.testBtn} onClick={() => onTest(service.id)} disabled={testing || !service.configured}>
          {testing ? (
            <>
              <span className={styles.spinner} style={{ width: 12, height: 12, borderWidth: 2 }} />
              Testing…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Test Connection
            </>
          )}
        </button>
        <ConfigureLink />
      </div>
    </div>
  );
}

function ConfigureLink() {
  const navigate = useNavigate();
  return (
    <button className={styles.configureBtn} onClick={() => navigate('/settings')}>
      Configure
    </button>
  );
}

function formatLabel(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace(/_/g, ' ');
}

export default function ApiConfig() {
  const [services, setServices] = useState([]);
  const [externalApi, setExternalApi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState({});
  const [testingIds, setTestingIds] = useState(new Set());
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiConfigApi.status();
      setServices(res.data.services || []);
      setExternalApi(res.data.externalApi || null);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) {
        setError('You need admin access to view API configuration.');
      } else {
        setError(err.response?.data?.error || 'Failed to load API configuration. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleTest(serviceId) {
    setTestingIds(prev => new Set([...prev, serviceId]));
    try {
      const res = await apiConfigApi.test(serviceId);
      setTestResults(prev => ({ ...prev, [serviceId]: res.data.result }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [serviceId]: { status: 'error', message: err.response?.data?.error || 'Test failed' },
      }));
    } finally {
      setTestingIds(prev => {
        const next = new Set(prev);
        next.delete(serviceId);
        return next;
      });
    }
  }

  async function handleTestAll() {
    for (const svc of services) {
      if (svc.configured) {
        handleTest(svc.id);
      }
    }
  }

  const configuredCount = services.filter(s => s.configured).length;
  const okCount = Object.values(testResults).filter(r => r?.status === 'ok').length;
  const errorCount = Object.values(testResults).filter(r => r?.status === 'error').length;
  const untestedCount = services.filter(s => s.configured).length - okCount - errorCount;

  if (loading) {
    return (
      <div className={styles.layout}>
        <Sidebar />
        <main className={styles.main}>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading API configuration…</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.pageTitle}>API Configuration</h1>
            <p className={styles.pageSub}>View service connectivity and test API integrations</p>
          </div>
          <button className={styles.refreshBtn} onClick={handleTestAll} disabled={testingIds.size > 0}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Test All
          </button>
        </div>

        {error && (
          <div style={{ padding: '14px 18px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
            <button onClick={load} style={{ marginLeft: 'auto', padding: '4px 12px', background: '#fff', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Retry</button>
          </div>
        )}

        <div className={styles.summaryBar}>
          <div className={styles.summaryItem}>
            <div>
              <div className={styles.summaryCount}>{configuredCount}</div>
              <div className={styles.summaryLabel}>Configured</div>
            </div>
          </div>
          <div className={`${styles.summaryItem} ${styles.summaryOk}`}>
            <div>
              <div className={styles.summaryCount}>{okCount}</div>
              <div className={styles.summaryLabel}>Connected</div>
            </div>
          </div>
          <div className={`${styles.summaryItem} ${styles.summaryError}`}>
            <div>
              <div className={styles.summaryCount}>{errorCount}</div>
              <div className={styles.summaryLabel}>Failed</div>
            </div>
          </div>
          {untestedCount > 0 && (
            <div className={`${styles.summaryItem} ${styles.summaryPending}`}>
              <div>
                <div className={styles.summaryCount}>{untestedCount}</div>
                <div className={styles.summaryLabel}>Untested</div>
              </div>
            </div>
          )}
          {externalApi && (
            <div className={styles.summaryItem}>
              <div>
                <div className={styles.summaryCount} style={{ fontSize: 14, fontFamily: 'monospace' }}>
                  {externalApi.configured ? externalApi.key : '—'}
                </div>
                <div className={styles.summaryLabel}>External API Key</div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.grid}>
          {services.map(svc => (
            <ServiceCard
              key={svc.id}
              service={svc}
              testResult={testResults[svc.id]}
              testing={testingIds.has(svc.id)}
              onTest={handleTest}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
