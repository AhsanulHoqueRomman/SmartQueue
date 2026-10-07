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

export const CustomerDashboard = () => {
  const { user } = useAuth();
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const [dashboardItems, setDashboardItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingInId, setCheckingInId] = useState(null);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);

  const fetchDashboardData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);

    try {
      const data = await appointmentService.getCustomerDashboard();
      const list = Array.isArray(data) ? data : data.results || [];
      setDashboardItems(list);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update customer dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCheckIn = async (orgId, appointmentId) => {
    if (!orgId || !appointmentId) return;
    setCheckingInId(appointmentId);

    try {
      await appointmentService.checkInAppointment(orgId, appointmentId);
      showSuccess('Checked in successfully! You are now in the live queue.');
      await fetchDashboardData(true);
    } catch (err) {
      showError(err.response?.data?.detail || 'Check-in failed. Please try again.');
    } finally {
      setCheckingInId(null);
    }
  };

  useEffect(() => {
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
  }, [currentOrg?.id]);

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
    <div className="animate-page-entrance" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header Banner - Streamlined & Task-First */}
      <div
        style={{
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border)',
          borderRadius: '18px',
          padding: '1.75rem 2rem',
          boxShadow: 'var(--lp-shadow-sm)',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
              Welcome back, {getUserFirstName()}!
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, margin: '0 0 0.35rem 0', fontFamily: 'Cinzel, serif', color: 'var(--lp-text)' }}>
              Customer Command Center
            </h1>
            <p style={{ color: 'var(--lp-text-subtle)', margin: 0, fontSize: '0.925rem' }}>
              Track your live queue telemetry, arrival windows, and upcoming consultations.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing}
              title="Refresh dashboard data"
              style={{
                padding: '0.65rem 0.9rem',
                background: 'var(--lp-bg-subtle)',
                color: 'var(--lp-text-subtle)',
                border: '1px solid var(--lp-border)',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: refreshing ? 'not-allowed' : 'pointer',
              }}
            >
              🔄 {refreshing ? 'Updating...' : 'Sync'}
            </button>

            <button
              onClick={() => navigate('/customer/book')}
              style={{
                padding: '0.75rem 1.4rem',
                background: 'var(--lp-btn-bg, #2F2520)',
                color: 'var(--lp-btn-text, #FFFFFF)',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(47, 37, 32, 0.25)',
              }}
            >
              ✨ Book Appointment
            </button>
          </div>
        </div>
      </div>

      {error && <div className="banner banner-danger" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      {/* Summary Metrics Bar - Single Compact Typography-Led Strip */}
      <div
        style={{
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border)',
          borderRadius: '14px',
          padding: '1.25rem 1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          boxShadow: 'var(--lp-shadow-sm)',
          marginBottom: '2rem',
        }}
      >
        <div style={{ paddingRight: '1rem' }}>
          <div style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Live Queue
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', lineHeight: 1.15, marginTop: '0.2rem' }}>
            {liveQueueItems.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--lp-text-subtle)' }}>Active sessions</div>
        </div>

        <div style={{ paddingRight: '1rem', borderLeft: '1px solid var(--lp-border)', paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Upcoming
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', lineHeight: 1.15, marginTop: '0.2rem' }}>
            {upcomingItems.length}
          </div>
          <Link to="/customer/appointments" style={{ fontSize: '0.78rem', color: 'var(--lp-accent)', fontWeight: 600, textDecoration: 'none' }}>
            View all →
          </Link>
        </div>

        <div style={{ paddingRight: '1rem', borderLeft: '1px solid var(--lp-border)', paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Today's Schedule
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--color-warning)', fontFamily: 'Outfit, sans-serif', lineHeight: 1.15, marginTop: '0.2rem' }}>
            {todayApptsCount}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--lp-text-subtle)' }}>Consultations today</div>
        </div>

        <div style={{ borderLeft: '1px solid var(--lp-border)', paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--lp-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Completed Care
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--color-success)', fontFamily: 'Outfit, sans-serif', lineHeight: 1.15, marginTop: '0.2rem' }}>
            {completedCount}
          </div>
          <Link to="/customer/reviews" style={{ fontSize: '0.78rem', color: 'var(--color-success)', fontWeight: 600, textDecoration: 'none' }}>
            Reviews →
          </Link>
        </div>
      </div>

      {/* Needs Follow-up / Reports Notice Bar */}
      {totalUnresolved > 0 && (
        <div
          style={{
            background: unreportedCount > 0 
              ? 'var(--color-warning-light, rgba(217, 119, 6, 0.08))' 
              : 'var(--lp-surface)',
            border: unreportedCount > 0 
              ? '1px solid var(--color-warning, #d97706)' 
              : '1px solid var(--lp-border)',
            borderRadius: '12px',
            padding: '1rem 1.35rem',
            marginBottom: '2rem',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            fontSize: '0.9rem',
            color: 'var(--lp-text)',
            boxShadow: unreportedCount > 0 ? 'none' : 'var(--lp-shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: '260px' }}>
            <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>
              {unreportedCount > 0 ? '⚠️' : '✓'}
            </span>
            <span style={{ lineHeight: 1.45 }}>
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
            style={{
              color: unreportedCount > 0 ? 'var(--color-warning, #d97706)' : 'var(--lp-accent, #5F7A70)',
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              background: 'var(--lp-bg-subtle)',
              border: '1px solid var(--lp-border)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              marginLeft: 'auto',
            }}
          >
            {unreportedCount > 0 ? 'Review appointments →' : 'View follow-ups →'}
          </Link>
        </div>
      )}

      {/* SECTION 1: LIVE QUEUE TELEMETRY */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--lp-border)' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--lp-text)', margin: 0, fontFamily: 'Cinzel, serif' }}>
              Live Queue Telemetry ({liveQueueItems.length})
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', margin: '0.2rem 0 0 0' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
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
      </div>

      {/* SECTION 2: UPCOMING SCHEDULE (Timeline List Layout) */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--lp-border)' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--lp-text)', margin: 0, fontFamily: 'Cinzel, serif' }}>
              Upcoming Schedule ({upcomingItems.length})
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)', margin: '0.2rem 0 0 0' }}>
              Scheduled future consultations across SmartQueue clinics.
            </p>
          </div>
          <Link to="/customer/appointments" style={{ fontSize: '0.85rem', color: 'var(--lp-accent)', fontWeight: 700, textDecoration: 'none' }}>
            View all appointments →
          </Link>
        </div>

        {upcomingItems.length === 0 ? (
          <div style={{ padding: '2rem 1.5rem', background: 'var(--lp-surface)', borderRadius: '14px', border: '1px solid var(--lp-border)', textAlign: 'center', color: 'var(--lp-text-subtle)', fontSize: '0.9rem' }}>
            No future appointments scheduled yet. Click "Book Appointment" to reserve your slot.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
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
                  style={{
                    padding: '1.25rem 0',
                    borderBottom: idx === upcomingItems.length - 1 ? 'none' : '1px solid var(--lp-border)',
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {item.organization_name || 'Organization Clinic'}
                    </div>
                    <h3 style={{ margin: '0.15rem 0 0.2rem 0', fontSize: '1.15rem', color: 'var(--lp-text)', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
                      {item.service_name || 'Consultation Service'}
                    </h3>
                    <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-subtle)' }}>
                      Provider: <strong style={{ color: 'var(--lp-text)' }}>{item.provider_name || item.provider_title || 'Assigned Specialist'}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--lp-text)' }}>
                        📅 {formattedDate}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-subtle)', marginTop: '0.15rem' }}>
                        ⏰ {formattedTime}
                      </div>
                    </div>

                    {normState.serial_number && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--lp-text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>Serial</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--lp-accent)', fontFamily: 'Outfit, sans-serif' }}>
                          #{normState.serial_number}
                        </div>
                      </div>
                    )}

                    <StatusBadge status={item.status} />

                    <Link
                      to={`/customer/appointments/${item.id}`}
                      style={{
                        padding: '0.5rem 0.9rem',
                        background: 'var(--lp-bg-subtle)',
                        color: 'var(--lp-accent)',
                        border: '1px solid var(--lp-border)',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        textDecoration: 'none',
                      }}
                    >
                      Details →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <RecentlyViewedOrganizations />
    </div>
  );
};

export default CustomerDashboard;
