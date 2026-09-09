import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ArrowRight, AlertCircle, ArrowUpRight, ShieldCheck, UserCheck, UserPlus } from 'lucide-react';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('alice123');
  const [role, setRole] = useState('CUSTOMER');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    if (isRegister) {
      const result = await register(username.trim(), password, role);
      setLoading(false);
      if (!result.success) {
        setErrorMsg(result.error || 'Registration failed.');
      }
    } else {
      const result = await login(username.trim(), password);
      setLoading(false);
      if (!result.success) {
        if (result.status === 401) {
          setErrorMsg('401 Unauthorized: Invalid username or password.');
        } else {
          setErrorMsg(result.error || 'Failed to connect to backend service.');
        }
      }
    }
  };

  const fillQuickLogin = (u, p) => {
    setIsRegister(false);
    setUsername(u);
    setPassword(p);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!isRegister) {
      setUsername('');
      setPassword('');
      setRole('CUSTOMER');
    } else {
      setUsername('alice');
      setPassword('alice123');
    }
  };

  return (
    <div className="login-page-wrapper">
      <div className="browser-window">
        {/* Top Floating Browser Chrome Header */}
        <div className="browser-header">
          <div className="browser-dots">
            <div className="dot dot-red"></div>
            <div className="dot dot-yellow"></div>
            <div className="dot dot-green"></div>
          </div>

          <div className="browser-address-bar">
            <ShieldCheck size={14} color="#64748b" />
            <span>{isRegister ? 'www.digitalledger.com/register' : 'www.digitalledger.com/login'}</span>
          </div>
        </div>

        {/* Main Split Grid */}
        <div className="login-split-container">
          {/* Left Form Panel */}
          <div className="form-panel">
            {/* Top Brand Header */}
            <div className="brand-header">
              <span className="brand-icon">✦</span>
              <span className="brand-title">Digital Ledger</span>
            </div>

            {/* Center Form Section */}
            <div className="form-content">
              <h1 className="form-title">{isRegister ? 'Create Account' : 'Welcome back'}</h1>
              <p className="form-subtext">
                {isRegister
                  ? 'Register a new user identity bound to the CQRS Banking Ledger.'
                  : 'High-Throughput Banking Infrastructure powered by CQRS & Event Sourcing.'}
              </p>

              {/* Warm Error Banner */}
              {errorMsg && (
                <div className="warm-error-banner">
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* Username Input */}
                <div className="pill-input-wrapper">
                  <Mail size={18} className="pill-input-icon" />
                  <input
                    type="text"
                    className="pill-input"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                {/* Password Input */}
                <div className="pill-input-wrapper">
                  <Lock size={18} className="pill-input-icon" />
                  <input
                    type="password"
                    className="pill-input"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {/* Role Selector (Register Mode Only) */}
                {isRegister && (
                  <div style={{ marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Account Role
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                      <button
                        type="button"
                        className="btn-demo-pill"
                        style={{
                          justifyContent: 'center',
                          height: '38px',
                          backgroundColor: role === 'CUSTOMER' ? '#f0fdf4' : '#faf8f5',
                          borderColor: role === 'CUSTOMER' ? '#bbf7d0' : '#e8e4db',
                          color: role === 'CUSTOMER' ? '#166534' : 'var(--text-dark)',
                          fontWeight: role === 'CUSTOMER' ? 700 : 500
                        }}
                        onClick={() => setRole('CUSTOMER')}
                      >
                        <UserCheck size={15} /> Customer
                      </button>

                      <button
                        type="button"
                        className="btn-demo-pill"
                        style={{
                          justifyContent: 'center',
                          height: '38px',
                          backgroundColor: role === 'ADMIN' ? '#eff6ff' : '#faf8f5',
                          borderColor: role === 'ADMIN' ? '#bfdbfe' : '#e8e4db',
                          color: role === 'ADMIN' ? '#1e40af' : 'var(--text-dark)',
                          fontWeight: role === 'ADMIN' ? 700 : 500
                        }}
                        onClick={() => setRole('ADMIN')}
                      >
                        <UserPlus size={15} /> Admin
                      </button>
                    </div>
                  </div>
                )}

                {/* Solid Black Primary Pill Button */}
                <button
                  type="submit"
                  className="btn-black-pill"
                  disabled={loading}
                >
                  {loading ? (isRegister ? 'Creating User...' : 'Authenticating...') : (
                    <>
                      {isRegister ? 'Register & Launch Dashboard' : 'Sign In to Dashboard'} <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>

              {/* Toggle Mode Link */}
              <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={toggleMode}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    color: 'var(--accent-gold)',
                    fontWeight: 600,
                    textDecoration: 'underline'
                  }}
                >
                  {isRegister ? 'Already have an account? Sign In' : 'Need a new account? Create one here'}
                </button>
              </div>

              {/* Quick Demo Sign In Options (Sign In Mode Only) */}
              {!isRegister && (
                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, display: 'block', marginBottom: '0.75rem' }}>
                    Quick Demo Access
                  </span>
                  <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn-demo-pill"
                      onClick={() => fillQuickLogin('alice', 'alice123')}
                    >
                      Alice (Customer)
                    </button>
                    <button
                      type="button"
                      className="btn-demo-pill"
                      onClick={() => fillQuickLogin('admin', 'admin123')}
                    >
                      Admin (Compliance)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Social Proof Element */}
            <div className="social-proof-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div className="avatar-group">
                  <div className="avatar-circle" style={{ backgroundColor: '#c5a059' }}></div>
                  <div className="avatar-circle" style={{ backgroundColor: '#a5b4fc' }}></div>
                  <div className="avatar-circle" style={{ backgroundColor: '#10b981' }}></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dark)' }}>20k+ Financial Nodes</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>10M+ Immutable Events</span>
                </div>
              </div>
              <ArrowUpRight size={16} color="var(--text-muted)" />
            </div>
          </div>

          {/* Right Visual Panel */}
          <div className="visual-panel-wrapper">
            <img
              src="/sculpture.jpg"
              alt="Digital Banking Security Art"
              className="visual-image"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
