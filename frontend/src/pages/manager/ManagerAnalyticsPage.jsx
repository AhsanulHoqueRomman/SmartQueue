import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import managerService from '../../services/managerService';
import apiClient from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { currentBusinessDate } from '../../utils/bookingDisplay';
import '../../styles/ManagerAnalytics.css';

/**
 * Calendar math utility: shifts an ISO YYYY-MM-DD date string by dayDelta days
 * using UTC date operations to avoid browser-local timezone/daylight saving drift.
 */
function shiftDhakaDate(dateStr, dayDelta) {
  if (!dateStr || typeof dateStr !== 'string') return currentBusinessDate();
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return currentBusinessDate();
  const [year, month, day] = parts;
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + dayDelta);
  return d.toISOString().split('T')[0];
}

/**
 * Generates Asia/Dhaka compliant preset dates relative to currentBusinessDate().
 */
function getPresetDates(presetKey) {
  const today = currentBusinessDate();
  if (presetKey === '7d') {
    // Today and 6 preceding calendar dates = 7 days inclusive
    return { start: shiftDhakaDate(today, -6), end: today };
  } else if (presetKey === '30d') {
    // Today and 29 preceding calendar dates = 30 days inclusive
    return { start: shiftDhakaDate(today, -29), end: today };
  } else if (presetKey === 'month') {
    // First calendar day of current month in Asia/Dhaka through today
    const [year, month] = today.split('-');
    return { start: `${year}-${month}-01`, end: today };
  }
  return { start: '', end: today };
}

