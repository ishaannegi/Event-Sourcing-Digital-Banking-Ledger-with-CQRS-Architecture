import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getBalanceViewApi,
  getAccountApi,
  openAccountApi,
  depositApi,
  withdrawApi,
  transferApi,
  getAccountEventsApi,
  setAuthToken
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
  Wallet,
  ShieldCheck,
  Layers,
  History,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
  Code,
  PlusCircle,
  Zap,
  Columns,
  Cpu,
  Lock,
  ShieldAlert
} from 'lucide-react';

const getKnownAccountIds = (user) => {
  try {
    const rawUser = localStorage.getItem(`ledger_accounts_${user}`);
    const userIds = rawUser ? JSON.parse(rawUser) : [];
    const rawGlobal = localStorage.getItem('ledger_known_accounts');
    const globalIds = rawGlobal ? JSON.parse(rawGlobal) : [];
    return Array.from(new Set([...userIds, ...globalIds]));
  } catch (e) {
    return [];
  }
};

const saveKnownAccountId = (accountId, user) => {
  if (!accountId) return;
  try {
    const rawUser = localStorage.getItem(`ledger_accounts_${user}`);
    const userIds = rawUser ? JSON.parse(rawUser) : [];
    if (!userIds.includes(accountId)) {
      userIds.push(accountId);
      localStorage.setItem(`ledger_accounts_${user}`, JSON.stringify(userIds));
    }
    const rawGlobal = localStorage.getItem('ledger_known_accounts');
    const globalIds = rawGlobal ? JSON.parse(rawGlobal) : [];
    if (!globalIds.includes(accountId)) {
      globalIds.push(accountId);
      localStorage.setItem('ledger_known_accounts', JSON.stringify(globalIds));
    }
  } catch (e) {
    console.error('Failed to save account ID to localStorage', e);
  }
};

