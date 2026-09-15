import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { StatCard } from '../../components/StatCard';

export function ManagerAnalyticsPage() {
  const { currentOrg } = useTenant();

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);

    managerService
      .getAnalyticsSummary(currentOrg.id)
      .then((data) => {
        setAnalytics(data);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to load analytics.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentOrg?.id]);

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the top selector."
      />
    );
  }

  if (loading) {
    return <LoadingState type="spinner" text="Loading operational analytics..." />;
  }

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Operational Analytics</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Service metrics, volume breakdown, and completion telemetry for {currentOrg.name}.</p>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ padding: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {analytics && (
        <>
          {/* Top Level Metric Cards */}
          <div className="grid-responsive grid-cols-4 animate-section stagger-1" style={{ marginBottom: '1.75rem' }}>
            <StatCard
              title="Total Appointments"
              value={analytics.total_appointments || 0}
              icon="📅"
              subtitle="All-time bookings"
              color="primary"
            />
            <StatCard
              title="Completed Services"
              value={analytics.status_counts?.COMPLETED || 0}
              icon="✓"
              subtitle="Successfully fulfilled"
              color="success"
            />
            <StatCard
              title="Cancelled / No Show"
              value={(analytics.status_counts?.CANCELLED || 0) + (analytics.status_counts?.NO_SHOW || 0)}
              icon="✖"
              subtitle="Unfulfilled bookings"
              color="danger"
            />
            <StatCard
              title="Active Queue Tokens"
              value={analytics.queue_counts?.TOTAL || 0}
              icon="⏳"
              subtitle="Today's waitlist total"
              color="info"
            />
          </div>

          {/* Breakdown Tables */}
          <div className="grid-responsive grid-cols-2 animate-section stagger-2">
            <div className="card">
              <h3>Appointment Status Distribution</h3>
              <div className="table-container" style={{ marginTop: '1rem' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Status Choice</th>
                      <th style={{ textAlign: 'right' }}>Total Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(analytics.status_counts || {}).map(([status, count]) => (
                      <tr key={status}>
                        <td>
                          <StatusBadge status={status} type="appointment" />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3>Services Breakdown</h3>
              {analytics.services_summary && analytics.services_summary.length > 0 ? (
                <div className="table-container" style={{ marginTop: '1rem' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Service Name</th>
                        <th>Bookings</th>
                        <th style={{ textAlign: 'right' }}>Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.services_summary.map((svc) => (
                        <tr key={svc.service_id}>
                          <td className="font-semibold">{svc.service_name}</td>
                          <td>{svc.total_appointments}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>{svc.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No Service History"
                  message="No service booking history recorded yet in this organization."
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ManagerAnalyticsPage;
