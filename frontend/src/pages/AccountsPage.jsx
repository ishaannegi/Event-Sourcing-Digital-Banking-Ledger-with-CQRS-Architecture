import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getBalanceViewApi,
  openAccountApi,
  depositApi,
  withdrawApi,
  transferApi
} from '../services/api';
import {
  CreditCard,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Repeat,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  X,
  Search,
  Wallet,
  ShieldCheck,
  Layers
} from 'lucide-react';

export default function AccountsPage() {
  const { username, role } = useAuth();
  const isAdmin = role === 'ADMIN' || role === 'ROLE_ADMIN';

  // Accounts state map keyed by accountId
  const [accountsMap, setAccountsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [globalSuccess, setGlobalSuccess] = useState(null);

  // Lookup / Search input
  const [lookupIdInput, setLookupIdInput] = useState('');

  // Copy to clipboard state
  const [copiedId, setCopiedId] = useState(null);

  // Modal States
  const [activeModal, setActiveModal] = useState(null); // 'open' | 'deposit' | 'withdraw' | 'transfer'
  const [modalAccountId, setModalAccountId] = useState(null); // target account for deposit/withdraw/transfer

  // Modal Form Inputs
  const [openOwnerName, setOpenOwnerName] = useState(username || '');
  const [openInitialBalance, setOpenInitialBalance] = useState('1000.00');

  const [depositAmount, setDepositAmount] = useState('500.00');
  const [withdrawAmount, setWithdrawAmount] = useState('200.00');

  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('300.00');

  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Auto-clear success message after 4 seconds
  useEffect(() => {
    if (globalSuccess) {
      const timer = setTimeout(() => setGlobalSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [globalSuccess]);

  // Load a single account by ID and add/update in state map
  const fetchAccount = async (id, silent = false) => {
    if (!id || !id.trim()) return;
    const cleanId = id.trim();
    if (!silent) setLoading(true);
    try {
      const data = await getBalanceViewApi(cleanId);
      setAccountsMap(prev => ({
        ...prev,
        [data.accountId]: data
      }));
      setGlobalError(null);
      return data;
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || `Failed to load account [${cleanId}]`;
      if (!silent) setGlobalError(msg);
      throw err;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleLookupSubmit = (e) => {
    e.preventDefault();
    if (!lookupIdInput.trim()) return;
    fetchAccount(lookupIdInput.trim())
      .then(() => setLookupIdInput(''))
      .catch(() => {});
  };

  // Copy helper
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Open New Account
  const handleOpenAccountSubmit = async (e) => {
    e.preventDefault();
    setModalError(null);
    setModalSubmitting(true);

    try {
      const newAcc = await openAccountApi(
        isAdmin ? openOwnerName : username,
        parseFloat(openInitialBalance)
      );

      setAccountsMap(prev => ({
        ...prev,
        [newAcc.accountId]: newAcc
      }));

      setGlobalSuccess(`Successfully opened new account [${newAcc.accountId}] for ${newAcc.ownerName} with $${newAcc.balance.toFixed(2)}`);
      closeModal();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to open account';
      setModalError(msg);
    } finally {
      setModalSubmitting(false);
    }
  };

  // Deposit Submit
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    setModalError(null);
    setModalSubmitting(true);

    try {
      const updated = await depositApi(modalAccountId, parseFloat(depositAmount));
      setAccountsMap(prev => ({
        ...prev,
        [updated.accountId]: updated
      }));
      setGlobalSuccess(`Deposited $${parseFloat(depositAmount).toFixed(2)} into [${modalAccountId}] — New Balance: $${updated.balance.toFixed(2)} (v${updated.version})`);
      closeModal();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Deposit failed';
      setModalError(msg);
    } finally {
      setModalSubmitting(false);
    }
  };

  // Withdraw Submit
  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setModalError(null);
    setModalSubmitting(true);

    try {
      const updated = await withdrawApi(modalAccountId, parseFloat(withdrawAmount));
      setAccountsMap(prev => ({
        ...prev,
        [updated.accountId]: updated
      }));
      setGlobalSuccess(`Withdrew $${parseFloat(withdrawAmount).toFixed(2)} from [${modalAccountId}] — New Balance: $${updated.balance.toFixed(2)} (v${updated.version})`);
      closeModal();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Withdrawal failed';
      setModalError(msg);
    } finally {
      setModalSubmitting(false);
    }
  };

  // Transfer Submit
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setModalError(null);
    setModalSubmitting(true);

    try {
      await transferApi(modalAccountId, transferToId.trim(), parseFloat(transferAmount));

      // Refresh both source and destination accounts
      await fetchAccount(modalAccountId, true).catch(() => {});
      if (transferToId.trim()) {
        await fetchAccount(transferToId.trim(), true).catch(() => {});
      }

      setGlobalSuccess(`Successfully transferred $${parseFloat(transferAmount).toFixed(2)} from [${modalAccountId}] to [${transferToId.trim()}]`);
      closeModal();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Transfer failed';
      setModalError(msg);
    } finally {
      setModalSubmitting(false);
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalAccountId(null);
    setModalError(null);
  };

  const accountsList = Object.values(accountsMap);
  const totalBalance = accountsList.reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Header Bar */}
      <div className="dashboard-topbar">
        <div>
          <h1 className="dashboard-title">Bank Accounts</h1>
          <p className="dashboard-subtext">CQRS Fast Read Model & Real-Time Transaction Processing</p>
        </div>

        <button
          className="btn-black-pill"
          style={{ width: 'auto', padding: '0.65rem 1.4rem' }}
          onClick={() => {
            setOpenOwnerName(username || '');
            setOpenInitialBalance('1000.00');
            setModalError(null);
            setActiveModal('open');
          }}
        >
          <Plus size={18} /> Open New Account
        </button>
      </div>

      {/* Global Success / Error Banners */}
      {globalSuccess && (
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#166534',
          borderRadius: '14px',
          padding: '0.85rem 1.1rem',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>{globalSuccess}</span>
        </div>
      )}

      {globalError && (
        <div className="warm-error-banner" style={{ margin: 0 }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>{globalError}</span>
          <button
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}
            onClick={() => setGlobalError(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Top Metrics Cards */}
      <div className="session-info-grid">
        <div className="info-tile">
          <span className="info-label">Active Loaded Accounts</span>
          <div className="info-value">
            <Wallet size={20} color="var(--accent-gold)" />
            <span>{accountsList.length} Accounts</span>
          </div>
        </div>

        <div className="info-tile">
          <span className="info-label">Total Combined Balance</span>
          <div className="info-value" style={{ fontSize: '1.25rem' }}>
            ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="info-tile">
          <span className="info-label">Read Architecture</span>
          <div className="info-value" style={{ fontSize: '0.85rem', color: 'var(--text-body)' }}>
            <Layers size={18} color="var(--accent-gold)" />
            <span>Redis Cache + Postgres</span>
          </div>
        </div>
      </div>

      {/* Account Lookup Bar */}
      <div className="saas-card" style={{ padding: '1.25rem 1.5rem' }}>
        <form onSubmit={handleLookupSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="pill-input-wrapper" style={{ flex: 1, marginBottom: 0 }}>
            <Search size={18} className="pill-input-icon" />
            <input
              type="text"
              className="pill-input"
              placeholder="Search or paste Account ID to load into workspace..."
              value={lookupIdInput}
              onChange={(e) => setLookupIdInput(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn-demo-pill"
            style={{ height: '52px', padding: '0 1.5rem' }}
            disabled={loading}
          >
            {loading ? 'Fetching...' : 'Load Account'}
          </button>
        </form>
      </div>

      {/* Account Cards List Grid */}
      {accountsList.length === 0 ? (
        <div className="saas-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <CreditCard size={48} color="var(--accent-gold)" style={{ opacity: 0.6, marginBottom: '1rem' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>No Active Accounts Loaded</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Click <strong>Open New Account</strong> above to create a new account, or paste an existing Account ID in the search bar.
          </p>
          <button
            className="btn-black-pill"
            style={{ width: 'auto', margin: '0 auto', padding: '0.65rem 1.5rem' }}
            onClick={() => {
              setOpenOwnerName(username || '');
              setOpenInitialBalance('1000.00');
              setModalError(null);
              setActiveModal('open');
            }}
          >
            <Plus size={18} /> Open First Account
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {accountsList.map(acc => (
            <div key={acc.accountId} className="saas-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                {/* Account Card Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-cream-dark)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      color: 'var(--text-dark)'
                    }}>
                      {acc.ownerName ? acc.ownerName.charAt(0).toUpperCase() : 'A'}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-dark)' }}>{acc.ownerName}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Account Owner</span>
                    </div>
                  </div>

                  <span style={{
                    backgroundColor: 'rgba(197, 160, 89, 0.15)',
                    color: 'var(--accent-gold)',
                    border: '1px solid rgba(197, 160, 89, 0.3)',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.65rem'
                  }}>
                    v{acc.version}
                  </span>
                </div>

                {/* Account ID Display & Copy */}
                <div style={{
                  backgroundColor: '#faf8f5',
                  borderRadius: '12px',
                  padding: '0.5rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1.25rem',
                  border: '1px solid #eee9df'
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)', truncate: true }}>
                    {acc.accountId}
                  </span>
                  <button
                    onClick={() => handleCopy(acc.accountId)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                    title="Copy Account ID"
                  >
                    {copiedId === acc.accountId ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  </button>
                </div>

                {/* Balance Tile */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Available Balance
                  </span>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: 'var(--text-dark)', marginTop: '0.1rem' }}>
                    ${Number(acc.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Action Buttons Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #f0ece3' }}>
                <button
                  className="btn-demo-pill"
                  style={{ justifyContent: 'center', fontSize: '0.8rem', height: '38px', color: '#16a34a', borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }}
                  onClick={() => {
                    setModalAccountId(acc.accountId);
                    setDepositAmount('500.00');
                    setModalError(null);
                    setActiveModal('deposit');
                  }}
                >
                  <ArrowDownLeft size={15} /> Deposit
                </button>

                <button
                  className="btn-demo-pill"
                  style={{ justifyContent: 'center', fontSize: '0.8rem', height: '38px', color: '#dc2626', borderColor: '#fecaca', backgroundColor: '#fef2f2' }}
                  onClick={() => {
                    setModalAccountId(acc.accountId);
                    setWithdrawAmount('200.00');
                    setModalError(null);
                    setActiveModal('withdraw');
                  }}
                >
                  <ArrowUpRight size={15} /> Withdraw
                </button>

                <button
                  className="btn-demo-pill"
                  style={{ justifyContent: 'center', fontSize: '0.8rem', height: '38px', gridColumn: 'span 2' }}
                  onClick={() => {
                    setModalAccountId(acc.accountId);
                    setTransferToId('');
                    setTransferAmount('300.00');
                    setModalError(null);
                    setActiveModal('transfer');
                  }}
                >
                  <Repeat size={15} /> Transfer (Double-Entry)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL 1: Open New Account */}
      {activeModal === 'open' && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(26, 24, 22, 0.6)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          zIndex: 1000
        }}>
          <div className="saas-card" style={{ width: '100%', maxWidth: '440px', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>Open New Bank Account</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div className="warm-error-banner">
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleOpenAccountSubmit}>
              <div className="pill-input-wrapper">
                <input
                  type="text"
                  className="pill-input"
                  style={{ paddingLeft: '1.25rem' }}
                  placeholder="Account Owner Name"
                  value={openOwnerName}
                  onChange={(e) => setOpenOwnerName(e.target.value)}
                  disabled={!isAdmin}
                  required
                />
              </div>

              <div className="pill-input-wrapper">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="pill-input"
                  style={{ paddingLeft: '1.25rem' }}
                  placeholder="Initial Deposit Balance ($)"
                  value={openInitialBalance}
                  onChange={(e) => setOpenInitialBalance(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-black-pill" disabled={modalSubmitting}>
                {modalSubmitting ? 'Opening Account...' : 'Open Account Now'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Deposit */}
      {activeModal === 'deposit' && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(26, 24, 22, 0.6)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          zIndex: 1000
        }}>
          <div className="saas-card" style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: '#16a34a' }}>Deposit Funds</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', fontFamily: 'monospace' }}>
              Account: {modalAccountId}
            </p>

            {modalError && (
              <div className="warm-error-banner">
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleDepositSubmit}>
              <div className="pill-input-wrapper">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="pill-input"
                  style={{ paddingLeft: '1.25rem' }}
                  placeholder="Deposit Amount ($)"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-black-pill" style={{ backgroundColor: '#16a34a' }} disabled={modalSubmitting}>
                {modalSubmitting ? 'Processing Deposit...' : 'Confirm Deposit'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Withdraw */}
      {activeModal === 'withdraw' && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(26, 24, 22, 0.6)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          zIndex: 1000
        }}>
          <div className="saas-card" style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: '#dc2626' }}>Withdraw Funds</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', fontFamily: 'monospace' }}>
              Account: {modalAccountId}
            </p>

            {modalError && (
              <div className="warm-error-banner">
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleWithdrawSubmit}>
              <div className="pill-input-wrapper">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="pill-input"
                  style={{ paddingLeft: '1.25rem' }}
                  placeholder="Withdrawal Amount ($)"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-black-pill" style={{ backgroundColor: '#dc2626' }} disabled={modalSubmitting}>
                {modalSubmitting ? 'Processing Withdrawal...' : 'Confirm Withdrawal'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Transfer (Double-Entry) */}
      {activeModal === 'transfer' && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(26, 24, 22, 0.6)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          zIndex: 1000
        }}>
          <div className="saas-card" style={{ width: '100%', maxWidth: '460px', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>Double-Entry Transfer</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div className="warm-error-banner">
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleTransferSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <span className="info-label">From Account (Source)</span>
                <input
                  type="text"
                  className="pill-input"
                  style={{ paddingLeft: '1.25rem', backgroundColor: '#faf8f5' }}
                  value={modalAccountId}
                  disabled
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <span className="info-label">To Account (Destination)</span>
                <input
                  type="text"
                  className="pill-input"
                  style={{ paddingLeft: '1.25rem' }}
                  placeholder="Destination Account ID"
                  value={transferToId}
                  onChange={(e) => setTransferToId(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <span className="info-label">Transfer Amount ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="pill-input"
                  style={{ paddingLeft: '1.25rem' }}
                  placeholder="Transfer Amount"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-black-pill" disabled={modalSubmitting}>
                {modalSubmitting ? 'Executing Transfer...' : 'Confirm Atomic Transfer'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