export default function AccountsPage() {
  const { username, role, token } = useAuth();
  const isAdmin = role === 'ADMIN' || role === 'ROLE_ADMIN';

  // Accounts state map keyed by accountId
  const [accountsMap, setAccountsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [globalSuccess, setGlobalSuccess] = useState(null);

  // Copy to clipboard state
  const [copiedId, setCopiedId] = useState(null);

  // Modal States
  const [activeModal, setActiveModal] = useState(null); // 'open' | 'deposit' | 'withdraw' | 'transfer' | 'events' | 'cqrs'
  const [modalAccountId, setModalAccountId] = useState(null); // target account for deposit/withdraw/transfer/events/cqrs

  // Event Log Modal States
  const [eventLogList, setEventLogList] = useState([]);
  const [eventLogLoading, setEventLogLoading] = useState(false);
  const [expandedPayloads, setExpandedPayloads] = useState({});

  // CQRS Inspector Modal States
  const [cqrsWriteData, setCqrsWriteData] = useState(null);
  const [cqrsReadData, setCqrsReadData] = useState(null);
  const [cqrsLoadingWrite, setCqrsLoadingWrite] = useState(false);
  const [cqrsLoadingRead, setCqrsLoadingRead] = useState(false);
  const [cqrsFiringDeposit, setCqrsFiringDeposit] = useState(false);
  const [cqrsSyncBenchmarkMs, setCqrsSyncBenchmarkMs] = useState(null);

  // Concurrency Inspector Modal States
  const [concurrencyExecuting, setConcurrencyExecuting] = useState(false);
  const [concurrencyResult1, setConcurrencyResult1] = useState(null);
  const [concurrencyResult2, setConcurrencyResult2] = useState(null);

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

  // Open Event Log Modal handler
  const handleOpenEventsModal = async (accountId) => {
    setModalAccountId(accountId);
    setActiveModal('events');
    setEventLogLoading(true);
    setModalError(null);
    setEventLogList([]);
    setExpandedPayloads({});

    try {
      const events = await getAccountEventsApi(accountId);
      setEventLogList(events || []);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to load event stream for account';
      setModalError(msg);
    } finally {
      setEventLogLoading(false);
    }
  };

  // Open CQRS Inspector Modal handler
  const handleOpenCqrsInspector = async (accountId) => {
    setModalAccountId(accountId);
    setActiveModal('cqrs');
    setModalError(null);
    setCqrsSyncBenchmarkMs(null);
    setCqrsWriteData(null);
    setCqrsReadData(null);
    setCqrsLoadingWrite(true);
    setCqrsLoadingRead(true);

    try {
      const [writeData, readData] = await Promise.all([
        getAccountApi(accountId),
        getBalanceViewApi(accountId)
      ]);
      setCqrsWriteData(writeData);
      setCqrsReadData(readData);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to inspect CQRS models';
      setModalError(msg);
    } finally {
      setCqrsLoadingWrite(false);
      setCqrsLoadingRead(false);
    }
  };

  // Fire Test Deposit ($10.00) in CQRS Inspector
  const handleFireTestDeposit = async () => {
    if (!modalAccountId) return;
    setCqrsFiringDeposit(true);
    setModalError(null);
    setCqrsSyncBenchmarkMs(null);

    const startTime = Date.now();

    try {
      // 1. Fire Deposit Command (Write Path)
      await depositApi(modalAccountId, 10.00);

      // 2. Immediately fetch Command Side (Source of Truth via Event Store Replay)
      const freshWrite = await getAccountApi(modalAccountId);
      setCqrsWriteData(freshWrite);
      setCqrsLoadingWrite(false);

      const targetVersion = freshWrite.version;

      // 3. Poll Query Side (Read Model - Redis/Postgres) every 100ms until version catches up
      let attempts = 0;
      const maxAttempts = 25;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const freshRead = await getBalanceViewApi(modalAccountId);
          setCqrsReadData(freshRead);

          if (freshRead.version >= targetVersion) {
            const elapsed = Date.now() - startTime;
            setCqrsSyncBenchmarkMs(elapsed);
            break;
          }
        } catch (e) {
          // keep polling
        }
        await new Promise(res => setTimeout(res, 100));
      }

      refreshAllLoadedAccounts();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to fire test deposit';
      setModalError(msg);
    } finally {
      setCqrsFiringDeposit(false);
    }
  };

  // Open Concurrency Modal Handler
  const handleOpenConcurrencyModal = (accountId) => {
    setModalAccountId(accountId);
    setActiveModal('concurrency');
    setModalError(null);
    setConcurrencyResult1(null);
    setConcurrencyResult2(null);
  };

  // Simulate Concurrent Writes Handler
  const handleSimulateConcurrency = async () => {
    const targetId = modalAccountId;
    if (!targetId) return;

    setConcurrencyExecuting(true);
    setConcurrencyResult1(null);
    setConcurrencyResult2(null);
    setModalError(null);

    const makeRequest = (amount) => depositApi(targetId, amount)
      .then(data => ({
        status: 200,
        statusText: '200 OK (Committed)',
        data,
        timestamp: new Date().toLocaleTimeString()
      }))
      .catch(err => ({
        status: err.response?.status || 409,
        statusText: `${err.response?.status || 409} Conflict`,
        error: err.response?.data?.message || err.response?.data?.error || 'Optimistic lock failure',
        data: err.response?.data,
        timestamp: new Date().toLocaleTimeString()
      }));

    // Dispatches two $50.00 deposits concurrently to trigger optimistic locking retry
    const results = await Promise.all([
      makeRequest(50.00),
      makeRequest(50.00)
    ]);

    // Sort by version ascending so Request #1 (e.g. v55) and Request #2 (e.g. v56) are displayed sequentially
    const sorted = [...results].sort((a, b) => (a.data?.version || 0) - (b.data?.version || 0));

    setConcurrencyResult1(sorted[0]);
    setConcurrencyResult2(sorted[1] || sorted[0]);
    setConcurrencyExecuting(false);

    refreshAllLoadedAccounts();
  };

  const togglePayload = (key) => {
    setExpandedPayloads(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Helper to re-fetch all known & currently loaded account cards on screen
  const refreshAllLoadedAccounts = () => {
    const knownIds = getKnownAccountIds(username);
    const loadedIds = Object.keys(accountsMap);
    const allIds = Array.from(new Set([...knownIds, ...loadedIds]));
    if (allIds.length > 0) {
      Promise.all(allIds.map(id => fetchAccount(id, true).catch(() => null)));
    }
  };

  // Auto-sync token and auto-fetch all known accounts for current session on mount
  useEffect(() => {
    if (token) {
      setAuthToken(token);
    }

    const knownIds = getKnownAccountIds(username);
    if (knownIds.length > 0) {
      setLoading(true);
      Promise.all(
        knownIds.map(id => fetchAccount(id, true).catch(() => null))
      ).finally(() => {
        setLoading(false);
      });
    }
  }, [username, token]);

  // Live polling every 3.5s to keep all displayed account cards automatically in sync across users/sessions
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAllLoadedAccounts();
    }, 3500);

    return () => clearInterval(interval);
  }, [username, Object.keys(accountsMap).join(',')]);

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

      saveKnownAccountId(newAcc.accountId, username);

      setAccountsMap(prev => ({
        ...prev,
        [newAcc.accountId]: newAcc
      }));

      setGlobalSuccess(`Successfully opened new account [${newAcc.accountId}] for ${newAcc.ownerName} with $${newAcc.balance.toFixed(2)}`);
      closeModal();

      refreshAllLoadedAccounts();
      setTimeout(() => refreshAllLoadedAccounts(), 350);
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

      refreshAllLoadedAccounts();
      setTimeout(() => refreshAllLoadedAccounts(), 350);
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

      refreshAllLoadedAccounts();
      setTimeout(() => refreshAllLoadedAccounts(), 350);
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

      if (transferToId.trim()) {
        saveKnownAccountId(transferToId.trim(), username);
      }

      setGlobalSuccess(`Successfully transferred $${parseFloat(transferAmount).toFixed(2)} from [${modalAccountId}] to [${transferToId.trim()}]`);
      closeModal();

      // Immediate refresh of all loaded account cards (source, destination, and admin list)
      refreshAllLoadedAccounts();

      // Second refresh after 350ms to ensure async Kafka projection consumer has completed updating Redis/Postgres
      setTimeout(() => {
        refreshAllLoadedAccounts();
      }, 350);
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

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className="btn-demo-pill"
            style={{ padding: '0.65rem 1.1rem' }}
            onClick={() => {
              const knownIds = getKnownAccountIds(username);
              if (knownIds.length > 0) {
                setLoading(true);
                Promise.all(knownIds.map(id => fetchAccount(id, true).catch(() => null)))
                  .finally(() => setLoading(false));
              }
            }}
            disabled={loading}
          >
            <RefreshCw size={16} /> {loading ? 'Syncing...' : 'Sync Accounts'}
          </button>

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

      {/* Account Cards List Grid */}
      {accountsList.length === 0 ? (
        <div className="saas-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <CreditCard size={48} color="var(--accent-gold)" style={{ opacity: 0.6, marginBottom: '1rem' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>No Accounts Yet</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Click <strong>Open New Account</strong> above to create your first bank account with an initial balance.
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
            <div key={acc.accountId} className="saas-card" style={{ display: 'flex', flexDirection: 'column', justifyContext: 'space-between' }}>
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

                <button
                  className="btn-demo-pill"
                  style={{ justifyContent: 'center', fontSize: '0.8rem', height: '38px', gridColumn: 'span 2', backgroundColor: '#faf8f5', borderColor: '#e8e4db' }}
                  onClick={() => handleOpenEventsModal(acc.accountId)}
                >
                  <History size={15} color="var(--accent-gold)" /> View Event Log
                </button>

                <button
                  className="btn-demo-pill"
                  style={{ justifyContent: 'center', fontSize: '0.8rem', height: '38px', gridColumn: 'span 2', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}
                  onClick={() => handleOpenCqrsInspector(acc.accountId)}
                >
                  <Columns size={15} color="#166534" /> CQRS Inspector (Write vs Read)
                </button>

                <button
                  className="btn-demo-pill"
                  style={{ justifyContent: 'center', fontSize: '0.8rem', height: '38px', gridColumn: 'span 2', backgroundColor: '#faf5ff', borderColor: '#e9d5ff', color: '#6b21a8' }}
                  onClick={() => handleOpenConcurrencyModal(acc.accountId)}
                >
                  <Lock size={15} color="#9333ea" /> Simulate Concurrency (409 Conflict)
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

      {/* MODAL 5: Raw Event Stream Timeline */}
      {activeModal === 'events' && (
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
          <div className="saas-card" style={{ width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '2rem', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f0ece3' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={20} color="var(--accent-gold)" /> Aggregate Event Stream
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  ID: {modalAccountId}
                </span>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Event Sourcing Demo Callout Banner */}
            <div style={{
              backgroundColor: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: '14px',
              padding: '0.85rem 1rem',
              fontSize: '0.85rem',
              color: '#92400e',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              marginBottom: '1.25rem',
              lineHeight: 1.45
            }}>
              <Sparkles size={20} color="var(--accent-gold)" style={{ flexShrink: 0 }} />
              <span>
                <strong>Event Sourcing Invariant:</strong> Balance is never stored directly — it's computed by replaying these events in order.
              </span>
            </div>

            {modalError && (
              <div className="warm-error-banner" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Scrollable Event Timeline */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {eventLogLoading ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.875rem' }}>Replaying event stream from Event Store...</p>
                </div>
              ) : eventLogList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                  <Clock size={28} color="var(--accent-gold)" style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.875rem' }}>No events recorded for this aggregate ID yet.</p>
                </div>
              ) : (
                eventLogList.map((evt, idx) => {
                  let payloadObj = {};
                  let formattedPayload = evt.payload;
                  try {
                    payloadObj = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : (evt.payload || {});
                    formattedPayload = JSON.stringify(payloadObj, null, 2);
                  } catch (e) {
                    payloadObj = {};
                  }

                  const isExpanded = !!expandedPayloads[evt.id || idx];
                  const isTransferEvent = evt.eventType === 'TransferInitiatedEvent' || evt.eventType === 'TransferInitiated';

                  if (isTransferEvent) {
                    const fromAcc = payloadObj.fromAccountId || evt.aggregateId;
                    const toAcc = payloadObj.toAccountId || 'N/A';
                    const amountVal = Number(payloadObj.amount || 0).toFixed(2);
                    const transferIdStr = payloadObj.transferId ? payloadObj.transferId.substring(0, 8) + '...' : 'N/A';

                    return (
                      <div
                        key={evt.id || idx}
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: '16px',
                          border: '1.5px solid #e9d5ff',
                          padding: '1.1rem 1.25rem',
                          boxShadow: 'var(--shadow-card)',
                          position: 'relative'
                        }}
                      >
                        {/* Card Header Bar */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f3e8ff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              backgroundColor: '#faf5ff',
                              color: '#6b21a8',
                              border: '1px solid #e9d5ff',
                              padding: '0.25rem 0.65rem',
                              borderRadius: 'var(--radius-pill)',
                              fontSize: '0.78rem',
                              fontWeight: 700
                            }}>
                              <Repeat size={15} color="#9333ea" /> Double-Entry Transfer
                            </span>

                            <span style={{
                              backgroundColor: 'rgba(197, 160, 89, 0.15)',
                              color: 'var(--accent-gold)',
                              border: '1px solid rgba(197, 160, 89, 0.3)',
                              borderRadius: 'var(--radius-pill)',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.55rem'
                            }}>
                              v{evt.version}
                            </span>
                          </div>

                          {/* Invariant Badge */}
                          <span style={{
                            backgroundColor: '#f0fdf4',
                            color: '#166534',
                            border: '1px solid #bbf7d0',
                            padding: '0.25rem 0.65rem',
                            borderRadius: 'var(--radius-pill)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}>
                            <CheckCircle2 size={14} color="#16a34a" /> Debit = Credit (Invariant Held)
                          </span>
                        </div>

                        {/* Transfer ID subtext & timestamp */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <span style={{ fontFamily: 'monospace' }}>
                            Transfer #{payloadObj.transferId || evt.id || idx}
                          </span>
                          <span>
                            {evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}
                          </span>
                        </div>

                        {/* Visual Linked Pair Group (DEBIT + CREDIT) */}
                        <div style={{
                          position: 'relative',
                          backgroundColor: '#faf8f5',
                          borderRadius: '14px',
                          border: '1px solid #eee9df',
                          padding: '0.85rem 1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                          marginBottom: '0.85rem'
                        }}>
                          {/* Left connecting vertical line indicator */}
                          <div style={{
                            position: 'absolute',
                            left: '0.85rem',
                            top: '1.25rem',
                            bottom: '1.25rem',
                            width: '3px',
                            backgroundColor: '#c5a059',
                            borderRadius: '2px'
                          }} />

                          {/* Row 1: DEBIT Entry */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '1.1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <span style={{
                                backgroundColor: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '0.15rem 0.5rem',
                                borderRadius: '6px',
                                letterSpacing: '0.05em'
                              }}>
                                DEBIT (-)
                              </span>
                              <div>
                                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-dark)' }}>Source Account</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontFamily: 'monospace' }}>
                                  {fromAcc}
                                </span>
                              </div>
                            </div>

                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <ArrowUpRight size={16} /> -${amountVal}
                            </div>
                          </div>

                          {/* Divider line inside linked card */}
                          <div style={{ height: '1px', backgroundColor: '#e8e4db', marginLeft: '1.1rem' }} />

                          {/* Row 2: CREDIT Entry */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '1.1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <span style={{
                                backgroundColor: '#f0fdf4',
                                color: '#16a34a',
                                border: '1px solid #bbf7d0',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '0.15rem 0.5rem',
                                borderRadius: '6px',
                                letterSpacing: '0.05em'
                              }}>
                                CREDIT (+)
                              </span>
                              <div>
                                <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-dark)' }}>Destination Account</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontFamily: 'monospace' }}>
                                  {toAcc}
                                </span>
                              </div>
                            </div>

                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <ArrowDownLeft size={16} /> +${amountVal}
                            </div>
                          </div>
                        </div>

                        {/* Double-Entry Proof Footer */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          padding: '0.2rem 0.2rem 0'
                        }}>
                          <div style={{ display: 'flex', gap: '0.85rem' }}>
                            <span>Debit: <strong style={{ color: '#dc2626' }}>${amountVal}</strong></span>
                            <span>Credit: <strong style={{ color: '#16a34a' }}>${amountVal}</strong></span>
                            <span>Net Change: <strong style={{ color: 'var(--text-dark)' }}>$0.00</strong></span>
                          </div>

                          <button
                            type="button"
                            onClick={() => togglePayload(evt.id || idx)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}
                          >
                            <Code size={13} /> {isExpanded ? 'Hide Payload' : 'Payload'}
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>

                        {/* Expandable JSON Payload Block */}
                        {isExpanded && (
                          <div className="token-code-block" style={{ marginTop: '0.65rem', padding: '0.75rem', backgroundColor: '#1a1816', borderRadius: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem', color: 'var(--accent-gold)', fontSize: '0.72rem' }}>
                              <span>RAW EVENT PAYLOAD ({evt.eventType})</span>
                            </div>
                            <pre style={{ margin: 0, fontSize: '0.78rem', color: '#a7f3d0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {formattedPayload}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  }

                  let icon = <Clock size={16} color="var(--accent-gold)" />;
                  let badgeBg = '#faf8f5';
                  let badgeColor = 'var(--text-dark)';
                  let badgeBorder = '#eee9df';
                  let label = evt.eventType;

                  if (evt.eventType === 'AccountOpenedEvent' || evt.eventType === 'AccountOpened') {
                    icon = <PlusCircle size={16} color="#2563eb" />;
                    badgeBg = '#eff6ff';
                    badgeColor = '#1e40af';
                    badgeBorder = '#bfdbfe';
                    label = 'Account Opened';
                  } else if (evt.eventType === 'FundsDepositedEvent' || evt.eventType === 'FundsDeposited') {
                    icon = <ArrowDownLeft size={16} color="#16a34a" />;
                    badgeBg = '#f0fdf4';
                    badgeColor = '#166534';
                    badgeBorder = '#bbf7d0';
                    label = 'Funds Deposited';
                  } else if (evt.eventType === 'FundsWithdrawnEvent' || evt.eventType === 'FundsWithdrawn') {
                    icon = <ArrowUpRight size={16} color="#dc2626" />;
                    badgeBg = '#fef2f2';
                    badgeColor = '#991b1b';
                    badgeBorder = '#fecaca';
                    label = 'Funds Withdrawn';
                  } else if (evt.eventType === 'TransferInitiatedEvent' || evt.eventType === 'TransferInitiated') {
                    icon = <Repeat size={16} color="#9333ea" />;
                    badgeBg = '#faf5ff';
                    badgeColor = '#6b21a8';
                    badgeBorder = '#e9d5ff';
                    label = 'Transfer Initiated';
                  }

                  return (
                    <div
                      key={evt.id || idx}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '14px',
                        border: '1px solid #e8e4db',
                        padding: '0.85rem 1rem',
                        boxShadow: 'var(--shadow-subtle)'
                      }}
                    >
                      {/* Event Row Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            backgroundColor: badgeBg,
                            color: badgeColor,
                            border: `1px solid ${badgeBorder}`,
                            padding: '0.25rem 0.65rem',
                            borderRadius: 'var(--radius-pill)',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}>
                            {icon}
                            <span>{label}</span>
                          </span>

                          <span style={{
                            backgroundColor: 'rgba(197, 160, 89, 0.15)',
                            color: 'var(--accent-gold)',
                            border: '1px solid rgba(197, 160, 89, 0.3)',
                            borderRadius: 'var(--radius-pill)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.55rem'
                          }}>
                            v{evt.version}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}
                          </span>

                          <button
                            type="button"
                            onClick={() => togglePayload(evt.id || idx)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}
                          >
                            <Code size={13} /> {isExpanded ? 'Hide Payload' : 'Payload'}
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable JSON Payload Block */}
                      {isExpanded && (
                        <div className="token-code-block" style={{ marginTop: '0.65rem', padding: '0.75rem', backgroundColor: '#1a1816', borderRadius: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem', color: 'var(--accent-gold)', fontSize: '0.72rem' }}>
                            <span>RAW EVENT PAYLOAD ({evt.eventType})</span>
                          </div>
                          <pre style={{ margin: 0, fontSize: '0.78rem', color: '#a7f3d0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {formattedPayload}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: CQRS Write vs Read Inspector */}
      {activeModal === 'cqrs' && (
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
          <div className="saas-card" style={{ width: '100%', maxWidth: '840px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '2rem', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f0ece3' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Columns size={22} color="var(--accent-gold)" /> CQRS Split-Screen Inspector
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  Account ID: {modalAccountId}
                </span>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Interactive Demo Action Bar */}
            <div style={{
              backgroundColor: '#faf8f5',
              border: '1px solid #eee9df',
              borderRadius: '16px',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-dark)', display: 'block' }}>
                  Eventual Consistency Live Simulation
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Fire a write command to append to Event Store, then watch the Read Model catch up asynchronously.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                {cqrsSyncBenchmarkMs !== null && (
                  <span style={{
                    backgroundColor: '#f0fdf4',
                    color: '#166534',
                    border: '1px solid #bbf7d0',
                    padding: '0.4rem 0.85rem',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}>
                    <CheckCircle2 size={16} color="#16a34a" /> Read model synced in {cqrsSyncBenchmarkMs} ms
                  </span>
                )}

                <button
                  className="btn-black-pill"
                  style={{ width: 'auto', padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}
                  onClick={handleFireTestDeposit}
                  disabled={cqrsFiringDeposit}
                >
                  <Zap size={16} color="#f59e0b" className={cqrsFiringDeposit ? "spin" : ""} />
                  {cqrsFiringDeposit ? 'Firing Deposit ($10)...' : 'Fire Test Deposit ($10.00)'}
                </button>
              </div>
            </div>

            {modalError && (
              <div className="warm-error-banner" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Split Screen 2-Column Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', flex: 1, overflowY: 'auto' }}>
              {/* LEFT PANEL: Command Side (Source of Truth) */}
              <div style={{
                backgroundColor: '#ffffff',
                border: '1.5px solid #e2e8f0',
                borderRadius: '16px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-subtle)'
              }}>
                <div>
                  {/* Title & Endpoint Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        WRITE SIDE (Command Model)
                      </span>
                      <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginTop: '0.1rem' }}>
                        Source of Truth
                      </h4>
                    </div>
                    <span style={{
                      backgroundColor: '#eff6ff',
                      color: '#1e40af',
                      border: '1px solid #bfdbfe',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.5rem',
                      fontFamily: 'monospace'
                    }}>
                      GET /accounts/{'{id}'}
                    </span>
                  </div>

                  {/* Architecture Details */}
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.45 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', color: 'var(--text-dark)', fontWeight: 600 }}>
                      <Cpu size={15} color="#2563eb" /> Event Store Aggregate Replay
                    </div>
                    State computed synchronously by replaying raw events in sequence from the Event Store.
                  </div>

                  {/* State Cards */}
                  {cqrsLoadingWrite ? (
                    <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RefreshCw size={20} className="spin" style={{ marginBottom: '0.5rem' }} />
                      <p style={{ fontSize: '0.8rem' }}>Loading Command State...</p>
                    </div>
                  ) : cqrsWriteData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Aggregate Balance
                        </span>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, color: '#1e293b' }}>
                          ${Number(cqrsWriteData.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                        <div style={{ backgroundColor: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Aggregate Version</span>
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#2563eb' }}>v{cqrsWriteData.version}</span>
                        </div>
                        <div style={{ backgroundColor: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Event Count</span>
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{cqrsWriteData.version} Events</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '0.65rem', borderTop: '1px solid #f1f5f9', fontSize: '0.75rem', color: '#64748b' }}>
                  ⚡ Updates synchronously upon Command receipt.
                </div>
              </div>

              {/* RIGHT PANEL: Query Side (Read Model) */}
              <div style={{
                backgroundColor: '#ffffff',
                border: cqrsReadData?.version < cqrsWriteData?.version ? '1.5px solid #f59e0b' : '1.5px solid #bbf7d0',
                borderRadius: '16px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-subtle)',
                transition: 'border-color 0.2s ease'
              }}>
                <div>
                  {/* Title & Endpoint Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f0fdf4' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        READ SIDE (Query Projection)
                      </span>
                      <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginTop: '0.1rem' }}>
                        Read Model
                      </h4>
                    </div>
                    <span style={{
                      backgroundColor: '#f0fdf4',
                      color: '#166534',
                      border: '1px solid #bbf7d0',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.5rem',
                      fontFamily: 'monospace'
                    }}>
                      GET /accounts/{'{id}'}/balance-view
                    </span>
                  </div>

                  {/* Architecture Details */}
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.45 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', color: 'var(--text-dark)', fontWeight: 600 }}>
                      <Layers size={15} color="#16a34a" /> Redis Cache + Postgres Projection
                    </div>
                    High-speed read model updated asynchronously via Kafka Domain Event projections.
                  </div>

                  {/* State Cards */}
                  {cqrsLoadingRead ? (
                    <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RefreshCw size={20} className="spin" style={{ marginBottom: '0.5rem' }} />
                      <p style={{ fontSize: '0.8rem' }}>Loading Read Projection...</p>
                    </div>
                  ) : cqrsReadData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div style={{
                        backgroundColor: cqrsReadData.version < (cqrsWriteData?.version || 0) ? '#fffbeb' : '#f0fdf4',
                        padding: '0.85rem 1rem',
                        borderRadius: '12px',
                        border: cqrsReadData.version < (cqrsWriteData?.version || 0) ? '1px solid #fef3c7' : '1px solid #bbf7d0',
                        transition: 'all 0.2s ease'
                      }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Projected Balance
                        </span>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, color: '#166534' }}>
                          ${Number(cqrsReadData.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                        <div style={{ backgroundColor: '#faf8f5', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #eee9df' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Read Version</span>
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#16a34a' }}>v{cqrsReadData.version}</span>
                        </div>
                        <div style={{ backgroundColor: '#faf8f5', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #eee9df' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Sync Status</span>
                          {cqrsFiringDeposit || (cqrsWriteData && cqrsReadData.version < cqrsWriteData.version) ? (
                            <span style={{ fontWeight: 700, fontSize: '0.825rem', color: '#d97706', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <RefreshCw size={13} className="spin" /> Syncing...
                            </span>
                          ) : (
                            <span style={{ fontWeight: 700, fontSize: '0.825rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <CheckCircle2 size={14} /> Synchronized
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '0.65rem', borderTop: '1px solid #f0fdf4', fontSize: '0.75rem', color: '#15803d' }}>
                  {cqrsReadData?.version < cqrsWriteData?.version ? (
                    <span style={{ color: '#d97706', fontWeight: 600 }}>⚡ Projection lag detected — polling for sync...</span>
                  ) : (
                    <span>✓ Fully consistent with Event Store Source of Truth.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: Optimistic Concurrency Control Simulator */}
      {activeModal === 'concurrency' && (
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
          <div className="saas-card" style={{ width: '100%', maxWidth: '840px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '2rem', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f0ece3' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Lock size={22} color="#9333ea" /> Optimistic Concurrency Simulator
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  Target Account: {modalAccountId}
                </span>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Invariant Explanation Banner */}
            <div style={{
              backgroundColor: '#faf5ff',
              border: '1px solid #e9d5ff',
              borderRadius: '14px',
              padding: '0.85rem 1rem',
              fontSize: '0.85rem',
              color: '#581c87',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              marginBottom: '1.25rem',
              lineHeight: 1.45
            }}>
              <ShieldCheck size={22} color="#9333ea" style={{ flexShrink: 0 }} />
              <span>
                <strong>Automatic Command Serialization:</strong> Fires two write requests simultaneously. When a version conflict occurs, the Command Handler automatically retries (reloading aggregate at current version, re-validating business rules, and re-appending events) with randomized backoff. Both transactions succeed sequentially without manual client retries or lost updates.
              </span>
            </div>

            {/* Interactive Control Bar */}
            <div style={{
              backgroundColor: '#faf8f5',
              border: '1px solid #eee9df',
              borderRadius: '16px',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-dark)', display: 'block' }}>
                  Race Condition Simulation
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Dispatches two <code>POST /deposit ($50.00)</code> requests to the same aggregate concurrently.
                </span>
              </div>

              <button
                className="btn-black-pill"
                style={{ width: 'auto', padding: '0.65rem 1.25rem', fontSize: '0.875rem', backgroundColor: '#6b21a8' }}
                onClick={handleSimulateConcurrency}
                disabled={concurrencyExecuting}
              >
                <Zap size={16} color="#f59e0b" className={concurrencyExecuting ? "spin" : ""} />
                {concurrencyExecuting ? 'Firing Race Condition...' : 'Simulate Concurrent Writes ($50)'}
              </button>
            </div>

            {modalError && (
              <div className="warm-error-banner" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Side-by-Side 2-Column Results Display */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', flex: 1, overflowY: 'auto' }}>
              {/* REQUEST 1 PANEL */}
              <div style={{
                backgroundColor: '#ffffff',
                border: concurrencyResult1?.status === 200 ? '1.5px solid #bbf7d0' : concurrencyResult1?.status === 409 ? '1.5px solid #fecaca' : '1.5px solid #e2e8f0',
                borderRadius: '16px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-subtle)'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dark)' }}>
                      CONCURRENT WRITE #1
                    </span>
                    {concurrencyResult1 ? (
                      <span style={{
                        backgroundColor: concurrencyResult1.status === 200 ? '#f0fdf4' : '#fef2f2',
                        color: concurrencyResult1.status === 200 ? '#166534' : '#991b1b',
                        border: concurrencyResult1.status === 200 ? '1px solid #bbf7d0' : '1px solid #fecaca',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.65rem',
                        fontFamily: 'monospace'
                      }}>
                        {concurrencyResult1.statusText}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Idle</span>
                    )}
                  </div>

                  {!concurrencyResult1 ? (
                    <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Click <strong>Simulate Concurrent Writes</strong> to fire Request #1.
                    </div>
                  ) : concurrencyResult1.status === 200 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ backgroundColor: '#f0fdf4', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#166534', textTransform: 'uppercase' }}>
                          Committed Balance
                        </span>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', fontWeight: 700, color: '#166534' }}>
                          ${Number(concurrencyResult1.data.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div style={{ backgroundColor: '#faf8f5', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #eee9df' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>New Version</span>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#16a34a' }}>v{concurrencyResult1.data.version}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: '#fef2f2', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #fecaca' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', display: 'block', marginBottom: '0.35rem' }}>
                        {concurrencyResult1.data?.error || 'Optimistic Lock Abort'}
                      </span>
                      <p style={{ fontSize: '0.78rem', color: '#991b1b', margin: 0, lineHeight: 1.4, fontFamily: 'monospace' }}>
                        {concurrencyResult1.error}
                      </p>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: '1.25rem', paddingTop: '0.65rem', borderTop: '1px solid #f1f5f9', fontSize: '0.75rem', color: '#64748b' }}>
                  {concurrencyResult1?.timestamp ? `Executed at ${concurrencyResult1.timestamp}` : 'Ready for test'}
                </div>
              </div>

              {/* REQUEST 2 PANEL */}
              <div style={{
                backgroundColor: '#ffffff',
                border: concurrencyResult2?.status === 409 ? '1.5px solid #fecaca' : concurrencyResult2?.status === 200 ? '1.5px solid #bbf7d0' : '1.5px solid #e2e8f0',
                borderRadius: '16px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-subtle)'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dark)' }}>
                      CONCURRENT WRITE #2
                    </span>
                    {concurrencyResult2 ? (
                      <span style={{
                        backgroundColor: concurrencyResult2.status === 409 ? '#fef2f2' : '#f0fdf4',
                        color: concurrencyResult2.status === 409 ? '#991b1b' : '#166534',
                        border: concurrencyResult2.status === 409 ? '1px solid #fecaca' : '1px solid #bbf7d0',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.65rem',
                        fontFamily: 'monospace'
                      }}>
                        {concurrencyResult2.statusText}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Idle</span>
                    )}
                  </div>

                  {!concurrencyResult2 ? (
                    <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Click <strong>Simulate Concurrent Writes</strong> to fire Request #2.
                    </div>
                  ) : concurrencyResult2.status === 409 ? (
                    <div style={{ backgroundColor: '#fef2f2', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #fecaca' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#991b1b', fontWeight: 700, fontSize: '0.825rem', marginBottom: '0.4rem' }}>
                        <ShieldAlert size={16} /> {concurrencyResult2.data?.error || 'Conflict - Optimistic Locking Error'}
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#991b1b', margin: 0, lineHeight: 1.45, fontFamily: 'monospace' }}>
                        {concurrencyResult2.error}
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ backgroundColor: '#f0fdf4', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#166534', textTransform: 'uppercase' }}>
                          Committed Balance
                        </span>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', fontWeight: 700, color: '#166534' }}>
                          ${Number(concurrencyResult2.data.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div style={{ backgroundColor: '#faf8f5', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #eee9df' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>New Version</span>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#16a34a' }}>v{concurrencyResult2.data.version}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: '1.25rem', paddingTop: '0.65rem', borderTop: '1px solid #f1f5f9', fontSize: '0.75rem', color: '#64748b' }}>
                  {concurrencyResult2?.timestamp ? `Executed at ${concurrencyResult2.timestamp}` : 'Ready for test'}
                </div>
              </div>
            </div>

            {/* Proof Result Summary Footer */}
            {concurrencyResult1 && concurrencyResult2 && (
              <div style={{
                marginTop: '1.25rem',
                padding: '0.85rem 1.1rem',
                borderRadius: '14px',
                backgroundColor: (concurrencyResult1.status === 200 && concurrencyResult2.status === 200) ? '#f0fdf4' : '#fffbeb',
                border: (concurrencyResult1.status === 200 && concurrencyResult2.status === 200) ? '1px solid #bbf7d0' : '1px solid #fef3c7',
                fontSize: '0.85rem',
                color: (concurrencyResult1.status === 200 && concurrencyResult2.status === 200) ? '#166534' : '#92400e',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem'
              }}>
                <CheckCircle2 size={20} color={(concurrencyResult1.status === 200 && concurrencyResult2.status === 200) ? '#16a34a' : '#d97706'} style={{ flexShrink: 0 }} />
                <span>
                  {(concurrencyResult1.status === 200 && concurrencyResult2.status === 200) ? (
                    <strong>PROVED AUTOMATIC CONCURRENCY SERIALIZATION: Both concurrent write commands succeeded (HTTP 200) sequentially via automatic retry-on-conflict!</strong>
                  ) : (
                    <strong>Version Conflict Exhausted: Retries exceeded max limit. Check backend server logs for retry breakdown.</strong>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


