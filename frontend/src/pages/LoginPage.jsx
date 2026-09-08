import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ArrowRight, AlertCircle, ArrowUpRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('alice123');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const result = await login(username, password);
    setLoading(false);

    if (!result.success) {
      if (result.status === 401) {
        setErrorMsg('401 Unauthorized: Invalid username or password.');
      } else {
        setErrorMsg(result.error || 'Failed to connect to backend service.');
      }
    }
  };

  const fillQuickLogin = (u, p) => {
    setUsername(u);
    setPassword(p);
    setErrorMsg(null);
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
            <span>www.digitalledger.com/login</span>
          </div>
        </div>

        {/* Main Split Grid */}
        <div className="login-split-container">
          {/* Left Form Panel */}
          <div className="form-panel">
            {/* Top Brand Header */}
            <div className="brand-header">
              <span style={{ color: 'var(--accent-gold)', fontSize: '1.25rem' }}>✦</span>
              <span>Digital Ledger</span>
            </div>

            {/* Center Form Section */}
            <div className="form-content">
              <h1 className="form-title">Welcome back</h1>
              <p className="form-subtext">
                High-Throughput Banking Infrastructure powered by CQRS & Event Sourcing.
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

                {/* Solid Black Primary Pill Button */}
                <button
                  type="submit"
                  className="btn-black-pill"
                  disabled={loading}
                >
                  {loading ? 'Authenticating...' : (
                    <>
                      Sign In to Dashboard <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>

              {/* Quick Demo Sign In Options */}
              <div style={{ marginTop: '1.75rem', textAlign: 'center' }}>
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

            {/* Bottom Overlay Glass Bar */}
            <div className="visual-overlay-bar">
              <div className="overlay-pills">
                <span className="overlay-pill">CQRS Architecture</span>
                <span className="overlay-pill">Event Sourcing</span>
              </div>
              <p className="overlay-tagline">
                Guiding Cryptographic Security & High-Throughput Financial Integrity.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
