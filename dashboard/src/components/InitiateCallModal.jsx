import React, { useState } from 'react';
import { callsApi } from '../api/client';

export default function InitiateCallModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ toPhone: '', customerName: '', orderId: '', customerId: '', maxRetries: 3 });
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
        { customerName: form.customerName || undefined, orderId: form.orderId || undefined, customerId: form.customerId || undefined },
        parseInt(form.maxRetries)
      );
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate call');
    } finally {
      setLoading(false);
    }
  };

  const inputSt = {
    width: '100%', padding: '9px 12px',
    border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
    fontSize: 13, color: 'var(--text-primary)', background: 'var(--card-bg)',
    outline: 'none', transition: 'border-color 0.15s',
  };
  const labelSt = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--card-bg)', borderRadius:'var(--radius-lg)', padding:32, width:'100%', maxWidth:460, boxShadow:'var(--shadow-lg)', border:'1px solid var(--border)' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div>
            <h2 style={{ fontSize:17, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>Initiate Voice Call</h2>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Outbound Tamil AI call via Twilio</p>
          </div>
          <button onClick={onClose} style={{ background:'var(--page-bg)', border:'none', borderRadius:8, width:30, height:30, fontSize:16, cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {result ? (
          <div>
            <div style={{ background:'var(--success-bg)', border:'1px solid rgba(5,150,105,0.2)', borderRadius:10, padding:16, marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--success-text)', marginBottom:8 }}>✓ Call queued successfully</div>
              <div style={{ fontSize:12, color:'var(--text-secondary)' }}>Call ID: <code style={{ fontFamily:'var(--font-mono)' }}>{result.callId}</code></div>
              <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:4 }}>Call SID: <code style={{ fontFamily:'var(--font-mono)' }}>{result.callSid}</code></div>
            </div>
            <button onClick={onSuccess} style={{ width:'100%', padding:'10px 16px', background:'var(--primary)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', fontSize:14, fontWeight:600, cursor:'pointer' }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div style={{ display:'grid', gap:12 }}>
              <div>
                <label style={labelSt}>Phone number *</label>
                <input style={inputSt} type="tel" placeholder="+919876543210" value={form.toPhone} onChange={set('toPhone')}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div>
                <label style={labelSt}>Customer name</label>
                <input style={inputSt} type="text" placeholder="ராஜேஷ் குமார்" value={form.customerName} onChange={set('customerName')}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={labelSt}>Order ID</label>
                  <input style={inputSt} type="text" placeholder="ORD-20240115-001" value={form.orderId} onChange={set('orderId')}
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                <div>
                  <label style={labelSt}>Customer ID</label>
                  <input style={inputSt} type="text" placeholder="CUST-12345" value={form.customerId} onChange={set('customerId')}
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>
              <div>
                <label style={labelSt}>Max retries</label>
                <select style={inputSt} value={form.maxRetries} onChange={set('maxRetries')}>
                  <option value={0}>No retries</option>
                  <option value={1}>1 retry</option>
                  <option value={2}>2 retries</option>
                  <option value={3}>3 retries (default)</option>
                </select>
              </div>
            </div>

            {error && (
              <div style={{ background:'var(--danger-bg)', color:'var(--danger-text)', border:'1px solid rgba(220,38,38,0.15)', borderRadius:'var(--radius-sm)', padding:'10px 12px', fontSize:13, marginTop:12 }}>
                {error}
              </div>
            )}

            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={onClose} style={{ flex:1, padding:'10px 16px', background:'var(--page-bg)', color:'var(--text-secondary)', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={loading} style={{ flex:2, padding:'10px 16px', background:'var(--primary)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:600, cursor:'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Connecting...' : '📞 Start Call'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
