import { EmergencyNotice } from '../../components/EmergencyNotice';
import { useRequestScope } from '../../hooks/useRequestScope';
import { confirmCustomerArrival } from '../../utils/customerArrival.js';
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import appointmentService from '../../services/appointmentService';
import CustomerBookingCard from '../../components/CustomerBookingCard';
import RecentlyViewedOrganizations from '../../components/RecentlyViewedOrganizations';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { getNormalizedCustomerQueueState } from '../../utils/queueDisplay';
import '../../styles/CustomerDashboard.css';

export const CustomerDashboard = () => {
  const { user } = useAuth();
  const requestScope = useRequestScope(String(user?.id));
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const [dashboardRows, setDashboardItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingInId, setCheckingInId] = useState(null);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);
  const mutationBusy = useRef(false);
  const [loadedUser, setLoadedUser] = useState(null);
  const dashboardItems = loadedUser === user?.id ? dashboardRows : [];

  const fetchDashboardData = async (isManual = false, force = false) => {
    if (!user?.id || (mutationBusy.current && !force)) return;
    const ticket = requestScope.begin(String(user?.id), { background: !isManual && !force });
    if (!ticket) return;
    if (isManual) setRefreshing(true);
    setError(null);

    try {
      const data = await appointmentService.getCustomerDashboard();
      if (!requestScope.isCurrent(ticket)) return;
      const list = Array.isArray(data) ? data : data.results || [];
      setDashboardItems(list); setLoadedUser(user.id);
    } catch (err) {
      if (!requestScope.isCurrent(ticket)) return;
      setError(err.response?.data?.detail || 'Failed to update customer dashboard data.');
    } finally {
      if (requestScope.isCurrent(ticket)) { setLoading(false); setRefreshing(false); }
      requestScope.finish(ticket);
    }
  };

  const handleCheckIn = async (orgId, appointmentId) => {
    if (!confirmCustomerArrival()) return;
    if (!orgId || !appointmentId || mutationBusy.current) return;
    const ticket = requestScope.begin(String(user?.id));
    if (!ticket) return;
    mutationBusy.current = true;
    setCheckingInId(appointmentId);

    try {
      await appointmentService.checkInAppointment(orgId, appointmentId);
      if (!requestScope.isCurrentScope(ticket)) return;
      showSuccess('Checked in successfully! You are now in the live queue.');
      await fetchDashboardData(true, true);
    } catch (err) {
      if (!requestScope.isCurrentScope(ticket)) return;
      showError(err.response?.data?.detail || 'Check-in failed. Please try again.');
    } finally {
      if (requestScope.isCurrentScope(ticket)) { mutationBusy.current = false; setCheckingInId(null); }
    }
  };

  useEffect(() => {
    mutationBusy.current = false; setCheckingInId(null); setLoading(true);
    fetchDashboardData();

    // 10-second single polling loop for customer multi-booking dashboard
    timerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData();
      }
    }, 10000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentOrg?.id, user?.id]);

  const todayStr = new Date().toDateString();

  // Categorize dashboard items into distinct arrays using server-derived fields
  const liveQueueItems = dashboardItems.filter((item) => {
    const norm = getNormalizedCustomerQueueState(item);
    if (norm.isPast || norm.isUnresolved) return false;
    if (item.is_live_queue !== undefined) return item.is_live_queue;
    const qStatus = item.queue_entry?.status || item.status;
    return item.temporal_classification === 'today' && ['WAITING', 'CALLED', 'IN_PROGRESS'].includes(qStatus);
  });

  const upcomingItems = dashboardItems.filter((item) => {
    return item.temporal_classification === 'future' && !['CANCELLED', 'COMPLETED', 'NO_SHOW', 'SKIPPED'].includes(item.status);
  });

  const todayApptsCount = dashboardItems.filter((item) => {
    const norm = getNormalizedCustomerQueueState(item);
    if (norm.isPast) return false;
    if (item.temporal_classification) return item.temporal_classification === 'today' && item.status !== 'CANCELLED';
    return new Date(item.start_datetime).toDateString() === todayStr && item.status !== 'CANCELLED';
  }).length;

  const completedCount = dashboardItems.filter(
    (item) => item.status === 'COMPLETED'
  ).length;

  const unresolvedItems = dashboardItems.filter((item) => {
    const norm = getNormalizedCustomerQueueState(item);
    return norm.isUnresolved;
  });

  const totalUnresolved = unresolvedItems.length;
  const unreportedCount = unresolvedItems.filter((item) => !item.has_issue_report).length;
  const underReviewCount = unresolvedItems.filter((item) => Boolean(item.has_issue_report)).length;

  const getUserFirstName = () => {
    if (user?.first_name) return user.first_name;
    if (user?.email) return user.email.split('@')[0];
    return 'Customer';
  };

  return (
    <div className="qt-customer-dashboard animate-page-entrance">
      {/* Header Banner - Streamlined & Task-First */}
      <header className="qt-customer-dashboard__header">
        <div className="qt-customer-dashboard__header-info">
          <div className="qt-customer-dashboard__header-badges">
            <span className="qt-customer-dashboard__welcome-badge">
              Welcome back, {getUserFirstName()}!
            </span>
            <span className="qt-customer-dashboard__role-badge">
              Customer Portal
            </span>
          </div>
          <h1 className="qt-customer-dashboard__title">
            Customer Command Center
          </h1>
          <p className="qt-customer-dashboard__subtitle">
            Track your live queue telemetry, arrival windows, and upcoming consultations.
          </p>
        </div>

        <div className="qt-customer-dashboard__header-actions">
          <button
            type="button"
            className="btn btn-secondary qt-customer-dashboard__sync-btn"
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            title="Refresh dashboard data"
            aria-label={refreshing ? 'Updating dashboard data' : 'Sync dashboard data'}
          >
            <svg
              className={`qt-customer-dashboard__sync-icon ${refreshing ? 'qt-customer-dashboard__sync-icon--spin' : ''}`}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>{refreshing ? 'Updating...' : 'Sync'}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary qt-customer-dashboard__book-btn"
            onClick={() => navigate('/customer/book')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Book Appointment</span>
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div
          className="qt-customer-dashboard__banner qt-customer-dashboard__banner--error"
          role="alert"
          aria-live="assertive"
        >
          <div className="qt-customer-dashboard__banner-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <div className="qt-customer-dashboard__banner-content">{error}</div>
        </div>
      )}

      {/* Global Emergency Notices for Non-Live Today Appointments */}
      {dashboardItems.filter(item => item.emergency && !item.is_live_queue && item.temporal_classification !== 'future').map(item => <EmergencyNotice key={item.id} appointment={item} />)}

      {/* Summary Metrics Bar - Single Compact Typography-Led Strip */}
      <section className="qt-customer-dashboard__metrics-strip" aria-label="Customer Activity Summary">
        <div className="qt-customer-dashboard__metric-card">
          <div className="qt-customer-dashboard__metric-eyebrow">
            Live Queue
          </div>
          <div className="qt-customer-dashboard__metric-value">
            {liveQueueItems.length}
          </div>
          <div className="qt-customer-dashboard__metric-desc">
            Active sessions
          </div>
        </div>

        <div className="qt-customer-dashboard__metric-card">
          <div className="qt-customer-dashboard__metric-eyebrow">
            Upcoming
          </div>
          <div className="qt-customer-dashboard__metric-value">
            {upcomingItems.length}
          </div>
          <Link
            to="/customer/appointments"
            className="qt-customer-dashboard__metric-link"
          >
            View all →
          </Link>
        </div>

        <div className="qt-customer-dashboard__metric-card">
          <div className="qt-customer-dashboard__metric-eyebrow">
            Today's Schedule
          </div>
          <div className="qt-customer-dashboard__metric-value qt-customer-dashboard__metric-value--warning">
            {todayApptsCount}
          </div>
          <div className="qt-customer-dashboard__metric-desc">
            Consultations today
          </div>
        </div>

        <div className="qt-customer-dashboard__metric-card">
          <div className="qt-customer-dashboard__metric-eyebrow">
            Completed Care
          </div>
          <div className="qt-customer-dashboard__metric-value qt-customer-dashboard__metric-value--success">
            {completedCount}
          </div>
          <Link
            to="/customer/reviews"
            className="qt-customer-dashboard__metric-link qt-customer-dashboard__metric-link--success"
          >
            Reviews →
          </Link>
        </div>
      </section>

      {/* Needs Follow-up / Reports Notice Bar */}
      {totalUnresolved > 0 && (
        <div
          className={`qt-customer-dashboard__followup-banner ${unreportedCount > 0 ? 'qt-customer-dashboard__followup-banner--warning' : 'qt-customer-dashboard__followup-banner--surface'}`}
          role="status"
        >
          <div className="qt-customer-dashboard__followup-content">
            <span className="qt-customer-dashboard__followup-icon" aria-hidden="true">
              {unreportedCount > 0 ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              )}
            </span>
            <span className="qt-customer-dashboard__followup-text">
              {unreportedCount > 0 && underReviewCount === 0 && (
                <>
                  You have <strong>{unreportedCount}</strong> {unreportedCount === 1 ? 'appointment that needs' : 'appointments that need'} follow-up.
                </>
              )}
              {unreportedCount === 0 && underReviewCount > 0 && (
                <>
                  <strong>{underReviewCount}</strong> {underReviewCount === 1 ? 'appointment report is' : 'appointment reports are'} under review. We'll notify you when they're resolved.
                </>
              )}
              {unreportedCount > 0 && underReviewCount > 0 && (
                <>
                  <strong>{unreportedCount}</strong> {unreportedCount === 1 ? 'appointment still needs' : 'appointments still need'} your follow-up. <strong>{underReviewCount}</strong> {underReviewCount === 1 ? 'report is' : 'reports are'} already under review.
                </>
              )}
            </span>
          </div>

          <Link
            to="/customer/appointments?tab=needs-follow-up"
            className="qt-customer-dashboard__followup-link"
          >
            {unreportedCount > 0 ? 'Review appointments →' : 'View follow-ups →'}
          </Link>
        </div>
      )}

      {/* SECTION 1: LIVE QUEUE TELEMETRY */}
      <section className="qt-customer-dashboard__section" aria-label="Live Queue Telemetry Section">
        <div className="qt-customer-dashboard__section-header">
          <div>
            <h2 className="qt-customer-dashboard__section-title">
              Live Queue Telemetry ({liveQueueItems.length})
            </h2>
            <p className="qt-customer-dashboard__section-desc">
              Real-time position, estimated service time, and checked-in readiness status.
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading your active live queue telemetry..." />
        ) : liveQueueItems.length === 0 ? (
          <EmptyState
            title="No Active Queue Sessions Today"
            message="You do not have any appointments checked into a live queue line today."
            actionText="Book New Appointment"
            onAction={() => navigate('/customer/book')}
          />
        ) : (
          <div className="qt-customer-dashboard__live-queue-list">
            {liveQueueItems.map((item) => (
              <CustomerBookingCard
                key={item.id}
                item={item}
                onCheckIn={handleCheckIn}
                checkingInId={checkingInId}
              />
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: UPCOMING SCHEDULE (Timeline List Layout) */}
      <section className="qt-customer-dashboard__section" aria-label="Upcoming Schedule Section">
        <div className="qt-customer-dashboard__section-header">
          <div>
            <h2 className="qt-customer-dashboard__section-title">
              Upcoming Schedule ({upcomingItems.length})
            </h2>
            <p className="qt-customer-dashboard__section-desc">
              Scheduled future consultations across QueueTurn clinics.
            </p>
          </div>
          <Link to="/customer/appointments" className="qt-customer-dashboard__section-link">
            View all appointments →
          </Link>
        </div>

        {upcomingItems.length === 0 ? (
          <div className="qt-customer-dashboard__empty-upcoming">
            No future appointments scheduled yet. Click &quot;Book Appointment&quot; to reserve your slot.
          </div>
        ) : (
          <div className="qt-customer-dashboard__upcoming-list">
            {upcomingItems.map((item, idx) => {
              const qEntry = item.queue_entry;
              const normState = getNormalizedCustomerQueueState(item, qEntry);
              const formattedDate = new Date(item.start_datetime).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              const formattedTime = new Date(item.start_datetime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={item.id}
                  className={`qt-customer-dashboard__upcoming-row ${idx === upcomingItems.length - 1 ? 'qt-customer-dashboard__upcoming-row--last' : ''}`}
                >
                  <div className="qt-customer-dashboard__upcoming-main">
                    <div className="qt-customer-dashboard__upcoming-org">
                      {item.organization_name || 'Organization Clinic'}
                    </div>
                    <h3 className="qt-customer-dashboard__upcoming-service">
                      {item.service_name || 'Consultation Service'}
                    </h3>
                    <div className="qt-customer-dashboard__upcoming-provider">
                      Provider: <strong>{item.provider_name || item.provider_title || 'Assigned Specialist'}</strong>
                    </div>
                  </div>

                  <div className="qt-customer-dashboard__upcoming-meta">
                    <div className="qt-customer-dashboard__upcoming-datetime">
                      <div className="qt-customer-dashboard__upcoming-date">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        <span>{formattedDate}</span>
                      </div>
                      <div className="qt-customer-dashboard__upcoming-time">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>{formattedTime}</span>
                      </div>
                    </div>

                    {normState.serial_number && (
                      <div className="qt-customer-dashboard__upcoming-serial">
                        <span className="qt-customer-dashboard__upcoming-serial-label">Serial</span>
                        <span className="qt-customer-dashboard__upcoming-serial-number">
                          #{normState.serial_number}
                        </span>
                      </div>
                    )}

                    <StatusBadge status={item.status} />

                    <Link
                      to={`/customer/appointments/${item.id}`}
                      className="qt-customer-dashboard__upcoming-details-link"
                    >
                      Details →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 3: RECENTLY VIEWED ORGANIZATIONS */}
      <RecentlyViewedOrganizations />
    </div>
  );
};

export default CustomerDashboard;
