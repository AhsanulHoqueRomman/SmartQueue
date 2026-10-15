import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import appointmentService from '../../services/appointmentService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import '../../styles/ManagerDashboard.css';

export const ManagerDashboard = () => {
  const { user } = useAuth();
  const { currentOrg } = useTenant();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    servicesCount: 0,
    providersCount: 0,
    membersCount: 0,
    todayApptsCount: 0,
  });
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg?.id) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    setLoading(true);

    const todayStr = new Date().toISOString().split('T')[0];

    Promise.allSettled([
      managerService.getServices(currentOrg.id),
      managerService.getProviders(currentOrg.id),
      managerService.getMembers(currentOrg.id),
      appointmentService.getAppointments(currentOrg.id, { date: todayStr }),
    ])
      .then(([svcRes, provRes, memRes, apptRes]) => {
        if (!isMounted) return;

        const svcList = svcRes.status === 'fulfilled' ? (Array.isArray(svcRes.value) ? svcRes.value : svcRes.value?.results || []) : [];
        const provList = provRes.status === 'fulfilled' ? (Array.isArray(provRes.value) ? provRes.value : provRes.value?.results || []) : [];
        const memList = memRes.status === 'fulfilled' ? (Array.isArray(memRes.value) ? memRes.value : memRes.value?.results || []) : [];
        const apptList = apptRes.status === 'fulfilled' ? (Array.isArray(apptRes.value) ? apptRes.value : apptRes.value?.results || []) : [];

        setStats({
          servicesCount: svcList.length,
          providersCount: provList.length,
          membersCount: memList.length,
          todayApptsCount: apptList.length,
        });
        setTodayAppointments(apptList);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id]);

  const filteredAppts = todayAppointments.filter((a) => {
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    return true;
  });

  const getVerificationBadge = () => {
    const status = currentOrg?.verification_status || 'SETUP_INCOMPLETE';
    switch (status) {
      case 'APPROVED':
        return (
          <span className="qt-manager-dashboard__verification-badge qt-manager-dashboard__verification-badge--approved">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Verified &amp; Operational
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="qt-manager-dashboard__verification-badge qt-manager-dashboard__verification-badge--review">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Verification Under Review
          </span>
        );
      case 'REJECTED':
        return (
          <span className="qt-manager-dashboard__verification-badge qt-manager-dashboard__verification-badge--rejected">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="18" x2="18" y2="18" />
            </svg>
            Verification Rejected
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="qt-manager-dashboard__verification-badge qt-manager-dashboard__verification-badge--suspended">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            Account Suspended
          </span>
        );
      default:
        return (
          <span className="qt-manager-dashboard__verification-badge qt-manager-dashboard__verification-badge--default">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="3" r="1" />
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Setup Incomplete
          </span>
        );
    }
  };

  return (
    <div className="qt-manager-dashboard app-container animate-page-entrance">
      {/* 1. Manager Header & Verification Status */}
      <header className="qt-manager-dashboard__header">
        <div className="qt-manager-dashboard__header-info">
          <div className="qt-manager-dashboard__header-badges">
            <span className="qt-manager-dashboard__role-badge">
              Manager Command Center
            </span>
            {getVerificationBadge()}
          </div>
          <h1 className="qt-manager-dashboard__title">
            Welcome, {user?.first_name || user?.email}!
          </h1>
          <p className="qt-manager-dashboard__subtitle">
            Organization telemetry &amp; operations for <strong>{currentOrg?.name || 'QueueTurn'}</strong>.
          </p>
        </div>
        <div className="qt-manager-dashboard__header-actions">
          <button
            type="button"
            className="btn btn-primary qt-manager-dashboard__nav-btn"
            onClick={() => navigate('/manager/appointments')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            Appointments Roster
          </button>
          <button
            type="button"
            className="btn btn-secondary qt-manager-dashboard__nav-btn"
            onClick={() => navigate('/manager/providers')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
              <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
              <circle cx="20" cy="10" r="2" />
            </svg>
            Providers
          </button>
          <button
            type="button"
            className="btn btn-outline qt-manager-dashboard__nav-btn"
            onClick={() => navigate('/manager/analytics')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Analytics
          </button>
        </div>
      </header>

      {/* 2. Suspended Organization Alert Banner */}
      {currentOrg?.verification_status === 'SUSPENDED' && (
        <div className="qt-manager-dashboard__suspended-banner" role="alert">
          <div className="qt-manager-dashboard__suspended-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="qt-manager-dashboard__suspended-content">
            <strong>Organization Suspended:</strong> Operational features and public booking may be restricted until system administration review.
          </div>
        </div>
      )}

      {!currentOrg ? (
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the top selector to access manager tools."
        />
      ) : loading ? (
        <LoadingState type="skeleton-card" rows={4} />
      ) : (
        <>
          {/* 3. Operations Stat Cards */}
          <section className="qt-manager-dashboard__metrics animate-section stagger-1" aria-label="Organization operational metrics">
            <StatCard
              title="Today's Bookings"
              value={stats.todayApptsCount}
              icon="📅"
              subtitle="Appointments today"
              color="primary"
            />
            <StatCard
              title="Active Providers"
              value={stats.providersCount}
              icon="🩺"
              subtitle="Registered providers"
              color="secondary"
            />
            <StatCard
              title="Team Members"
              value={stats.membersCount}
              icon="👥"
              subtitle="Staff & manager users"
              color="info"
            />
            <StatCard
              title="Active Services"
              value={stats.servicesCount}
              icon="💼"
              subtitle="Service portfolio"
              color="success"
            />
          </section>

          {/* 4. Today's Operations Roster Overview */}
          <section className="qt-manager-dashboard__roster-card animate-section stagger-2" aria-labelledby="manager-roster-heading">
            <div className="qt-manager-dashboard__roster-header">
              <div className="qt-manager-dashboard__roster-title-group">
                <h3 id="manager-roster-heading" className="qt-manager-dashboard__section-title">
                  Today's Operations Overview ({filteredAppts.length})
                </h3>
                <p className="qt-manager-dashboard__section-desc">
                  All appointments scheduled across providers for today's date
                </p>
              </div>
              <div className="qt-manager-dashboard__roster-controls">
                <div className="qt-manager-dashboard__filter-group">
                  <label htmlFor="manager-status-filter" className="qt-manager-dashboard__filter-label">
                    Filter:
                  </label>
                  <select
                    id="manager-status-filter"
                    className="qt-manager-dashboard__filter-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter appointments by status"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="CHECKED_IN">CHECKED_IN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => navigate('/manager/appointments')}
                >
                  Full Roster &rarr;
                </button>
              </div>
            </div>

            {filteredAppts.length === 0 ? (
              <EmptyState title="No Appointments Today" message="No appointments scheduled matching the selected status filter." />
            ) : (
              <div className="qt-manager-dashboard__table-wrapper" role="region" aria-label="Today's operations overview table" tabIndex="0">
                <table className="qt-manager-dashboard__table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Provider</th>
                      <th scope="col">Service</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppts.map((appt) => {
                      const dt = appt.start_datetime ? new Date(appt.start_datetime) : null;
                      return (
                        <tr key={appt.id}>
                          <td className="qt-manager-dashboard__time-cell">
                            {dt ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                          </td>
                          <td>
                            <div className="qt-manager-dashboard__customer-name">
                              {appt.customer_name || appt.customer_email}
                            </div>
                            <div className="qt-manager-dashboard__customer-sub">{appt.customer_email}</div>
                          </td>
                          <td>
                            <span className="qt-manager-dashboard__provider-cell">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
                                <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
                                <circle cx="20" cy="10" r="2" />
                              </svg>
                              {appt.provider_name || 'Assigned Provider'}
                            </span>
                          </td>
                          <td className="qt-manager-dashboard__service-name">
                            {appt.service_name || 'Service'}
                          </td>
                          <td>
                            <StatusBadge status={appt.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 5. Quick Management Portals */}
          <section className="qt-manager-dashboard__portals-grid animate-section stagger-3" aria-label="Management portals">
            <div className="qt-manager-dashboard__portal-card">
              <div className="qt-manager-dashboard__portal-content">
                <span className="qt-manager-dashboard__portal-badge qt-manager-dashboard__portal-badge--info">
                  Service Catalog
                </span>
                <h3 className="qt-manager-dashboard__portal-title">Service Portfolio</h3>
                <p className="qt-manager-dashboard__portal-desc">
                  Manage organization services, set durations, pricing, and active status.
                </p>
              </div>
              <div className="qt-manager-dashboard__portal-actions">
                <button
                  type="button"
                  className="btn btn-primary qt-manager-dashboard__portal-btn qt-manager-dashboard__portal-btn--full"
                  onClick={() => navigate('/manager/services')}
                >
                  Open Services &rarr;
                </button>
              </div>
            </div>

            <div className="qt-manager-dashboard__portal-card">
              <div className="qt-manager-dashboard__portal-content">
                <span className="qt-manager-dashboard__portal-badge qt-manager-dashboard__portal-badge--neutral">
                  Roster Management
                </span>
                <h3 className="qt-manager-dashboard__portal-title">Providers &amp; Staff</h3>
                <p className="qt-manager-dashboard__portal-desc">
                  Review provider applications, onboard staff via invitation tokens, and assign roles.
                </p>
              </div>
              <div className="qt-manager-dashboard__portal-actions">
                <button
                  type="button"
                  className="btn btn-secondary qt-manager-dashboard__portal-btn qt-manager-dashboard__portal-btn--half"
                  onClick={() => navigate('/manager/providers')}
                >
                  Providers
                </button>
                <button
                  type="button"
                  className="btn btn-outline qt-manager-dashboard__portal-btn qt-manager-dashboard__portal-btn--half"
                  onClick={() => navigate('/manager/staff')}
                >
                  Staff Roster
                </button>
              </div>
            </div>

            <div className="qt-manager-dashboard__portal-card">
              <div className="qt-manager-dashboard__portal-content">
                <span className="qt-manager-dashboard__portal-badge qt-manager-dashboard__portal-badge--success">
                  Insights &amp; Audit
                </span>
                <h3 className="qt-manager-dashboard__portal-title">Analytics &amp; Audit Logs</h3>
                <p className="qt-manager-dashboard__portal-desc">
                  Monitor completion rates, peak queue volumes, ratings, and system audit trail.
                </p>
              </div>
              <div className="qt-manager-dashboard__portal-actions">
                <button
                  type="button"
                  className="btn btn-outline qt-manager-dashboard__portal-btn qt-manager-dashboard__portal-btn--half"
                  onClick={() => navigate('/manager/analytics')}
                >
                  Analytics
                </button>
                <button
                  type="button"
                  className="btn btn-outline qt-manager-dashboard__portal-btn qt-manager-dashboard__portal-btn--half"
                  onClick={() => navigate('/manager/audit')}
                >
                  Audit Logs
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default ManagerDashboard;
