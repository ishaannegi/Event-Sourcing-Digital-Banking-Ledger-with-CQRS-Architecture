import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUserTransactionsApi } from '../services/api';
import {
  Repeat,
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  Search,
  Filter,
  Download,
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  X,
  Lock,
  Layers,
  Wallet,
  TrendingUp,
  TrendingDown,
  FileText,
  ChevronDown,
  Sparkles
} from 'lucide-react';

export default function TransactionsPage() {
  const { username, role } = useAuth();
  const isAdmin = role === 'ADMIN' || role === 'ROLE_ADMIN';

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL'); // 'ALL' | 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'
  const [dateRange, setDateRange] = useState('ALL'); // 'ALL' | 'TODAY' | '7D' | '30D'

  // Pagination / Click to expand state (initial visible items)
  const [visibleCount, setVisibleCount] = useState(15);

  // Modal inspection
  const [selectedTx, setSelectedTx] = useState(null);
  const [copiedHash, setCopiedHash] = useState(null);

  const fetchTransactions = async () => {
    setIsRefreshing(true);
    try {
      const data = await getUserTransactionsApi();
      setTransactions(data || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setError(err.response?.data?.message || 'Failed to load transaction history.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  // Reset pagination to 15 whenever filters change
  useEffect(() => {
    setVisibleCount(15);
  }, [selectedAccount, selectedType, dateRange, searchQuery]);

  // Unique account list from transactions
  const uniqueAccounts = useMemo(() => {
    const map = new Map();
    transactions.forEach((tx) => {
      if (tx.accountId && !map.has(tx.accountId)) {
        map.set(tx.accountId, tx.ownerName || 'User Account');
      }
    });
    return Array.from(map.entries()).map(([id, owner]) => ({ id, owner }));
  }, [transactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter((tx) => {
      // Account filter
      if (selectedAccount !== 'ALL' && tx.accountId !== selectedAccount) {
        return false;
      }

      // Type filter
      if (selectedType === 'DEPOSIT') {
        if (tx.typeLabel !== 'Deposit' && tx.typeLabel !== 'Account Opened') return false;
      } else if (selectedType === 'WITHDRAWAL') {
        if (tx.typeLabel !== 'Withdrawal') return false;
      } else if (selectedType === 'TRANSFER') {
        if (tx.typeLabel !== 'Transfer' && tx.typeLabel !== 'Transfer Sent' && tx.typeLabel !== 'Transfer Received') return false;
      }

      // Date Range filter
      if (dateRange !== 'ALL' && tx.createdAt) {
        const txDate = new Date(tx.createdAt);
        const diffMs = now - txDate;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (dateRange === 'TODAY' && diffDays > 1) return false;
        if (dateRange === '7D' && diffDays > 7) return false;
        if (dateRange === '30D' && diffDays > 30) return false;
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = (tx.description || '').toLowerCase().includes(q);
        const accMatch = (tx.accountId || '').toLowerCase().includes(q);
        const typeMatch = (tx.typeLabel || '').toLowerCase().includes(q);
        const amountMatch = (tx.amount?.toString() || '').includes(q);
        const hashMatch = (tx.hash || '').toLowerCase().includes(q);
        if (!descMatch && !accMatch && !typeMatch && !amountMatch && !hashMatch) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, selectedAccount, selectedType, dateRange, searchQuery]);

  // Sliced transactions based on click-to-expand visibleCount
  const displayedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, visibleCount);
  }, [filteredTransactions, visibleCount]);

  // Analytics Metrics (from filtered or total set)
  const metrics = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;

    filteredTransactions.forEach((tx) => {
      const amt = Number(tx.amount || 0);
      if (amt > 0) {
        totalInflow += amt;
      } else if (amt < 0) {
        totalOutflow += Math.abs(amt);
      }
    });

    const netFlow = totalInflow - totalOutflow;
    return {
      totalInflow,
      totalOutflow,
      netFlow,
      count: filteredTransactions.length
    };
  }, [filteredTransactions]);

  const hasActiveFilters = searchQuery.trim() !== '' || selectedAccount !== 'ALL' || selectedType !== 'ALL' || dateRange !== 'ALL';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedAccount('ALL');
    setSelectedType('ALL');
    setDateRange('ALL');
  };

  // CSV Export handler
  const handleExportCsv = () => {
    if (!filteredTransactions.length) return;

    const headers = ['Date', 'Account ID', 'Owner', 'Type', 'Description', 'Amount ($)', 'Running Balance ($)', 'Version', 'Hash'];
    const rows = filteredTransactions.map((tx) => [
      `"${tx.createdAt || ''}"`,
      `"${tx.accountId || ''}"`,
      `"${tx.ownerName || ''}"`,
      `"${tx.typeLabel || tx.eventType || ''}"`,
      `"${(tx.description || '').replace(/"/g, '""')}"`,
      (tx.amount ?? 0).toFixed(2),
      (tx.runningBalance ?? 0).toFixed(2),
      tx.version ?? '',
      `"${tx.hash || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `statement_${username}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(key);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Header Bar */}
      <div className="dashboard-topbar">
        <div>
          <h1 className="dashboard-title" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Repeat size={28} color="var(--accent-gold)" />
            <span>Transactions & Ledger Statement</span>
          </h1>
          <p className="dashboard-subtext">
            Immutable, cryptographically verified audit stream reconstructed directly from the PostgreSQL Event Store
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={fetchTransactions}
            className="btn-demo-pill"
            disabled={isRefreshing}
            style={{ padding: '0.5rem 1rem', fontSize: '0.825rem' }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'spin-icon' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={!filteredTransactions.length}
            className="btn-demo-pill"
            style={{
              padding: '0.5rem 1.1rem',
              fontSize: '0.825rem',
              backgroundColor: 'var(--accent-black)',
              color: '#ffffff',
              borderColor: 'var(--accent-black)'
            }}
          >
            <Download size={14} color="var(--accent-gold)" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="warm-error-banner">
          <ShieldCheck size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* SECTION 1: FINANCIAL FLOW METRIC CARDS (4 Column Responsive Grid) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {/* Inflow Card */}
        <div className="saas-card" style={{ padding: '1.35rem 1.6rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Inflow (Credits)
            </span>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowDownLeft size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#16a34a', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
            +${metrics.totalInflow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
            Deposits & Incoming transfers
          </span>
        </div>

        {/* Outflow Card */}
        <div className="saas-card" style={{ padding: '1.35rem 1.6rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Outflow (Debits)
            </span>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#dc2626', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
            -${metrics.totalOutflow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
            Withdrawals & Outgoing transfers
          </span>
        </div>

        {/* Net Flow Card */}
        <div className="saas-card" style={{ padding: '1.35rem 1.6rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Net Cash Flow
            </span>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: 'rgba(197, 160, 89, 0.15)', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: metrics.netFlow >= 0 ? 'var(--text-dark)' : '#dc2626', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
            {metrics.netFlow >= 0 ? '+' : ''}${metrics.netFlow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
            Net balance adjustment
          </span>
        </div>

        {/* Count Card */}
        <div className="saas-card" style={{ padding: '1.35rem 1.6rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Recorded Events
            </span>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#f8fafc', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-dark)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
            {metrics.count.toLocaleString()}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
            Cryptographically sealed blocks
          </span>
        </div>
      </div>

      {/* SECTION 2: SEARCH & FILTER TOOLBAR */}
      <div className="saas-card" style={{ padding: '1.25rem 1.6rem', marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search description, amount, or hash..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem 0.65rem 2.4rem',
                borderRadius: '12px',
                border: '1px solid #e2dcd0',
                backgroundColor: '#ffffff',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'border-color 0.15s ease'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '2px'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Account Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Account:</span>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={{
                padding: '0.55rem 0.85rem',
                borderRadius: '12px',
                border: '1px solid #e2dcd0',
                backgroundColor: '#ffffff',
                fontSize: '0.825rem',
                fontWeight: 600,
                color: 'var(--text-dark)',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Accounts ({uniqueAccounts.length})</option>
              {uniqueAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.id.slice(0, 8)}... ({acc.owner})
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f4efe6', padding: '0.3rem', borderRadius: '12px', gap: '0.3rem' }}>
            {['ALL', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER'].map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                style={{
                  border: 'none',
                  background: selectedType === type ? '#ffffff' : 'transparent',
                  color: selectedType === type ? 'var(--text-dark)' : 'var(--text-muted)',
                  fontWeight: selectedType === type ? 700 : 500,
                  fontSize: '0.75rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '9px',
                  cursor: 'pointer',
                  boxShadow: selectedType === type ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {type === 'ALL' ? 'All Types' : type.charAt(0) + type.slice(1).toLowerCase() + 's'}
              </button>
            ))}
          </div>

          {/* Date Range Selector */}
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f4efe6', padding: '0.3rem', borderRadius: '12px', gap: '0.3rem' }}>
            {[
              { id: 'ALL', label: 'All Time' },
              { id: 'TODAY', label: 'Today' },
              { id: '7D', label: '7 Days' },
              { id: '30D', label: '30 Days' }
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setDateRange(d.id)}
                style={{
                  border: 'none',
                  background: dateRange === d.id ? '#ffffff' : 'transparent',
                  color: dateRange === d.id ? 'var(--text-dark)' : 'var(--text-muted)',
                  fontWeight: dateRange === d.id ? 700 : 500,
                  fontSize: '0.75rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '9px',
                  cursor: 'pointer',
                  boxShadow: dateRange === d.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Reset Filters (if active) */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="btn-demo-pill"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5', backgroundColor: '#fff5f5' }}
            >
              <X size={12} />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 3: TRANSACTION STATEMENT TABLE (Scrollable with Click to Expand) */}
      <div className="saas-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.6rem', borderBottom: '1px solid #f0ece3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-dark)', fontFamily: 'var(--font-display)' }}>
              Ledger Event Statement
            </h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Showing {displayedTransactions.length} of {filteredTransactions.length} events
              {filteredTransactions.length < transactions.length && ` (filtered from ${transactions.length} total)`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {selectedType === 'TRANSFER' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: '#6b21a8', fontWeight: 700, backgroundColor: '#faf5ff', padding: '0.4rem 0.85rem', borderRadius: '50px', border: '1px solid #e9d5ff' }}>
                <Repeat size={14} />
                <span>Double-Entry Accounting Reconciled</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#16a34a', fontWeight: 700, backgroundColor: '#f0fdf4', padding: '0.4rem 0.85rem', borderRadius: '50px', border: '1px solid #bbf7d0' }}>
              <CheckCircle2 size={14} />
              <span>Cryptographic Sequence Verified</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin-icon" style={{ margin: '0 auto 1rem' }} />
            <p>Replaying and verifying transaction event stream...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={36} color="var(--accent-gold)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.25rem' }}>No Transactions Found</h3>
            <p style={{ fontSize: '0.825rem', marginBottom: '1rem' }}>No ledger events match the selected filters or search terms.</p>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="btn-demo-pill" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}>
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Scrollable Container with Sticky Table Header */}
            <div style={{ overflowX: 'auto', maxHeight: '580px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#faf8f5', borderBottom: '1px solid #eee9df' }}>
                  <tr style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '0.85rem 1.4rem' }}>Transaction & Type</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Account</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Description / Memo</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Running Balance</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Integrity</th>
                    <th style={{ padding: '0.85rem 1.4rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTransactions.map((tx, idx) => {
                    const amt = Number(tx.amount || 0);
                    const isPositive = amt > 0;
                    const isNegative = amt < 0;

                    let typeBg = '#f1f5f9';
                    let typeColor = '#475569';
                    let typeIcon = <Clock size={14} />;

                    if (tx.typeLabel === 'Transfer Sent') {
                      typeBg = '#fef2f2';
                      typeColor = '#dc2626';
                      typeIcon = <ArrowUpRight size={14} color="#dc2626" />;
                    } else if (tx.typeLabel === 'Transfer Received') {
                      typeBg = '#f0fdf4';
                      typeColor = '#16a34a';
                      typeIcon = <ArrowDownLeft size={14} color="#16a34a" />;
                    } else if (tx.typeLabel === 'Deposit' || tx.typeLabel === 'Account Opened') {
                      typeBg = '#f0fdf4';
                      typeColor = '#166534';
                      typeIcon = <ArrowDownLeft size={14} color="#16a34a" />;
                    } else if (tx.typeLabel === 'Withdrawal') {
                      typeBg = '#fef2f2';
                      typeColor = '#991b1b';
                      typeIcon = <ArrowUpRight size={14} color="#dc2626" />;
                    } else if (tx.typeLabel === 'Transfer') {
                      typeBg = isPositive ? '#f0fdf4' : '#fef2f2';
                      typeColor = isPositive ? '#16a34a' : '#dc2626';
                      typeIcon = isPositive ? <ArrowDownLeft size={14} color="#16a34a" /> : <ArrowUpRight size={14} color="#dc2626" />;
                    }

                    const formattedDate = tx.createdAt
                      ? new Date(tx.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'Unknown';

                    return (
                      <tr
                        key={tx.id || idx}
                        style={{
                          borderBottom: '1px solid #f6f3ed',
                          backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fdfcfb',
                          transition: 'background-color 0.1s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#faf7f2')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#fdfcfb')}
                      >
                        {/* Transaction & Type */}
                        <td style={{ padding: '0.9rem 1.4rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '10px',
                              backgroundColor: typeBg,
                              color: typeColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {typeIcon}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text-dark)', fontSize: '0.85rem' }}>
                                  {tx.typeLabel || tx.eventType}
                                </span>
                                {(tx.typeLabel === 'Transfer Sent' || tx.typeLabel === 'Withdrawal') && (
                                  <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#991b1b' }}>
                                    DEBIT
                                  </span>
                                )}
                                {(tx.typeLabel === 'Transfer Received' || tx.typeLabel === 'Deposit' || tx.typeLabel === 'Account Opened') && (
                                  <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#166534' }}>
                                    CREDIT
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {formattedDate} • <span style={{ fontFamily: 'monospace', color: 'var(--accent-gold)' }}>v{tx.version}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Account ID */}
                        <td style={{ padding: '0.9rem 1rem' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#faf8f5', padding: '0.2rem 0.5rem', borderRadius: '8px', border: '1px solid #eee9df' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-dark)' }}>
                              {tx.accountId ? `${tx.accountId.slice(0, 8)}...` : 'N/A'}
                            </span>
                            <button
                              onClick={() => copyToClipboard(tx.accountId, `acc_${idx}`)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}
                              title="Copy Account ID"
                            >
                              {copiedHash === `acc_${idx}` ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                            </button>
                          </div>
                          {isAdmin && tx.ownerName && (
                            <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {tx.ownerName}
                            </span>
                          )}
                        </td>

                        {/* Description */}
                        <td style={{ padding: '0.9rem 1rem', maxWidth: '280px' }}>
                          <span style={{ color: 'var(--text-dark)', fontSize: '0.825rem' }}>
                            {tx.description || 'Ledger event'}
                          </span>
                        </td>

                        {/* Amount */}
                        <td style={{ padding: '0.9rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{
                            fontWeight: 800,
                            fontSize: '0.9rem',
                            fontFamily: 'var(--font-display)',
                            color: isPositive ? '#16a34a' : isNegative ? '#dc2626' : 'var(--text-dark)'
                          }}>
                            {isPositive ? '+' : ''}${Math.abs(amt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>

                        {/* Running Balance */}
                        <td style={{ padding: '0.9rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-dark)', fontSize: '0.85rem' }}>
                            ${(tx.runningBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>

                        {/* Integrity Badges */}
                        <td style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                            {tx.hash && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                backgroundColor: '#f0fdf4',
                                color: '#166534',
                                border: '1px solid #bbf7d0',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '6px',
                                fontSize: '0.68rem',
                                fontWeight: 700
                              }}>
                                ✓ SHA-256
                              </span>
                            )}
                            {tx.pqcSignature && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                backgroundColor: 'rgba(197, 160, 89, 0.15)',
                                color: 'var(--accent-gold)',
                                border: '1px solid rgba(197, 160, 89, 0.3)',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '6px',
                                fontSize: '0.68rem',
                                fontWeight: 700
                              }}>
                                ✓ PQC
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '0.9rem 1.4rem', textAlign: 'right' }}>
                          <button
                            onClick={() => setSelectedTx(tx)}
                            className="btn-demo-pill"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.72rem' }}
                          >
                            <ShieldCheck size={12} color="var(--accent-gold)" />
                            <span>Inspect Proof</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* EXPANDER & PAGINATION CONTROLS BAR */}
            <div style={{
              padding: '1.1rem 1.6rem',
              borderTop: '1px solid #eee9df',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#faf8f5',
              flexWrap: 'wrap',
              gap: '0.85rem'
            }}>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                Showing <strong style={{ color: 'var(--text-dark)' }}>{displayedTransactions.length}</strong> of{' '}
                <strong style={{ color: 'var(--text-dark)' }}>{filteredTransactions.length}</strong> events
                {filteredTransactions.length < transactions.length && (
                  <span style={{ marginLeft: '0.35rem' }}>
                    (from {transactions.length} total)
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {visibleCount < filteredTransactions.length && (
                  <>
                    <button
                      onClick={() => setVisibleCount((prev) => Math.min(prev + 20, filteredTransactions.length))}
                      className="btn-demo-pill"
                      style={{
                        padding: '0.45rem 1rem',
                        fontSize: '0.8rem',
                        backgroundColor: '#ffffff',
                        borderColor: '#e2dcd0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <ChevronDown size={14} />
                      <span>Show Next 20</span>
                    </button>

                    <button
                      onClick={() => setVisibleCount(filteredTransactions.length)}
                      className="btn-demo-pill"
                      style={{
                        padding: '0.45rem 1.1rem',
                        fontSize: '0.8rem',
                        backgroundColor: 'var(--accent-black)',
                        color: '#ffffff',
                        borderColor: 'var(--accent-black)'
                      }}
                    >
                      <span>Expand All ({filteredTransactions.length})</span>
                    </button>
                  </>
                )}

                {visibleCount > 15 && (
                  <button
                    onClick={() => setVisibleCount(15)}
                    className="btn-demo-pill"
                    style={{
                      padding: '0.45rem 0.9rem',
                      fontSize: '0.8rem',
                      backgroundColor: '#ffffff',
                      color: 'var(--text-muted)',
                      borderColor: '#e2dcd0'
                    }}
                  >
                    <span>Collapse to 15</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODAL: CRYPTOGRAPHIC EVENT PROOF INSPECTOR */}
      {selectedTx && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(26, 24, 22, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          zIndex: 1000
        }}>
          <div className="saas-card" style={{ width: '100%', maxWidth: '750px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: '2rem', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #eee9df' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={22} color="var(--accent-gold)" />
                  <span>Cryptographic Event Proof</span>
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Block Version {selectedTx.version} • {selectedTx.typeLabel || selectedTx.eventType}
                </span>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Event Metadata Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', backgroundColor: '#faf8f5', padding: '1rem', borderRadius: '14px', border: '1px solid #eee9df' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>ACCOUNT ID</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace' }}>{selectedTx.accountId}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>EVENT TIMESTAMP</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{selectedTx.createdAt}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>TRANSACTION AMOUNT</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: Number(selectedTx.amount) >= 0 ? '#16a34a' : '#dc2626' }}>
                    ${Number(selectedTx.amount).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>RUNNING BALANCE</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                    ${Number(selectedTx.runningBalance || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Hash Chain Block */}
              <div style={{ backgroundColor: '#1a1816', color: '#ffffff', borderRadius: '14px', padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                    SHA-256 HASH CHAIN LINKAGE
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <CheckCircle2 size={12} /> INTACT
                  </span>
                </div>

                <div style={{ marginBottom: '0.65rem' }}>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>PREVIOUS BLOCK HASH:</span>
                  <code style={{ fontSize: '0.72rem', color: '#e2e8f0', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                    {selectedTx.previousHash || '(Genesis Block - Hash Zero)'}
                  </code>
                </div>

                <div>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>CURRENT EVENT HASH:</span>
                  <code style={{ fontSize: '0.72rem', color: '#a7f3d0', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                    {selectedTx.hash}
                  </code>
                </div>
              </div>

              {/* PQC Signature Block */}
              {selectedTx.pqcSignature && (
                <div style={{ backgroundColor: '#faf8f5', borderRadius: '14px', padding: '1rem 1.25rem', border: '1px solid #eee9df' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dark)' }}>
                      POST-QUANTUM DIGITAL SIGNATURE ({selectedTx.signatureAlgorithm || 'DILITHIUM3'})
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedTx.pqcSignature, 'sig')}
                      className="btn-demo-pill"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.68rem' }}
                    >
                      {copiedHash === 'sig' ? <Check size={11} color="#16a34a" /> : <Copy size={11} />}
                      <span>{copiedHash === 'sig' ? 'Copied' : 'Copy Signature'}</span>
                    </button>
                  </div>
                  <pre style={{ margin: 0, fontSize: '0.68rem', color: '#475569', wordBreak: 'break-all', whiteSpace: 'pre-wrap', maxHeight: '70px', overflowY: 'auto' }}>
                    {selectedTx.pqcSignature}
                  </pre>
                </div>
              )}

              {/* Raw JSON Payload */}
              <div style={{ backgroundColor: '#0f172a', borderRadius: '14px', padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>
                    RAW EVENT STORE PAYLOAD
                  </span>
                  <button
                    onClick={() => copyToClipboard(selectedTx.rawPayload, 'payload')}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    {copiedHash === 'payload' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                    <span>{copiedHash === 'payload' ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre style={{ margin: 0, fontSize: '0.72rem', color: '#f8fafc', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '140px', overflowY: 'auto' }}>
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedTx.rawPayload), null, 2);
                    } catch {
                      return selectedTx.rawPayload;
                    }
                  })()}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #eee9df', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedTx(null)}
                className="btn-demo-pill"
                style={{ padding: '0.5rem 1.25rem', fontSize: '0.825rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
