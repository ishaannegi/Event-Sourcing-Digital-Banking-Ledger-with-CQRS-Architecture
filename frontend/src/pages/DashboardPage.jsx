import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAccountApi } from '../services/api';
import AccountsPage from './AccountsPage';
import AuditTrailPage from './AuditTrailPage';
import {
  LayoutDashboard,
  CreditCard,
  Repeat,
  ShieldAlert,
  LogOut,
  UserCheck,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Eye,
  EyeOff,
  Code2,
  Search,
  Server
} from 'lucide-react';

export default function DashboardPage() {
  const { username, role, token, logout } = useAuth();

  const isAdmin = role === 'ADMIN' || role === 'ROLE_ADMIN';

  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'accounts' | 'audit'

  const [accountIdInput, setAccountIdInput] = useState('');
  const [apiResult, setApiResult] = useState(null);
  const [loadingCall, setLoadingCall] = useState(false);
  const [callError, setCallError] = useState(null);
  const [showToken, setShowToken] = useState(false);

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
    <div className="dashboard-layout">
      {/* Left Sidebar */}
      <aside className="sidebar">
        <div>
          {/* Sidebar Brand Logo */}
          <div className="sidebar-brand">
            <span style={{ color: 'var(--accent-gold)', fontSize: '1.2rem' }}>✦</span>
            <span>Digital Ledger</span>
          </div>

          {/* Sidebar Navigation */}
          <nav className="sidebar-nav">
            <a
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); }}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </a>

            <a
              className={`nav-item ${activeTab === 'accounts' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setActiveTab('accounts'); }}
            >
              <CreditCard size={18} />
              <span>Accounts</span>
            </a>

            <a className="nav-item" onClick={(e) => e.preventDefault()}>
              <Repeat size={18} />
              <span>Transactions</span>
              <span className="nav-badge">Soon</span>
            </a>

            {/* Audit Trail Tab - ADMIN Role Only */}
            {isAdmin && (
              <a
                className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
                onClick={(e) => { e.preventDefault(); setActiveTab('audit'); }}
              >
                <ShieldAlert size={18} />
                <span>Audit Trail</span>
                <span className="nav-badge" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>Admin</span>
              </a>
            )}
          </nav>
        </div>

        {/* Sidebar Bottom User Session Mini Card */}
        <div className="sidebar-user-footer">
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-black)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.9rem',
            flexShrink: 0
          }}>
            {username ? username.charAt(0).toUpperCase() : 'U'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dark)', truncate: true }}>
              {username}
            </div>
            <span className={`role-pill ${isAdmin ? 'role-pill-admin' : 'role-pill-customer'}`}>
              {isAdmin ? 'ADMIN' : 'CUSTOMER'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main">
        {activeTab === 'accounts' ? (
          <AccountsPage />
        ) : activeTab === 'audit' && isAdmin ? (
          <AuditTrailPage />
        ) : (
          <>
            {/* Topbar */}
            <div className="dashboard-topbar">
              <div>
                <h1 className="dashboard-title">Welcome back, {username}!</h1>
                <p className="dashboard-subtext">CQRS Architecture & Event-Sourcing Ledger Portal</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <button
                  onClick={logout}
                  className="btn-demo-pill"
                  style={{ padding: '0.5rem 1.1rem' }}
                >
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            </div>

            {/* Card 1: Session & In-Memory Token */}
            <div className="saas-card">
              <div className="card-header">
                <div className="card-title-group">
                  <UserCheck size={20} color="var(--accent-gold)" />
                  <h2 className="card-title">Active In-Memory Session</h2>
                </div>

                {/* Collapsible Debug Info Toggle Button */}
                <button
                  type="button"
                  className="debug-toggle-btn"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  <span>{showToken ? 'Hide Token' : 'Debug Info (Show Token)'}</span>
                </button>
              </div>

              {/* Session Info Grid */}
              <div className="session-info-grid">
                <div className="info-tile">
                  <span className="info-label">Authenticated User</span>
                  <div className="info-value">
                    {username}
                  </div>
                </div>

                <div className="info-tile">
                  <span className="info-label">Assigned Role</span>
                  <div className="info-value">
                    <span className={`role-pill ${isAdmin ? 'role-pill-admin' : 'role-pill-customer'}`}>
                      {isAdmin ? 'ADMIN' : 'CUSTOMER'}
                    </span>
                  </div>
                </div>

                <div className="info-tile">
                  <span className="info-label">Token Storage Mode</span>
                  <div className="info-value" style={{ fontSize: '0.9rem', color: '#16a34a' }}>
                    <ShieldCheck size={18} /> In-Memory State Only
                  </div>
                </div>
              </div>

              {/* Collapsible Token Code Block */}
              {showToken && (
                <div className="token-code-block">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', color: 'var(--accent-gold)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Bearer JWT Token (Memory)
                    </span>
                    <Code2 size={16} />
                  </div>
                  <code>{token || 'No Token Available'}</code>
                </div>
              )}
            </div>

            {/* Card 2: Test Authenticated API Call */}
            <div className="saas-card">
              <div className="card-header">
                <div className="card-title-group">
                  <Server size={20} color="var(--accent-gold)" />
                  <h2 className="card-title">Test Authenticated Endpoint</h2>
                </div>
              </div>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-body)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                Execute an authorized request to <code>GET /accounts/{'{id}'}</code> with your in-memory Bearer token to verify CORS and role permissions end-to-end.
              </p>

              <form onSubmit={handleTestCall} style={{ marginBottom: '1rem' }}>
                <div className="pill-input-wrapper" style={{ marginBottom: '1.25rem' }}>
                  <Search size={18} className="pill-input-icon" />
                  <input
                    type="text"
                    className="pill-input"
                    placeholder="Enter Account ID (e.g. paste account-id here)"
                    value={accountIdInput}
                    onChange={(e) => setAccountIdInput(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-black-pill"
                  disabled={loadingCall}
                >
                  {loadingCall ? 'Executing Request...' : (
                    <>
                      Execute Authenticated GET Request <Play size={16} />
                    </>
                  )}
                </button>
              </form>

              {/* Error Output Banner */}
              {callError && (
                <div className="warm-error-banner" style={{ marginTop: '1rem', marginBottom: 0 }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <span>{callError}</span>
                </div>
              )}

              {/* Formatted JSON Inspector Result Box */}
              {apiResult && (
                <div className="json-viewer-card">
                  <div className="json-viewer-header">
                    <div className="json-viewer-title">
                      <CheckCircle2 size={16} color="#10b981" />
                      <span>HTTP 200 OK — Authenticated Response Received</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>application/json</span>
                  </div>
                  <pre className="json-pre-block">
                    {JSON.stringify(apiResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
