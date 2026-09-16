import React, { useState, useEffect, useCallback } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { StatCard } from '../../components/StatCard';

export function ManagerAnalyticsPage() {
  const { currentOrg } = useTenant();

  // Date range preset options
  const [preset, setPreset] = useState('30d'); // 7d, 30d, month, custom
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Helper to calculate date range based on preset
  const calculatePresetDates = (presetKey) => {
    const today = new Date();
    const endStr = today.toISOString().split('T')[0];
    let start = new Date();

    if (presetKey === '7d') {
      start.setDate(today.getDate() - 7);
    } else if (presetKey === '30d') {
      start.setDate(today.getDate() - 30);
    } else if (presetKey === 'month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
      return { start: startDate, end: endDate };
    }

    const startStr = start.toISOString().split('T')[0];
    return { start: startStr, end: endStr };
  };

  const fetchAnalytics = useCallback(async (startStr, endStr) => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);

    try {
      const params = {};
      if (startStr) params.start_date = startStr;
      if (endStr) params.end_date = endStr;

      const data = await managerService.getAnalyticsSummary(currentOrg.id, params);
      setAnalytics(data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load operational analytics.');
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    if (!currentOrg?.id) {
      setLoading(false);
      return;
    }
    const { start, end } = calculatePresetDates(preset);
    setStartDate(start);
    setEndDate(end);
    fetchAnalytics(start, end);
  }, [currentOrg?.id, preset, fetchAnalytics]);

  const handleApplyCustomFilter = (e) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError('Both Start Date and End Date are required for custom date range.');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError('Start Date cannot be after End Date.');
      return;
    }
    setPreset('custom');
    fetchAnalytics(startDate, endDate);
  };

  const handlePresetSelect = (pKey) => {
    setPreset(pKey);
    const { start, end } = calculatePresetDates(pKey);
    setStartDate(start);
    setEndDate(end);
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the top selector to view analytics."
      />
    );
  }

  const summary = analytics?.summary || {};
  const statusCounts = analytics?.status_counts || {};
  const ratingDist = analytics?.rating_distribution || {};
  const queueSummary = analytics?.queue_summary || {};
  const trend = analytics?.appointment_trend || [];
  const providers = analytics?.providers || [];
  const services = analytics?.services || [];

  // Compute trend max for responsive chart scaling
  const maxTrendVal = Math.max(...trend.map((t) => t.total || 0), 5);

  return (
    <div className="app-container animate-page-entrance">
      {/* Header & Date Selector Toolbar */}
      <div
        className="card"
        style={{
          marginBottom: '1.75rem',
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="flex justify-between items-center flex-wrap gap-md">
          <div>
            <span className="badge badge-info" style={{ marginBottom: '0.4rem' }}>
              Operational Analytics & Telemetry
            </span>
            <h1 style={{ marginTop: '0.25rem' }}>Reporting Dashboard</h1>
            <p className="subtitle" style={{ marginTop: '0.25rem' }}>
              Factual metrics & performance outcomes for <strong>{currentOrg.name}</strong>.
            </p>
          </div>

          <div className="flex items-center gap-sm flex-wrap">
            {lastUpdated && (
              <span className="text-xs text-muted">
                Last updated: <strong>{lastUpdated}</strong>
              </span>
            )}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => fetchAnalytics(startDate, endDate)}
              disabled={loading}
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Date Filter Toolbar */}
        <div
          style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div className="flex items-center gap-xs flex-wrap">
            <span className="text-xs text-muted font-semibold" style={{ marginRight: '0.5rem', textTransform: 'uppercase' }}>
              Timeframe:
            </span>
            <button
              className={`btn btn-sm ${preset === '7d' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handlePresetSelect('7d')}
            >
              Last 7 Days
            </button>
            <button
              className={`btn btn-sm ${preset === '30d' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handlePresetSelect('30d')}
            >
              Last 30 Days
            </button>
            <button
              className={`btn btn-sm ${preset === 'month' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handlePresetSelect('month')}
            >
              This Month
            </button>
          </div>

          <form onSubmit={handleApplyCustomFilter} className="flex items-center gap-xs flex-wrap">
            <span className="text-xs text-muted font-semibold">Custom:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPreset('custom');
              }}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-subtle)',
                fontSize: '0.85rem',
              }}
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPreset('custom');
              }}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-subtle)',
                fontSize: '0.85rem',
              }}
            />
            <button type="submit" className="btn btn-secondary btn-sm">
              Apply Filter
            </button>
          </form>
        </div>
      </div>

      {error && (
        <div
          className="error-banner"
          style={{
            padding: '1rem',
            background: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <LoadingState type="skeleton-card" rows={4} />
      ) : !analytics ? (
        <EmptyState title="No Analytics Available" message="No operational data recorded for the selected timeframe." />
      ) : (
        <>
          {/* Core KPI Cards Grid */}
          <div className="grid-responsive grid-cols-3 animate-section stagger-1" style={{ marginBottom: '1.75rem' }}>
            <StatCard
              title="Total Appointments"
              value={summary.total_appointments || 0}
              icon="📅"
              subtitle={`In range (${analytics.period?.start_date} to ${analytics.period?.end_date})`}
              color="primary"
            />
            <StatCard
              title="Completed Services"
              value={summary.completed || 0}
              icon="✓"
              subtitle={`Completion rate: ${summary.completion_rate || 0}%`}
              color="success"
            />
            <StatCard
              title="Check-In Rate"
              value={`${summary.check_in_rate || 0}%`}
              icon="🎫"
              subtitle="Confirmed bookings checked in"
              color="info"
            />
            <StatCard
              title="Unfulfilled (Cancelled/No-Show)"
              value={(summary.cancelled || 0) + (summary.no_show || 0)}
              icon="✖"
              subtitle={`Cancelled: ${summary.cancelled || 0} • No-Show: ${summary.no_show || 0}`}
              color="danger"
            />
            <StatCard
              title="Average Rating"
              value={summary.average_rating ? `${summary.average_rating} ★` : 'N/A'}
              icon="★"
              subtitle={`From ${summary.total_reviews || 0} customer reviews`}
              color="warning"
            />
            <StatCard
              title="Average Wait Duration"
              value={queueSummary.average_wait_seconds ? `${Math.round(queueSummary.average_wait_seconds / 60)} min` : 'N/A'}
              icon="⏳"
              subtitle={`Avg service duration: ${Math.round((queueSummary.average_service_seconds || 0) / 60)} min`}
              color="secondary"
            />
          </div>

          {/* Daily Appointment Volume Trend Chart */}
          <div className="card animate-section stagger-2" style={{ marginBottom: '1.75rem' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
              <div>
                <h3>Daily Appointment Volume Trend</h3>
                <p className="text-xs text-muted">Total vs Completed appointment volume per day</p>
              </div>
              <div className="flex items-center gap-md text-xs">
                <span className="flex items-center gap-xs">
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'var(--color-primary)', borderRadius: '2px' }}></span> Total
                </span>
                <span className="flex items-center gap-xs">
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'var(--color-success)', borderRadius: '2px' }}></span> Completed
                </span>
              </div>
            </div>

            {trend.length === 0 ? (
              <EmptyState title="No Trend Data" message="No appointment activity recorded in this timeframe." />
            ) : (
              <div style={{ overflowX: 'auto', paddingTop: '1rem', paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', minWidth: `${trend.length * 28}px`, height: '180px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                  {trend.map((t) => {
                    const totalH = Math.max((t.total / maxTrendVal) * 150, t.total > 0 ? 8 : 2);
                    const compH = Math.max((t.completed / maxTrendVal) * 150, t.completed > 0 ? 6 : 0);
                    const dateObj = new Date(t.date);
                    const dayLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

                    return (
                      <div
                        key={t.date}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          position: 'relative',
                        }}
                        title={`${t.date}: ${t.total} Total, ${t.completed} Completed`}
                      >
                        <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                          <div
                            style={{
                              width: '45%',
                              height: `${totalH}px`,
                              backgroundColor: 'var(--color-primary)',
                              borderRadius: '3px 3px 0 0',
                              transition: 'height 0.3s ease',
                            }}
                          ></div>
                          {t.completed > 0 && (
                            <div
                              style={{
                                width: '45%',
                                height: `${compH}px`,
                                backgroundColor: 'var(--color-success)',
                                borderRadius: '3px 3px 0 0',
                                transition: 'height 0.3s ease',
                              }}
                            ></div>
                          )}
                        </div>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '6px', whiteSpace: 'nowrap' }}>
                          {dayLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Status Breakdown & Customer Ratings Grid */}
          <div className="grid-responsive grid-cols-2 animate-section stagger-3" style={{ marginBottom: '1.75rem' }}>
            {/* Status Distribution */}
            <div className="card">
              <h3>Appointment Status Distribution</h3>
              <p className="text-xs text-muted" style={{ marginBottom: '1rem' }}>Operational breakdown by appointment lifecycle state</p>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Status State</th>
                      <th style={{ textAlign: 'right' }}>Count</th>
                      <th style={{ textAlign: 'right' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(statusCounts).map(([statusKey, count]) => {
                      if (statusKey === 'TOTAL') return null;
                      const sharePct = summary.total_appointments > 0 ? ((count / summary.total_appointments) * 100).toFixed(1) : 0;
                      return (
                        <tr key={statusKey}>
                          <td>
                            <StatusBadge status={statusKey} type="appointment" />
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{count}</td>
                          <td style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>{sharePct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Customer Rating Distribution */}
            <div className="card">
              <h3>Customer Rating Distribution</h3>
              <p className="text-xs text-muted" style={{ marginBottom: '1rem' }}>Review ratings submitted by verified customers</p>

              {summary.total_reviews === 0 ? (
                <EmptyState title="No Ratings Submitted" message="No customer reviews recorded during this timeframe." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {[5, 4, 3, 2, 1].map((star) => {
                    const starCount = ratingDist[`star_${star}`] || 0;
                    const starPct = summary.total_reviews > 0 ? (starCount / summary.total_reviews) * 100 : 0;

                    return (
                      <div key={star} className="flex items-center gap-sm">
                        <span className="font-semibold text-sm" style={{ width: '40px' }}>
                          {star} ★
                        </span>
                        <div style={{ flex: 1, height: '10px', background: 'var(--color-bg-subtle)', borderRadius: '5px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${starPct}%`,
                              height: '100%',
                              background: star >= 4 ? 'var(--color-warning)' : star === 3 ? 'var(--color-info)' : 'var(--color-danger)',
                              borderRadius: '5px',
                              transition: 'width 0.4s ease',
                            }}
                          ></div>
                        </div>
                        <span className="text-xs text-muted font-semibold" style={{ width: '50px', textAlign: 'right' }}>
                          {starCount} ({Math.round(starPct)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Service Utilization & Provider Performance Grid */}
          <div className="grid-responsive grid-cols-2 animate-section stagger-4">
            {/* Service Utilization */}
            <div className="card">
              <h3>Service Portfolio Utilization</h3>
              <p className="text-xs text-muted" style={{ marginBottom: '1rem' }}>Service requests and fulfillment counts</p>

              {services.length === 0 ? (
                <EmptyState title="No Service Activity" message="No services recorded in the selected period." />
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Service Offering</th>
                        <th style={{ textAlign: 'right' }}>Bookings</th>
                        <th style={{ textAlign: 'right' }}>Completed</th>
                        <th style={{ textAlign: 'right' }}>Unfulfilled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((svc) => (
                        <tr key={svc.service_id}>
                          <td className="font-semibold">{svc.service_name}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{svc.total_appointments}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>{svc.completed}</td>
                          <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{svc.cancelled + svc.no_show}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Provider Operational Summary */}
            <div className="card">
              <h3>Provider Operational Summary</h3>
              <p className="text-xs text-muted" style={{ marginBottom: '1rem' }}>Factual volume and rating summary per provider</p>

              {providers.length === 0 ? (
                <EmptyState title="No Provider Activity" message="No provider activity recorded in the selected period." />
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Provider Name</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Completed</th>
                        <th style={{ textAlign: 'right' }}>No-Show</th>
                        <th style={{ textAlign: 'right' }}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((p) => (
                        <tr key={p.provider_id}>
                          <td className="font-semibold">🩺 {p.provider_name}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.total_appointments}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>{p.completed}</td>
                          <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{p.no_show}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-warning)' }}>
                            {p.average_rating ? `${p.average_rating} ★` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ManagerAnalyticsPage;
