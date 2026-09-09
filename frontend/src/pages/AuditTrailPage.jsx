import React, { useState, useEffect } from 'react';
import { getHistoricalBalanceApi, getRegulatoryReportApi } from '../services/api';
import {
  ShieldAlert,
  History,
  FileText,
  Search,
  Calendar,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Hash,
  DollarSign,
  User,
  Layers,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Download
} from 'lucide-react';

export default function AuditTrailPage() {
  // Point-in-time state
  const [pitAccountId, setPitAccountId] = useState('');
  const [pitTimestamp, setPitTimestamp] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [pitResult, setPitResult] = useState(null);
  const [pitLoading, setPitLoading] = useState(false);
  const [pitError, setPitError] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Regulatory report state
  const [reportFrom, setReportFrom] = useState(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return new Date(sevenDaysAgo.getTime() - sevenDaysAgo.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [reportTo, setReportTo] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [reportResult, setReportResult] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  // Handle Point-in-time lookup
  const handlePitSubmit = async (e) => {
    e?.preventDefault();
    if (!pitAccountId.trim()) {
      setPitError('Please enter a valid Account ID');
      return;
    }
    setPitError(null);
    setPitLoading(true);

    try {
      let d = new Date(pitTimestamp);
      // If user provided datetime without seconds (length 16: YYYY-MM-DDTHH:mm),
      // set seconds to 59 and ms to 999 to cover all events in that minute!
      if (pitTimestamp && pitTimestamp.length === 16) {
        d.setSeconds(59, 999);
      } else if (pitTimestamp && pitTimestamp.length === 19) {
        d.setMilliseconds(999);
      }
      const isoTimestamp = d.toISOString();
      const data = await getHistoricalBalanceApi(pitAccountId.trim(), isoTimestamp);
      setPitResult(data);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to reconstruct historical balance';
      setPitError(msg);
    } finally {
      setPitLoading(false);
    }
  };

  // Handle Regulatory Report submit
  const handleReportSubmit = async (e) => {
    e?.preventDefault();
    setReportError(null);
    setReportLoading(true);

    try {
      let dFrom = new Date(reportFrom);
      let dTo = new Date(reportTo);
      if (reportTo && reportTo.length === 16) {
        dTo.setSeconds(59, 999);
      } else if (reportTo && reportTo.length === 19) {
        dTo.setMilliseconds(999);
      }
      const isoFrom = dFrom.toISOString();
      const isoTo = dTo.toISOString();
      const data = await getRegulatoryReportApi(isoFrom, isoTo);
      setReportResult(data);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to generate regulatory report';
      setReportError(msg);
    } finally {
      setReportLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!pitResult || !pitResult.replayedEvents || pitResult.replayedEvents.length === 0) return;
    const headers = ['version', 'event_type', 'amount', 'running_balance', 'timestamp'];
    const rows = pitResult.replayedEvents.map(e => [
      e.version,
      e.eventType,
      e.amount,
      e.runningBalance,
      `"${new Date(e.timestamp).toISOString()}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_replay_${pitResult.accountId}_v${pitResult.version}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Topbar */}
      <div className="dashboard-topbar">
        <div>
          <h1 className="dashboard-title" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ShieldAlert size={28} color="var(--accent-gold)" /> Audit & Compliance Trail
          </h1>
          <p className="dashboard-subtext">
            Tamper-evident event stream reconstruction & regulatory compliance reporting
          </p>
        </div>
        <span className="role-pill role-pill-admin" style={{ fontSize: '0.825rem', padding: '0.35rem 0.85rem' }}>
          ADMIN ONLY
        </span>
      </div>

      {/* SECTION 1: Point-in-Time Balance Reconstruction */}
      <div className="saas-card">
        <div className="card-header">
          <div className="card-title-group">
            <History size={22} color="var(--accent-gold)" />
            <h2 className="card-title">Point-In-Time Balance Lookup</h2>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            GET /audit/accounts/{'{id}'}/balance-at
          </span>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-body)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Replays domain events strictly from the append-only <code>audit_log</code> table up to the exact requested timestamp to reconstruct aggregate state as it existed at that moment.
        </p>

        <form onSubmit={handlePitSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.35rem' }}>
                ACCOUNT ID
              </label>
              <div className="pill-input-wrapper">
                <Search size={18} className="pill-input-icon" />
                <input
                  type="text"
                  className="pill-input"
                  placeholder="e.g. 2af83ff4-b6c5-4c4a-88ff-29a9a7958e64"
                  value={pitAccountId}
                  onChange={(e) => setPitAccountId(e.target.value)}
                />
              </div>

              {/* Quick Account Selector Chips */}
              {reportResult && reportResult.accountTransactionCounts && Object.keys(reportResult.accountTransactionCounts).length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Quick Select:</span>
                  {Object.keys(reportResult.accountTransactionCounts).slice(0, 3).map(accId => (
                    <button
                      key={accId}
                      type="button"
                      onClick={() => setPitAccountId(accId)}
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        cursor: 'pointer',
                        fontFamily: 'monospace'
                      }}
                    >
                      {accId.slice(0, 8)}...
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.35rem' }}>
                AS-OF TIMESTAMP (UTC / LOCAL)
              </label>
              <div className="pill-input-wrapper">
                <Clock size={18} className="pill-input-icon" />
                <input
                  type="datetime-local"
                  step="1"
                  className="pill-input"
                  value={pitTimestamp}
                  onChange={(e) => setPitTimestamp(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn-black-pill"
            style={{ width: 'fit-content', padding: '0.65rem 1.4rem' }}
            disabled={pitLoading}
          >
            {pitLoading ? 'Reconstructing State...' : (
              <>
                Reconstruct Historical Balance <History size={16} />
              </>
            )}
          </button>
        </form>

        {/* PIT Error Banner */}
        {pitError && (
          <div className="warm-error-banner" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{pitError}</span>
          </div>
        )}

        {/* PIT Result Card */}
        {pitResult && (
          <div style={{
            marginTop: '1.5rem',
            backgroundColor: '#faf8f5',
            border: '1.5px solid #eee9df',
            borderRadius: '16px',
            padding: '1.35rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.65rem', borderBottom: '1px solid #e8e4db' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', fontWeight: 700, fontSize: '0.9rem' }}>
                <CheckCircle2 size={18} /> Point-in-Time Reconstruction Result
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                Account: {pitResult.accountId}
              </span>
            </div>

            <div className="session-info-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div className="info-tile" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <span className="info-label" style={{ color: '#166534' }}>Reconstructed Balance</span>
                <div className="info-value" style={{ fontSize: '1.5rem', color: '#166534' }}>
                  ${Number(pitResult.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="info-tile">
                <span className="info-label">Historical Version</span>
                <div className="info-value" style={{ color: 'var(--accent-gold)' }}>
                  v{pitResult.version}
                </div>
              </div>

              <div className="info-tile">
                <span className="info-label">Events Replayed</span>
                <div className="info-value">
                  <Layers size={18} color="var(--accent-gold)" />
                  <span>{pitResult.eventsReplayedCount} Events</span>
                </div>
              </div>

              <div className="info-tile">
                <span className="info-label">Account Owner</span>
                <div className="info-value" style={{ fontSize: '0.95rem' }}>
                  <User size={16} />
                  <span>{pitResult.ownerName || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e8e4db', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={14} /> As-Of Timestamp: <strong>{new Date(pitResult.asOfTimestamp).toLocaleString()}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {pitResult.replayedEvents && pitResult.replayedEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadCsv}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      backgroundColor: 'var(--accent-black)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Download size={14} /> Export CSV
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowBreakdown(!showBreakdown)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #dcd6cd',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-dark)',
                    cursor: 'pointer'
                  }}
                >
                  {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>{showBreakdown ? 'Hide Breakdown' : `View Replay Breakdown (${pitResult.eventsReplayedCount})`}</span>
                </button>
              </div>
            </div>

            {/* Expandable Replay Breakdown Table (Matching Image 3) */}
            {showBreakdown && pitResult.replayedEvents && pitResult.replayedEvents.length > 0 && (
              <div style={{
                marginTop: '1rem',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e8e4db',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}>
                <div style={{ padding: '0.65rem 1rem', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dark)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                    Step-by-step Event Audit Trail & Running Balance (Up to As-Of Timestamp)
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {pitResult.replayedEvents.length} rows
                  </span>
                </div>

                <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#1e293b', color: '#f8fafc', textAlign: 'left', position: 'sticky', top: 0, zIndex: 10 }}>
                        <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>version</th>
                        <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>event_type</th>
                        <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'right' }}>amount</th>
                        <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'right' }}>running_balance</th>
                        <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, textAlign: 'center' }}>timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pitResult.replayedEvents.map((evt, idx) => {
                        const isDeposit = evt.eventType === 'FundsDepositedEvent' || evt.eventType === 'AccountOpenedEvent';
                        const isWithdraw = evt.eventType === 'FundsWithdrawnEvent';
                        const isTransfer = evt.eventType === 'TransferInitiatedEvent';
                        const amountColor = isDeposit ? '#15803d' : isWithdraw ? '#b91c1c' : '#475569';
                        const sign = isDeposit ? '+' : isWithdraw ? '-' : '';

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                              {evt.version}
                            </td>
                            <td style={{ padding: '0.6rem 0.85rem', color: '#0f172a', fontWeight: 600 }}>
                              <span style={{
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                backgroundColor: isDeposit ? '#f0fdf4' : isWithdraw ? '#fef2f2' : '#f1f5f9',
                                color: isDeposit ? '#166534' : isWithdraw ? '#991b1b' : '#334155',
                                fontSize: '0.78rem'
                              }}>
                                {evt.eventType}
                              </span>
                            </td>
                            <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: amountColor }}>
                              {isTransfer ? `$${Number(evt.amount).toFixed(2)} (Ref)` : `${sign}$${Number(evt.amount).toFixed(2)}`}
                            </td>
                            <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              ${Number(evt.runningBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '0.6rem 0.85rem', textAlign: 'center', color: '#64748b', fontSize: '0.75rem' }}>
                              {new Date(evt.timestamp).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: Regulatory Compliance Report */}
      <div className="saas-card">
        <div className="card-header">
          <div className="card-title-group">
            <FileText size={22} color="var(--accent-gold)" />
            <h2 className="card-title">Regulatory Compliance Report</h2>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            GET /audit/report
          </span>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-body)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Generates aggregate audit metrics (total transaction count, total financial volume, per-account breakdown) strictly from the tamper-evident <code>audit_log</code> table for compliance reporting.
        </p>

        <form onSubmit={handleReportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.35rem' }}>
                START DATE / TIME (FROM)
              </label>
              <div className="pill-input-wrapper">
                <Calendar size={18} className="pill-input-icon" />
                <input
                  type="datetime-local"
                  step="1"
                  className="pill-input"
                  value={reportFrom}
                  onChange={(e) => setReportFrom(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.35rem' }}>
                END DATE / TIME (TO)
              </label>
              <div className="pill-input-wrapper">
                <Calendar size={18} className="pill-input-icon" />
                <input
                  type="datetime-local"
                  step="1"
                  className="pill-input"
                  value={reportTo}
                  onChange={(e) => setReportTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn-black-pill"
            style={{ width: 'fit-content', padding: '0.65rem 1.4rem' }}
            disabled={reportLoading}
          >
            {reportLoading ? 'Generating Report...' : (
              <>
                Generate Regulatory Report <BarChart3 size={16} />
              </>
            )}
          </button>
        </form>

        {/* Report Error Banner */}
        {reportError && (
          <div className="warm-error-banner" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{reportError}</span>
          </div>
        )}

        {/* Report Result Display */}
        {reportResult && (
          <div style={{
            marginTop: '1.5rem',
            backgroundColor: '#faf8f5',
            border: '1.5px solid #eee9df',
            borderRadius: '16px',
            padding: '1.35rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.65rem', borderBottom: '1px solid #e8e4db' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-dark)', fontWeight: 700, fontSize: '0.95rem' }}>
                <CheckCircle2 size={18} color="#16a34a" /> Official Regulatory Compliance Report
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Generated At: {new Date(reportResult.reportGeneratedAt).toLocaleString()}
              </span>
            </div>

            {/* Metrics Tiles */}
            <div className="session-info-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="info-tile">
                <span className="info-label">Total Transactions</span>
                <div className="info-value" style={{ fontSize: '1.5rem' }}>
                  <Hash size={20} color="var(--accent-gold)" />
                  <span>{reportResult.totalTransactions}</span>
                </div>
              </div>

              <div className="info-tile">
                <span className="info-label">Total Financial Volume</span>
                <div className="info-value" style={{ fontSize: '1.5rem', color: 'var(--accent-black)' }}>
                  ${Number(reportResult.totalVolume || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="info-tile">
                <span className="info-label">Reporting Window</span>
                <div className="info-value" style={{ fontSize: '0.8rem', color: 'var(--text-body)', flexDirection: 'column', alignItems: 'flex-start', gap: '0.1rem' }}>
                  <div>From: <strong>{new Date(reportResult.from).toLocaleDateString()}</strong></div>
                  <div>To: <strong>{new Date(reportResult.to).toLocaleDateString()}</strong></div>
                </div>
              </div>
            </div>

            {/* Per-Account Transaction Count Breakdown */}
            <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <BarChart3 size={18} color="var(--accent-gold)" /> Per-Account Transaction Breakdown
            </h4>

            {Object.keys(reportResult.accountTransactionCounts || {}).length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e8e4db' }}>
                No recorded transaction events found within the selected reporting window.
              </div>
            ) : (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e8e4db', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-dark)' }}>Account ID</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-dark)', textAlign: 'right' }}>Event Count</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-dark)', width: '35%' }}>Activity Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(reportResult.accountTransactionCounts).map(([accId, count], idx) => {
                      const total = reportResult.totalTransactions || 1;
                      const percentage = Math.round((count / total) * 100);
                      return (
                        <tr key={accId} style={{ borderBottom: idx < Object.keys(reportResult.accountTransactionCounts).length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-dark)' }}>
                            {accId}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--accent-gold)' }}>
                            {count} events
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div style={{ flex: 1, backgroundColor: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${percentage}%`, backgroundColor: 'var(--accent-gold)', height: '100%', borderRadius: '4px' }} />
                              </div>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', width: '32px', textAlign: 'right' }}>
                                {percentage}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
