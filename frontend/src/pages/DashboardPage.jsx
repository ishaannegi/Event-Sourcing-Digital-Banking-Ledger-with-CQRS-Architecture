import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAccountApi } from '../services/api';
import { LogOut, UserCheck, Shield, Key, Database, CheckCircle2, AlertTriangle, Play } from 'lucide-react';

export default function DashboardPage() {
  const { username, role, token, logout } = useAuth();

  const [accountIdInput, setAccountIdInput] = useState('');
  const [apiResult, setApiResult] = useState(null);
  const [loadingCall, setLoadingCall] = useState(false);
  const [callError, setCallError] = useState(null);

  const handleTestCall = async (e) => {
    e?.preventDefault();
    if (!accountIdInput.trim()) {
      setCallError('Please enter a valid Account ID to test');
      return;
    }

    setCallError(null);
    setApiResult(null);
    setLoadingCall(true);

    try {
      const data = await getAccountApi(accountIdInput.trim());
      setApiResult(data);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || `HTTP ${err.response?.status || '500'}: Failed to fetch account`;
      setCallError(msg);
    } finally {
      setLoadingCall(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Top Navbar */}
      <header className="glass-panel" style={{
        padding: '1.25rem 1.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Database size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', lineHeight: 1.2 }}>Digital Banking Ledger</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phase 7.1 Dashboard</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserCheck size={18} color="var(--text-muted)" />
            <span style={{ fontWeight: 600 }}>{username}</span>
            <span className={`badge ${role === 'ROLE_ADMIN' ? 'badge-admin' : 'badge-customer'}`}>
              {role === 'ROLE_ADMIN' ? 'ADMIN' : 'CUSTOMER'}
            </span>
          </div>

          <button onClick={logout} className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        
        {/* Token & User Session Card */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Key size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.1rem' }}>Active In-Memory JWT Session</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <span className="form-label">Authenticated Username</span>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                {username}
              </div>
            </div>

            <div>
              <span className="form-label">Assigned Role</span>
              <div style={{ marginTop: '0.2rem' }}>
                <span className={`badge ${role === 'ROLE_ADMIN' ? 'badge-admin' : 'badge-customer'}`}>
                  {role}
                </span>
              </div>
            </div>

            <div>
              <span className="form-label">In-Memory JWT Token (Truncated)</span>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--bg-card-border)',
                color: '#a5b4fc',
                wordBreak: 'break-all',
                marginTop: '0.25rem'
              }}>
                {token ? `${token.substring(0, 42)}...${token.substring(token.length - 20)}` : 'No Token'}
              </div>
            </div>
          </div>
        </div>

        {/* Authenticated Endpoint Verification Card */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Shield size={20} color="var(--accent-emerald)" />
            <h3 style={{ fontSize: '1.1rem' }}>Test Authenticated Call</h3>
          </div>

          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Test that the in-memory Bearer token authorizes requests to <code>GET /accounts/{'{id}'}</code> without triggering a 401 Unauthorized response.
          </p>

          <form onSubmit={handleTestCall} style={{ marginBottom: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">Account ID to Query</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. paste account-id here"
                value={accountIdInput}
                onChange={(e) => setAccountIdInput(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 14px var(--accent-emerald-glow)' }}
              disabled={loadingCall}
            >
              {loadingCall ? 'Fetching Account...' : (
                <>
                  <Play size={16} /> Execute Authenticated GET Request
                </>
              )}
            </button>
          </form>

          {/* Test Call Output Banners */}
          {callError && (
            <div className="error-banner" style={{ margin: 0 }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span>{callError}</span>
            </div>
          )}

          {apiResult && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              marginTop: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                <CheckCircle2 size={18} /> HTTP 200 OK — Authenticated Response Received
              </div>
              <pre style={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: '#e2e8f0',
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                overflowX: 'auto'
              }}>
                {JSON.stringify(apiResult, null, 2)}
              </pre>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
