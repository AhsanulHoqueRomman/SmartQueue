import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import organizationService from '../../services/organizationService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';

export const StaffDashboard = () => {
  const { user } = useAuth();
  const { currentOrg } = useTenant();
  const navigate = useNavigate();

  const [todayAppointments, setTodayAppointments] = useState([]);
  const [providers, setProviders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingInId, setCheckingInId] = useState(null);
  const [checkInFeedback, setCheckInFeedback] = useState(null);

  const fetchStaffData = async () => {
    if (!currentOrg?.id) return;
    const todayStr = new Date().toISOString().split('T')[0];

    try {
      const [apptRes, provRes] = await Promise.allSettled([
        appointmentService.getAppointments(currentOrg.id, { date: todayStr }),
        organizationService.getProviders(currentOrg.id),
      ]);

      if (apptRes.status === 'fulfilled') {
        const list = Array.isArray(apptRes.value) ? apptRes.value : apptRes.value?.results || [];
        setTodayAppointments(list);
      }
      if (provRes.status === 'fulfilled') {
        const list = Array.isArray(provRes.value) ? provRes.value : provRes.value?.results || [];
        setProviders(list);
      }
    } catch (err) {
      // quiet fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentOrg?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchStaffData();
  }, [currentOrg?.id]);

  const handleCheckIn = async (appointmentId) => {
    if (!currentOrg?.id) return;
    setCheckingInId(appointmentId);
    setCheckInFeedback(null);

    try {
      await appointmentService.checkInAppointment(currentOrg.id, appointmentId);
      setCheckInFeedback({ type: 'success', message: 'Customer successfully checked in and queue token issued.' });
      await fetchStaffData();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to check in appointment.';
      setCheckInFeedback({ type: 'error', message: msg });
    } finally {
      setCheckingInId(null);
    }
  };

  const confirmedAppts = todayAppointments.filter((a) => a.status === 'CONFIRMED');
  const checkedInAppts = todayAppointments.filter((a) => a.status === 'CHECKED_IN');
  const inProgressAppts = todayAppointments.filter((a) => a.status === 'IN_PROGRESS');
  const completedAppts = todayAppointments.filter((a) => a.status === 'COMPLETED');

  const filteredAppts = todayAppointments.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const cust = (a.customer_name || a.customer_email || '').toLowerCase();
    const svc = (a.service_name || '').toLowerCase();
    const prov = (a.provider_name || '').toLowerCase();
    return cust.includes(q) || svc.includes(q) || prov.includes(q);
  });

  return (
    <div className="app-container animate-page-entrance">
      {/* Staff Header */}
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
            <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}>
              Staff Front-Desk Command
            </span>
            <h1 style={{ marginTop: '0.25rem' }}>Welcome, {user?.first_name || user?.email}!</h1>
            <p className="subtitle" style={{ marginTop: '0.25rem' }}>
              Patient check-in, identity verification & queue supervision for <strong>{currentOrg?.name || 'SmartQueue'}</strong>.
            </p>
          </div>
          <div className="flex gap-sm flex-wrap">
            <button className="btn btn-primary" onClick={() => navigate('/staff/appointments')}>
              📋 All Appointments
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/staff/queue')}>
              ⏳ Monitor Queue
            </button>
            <button className="btn btn-outline" onClick={() => navigate('/staff/customers')}>
              👥 Customers Roster
            </button>
          </div>
        </div>
      </div>

      {checkInFeedback && (
        <div
          className="banner"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            background: checkInFeedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: checkInFeedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${checkInFeedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
          }}
        >
          {checkInFeedback.message}
        </div>
      )}

      {!currentOrg ? (
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the top selector to access staff tools."
        />
      ) : loading ? (
        <LoadingState type="skeleton-card" rows={3} />
      ) : (
        <>
          {/* Staff Operational Metrics */}
          <div className="grid-responsive grid-cols-4 animate-section stagger-1" style={{ marginBottom: '1.75rem' }}>
            <StatCard
              title="Today's Bookings"
              value={todayAppointments.length}
              icon="📅"
              subtitle="Total scheduled today"
              color="info"
            />
            <StatCard
              title="Awaiting Check-In"
              value={confirmedAppts.length}
              icon="⏳"
              subtitle="Confirmed appointments"
              color="warning"
            />
            <StatCard
              title="Checked-In & Waiting"
              value={checkedInAppts.length}
              icon="🎫"
              subtitle="Queue tokens issued"
              color="primary"
            />
            <StatCard
              title="Completed Today"
              value={completedAppts.length}
              icon="✓"
              subtitle="Finished consultations"
              color="success"
            />
          </div>

          {/* Quick Front-Desk Customer Check-In Search */}
          <div className="card animate-section stagger-2" style={{ marginBottom: '1.75rem' }}>
            <div className="flex justify-between items-center flex-wrap gap-sm" style={{ marginBottom: '1rem' }}>
              <div>
                <h3>Front-Desk Patient Lookup & Check-In</h3>
                <p className="text-xs text-muted">Lookup confirmed bookings to issue queue check-in tokens</p>
              </div>
              <input
                type="text"
                placeholder="Search patient name, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-subtle)',
                  fontSize: '0.85rem',
                  minWidth: '220px',
                }}
              />
            </div>

            {filteredAppts.length === 0 ? (
              <EmptyState title="No Matching Appointments" message="No appointments match your search term for today." />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Patient</th>
                      <th>Service</th>
                      <th>Provider</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Front-Desk Action</th>
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
                          <td>{appt.service_name || 'Consultation'}</td>
                          <td className="font-semibold text-muted">🩺 {appt.provider_name || 'Provider'}</td>
                          <td>
                            <StatusBadge status={appt.status} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {appt.status === 'CONFIRMED' ? (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleCheckIn(appt.id)}
                                disabled={checkingInId === appt.id}
                              >
                                {checkingInId === appt.id ? 'Checking In...' : '🎫 Check In Patient'}
                              </button>
                            ) : appt.status === 'CHECKED_IN' ? (
                              <span className="badge badge-info">In Queue</span>
                            ) : appt.status === 'IN_PROGRESS' ? (
                              <span className="badge badge-warning">In Room</span>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Provider Supervision Cards */}
          <div className="card animate-section stagger-3">
            <h3 style={{ marginBottom: '1rem' }}>Active Organization Providers ({providers.length})</h3>
            {providers.length === 0 ? (
              <p className="text-muted text-sm">No active providers configured in this organization.</p>
            ) : (
              <div className="grid-responsive grid-cols-3">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-bg-subtle)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div className="font-semibold" style={{ fontSize: '1rem' }}>
                      🩺 {p.user_name || p.title || 'Provider'}
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>
                      {p.specialization || 'General Specialist'}
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => navigate('/staff/queue')}
                      style={{ marginTop: '0.75rem', width: '100%' }}
                    >
                      View Live Queue &rarr;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default StaffDashboard;
