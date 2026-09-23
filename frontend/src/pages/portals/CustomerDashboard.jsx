import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import appointmentService from '../../services/appointmentService';
import notificationService from '../../services/notificationService';
import { getRecentlyViewedOrgs, getFavoriteOrgs } from '../../utils/recentAndFavorites';
import CustomerBookingCard from '../../components/CustomerBookingCard';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export const CustomerDashboard = () => {
  const { user } = useAuth();
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const [dashboardItems, setDashboardItems] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [savedFavorites, setSavedFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingInId, setCheckingInId] = useState(null);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);

  useEffect(() => {
    setRecentlyViewed(getRecentlyViewedOrgs());
    setSavedFavorites(getFavoriteOrgs());
  }, []);

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

  // Categorize dashboard items into distinct arrays using stable IDs
  const liveQueueItems = dashboardItems.filter((item) => {
    const qStatus = item.queue_entry?.status || item.status;
    return ['WAITING', 'CALLED', 'IN_PROGRESS'].includes(qStatus);
  });

  const upcomingItems = dashboardItems.filter((item) => {
    const qStatus = item.queue_entry?.status || item.status;
    return !['WAITING', 'CALLED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'NO_SHOW'].includes(qStatus) &&
      new Date(item.start_datetime) > new Date();
  });

  const todayApptsCount = dashboardItems.filter(
    (item) => new Date(item.start_datetime).toDateString() === todayStr
  ).length;

  const completedCount = dashboardItems.filter(
    (item) => (item.queue_entry?.status || item.status) === 'COMPLETED'
  ).length;

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1150px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #2F2520 0%, #211C19 100%)',
          color: '#FAF8F3',
          borderRadius: '20px',
          padding: '2rem',
          boxShadow: '0 8px 30px rgba(47, 37, 32, 0.12)',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(230, 225, 217, 0.15)', color: '#E6E1D9', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              👤 Customer Schedule Command Center
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif', color: '#FAF8F3' }}>
              Welcome back, {user?.first_name || user?.email?.split('@')[0]}!
            </h1>
            <p style={{ color: '#E6E1D9', margin: 0, fontSize: '0.95rem', opacity: 0.9 }}>
              Supervise your live queue positions, upcoming consultations, and saved providers across SmartQueue.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing}
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#FAF8F3',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              🔄 {refreshing ? 'Refreshing...' : 'Refresh All'}
            </button>
            <button
              onClick={() => navigate('/organizations')}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#FAF8F3',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              🏥 Explore Clinics
            </button>
            <button
              onClick={() => navigate('/customer/book')}
              style={{
                padding: '0.75rem 1.25rem',
                background: '#5F7A70',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(95, 122, 112, 0.3)',
              }}
            >
              ✨ Book Appointment
            </button>
          </div>
        </div>
      </div>

      {/* Summary Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase' }}>
            Live Queue Sessions
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#5F7A70', marginTop: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
            {liveQueueItems.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#78716C' }}>Active sessions</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>
            Upcoming Bookings
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#211C19', marginTop: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
            {upcomingItems.length}
          </div>
          <Link to="/customer/appointments" style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600, textDecoration: 'none' }}>
            View schedule →
          </Link>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>
            Today's Schedule
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#B06D2E', marginTop: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
            {todayApptsCount}
          </div>
          <span style={{ fontSize: '0.8rem', color: '#78716C' }}>Bookings for today</span>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>
            Completed Care
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#4F7A5A', marginTop: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
            {completedCount}
          </div>
          <Link to="/customer/reviews" style={{ fontSize: '0.8rem', color: '#4F7A5A', fontWeight: 600, textDecoration: 'none' }}>
            Write reviews →
          </Link>
        </div>
      </div>

      {/* SECTION 1: MY SCHEDULE / LIVE QUEUE CARDS */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#211C19', margin: 0, fontFamily: 'Cinzel, serif' }}>
              🟢 Live Queue Telemetry Cards ({liveQueueItems.length})
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#78716C', margin: '0.2rem 0 0 0' }}>
              Real-time serial telemetry and ETA windows across all your active bookings.
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading your live queue schedule..." />
        ) : liveQueueItems.length === 0 ? (
          <EmptyState
            title="No Active Queue Sessions"
            message="You do not have any appointments currently in a live queue line."
            actionText="Book an Appointment"
            onAction={() => navigate('/customer/book')}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
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

      {/* SECTION 2: UPCOMING SCHEDULE & QUICK ACTIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Upcoming Bookings Grid */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #FAF8F3' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#211C19', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
              Upcoming Schedule ({upcomingItems.length})
            </h3>
            <Link to="/customer/appointments" style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600, textDecoration: 'none' }}>
              View all →
            </Link>
          </div>

          {upcomingItems.length === 0 ? (
            <p style={{ color: '#78716C', fontSize: '0.85rem', margin: 0 }}>
              No upcoming appointments scheduled for future dates.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {upcomingItems.slice(0, 3).map((item) => (
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

        {/* Quick Navigation Shortcuts */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', color: '#211C19', fontWeight: 700, fontFamily: 'Cinzel, serif', paddingBottom: '0.75rem', borderBottom: '1px solid #FAF8F3' }}>
              Quick Actions
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div
                onClick={() => navigate('/organizations')}
                style={{ padding: '0.85rem', background: '#FAF8F3', borderRadius: '10px', border: '1px solid #E6E1D9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s ease' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>🏥</span>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#211C19' }}>Explore Clinics & Services</div>
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>Find verified partner providers</div>
                  </div>
                </div>
                <span style={{ color: '#5F7A70', fontWeight: 700 }}>→</span>
              </div>

              <div
                onClick={() => navigate('/customer/appointments')}
                style={{ padding: '0.85rem', background: '#FAF8F3', borderRadius: '10px', border: '1px solid #E6E1D9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s ease' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>📋</span>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#211C19' }}>My Appointments</div>
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>Full appointment & queue history</div>
                  </div>
                </div>
                <span style={{ color: '#5F7A70', fontWeight: 700 }}>→</span>
              </div>

              <div
                onClick={() => navigate('/customer/notifications')}
                style={{ padding: '0.85rem', background: '#FAF8F3', borderRadius: '10px', border: '1px solid #E6E1D9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s ease' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>🔔</span>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#211C19' }}>Notifications Center</div>
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>Queue call-outs & reminders</div>
                  </div>
                </div>
                <span style={{ color: '#5F7A70', fontWeight: 700 }}>→</span>
              </div>

              <div
                onClick={() => navigate('/customer/reviews')}
                style={{ padding: '0.85rem', background: '#FAF8F3', borderRadius: '10px', border: '1px solid #E6E1D9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s ease' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>★</span>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#211C19' }}>My Reviews</div>
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>Rate completed consultations</div>
                  </div>
                </div>
                <span style={{ color: '#5F7A70', fontWeight: 700 }}>→</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Saved & Recently Viewed Clinics Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
        {/* Saved Favorites Widget */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #FAF8F3' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#211C19', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
              ❤️ Saved Clinics ({savedFavorites.length})
            </h3>
            <Link to="/favorites" style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600, textDecoration: 'none' }}>
              View all →
            </Link>
          </div>

          {savedFavorites.length === 0 ? (
            <p style={{ color: '#78716C', fontSize: '0.85rem', margin: 0 }}>
              No bookmarked clinics yet. Click heart icons on clinic profiles to save them here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {savedFavorites.slice(0, 3).map((org) => (
                <div
                  key={org.id}
                  onClick={() => navigate(`/organizations/${org.id}`)}
                  style={{ padding: '0.75rem', background: '#FAF8F3', borderRadius: '10px', border: '1px solid #E6E1D9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#211C19' }}>{org.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>{org.category || 'HEALTHCARE'} • ★ {org.rating || '4.9'}</div>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: '#5F7A70', fontWeight: 600 }}>Book →</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently Viewed Widget */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #FAF8F3' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#211C19', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
              🕒 Recently Viewed Clinics
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#78716C' }}>History</span>
          </div>

          {recentlyViewed.length === 0 ? (
            <p style={{ color: '#78716C', fontSize: '0.85rem', margin: 0 }}>
              No recently viewed clinics. Explore clinics to keep track of your browsing history.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {recentlyViewed.slice(0, 3).map((org) => (
                <div
                  key={org.id}
                  onClick={() => navigate(`/organizations/${org.id}`)}
                  style={{ padding: '0.75rem', background: '#FAF8F3', borderRadius: '10px', border: '1px solid #E6E1D9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#211C19' }}>{org.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>{org.category || 'HEALTHCARE'}</div>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: '#5F7A70', fontWeight: 600 }}>View →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;
