/**
 * InitiateCallModal - Form to start an outgoing Tamil voice call
 */

import React, { useState } from 'react';
import { callsApi } from '../api/client';

export default function InitiateCallModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    toPhone: '',
    customerName: '',
    orderId: '',
    customerId: '',
    maxRetries: 3,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async () => {
    if (!form.toPhone.match(/^\+?[1-9]\d{7,14}$/)) {
      setError('Enter a valid phone number in E.164 format (e.g. +919876543210)');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await callsApi.initiate(
        form.toPhone,
        {
          customerName: form.customerName || undefined,
          orderId: form.orderId || undefined,
          customerId: form.customerId || undefined,
        },
        parseInt(form.maxRetries)
      );
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate call');
    } finally {
      setLoading(false);
    }
  };

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const modal = {
    background: '#fff', borderRadius: 16, padding: 32, width: '100%',
    maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  };
  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 8, fontSize: 14, marginBottom: 12, color: '#2C2C2A', background: '#fff', outline: 'none',
  };
  const labelStyle = { fontSize: 12, color: '#5F5E5A', fontWeight: 500, display: 'block', marginBottom: 4 };

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#2C2C2A' }}>Initiate Tamil Voice Call</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888780' }}>×</button>
        </div>

        {result ? (
          <div>
            <div style={{ background: '#EAF3DE', border: '1px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0F6E56', marginBottom: 6 }}>✓ Call queued successfully</div>
              <div style={{ fontSize: 12, color: '#5F5E5A' }}>Call ID: <code>{result.callId}</code></div>
              <div style={{ fontSize: 12, color: '#5F5E5A', marginTop: 4 }}>Exotel SID: <code>{result.callSid}</code></div>
            </div>
            <button onClick={onSuccess} style={{ width: '100%', padding: 10, background: '#3C3489', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <label style={labelStyle}>Phone number *</label>
            <input style={inputStyle} type="tel" placeholder="+919876543210" value={form.toPhone} onChange={set('toPhone')} />

            <label style={labelStyle}>Customer name</label>
            <input style={inputStyle} type="text" placeholder="ராஜேஷ் குமார்" value={form.customerName} onChange={set('customerName')} />

            <label style={labelStyle}>Order ID</label>
            <input style={inputStyle} type="text" placeholder="ORD-20240115-001" value={form.orderId} onChange={set('orderId')} />

            <label style={labelStyle}>Customer ID</label>
            <input style={inputStyle} type="text" placeholder="CUST-12345" value={form.customerId} onChange={set('customerId')} />

            <label style={labelStyle}>Max retries</label>
            <select style={inputStyle} value={form.maxRetries} onChange={set('maxRetries')}>
              <option value={0}>No retries</option>
              <option value={1}>1 retry</option>
              <option value={2}>2 retries</option>
              <option value={3}>3 retries (default)</option>
            </select>

            {error && (
              <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 10, background: '#fff', color: '#5F5E5A', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={loading} style={{ flex: 2, padding: 10, background: '#3C3489', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Calling...' : 'Start call'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