export function ManagerAnalyticsPage() {
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();

  // Active Date Filter: '7d' | '30d' | 'month' | 'custom'
  const [preset, setPreset] = useState('30d');
  const [startDate, setStartDate] = useState(() => getPresetDates('30d').start);
  const [endDate, setEndDate] = useState(() => getPresetDates('30d').end);

  // Authoritative server data & UI states
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [viewTrendTable, setViewTrendTable] = useState(false);

  // Concurrency, Tenant Generation & Stale Response Protection Refs
  const requestTicketRef = useRef(0);
  const exportBusyRef = useRef(false);
  const activeOrgIdRef = useRef(currentOrg?.id);
  const orgGenRef = useRef(0);
  const isMountedRef = useRef(true);

  // Mount/Unmount lifecycle tracker
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Synchronize active organization ID and increment context generation on tenant switch
  useEffect(() => {
    if (activeOrgIdRef.current !== currentOrg?.id) {
      activeOrgIdRef.current = currentOrg?.id;
      orgGenRef.current += 1;
    }
  }, [currentOrg?.id]);

  // --------------------------------------------------------------------------
  // Data Fetching with Generation Ticket Guard
  // --------------------------------------------------------------------------
  const fetchAnalytics = useCallback(async (startStr, endStr) => {
    if (!currentOrg?.id) return;
    const ticket = ++requestTicketRef.current;
    const targetOrgId = currentOrg.id;
    const targetGen = orgGenRef.current;

    setLoading(true);
    setError(null);

    try {
      const params = {};
      if (startStr) params.start_date = startStr;
      if (endStr) params.end_date = endStr;

      const data = await managerService.getAnalyticsSummary(targetOrgId, params);

      // Discard stale responses if organization, generation, unmount, or ticket has superseded
      if (
        !isMountedRef.current ||
        ticket !== requestTicketRef.current ||
        activeOrgIdRef.current !== targetOrgId ||
        orgGenRef.current !== targetGen
      ) {
        return;
      }

      setAnalytics(data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      if (
        isMountedRef.current &&
        ticket === requestTicketRef.current &&
        activeOrgIdRef.current === targetOrgId &&
        orgGenRef.current === targetGen
      ) {
        setError(err.response?.data?.detail || 'Failed to load operational analytics.');
      }
    } finally {
      if (
        isMountedRef.current &&
        ticket === requestTicketRef.current &&
        activeOrgIdRef.current === targetOrgId &&
        orgGenRef.current === targetGen
      ) {
        setLoading(false);
      }
    }
  }, [currentOrg?.id]);

  // Initial load and context change synchronization
  useEffect(() => {
    if (!currentOrg?.id) {
      setLoading(false);
      setAnalytics(null);
      return;
    }
    const { start, end } = getPresetDates(preset);
    setStartDate(start);
    setEndDate(end);
    fetchAnalytics(start, end);
  }, [currentOrg?.id, preset, fetchAnalytics]);

  // Preset switch handler
  const handlePresetSelect = (pKey) => {
    setPreset(pKey);
    const { start, end } = getPresetDates(pKey);
    setStartDate(start);
    setEndDate(end);
    fetchAnalytics(start, end);
  };

  // Custom date range submit handler
  const handleApplyCustomFilter = (e) => {
    e.preventDefault();
    const todayDhaka = currentBusinessDate();

    if (!startDate || !endDate) {
      setError('Both Start Date and End Date are required for a custom date range.');
      return;
    }
    if (startDate > endDate) {
      setError('Start Date cannot be after End Date.');
      return;
    }
    if (endDate > todayDhaka) {
      setError('End Date cannot be in the future.');
      return;
    }

    setPreset('custom');
    fetchAnalytics(startDate, endDate);
  };

  // --------------------------------------------------------------------------
  // Owner Decision D1 — Safe Authenticated CSV Export
  // Finding F1: Protected against in-flight tenant changes and component unmount
  // --------------------------------------------------------------------------
  const handleExportCsv = async () => {
    if (!currentOrg?.id || exportBusyRef.current) return;
    exportBusyRef.current = true;
    setExporting(true);

    const targetOrgId = currentOrg.id;
    const targetGen = orgGenRef.current;
    const targetSlug = currentOrg.slug || 'organization';

    let blobUrl = null;
    try {
      const response = await apiClient.get(`/organizations/${targetOrgId}/analytics/export/`, {
        responseType: 'blob',
      });

      // Airtight check:
      // Component must remain mounted, and active organization and generation must still match
      // the exact context that initiated the export request.
      if (
        !isMountedRef.current ||
        activeOrgIdRef.current !== targetOrgId ||
        orgGenRef.current !== targetGen
      ) {
        // Discard blob without creating an object URL or triggering anchor download
        return;
      }

      blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${targetSlug}-queue-analytics.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showSuccess('Queue analytics CSV downloaded successfully.');
    } catch (err) {
      if (
        isMountedRef.current &&
        activeOrgIdRef.current === targetOrgId &&
        orgGenRef.current === targetGen
      ) {
        showError(err.response?.data?.detail || 'Failed to export queue analytics CSV.');
      }
    } finally {
      if (blobUrl) {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (_) {
            // Ignore revocation errors
          }
        }, 1000);
      }
      exportBusyRef.current = false;
      if (isMountedRef.current) {
        setExporting(false);
      }
    }
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the header selector to view operational analytics."
      />
    );
  }

  // Authoritative server payload extracts
  const summary = analytics?.summary || {};
  const statusCounts = analytics?.status_counts || {};
  const ratingDist = analytics?.rating_distribution || {};
  const queueSummary = analytics?.queue_summary || {};
  const trend = analytics?.appointment_trend || [];
  const providers = analytics?.providers || [];
  const services = analytics?.services || [];

  // Scaler for SVG bar chart
  const maxTrendVal = Math.max(...trend.map((t) => t.total || 0), 1);

  // Finding F2: Duration formatting with truthful zero/null observation semantics
  // The backend returns 0.0 when no qualifying timestamp observations exist.
  // Where observation presence cannot be reliably established and an average is zero,
  // display neutral 'N/A' rather than asserting a measured '0 min'.
  const formatDurationMinutes = (seconds) => {
    if (typeof seconds !== 'number' || seconds <= 0 || isNaN(seconds)) {
      return 'N/A';
    }
    const mins = Math.round(seconds / 60);
    return `${mins > 0 ? mins : '< 1'} min`;
  };

  return (
    <div className="manager-analytics animate-page-entrance">
      {/* Editorial Header */}
      <div className="manager-analytics__header">
        <div className="manager-analytics__header-info">
          <div className="manager-analytics__eyebrow">
            <span>📊 Clinical & Operational Telemetry</span>
          </div>
          <h1 className="manager-analytics__title">Operational Analytics & Reporting</h1>
          <p className="manager-analytics__subtitle">
            Observed clinical volumes, patient wait times, and fulfillment telemetry for{' '}
            <span className="manager-analytics__subtitle-org">{currentOrg.name}</span>.
          </p>
        </div>

        <div className="manager-analytics__header-actions">
          <div className="manager-analytics__action-group">
            {lastUpdated && (
              <span className="manager-analytics__timestamp">
                Last updated: <strong>{lastUpdated}</strong>
              </span>
            )}
            <button
              type="button"
              className="manager-analytics__btn-refresh"
              onClick={() => fetchAnalytics(startDate, endDate)}
              disabled={loading || exporting}
              title="Refresh telemetry for selected period"
            >
              <span>🔄</span>
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              className="manager-analytics__btn-export"
              onClick={handleExportCsv}
              disabled={loading || exporting}
              title="Export all-time organization queue records to CSV"
            >
              <span>📥</span>
              <span>{exporting ? 'Exporting...' : 'Export Queue CSV'}</span>
            </button>
          </div>
          <span className="manager-analytics__export-note">
            ℹ️ CSV export downloads all historical queue records for this organization.
          </span>
        </div>
      </div>

      {/* Date Filter & Preset Toolbar */}
      <div className="manager-analytics__toolbar">
        <div className="manager-analytics__presets">
          <button
            type="button"
            className={`manager-analytics__preset-btn ${preset === '7d' ? 'manager-analytics__preset-btn--active' : ''}`}
            onClick={() => handlePresetSelect('7d')}
            disabled={loading}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            className={`manager-analytics__preset-btn ${preset === '30d' ? 'manager-analytics__preset-btn--active' : ''}`}
            onClick={() => handlePresetSelect('30d')}
            disabled={loading}
          >
            Last 30 Days
          </button>
          <button
            type="button"
            className={`manager-analytics__preset-btn ${preset === 'month' ? 'manager-analytics__preset-btn--active' : ''}`}
            onClick={() => handlePresetSelect('month')}
            disabled={loading}
          >
            This Month
          </button>
        </div>

        <form onSubmit={handleApplyCustomFilter} className="manager-analytics__custom-form">
          <label htmlFor="analytics-start-date" className="manager-analytics__date-label">
            From:
          </label>
          <input
            id="analytics-start-date"
            type="date"
            value={startDate}
            max={currentBusinessDate()}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPreset('custom');
            }}
            disabled={loading}
            className="manager-analytics__date-input"
          />
          <label htmlFor="analytics-end-date" className="manager-analytics__date-label">
            To:
          </label>
          <input
            id="analytics-end-date"
            type="date"
            value={endDate}
            max={currentBusinessDate()}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPreset('custom');
            }}
            disabled={loading}
            className="manager-analytics__date-input"
          />
          <button
            type="submit"
            disabled={loading || !startDate || !endDate}
            className="manager-analytics__btn-apply"
          >
            Apply Range
          </button>
        </form>
      </div>

      {error && (
        <div role="alert" className="manager-analytics__alert manager-analytics__alert--error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <LoadingState message="Aggregating operational analytics..." />
      ) : !analytics ? (
        <EmptyState
          title="No Analytics Available"
          message="No operational data was returned for the selected organization and date range."
        />
      ) : (
        <>
          {/* Executive Telemetry Strip (Owner Decision D2: Strictly Operational Metrics) */}
          <div className="manager-analytics__kpi-grid">
            {/* Card 1: Total Appointments */}
            <div className="manager-analytics__kpi-card">
              <div className="manager-analytics__kpi-header">
                <span className="manager-analytics__kpi-label">Total Bookings</span>
                <span className="manager-analytics__kpi-icon">📅</span>
              </div>
              <div className="manager-analytics__kpi-body">
                <span className="manager-analytics__kpi-value">{summary.total_appointments ?? 0}</span>
              </div>
              <p className="manager-analytics__kpi-subtext">
                Scheduled across {analytics.period?.start_date} to {analytics.period?.end_date}
              </p>
            </div>

            {/* Card 2: Completed Consultations */}
            <div className="manager-analytics__kpi-card">
              <div className="manager-analytics__kpi-header">
                <span className="manager-analytics__kpi-label">Completed Consultations</span>
                <span className="manager-analytics__kpi-icon">✓</span>
              </div>
              <div className="manager-analytics__kpi-body">
                <span className="manager-analytics__kpi-value">{summary.completed ?? 0}</span>
                <span className="manager-analytics__kpi-badge manager-analytics__kpi-badge--success">
                  {summary.completion_rate ?? 0}% fulfilled
                </span>
              </div>
              <p className="manager-analytics__kpi-subtext">
                Proportion of booked consultations successfully served
              </p>
            </div>

            {/* Card 3: Physical Check-In Rate */}
            <div className="manager-analytics__kpi-card">
              <div className="manager-analytics__kpi-header">
                <span className="manager-analytics__kpi-label">Physical Check-In Rate</span>
                <span className="manager-analytics__kpi-icon">🎫</span>
              </div>
              <div className="manager-analytics__kpi-body">
                <span className="manager-analytics__kpi-value">{summary.check_in_rate ?? 0}%</span>
                <span className="manager-analytics__kpi-badge manager-analytics__kpi-badge--info">
                  Attended
                </span>
              </div>
              <p className="manager-analytics__kpi-subtext">
                Attended appointments verified via front-desk check-in
              </p>
            </div>

            {/* Card 4: Unfulfilled Consultations */}
            <div className="manager-analytics__kpi-card">
              <div className="manager-analytics__kpi-header">
                <span className="manager-analytics__kpi-label">Unfulfilled Volume</span>
                <span className="manager-analytics__kpi-icon">✖</span>
              </div>
              <div className="manager-analytics__kpi-body">
                <span className="manager-analytics__kpi-value">
                  {(summary.cancelled || 0) + (summary.no_show || 0)}
                </span>
                <span className="manager-analytics__kpi-badge manager-analytics__kpi-badge--danger">
                  Drop-off
                </span>
              </div>
              <p className="manager-analytics__kpi-subtext">
                Cancelled: {summary.cancelled || 0} · No-Show: {summary.no_show || 0}
              </p>
            </div>

            {/* Card 5: Average Observed Queue Wait Duration (Finding F2: Truthful Zero Semantics) */}
            <div className="manager-analytics__kpi-card">
              <div className="manager-analytics__kpi-header">
                <span className="manager-analytics__kpi-label">Observed Queue Wait</span>
                <span className="manager-analytics__kpi-icon">⏳</span>
              </div>
              <div className="manager-analytics__kpi-body">
                <span className="manager-analytics__kpi-value">
                  {formatDurationMinutes(queueSummary.average_wait_seconds)}
                </span>
                {queueSummary.average_wait_seconds > 0 ? (
                  <span className="manager-analytics__kpi-badge manager-analytics__kpi-badge--info">
                    Observed
                  </span>
                ) : (
                  <span
                    className="manager-analytics__kpi-badge"
                    style={{ backgroundColor: 'rgba(120, 113, 108, 0.1)', color: 'var(--color-text-muted, #78716C)' }}
                  >
                    No observations
                  </span>
                )}
              </div>
              <p className="manager-analytics__kpi-subtext">
                {queueSummary.average_service_seconds > 0
                  ? `Average consultation: ${formatDurationMinutes(queueSummary.average_service_seconds)}`
                  : 'Consultation duration: N/A (no timestamp observations)'}
              </p>
            </div>

            {/* Card 6: Patient Feedback Rating */}
            <div className="manager-analytics__kpi-card">
              <div className="manager-analytics__kpi-header">
                <span className="manager-analytics__kpi-label">Patient Satisfaction</span>
                <span className="manager-analytics__kpi-icon">★</span>
              </div>
              <div className="manager-analytics__kpi-body">
                <span className="manager-analytics__kpi-value">
                  {summary.total_reviews > 0 ? `${summary.average_rating} ★` : 'No reviews'}
                </span>
                {summary.total_reviews > 0 && (
                  <span className="manager-analytics__kpi-badge manager-analytics__kpi-badge--warning">
                    Verified
                  </span>
                )}
              </div>
              <p className="manager-analytics__kpi-subtext">
                {summary.total_reviews > 0
                  ? `Based on ${summary.total_reviews} verified customer review${summary.total_reviews > 1 ? 's' : ''}`
                  : 'No customer feedback submitted in this date range'}
              </p>
            </div>
          </div>

          {/* Daily Appointment Volume Trend */}
          <div className="manager-analytics__trend-section">
            <div className="manager-analytics__trend-header">
              <div className="manager-analytics__trend-title-group">
                <h3>Daily Appointment Volume Trend</h3>
                <p>Observed daily scheduled appointments versus completed consultations</p>
              </div>

              <div className="manager-analytics__trend-controls">
                <div className="manager-analytics__trend-legend">
                  <span className="manager-analytics__legend-item">
                    <span className="manager-analytics__legend-dot manager-analytics__legend-dot--total"></span>
                    <span>Total Booked</span>
                  </span>
                  <span className="manager-analytics__legend-item">
                    <span className="manager-analytics__legend-dot manager-analytics__legend-dot--completed"></span>
                    <span>Completed</span>
                  </span>
                </div>

                <button
                  type="button"
                  className="manager-analytics__view-toggle"
                  onClick={() => setViewTrendTable((prev) => !prev)}
                >
                  {viewTrendTable ? '📊 Show Chart' : '📋 Show Data Table'}
                </button>
              </div>
            </div>

            {trend.length === 0 ? (
              <EmptyState title="No Trend Data" message="No appointments recorded during this reporting timeframe." />
            ) : viewTrendTable ? (
              /* Accessible Tabular Alternative */
              <div className="manager-analytics__table-wrap">
                <table className="manager-analytics__table" aria-label="Daily appointment trend data table">
                  <thead>
                    <tr>
                      <th>Calendar Date</th>
                      <th style={{ textAlign: 'right' }}>Total Bookings</th>
                      <th style={{ textAlign: 'right' }}>Completed</th>
                      <th style={{ textAlign: 'right' }}>Cancelled</th>
                      <th style={{ textAlign: 'right' }}>No-Show</th>
                      <th style={{ textAlign: 'right' }}>Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((row) => {
                      const rate = row.total > 0 ? ((row.completed / row.total) * 100).toFixed(1) : '—';
                      return (
                        <tr key={row.date}>
                          <td className="manager-analytics__td-bold">{row.date}</td>
                          <td className="manager-analytics__td-num">{row.total}</td>
                          <td className="manager-analytics__td-num" style={{ color: '#10B981' }}>{row.completed}</td>
                          <td className="manager-analytics__td-num" style={{ color: '#EF4444' }}>{row.cancelled}</td>
                          <td className="manager-analytics__td-num" style={{ color: '#F59E0B' }}>{row.no_show}</td>
                          <td className="manager-analytics__td-num">{rate === '—' ? rate : `${rate}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Lightweight React/CSS Bar Chart */
              <div className="manager-analytics__chart-scroll">
                <div
                  className="manager-analytics__chart-bars"
                  role="graphics-document"
                  aria-label="Daily appointment volume chart showing total versus completed appointments"
                  style={{ minWidth: `${Math.max(trend.length * 34, 320)}px` }}
                >
                  {trend.map((t) => {
                    const totalH = Math.max((t.total / maxTrendVal) * 160, t.total > 0 ? 8 : 2);
                    const compH = Math.max((t.completed / maxTrendVal) * 160, t.completed > 0 ? 6 : 0);
                    const dateParts = t.date.split('-');
                    const dateLabel = `${dateParts[1]}/${dateParts[2]}`;

                    return (
                      <div
                        key={t.date}
                        className="manager-analytics__chart-column"
                        title={`${t.date}: ${t.total} Total Bookings, ${t.completed} Completed`}
                        tabIndex={0}
                        aria-label={`${t.date}: ${t.total} total appointments, ${t.completed} completed consultations`}
                      >
                        <div className="manager-analytics__bar-pair">
                          <div
                            className="manager-analytics__bar-total"
                            style={{ height: `${totalH}px` }}
                          ></div>
                          {t.completed > 0 && (
                            <div
                              className="manager-analytics__bar-completed"
                              style={{ height: `${compH}px` }}
                            ></div>
                          )}
                        </div>
                        <span className="manager-analytics__chart-date">{dateLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Operational Breakdowns (2-Column Grid) */}
          <div className="manager-analytics__section-grid">
            {/* Breakdown 1: Appointment Status Distribution */}
            <div className="manager-analytics__card">
              <div className="manager-analytics__card-header">
                <h3 className="manager-analytics__card-title">Appointment Status Distribution</h3>
                <p className="manager-analytics__card-subtitle">
                  Volume breakdown across lifecycle states
                </p>
              </div>

              <div className="manager-analytics__table-wrap">
                <table className="manager-analytics__table" aria-label="Appointment status breakdown">
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
                      const sharePct = summary.total_appointments > 0
                        ? ((count / summary.total_appointments) * 100).toFixed(1)
                        : 0;
                      return (
                        <tr key={statusKey}>
                          <td>
                            <StatusBadge status={statusKey} type="appointment" />
                          </td>
                          <td className="manager-analytics__td-num">{count}</td>
                          <td className="manager-analytics__td-num" style={{ color: 'var(--color-text-muted, #78716C)' }}>
                            {sharePct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Breakdown 2: Customer Rating Distribution */}
            <div className="manager-analytics__card">
              <div className="manager-analytics__card-header">
                <h3 className="manager-analytics__card-title">Customer Rating Distribution</h3>
                <p className="manager-analytics__card-subtitle">
                  Verified patient star ratings submitted in range
                </p>
              </div>

              {summary.total_reviews === 0 ? (
                <EmptyState
                  title="No Ratings Submitted"
                  message="No customer reviews recorded during this timeframe."
                />
              ) : (
                <div className="manager-analytics__rating-list" role="list" aria-label="Rating distribution breakdown">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = ratingDist[`star_${star}`] || 0;
                    const pct = summary.total_reviews > 0 ? (count / summary.total_reviews) * 100 : 0;
                    return (
                      <div key={star} className="manager-analytics__rating-row" role="listitem">
                        <span className="manager-analytics__rating-label">{star} ★</span>
                        <div className="manager-analytics__rating-track">
                          <div
                            className={`manager-analytics__rating-fill manager-analytics__rating-fill--${star}`}
                            style={{ width: `${pct}%` }}
                            role="progressbar"
                            aria-valuenow={count}
                            aria-valuemin={0}
                            aria-valuemax={summary.total_reviews}
                            aria-label={`${star} star rating: ${count} reviews`}
                          ></div>
                        </div>
                        <span className="manager-analytics__rating-stat">
                          {count} ({Math.round(pct)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Detailed Performance Tables (Service & Provider) */}
          <div className="manager-analytics__section-grid">
            {/* Service Utilization Summary */}
            <div className="manager-analytics__card">
              <div className="manager-analytics__card-header">
                <h3 className="manager-analytics__card-title">Service Portfolio Utilization</h3>
                <p className="manager-analytics__card-subtitle">
                  Fulfillment volume per catalog service offering
                </p>
              </div>

              {services.length === 0 ? (
                <EmptyState
                  title="No Service Activity"
                  message="No services were requested during the selected timeframe."
                />
              ) : (
                <div className="manager-analytics__table-wrap">
                  <table className="manager-analytics__table" aria-label="Service utilization summary">
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
                          <td className="manager-analytics__td-bold">{svc.service_name}</td>
                          <td className="manager-analytics__td-num">{svc.total_appointments}</td>
                          <td className="manager-analytics__td-num" style={{ color: '#10B981' }}>
                            {svc.completed}
                          </td>
                          <td className="manager-analytics__td-num" style={{ color: '#EF4444' }}>
                            {(svc.cancelled || 0) + (svc.no_show || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Provider Operational Performance */}
            <div className="manager-analytics__card">
              <div className="manager-analytics__card-header">
                <h3 className="manager-analytics__card-title">Provider Operational Performance</h3>
                <p className="manager-analytics__card-subtitle">
                  Consultation volumes and ratings per professional
                </p>
              </div>

              {providers.length === 0 ? (
                <EmptyState
                  title="No Provider Activity"
                  message="No active providers recorded consultations in this timeframe."
                />
              ) : (
                <div className="manager-analytics__table-wrap">
                  <table className="manager-analytics__table" aria-label="Provider operational performance">
                    <thead>
                      <tr>
                        <th>Professional</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Completed</th>
                        <th style={{ textAlign: 'right' }}>No-Show</th>
                        <th style={{ textAlign: 'right' }}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((p) => (
                        <tr key={p.provider_id}>
                          <td className="manager-analytics__td-bold">🩺 {p.provider_name}</td>
                          <td className="manager-analytics__td-num">{p.total_appointments}</td>
                          <td className="manager-analytics__td-num" style={{ color: '#10B981' }}>
                            {p.completed}
                          </td>
                          <td className="manager-analytics__td-num" style={{ color: '#F59E0B' }}>
                            {p.no_show || 0}
                          </td>
                          <td className="manager-analytics__td-num">
                            {p.average_rating > 0 ? (
                              <span className="manager-analytics__rating-badge">
                                {p.average_rating} ★
                              </span>
                            ) : (
                              '—'
                            )}
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
