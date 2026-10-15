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
import '../../styles/StaffDashboard.css';

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
    <div className="qt-staff-dashboard app-container animate-page-entrance">
      {/* 1. Staff Header Command Card */}
      <header className="qt-staff-dashboard__header">
        <div className="qt-staff-dashboard__header-info">
          <span className="qt-staff-dashboard__badge">
            Staff Front-Desk Command
          </span>
          <h1 className="qt-staff-dashboard__title">Welcome, {user?.first_name || user?.email}!</h1>
          <p className="qt-staff-dashboard__subtitle">
            Patient check-in, identity verification & queue supervision for <strong>{currentOrg?.name || 'QueueTurn'}</strong>.
          </p>
        </div>
        <div className="qt-staff-dashboard__header-actions">
          <button
            type="button"
            className="btn btn-primary qt-staff-dashboard__nav-btn"
            onClick={() => navigate('/staff/appointments')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            All Appointments
          </button>
          <button
            type="button"
            className="btn btn-secondary qt-staff-dashboard__nav-btn"
            onClick={() => navigate('/staff/queue')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Monitor Queue
          </button>
          <button
            type="button"
            className="btn btn-outline qt-staff-dashboard__nav-btn"
            onClick={() => navigate('/staff/customers')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Customers Roster
          </button>
        </div>
      </header>

      {/* 2. Operational Feedback Banner */}
      {checkInFeedback && (
        <div
          className={`qt-staff-dashboard__feedback qt-staff-dashboard__feedback--${checkInFeedback.type}`}
          role={checkInFeedback.type === 'error' ? 'alert' : 'status'}
          aria-live={checkInFeedback.type === 'error' ? 'assertive' : 'polite'}
        >
          <div className="qt-staff-dashboard__feedback-icon" aria-hidden="true">
            {checkInFeedback.type === 'success' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <div className="qt-staff-dashboard__feedback-message">
            {checkInFeedback.message}
          </div>
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
          {/* 3. Staff Operational Metrics Grid */}
          <section className="qt-staff-dashboard__metrics animate-section stagger-1" aria-label="Daily metrics overview">
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
          </section>

          {/* 4. Quick Front-Desk Customer Check-In Search & Table */}
          <section className="qt-staff-dashboard__table-card animate-section stagger-2" aria-labelledby="staff-lookup-heading">
            <div className="qt-staff-dashboard__search-header">
              <div className="qt-staff-dashboard__search-titles">
                <h3 id="staff-lookup-heading">Front-Desk Patient Lookup & Check-In</h3>
                <p className="qt-staff-dashboard__search-desc">Lookup confirmed bookings to issue queue check-in tokens</p>
              </div>
              <div className="qt-staff-dashboard__search-wrap">
                <span className="qt-staff-dashboard__search-icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <label htmlFor="staff-patient-search" className="sr-only">
                  Search patient by name, email, service, or provider
                </label>
                <input
                  id="staff-patient-search"
                  type="search"
                  placeholder="Search patient name, email, service..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="qt-staff-dashboard__search-input"
                  aria-label="Search patient by name, email, service, or provider"
                />
              </div>
            </div>

            {filteredAppts.length === 0 ? (
              <EmptyState title="No Matching Appointments" message="No appointments match your search term for today." />
            ) : (
              <div className="qt-staff-dashboard__table-wrapper" role="region" aria-label="Today's patient appointments table" tabIndex="0">
                <table className="qt-staff-dashboard__table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Patient</th>
                      <th scope="col">Service</th>
                      <th scope="col">Provider</th>
                      <th scope="col">Status</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Front-Desk Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppts.map((appt) => {
                      const dt = appt.start_datetime ? new Date(appt.start_datetime) : null;
                      return (
                        <tr key={appt.id}>
                          <td className="qt-staff-dashboard__time-cell">
                            {dt ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                          </td>
                          <td>
                            <div className="qt-staff-dashboard__customer-name">
                              {appt.customer_name || appt.customer_email}
                            </div>
                            <div className="qt-staff-dashboard__customer-sub">{appt.customer_email}</div>
                          </td>
                          <td className="qt-staff-dashboard__service-name">
                            {appt.service_name || 'Consultation'}
                          </td>
                          <td>
                            <span className="qt-staff-dashboard__provider-cell">
                              <span className="qt-staff-dashboard__provider-icon" aria-hidden="true">🩺</span>
                              <span>{appt.provider_name || 'Provider'}</span>
                            </span>
                          </td>
                          <td>
                            <StatusBadge status={appt.status} />
                          </td>
                          <td className="qt-staff-dashboard__action-cell">
                            {appt.status === 'CONFIRMED' ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm qt-staff-dashboard__checkin-btn"
                                onClick={() => handleCheckIn(appt.id)}
                                disabled={checkingInId === appt.id}
                                aria-busy={checkingInId === appt.id}
                              >
                                {checkingInId === appt.id ? 'Checking In...' : '🎫 Check In Patient'}
                              </button>
                            ) : appt.status === 'CHECKED_IN' ? (
                              <span className="qt-staff-dashboard__pill qt-staff-dashboard__pill--queue">In Queue</span>
                            ) : appt.status === 'IN_PROGRESS' ? (
                              <span className="qt-staff-dashboard__pill qt-staff-dashboard__pill--room">In Room</span>
                            ) : (
                              <span className="qt-staff-dashboard__dash" aria-label="No action available">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 5. Provider Supervision Cards */}
          <section className="qt-staff-dashboard__providers-card animate-section stagger-3" aria-labelledby="staff-providers-heading">
            <h3 id="staff-providers-heading" className="qt-staff-dashboard__section-title">
              Active Organization Providers ({providers.length})
            </h3>
            {providers.length === 0 ? (
              <p className="text-muted text-sm">No active providers configured in this organization.</p>
            ) : (
              <div className="qt-staff-dashboard__providers-grid">
                {providers.map((p) => (
                  <div key={p.id} className="qt-staff-dashboard__provider-card">
                    <div className="qt-staff-dashboard__provider-info">
                      <div className="qt-staff-dashboard__provider-name">
                        <span aria-hidden="true">🩺</span>
                        <span>{p.user_name || p.title || 'Provider'}</span>
                      </div>
                      <div className="qt-staff-dashboard__provider-spec">
                        {p.specialization || 'General Specialist'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm qt-staff-dashboard__provider-action"
                      onClick={() => navigate('/staff/queue')}
                    >
                      View Live Queue &rarr;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default StaffDashboard;
