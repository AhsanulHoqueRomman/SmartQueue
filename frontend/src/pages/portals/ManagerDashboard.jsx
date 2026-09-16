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
        return <span className="badge badge-success">✓ Verified & Operational</span>;
      case 'UNDER_REVIEW':
        return <span className="badge badge-warning">⏳ Verification Under Review</span>;
      case 'REJECTED':
        return <span className="badge badge-danger">✖ Verification Rejected</span>;
      case 'SUSPENDED':
        return <span className="badge badge-danger">🚫 Account Suspended</span>;
      default:
        return <span className="badge badge-neutral">⚙️ Setup Incomplete</span>;
    }
  };

  return (
    <div className="app-container animate-page-entrance">
      {/* Manager Header & Verification Status */}
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
            <div className="flex items-center gap-sm" style={{ marginBottom: '0.4rem' }}>
              <span className="badge badge-info">Manager Command Center</span>
              {getVerificationBadge()}
            </div>
            <h1 style={{ marginTop: '0.25rem' }}>Welcome, {user?.first_name || user?.email}!</h1>
            <p className="subtitle" style={{ marginTop: '0.25rem' }}>
              Organization telemetry & operations for <strong>{currentOrg?.name || 'SmartQueue'}</strong>.
            </p>
          </div>
          <div className="flex gap-sm flex-wrap">
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/manager/appointments')}>
              📋 Appointments Roster
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/manager/providers')}>
              🩺 Providers
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/manager/analytics')}>
              📈 Analytics
            </button>
          </div>
        </div>
      </div>

      {currentOrg?.verification_status === 'SUSPENDED' && (
        <div className="error-banner" style={{ padding: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          ⚠️ <strong>Organization Suspended:</strong> Operational features and public booking may be restricted until system administration review.
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
          {/* Operations Stat Cards */}
          <div className="grid-responsive grid-cols-4 animate-section stagger-1" style={{ marginBottom: '1.75rem' }}>
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
          </div>

          {/* Today's Operations Roster Overview */}
          <div className="card animate-section stagger-2" style={{ marginBottom: '1.75rem' }}>
            <div className="flex justify-between items-center flex-wrap gap-sm" style={{ marginBottom: '1rem' }}>
              <div>
                <h3>Today's Operations Overview ({filteredAppts.length})</h3>
                <p className="text-xs text-muted">All appointments scheduled across providers for today's date</p>
              </div>
              <div className="flex items-center gap-sm">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="CHECKED_IN">CHECKED_IN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/manager/appointments')}>
                  Full Roster &rarr;
                </button>
              </div>
            </div>

            {filteredAppts.length === 0 ? (
              <EmptyState title="No Appointments Today" message="No appointments scheduled matching the selected status filter." />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Customer</th>
                      <th>Provider</th>
                      <th>Service</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppts.map((appt) => {
                      const dt = appt.start_datetime ? new Date(appt.start_datetime) : null;
                      return (
                        <tr key={appt.id}>
                          <td className="font-semibold">
                            {dt ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                          </td>
                          <td>
                            <div className="font-semibold">{appt.customer_name || appt.customer_email}</div>
                            <div className="text-xs text-muted">{appt.customer_email}</div>
                          </td>
                          <td className="font-semibold text-muted">🩺 {appt.provider_name || 'Assigned Provider'}</td>
                          <td>{appt.service_name || 'Service'}</td>
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
          </div>

          {/* Quick Management Portals */}
          <div className="grid-responsive grid-cols-3 animate-section stagger-3">
            <div className="card card-hover flex flex-col justify-between">
              <div>
                <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Service Catalog</span>
                <h3>Service Portfolio</h3>
                <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                  Manage organization services, set durations, pricing, and active status.
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => navigate('/manager/services')} style={{ marginTop: '1.25rem' }}>
                Open Services &rarr;
              </button>
            </div>

            <div className="card card-hover flex flex-col justify-between">
              <div>
                <span className="badge badge-neutral" style={{ marginBottom: '0.5rem' }}>Roster Management</span>
                <h3>Providers & Staff</h3>
                <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                  Review provider applications, onboard staff via invitation tokens, and assign roles.
                </p>
              </div>
              <div className="flex gap-sm" style={{ marginTop: '1.25rem' }}>
                <button className="btn btn-secondary" onClick={() => navigate('/manager/providers')} style={{ flex: 1 }}>
                  Providers
                </button>
                <button className="btn btn-outline" onClick={() => navigate('/manager/staff')} style={{ flex: 1 }}>
                  Staff Roster
                </button>
              </div>
            </div>

            <div className="card card-hover flex flex-col justify-between">
              <div>
                <span className="badge badge-success" style={{ marginBottom: '0.5rem' }}>Insights & Audit</span>
                <h3>Analytics & Audit Logs</h3>
                <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                  Monitor completion rates, peak queue volumes, ratings, and system audit trail.
                </p>
              </div>
              <div className="flex gap-sm" style={{ marginTop: '1.25rem' }}>
                <button className="btn btn-outline" onClick={() => navigate('/manager/analytics')} style={{ flex: 1 }}>
                  Analytics
                </button>
                <button className="btn btn-outline" onClick={() => navigate('/manager/audit')} style={{ flex: 1 }}>
                  Audit Logs
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ManagerDashboard;
