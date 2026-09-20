import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getRegulatoryReportApi,
  getAccountEventsApi,
  getAccountApi
} from '../services/api';
import AccountsPage from './AccountsPage';
import AuditTrailPage from './AuditTrailPage';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar
} from 'recharts';
import {
  LayoutDashboard,
  CreditCard,
  Repeat,
  ShieldAlert,
  LogOut,
  PlusCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  Activity,
  Layers,
  Zap,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Clock,
  Cpu,
  RefreshCw,
  Sparkles,
  Search,
  CheckCircle2,
  DollarSign,
  History,
  Lock
} from 'lucide-react';

export default function DashboardPage() {
  const { username, role, logout } = useAuth();
  const isAdmin = role === 'ADMIN' || role === 'ROLE_ADMIN';

  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'accounts' | 'audit'

  // Dashboard Metrics & Chart State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [accountList, setAccountList] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [totalCombinedBalance, setTotalCombinedBalance] = useState(0);
  const [totalDepositsSum, setTotalDepositsSum] = useState(0);
  const [totalWithdrawalsSum, setTotalWithdrawalsSum] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch real portal data across accounts & event streams
  const fetchDashboardData = async () => {
    setIsRefreshing(true);
    try {
      // 1. Fetch regulatory report for overall metrics
      const now = new Date();
      const pastYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const report = await getRegulatoryReportApi(pastYear.toISOString(), now.toISOString());
      setReportData(report);

      const accCounts = report.accountTransactionCounts || {};
      const accountIds = Object.keys(accCounts);

      let aggregatedBalance = 0;
      let sumDeposits = 0;
      let sumWithdrawals = 0;
      let allEventsCollected = [];
      let accountsDetail = [];

      // 2. Fetch events & balance view for each aggregate account
      for (const accId of accountIds) {
        try {
          const [accDetails, events] = await Promise.all([
            getAccountApi(accId).catch(() => null),
            getAccountEventsApi(accId).catch(() => [])
          ]);

          if (accDetails) {
            accountsDetail.push(accDetails);
            aggregatedBalance += Number(accDetails.balance || 0);
          }

          if (events && events.length > 0) {
            allEventsCollected.push(...events);
          }
        } catch (err) {
          console.warn(`Failed to fetch event stream for account ${accId}:`, err);
        }
      }

      setAccountList(accountsDetail);
      setTotalCombinedBalance(aggregatedBalance);

      // 3. Process events to build sums, activity feed, and time-series chart data
      allEventsCollected.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setRecentEvents(allEventsCollected.slice(0, 25)); // Top 25 recent events

      // Build daily time-series aggregation for Recharts
      const dateMap = {};

      allEventsCollected.forEach(ev => {
        const dateStr = new Date(ev.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (!dateMap[dateStr]) {
          dateMap[dateStr] = { date: dateStr, deposits: 0, withdrawals: 0, rawDate: new Date(ev.createdAt) };
        }

        const amt = Number(ev.amount || 0);
        if (ev.eventType === 'FundsDepositedEvent' || ev.eventType === 'AccountOpenedEvent') {
          sumDeposits += amt;
          dateMap[dateStr].deposits += amt;
        } else if (ev.eventType === 'FundsWithdrawnEvent' || ev.eventType === 'TransferInitiatedEvent') {
          sumWithdrawals += amt;
          dateMap[dateStr].withdrawals += amt;
        }
      });

      setTotalDepositsSum(sumDeposits);
      setTotalWithdrawalsSum(sumWithdrawals);

      // Convert dateMap to sorted array for chart
      const chartArray = Object.values(dateMap)
        .sort((a, b) => a.rawDate - b.rawDate)
        .slice(-14); // Last 14 active days

      setChartData(chartArray);
      setError(null);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load live dashboard data');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const timer = setInterval(() => {
      fetchDashboardData();
    }, 15000); // Periodic live refresh every 15 seconds
    return () => clearInterval(timer);
  }, []);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  };

  const getEventIcon = (type) => {
    switch (type) {
      case 'FundsDepositedEvent':
        return <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#15803d', flexShrink: 0 }}><ArrowDownLeft size={18} /></div>;
      case 'FundsWithdrawnEvent':
        return <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c', flexShrink: 0 }}><ArrowUpRight size={18} /></div>;
      case 'TransferInitiatedEvent':
        return <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309', flexShrink: 0 }}><ArrowRightLeft size={18} /></div>;
      case 'AccountOpenedEvent':
      default:
        return <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0369a1', flexShrink: 0 }}><Sparkles size={18} /></div>;
    }
  };

  const getEventLabel = (type) => {
    switch (type) {
      case 'FundsDepositedEvent': return 'Deposit Received';
      case 'FundsWithdrawnEvent': return 'Funds Withdrawal';
      case 'TransferInitiatedEvent': return 'Account Transfer';
      case 'AccountOpenedEvent': return 'Account Opened';
      default: return type;
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Left Sidebar */}
      <aside className="sidebar">
        <div>
          {/* Sidebar Brand Logo */}
          <div className="sidebar-brand">
            <span style={{ color: 'var(--accent-gold)', fontSize: '1.25rem' }}>✦</span>
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
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dark)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Topbar */}
            <div className="dashboard-topbar">
              <div>
                <h1 className="dashboard-title">Welcome back, {username}!</h1>
                <p className="dashboard-subtext">
                  CQRS Architecture & Post-Quantum Event-Sourced Banking Portal
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <button
                  onClick={fetchDashboardData}
                  className="btn-demo-pill"
                  disabled={isRefreshing}
                  style={{ padding: '0.5rem 1.1rem', fontSize: '0.825rem' }}
                >
                  <RefreshCw size={14} className={isRefreshing ? 'spin-icon' : ''} /> {isRefreshing ? 'Refreshing...' : 'Refresh Live'}
                </button>
                <button
                  onClick={logout}
                  className="btn-demo-pill"
                  style={{ padding: '0.5rem 1.1rem', fontSize: '0.825rem' }}
                >
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            </div>

            {/* Error Notification Banner */}
            {error && (
              <div className="warm-error-banner" style={{ marginBottom: 0 }}>
                <ShieldAlert size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* SECTION 1: HERO BANK CARD WIDGET (Gold/Black Gradient Theme) */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1a1816 100%)',
              borderRadius: '24px',
              padding: '2.25rem 2.5rem',
              color: '#ffffff',
              boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.4)',
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid rgba(197, 160, 89, 0.3)'
            }}>
              {/* Decorative Subtle Gold Shimmer Circles */}
              <div style={{
                position: 'absolute',
                top: '-40px',
                right: '-40px',
                width: '240px',
                height: '240px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(197, 160, 89, 0.18) 0%, transparent 70%)',
                pointerEvents: 'none'
              }} />

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1.5rem',
                position: 'relative',
                zIndex: 2
              }}>
                {/* Hero Balance Text & Details */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--accent-gold-light)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}>
                      <Sparkles size={14} /> Total Combined Balance (All Accounts)
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.12)',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '50px',
                      color: '#cbd5e1'
                    }}>
                      CQRS Real-Time Projection
                    </span>
                  </div>

                  <h2 style={{
                    fontSize: '2.75rem',
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: '#ffffff',
                    lineHeight: 1.1,
                    margin: '0.25rem 0 0.5rem 0'
                  }}>
                    {loading ? '$ ...' : formatCurrency(totalCombinedBalance)}
                  </h2>

                  <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0 }}>
                    Strictly reconstructed from append-only PostgreSQL Event Store & Redis Read Models
                  </p>
                </div>

                {/* Hero Card Quick Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setActiveTab('accounts')}
                    className="btn-gold-pill"
                    style={{
                      padding: '0.75rem 1.4rem',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      borderRadius: '50px',
                      backgroundColor: 'var(--accent-gold)',
                      color: '#ffffff',
                      border: 'none',
                      boxShadow: '0 4px 14px rgba(197, 160, 89, 0.35)',
                      cursor: 'pointer'
                    }}
                  >
                    <PlusCircle size={18} /> Manage Deposits
                  </button>

                  <button
                    onClick={() => setActiveTab('accounts')}
                    style={{
                      padding: '0.75rem 1.4rem',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      borderRadius: '50px',
                      backgroundColor: 'rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      backdropFilter: 'blur(8px)',
                      cursor: 'pointer'
                    }}
                  >
                    <Repeat size={18} /> Fast Transfer
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => setActiveTab('audit')}
                      style={{
                        padding: '0.75rem 1.4rem',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        borderRadius: '50px',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: 'var(--accent-gold-light)',
                        border: '1px solid rgba(197, 160, 89, 0.4)',
                        cursor: 'pointer'
                      }}
                    >
                      <ShieldCheck size={18} /> Verify Chain
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2: 4 STAT CARDS IN A ROW */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              {/* Stat Card 1: Total Accounts */}
              <div className="saas-card" style={{ padding: '1.35rem 1.5rem', marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Active Accounts
                  </span>
                  <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' }}>
                    <CreditCard size={18} />
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-dark)' }}>
                  {loading ? '...' : accountList.length}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>
                  <TrendingUp size={14} /> <span>100% Active in Aggregate</span>
                </div>
              </div>

              {/* Stat Card 2: Events Processed */}
              <div className="saas-card" style={{ padding: '1.35rem 1.5rem', marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Events Processed
                  </span>
                  <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
                    <Layers size={18} />
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-dark)' }}>
                  {loading ? '...' : (reportData?.totalTransactions || recentEvents.length || 0)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--accent-gold)', fontWeight: 600 }}>
                  <Zap size={14} /> <span>Kafka Event-Streamed</span>
                </div>
              </div>

              {/* Stat Card 3: Total Deposits Sum */}
              <div className="saas-card" style={{ padding: '1.35rem 1.5rem', marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total Deposits (Sum)
                  </span>
                  <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#15803d' }}>
                    <ArrowDownLeft size={18} />
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#166534' }}>
                  {loading ? '$ ...' : formatCurrency(totalDepositsSum)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>
                  <TrendingUp size={14} /> <span>Total Inflow Credit</span>
                </div>
              </div>

              {/* Stat Card 4: Total Withdrawals Sum */}
              <div className="saas-card" style={{ padding: '1.35rem 1.5rem', marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total Withdrawals (Sum)
                  </span>
                  <div style={{ width: '38px', height: '38px', borderRadius: '12px', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b91c1c' }}>
                    <ArrowUpRight size={18} />
                  </div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#991b1b' }}>
                  {loading ? '$ ...' : formatCurrency(totalWithdrawalsSum)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                  <TrendingDown size={14} /> <span>Total Outflow Debit</span>
                </div>
              </div>
            </div>

            {/* SECTION 3: TWO-COLUMN CHARTS + LIVE ACTIVITY FEED */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1.1fr)', gap: '1.5rem' }}>
              {/* LEFT COLUMN: Deposits vs Withdrawals Chart */}
              <div className="saas-card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
                <div className="card-header" style={{ marginBottom: '1.25rem' }}>
                  <div className="card-title-group">
                    <Activity size={20} color="var(--accent-gold)" />
                    <h2 className="card-title">Transaction Volume & Cashflow Over Time</h2>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Recharts Real Event Stream
                  </span>
                </div>

                <div style={{ width: '100%', height: '320px', marginTop: '0.5rem' }}>
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorDeposits" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="colorWithdrawals" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            border: 'none',
                            borderRadius: '12px',
                            color: '#ffffff',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                          }}
                          formatter={(value) => [formatCurrency(value)]}
                        />
                        <Area
                          type="monotone"
                          dataKey="deposits"
                          name="Deposits ($)"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorDeposits)"
                        />
                        <Area
                          type="monotone"
                          dataKey="withdrawals"
                          name="Withdrawals ($)"
                          stroke="#ef4444"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorWithdrawals)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {loading ? 'Rendering financial charts...' : 'No transaction event history to plot.'}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: Live Activity Feed */}
              <div className="saas-card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
                <div className="card-header" style={{ marginBottom: '1rem' }}>
                  <div className="card-title-group">
                    <Clock size={20} color="var(--accent-gold)" />
                    <h2 className="card-title">Live Activity Feed</h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
                    <span>LIVE</span>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  maxHeight: '320px',
                  overflowY: 'auto',
                  paddingRight: '0.35rem'
                }}>
                  {recentEvents.length > 0 ? (
                    recentEvents.map((ev, idx) => (
                      <div
                        key={ev.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem 0.85rem',
                          borderRadius: '12px',
                          backgroundColor: '#f8fafc',
                          border: '1px solid #f1f5f9',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {getEventIcon(ev.eventType)}
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dark)' }}>
                              {getEventLabel(ev.eventType)}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              Account: {ev.aggregateId ? ev.aggregateId.slice(0, 8) + '...' : 'N/A'} • v{ev.version}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontSize: '0.875rem',
                            fontWeight: 800,
                            color: ev.eventType === 'FundsDepositedEvent' || ev.eventType === 'AccountOpenedEvent' ? '#166534' : '#991b1b'
                          }}>
                            {ev.eventType === 'FundsDepositedEvent' || ev.eventType === 'AccountOpenedEvent' ? '+' : '-'}
                            {formatCurrency(ev.amount)}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      {loading ? 'Fetching live event stream...' : 'No activity logs found in Event Store.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 4: "QUICK ACTIONS" ICON-GRID ROW */}
            <div className="saas-card" style={{ marginBottom: 0 }}>
              <div className="card-header" style={{ marginBottom: '1.25rem' }}>
                <div className="card-title-group">
                  <Zap size={20} color="var(--accent-gold)" />
                  <h2 className="card-title">Quick Banking Shortcuts</h2>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {/* Action 1: Open Account */}
                <div
                  onClick={() => setActiveTab('accounts')}
                  style={{
                    backgroundColor: '#faf7f2',
                    border: '1.5px solid #e8d9b8',
                    borderRadius: '16px',
                    padding: '1.1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease, boxShadow 0.2s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: 'var(--accent-black)', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <PlusCircle size={22} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-dark)' }}>Open New Account</div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Append-Only Initial State</span>
                  </div>
                </div>

                {/* Action 2: View Accounts */}
                <div
                  onClick={() => setActiveTab('accounts')}
                  style={{
                    backgroundColor: '#faf7f2',
                    border: '1.5px solid #e8d9b8',
                    borderRadius: '16px',
                    padding: '1.1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease, boxShadow 0.2s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: 'var(--accent-black)', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CreditCard size={22} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-dark)' }}>View Accounts & Cache</div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CQRS Fast Read Models</span>
                  </div>
                </div>

                {/* Action 3: Audit Trail (Admin) */}
                {isAdmin ? (
                  <div
                    onClick={() => setActiveTab('audit')}
                    style={{
                      backgroundColor: '#faf7f2',
                      border: '1.5px solid #e8d9b8',
                      borderRadius: '16px',
                      padding: '1.1rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      cursor: 'pointer',
                      transition: 'transform 0.2s ease, boxShadow 0.2s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: 'var(--accent-black)', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ShieldCheck size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-dark)' }}>Audit & Compliance</div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Post-Quantum Cryptography</span>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '16px',
                    padding: '1.1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    opacity: 0.7
                  }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#cbd5e1', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Lock size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#64748b' }}>Audit Trail (Admin Only)</div>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Restricted Access</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 5: "ARCHITECTURE SNAPSHOT" STATUS CHIP ROW */}
            <div className="saas-card" style={{ marginBottom: 0, padding: '1.25rem 1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-dark)' }}>
                  <Cpu size={18} color="var(--accent-gold)" />
                  <span>Architecture Core System Status:</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '0.35rem 0.75rem', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 700 }}>
                    <CheckCircle2 size={14} color="#16a34a" /> Event Sourcing (Append-Only)
                  </span>

                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '0.35rem 0.75rem', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 700 }}>
                    <CheckCircle2 size={14} color="#16a34a" /> CQRS Architecture (Read/Write Split)
                  </span>

                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '0.35rem 0.75rem', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 700 }}>
                    <CheckCircle2 size={14} color="#16a34a" /> Apache Kafka (Event Bus)
                  </span>

                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '0.35rem 0.75rem', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 700 }}>
                    <CheckCircle2 size={14} color="#16a34a" /> Redis Cache (Sub-Millisecond Read)
                  </span>

                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '0.35rem 0.75rem', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 700 }}>
                    <CheckCircle2 size={14} color="#16a34a" /> Post-Quantum Signed (ML-DSA-65)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
