import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import queueService from '../../services/queueService';
import notificationService from '../../services/notificationService';
import { getRecentlyViewedOrgs, getFavoriteOrgs } from '../../utils/recentAndFavorites';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export const CustomerDashboard = () => {
  const { user } = useAuth();
  const { currentOrg } = useTenant();
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState([]);
  const [activeQueueEntry, setActiveQueueEntry] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [savedFavorites, setSavedFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setRecentlyViewed(getRecentlyViewedOrgs());
    setSavedFavorites(getFavoriteOrgs());
  }, []);

  useEffect(() => {
    if (!currentOrg?.id) {
      setAppointments([]);
      setActiveQueueEntry(null);
      setNotifications([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      appointmentService.getAppointments(currentOrg.id),
      queueService.getMyQueue(currentOrg.id),
      notificationService.getNotifications(currentOrg.id),
    ])
      .then(([apptRes, queueRes, notifRes]) => {
        if (!isMounted) return;

        if (apptRes.status === 'fulfilled') {
          const list = Array.isArray(apptRes.value) ? apptRes.value : apptRes.value.results || [];
          setAppointments(list);
        }

        if (queueRes.status === 'fulfilled') {
          const qList = Array.isArray(queueRes.value) ? queueRes.value : queueRes.value.results || [];
          const active = qList.find((q) => ['WAITING', 'CALLED', 'IN_PROGRESS'].includes(q.status));
          setActiveQueueEntry(active || null);
        }

        if (notifRes.status === 'fulfilled') {
          const nList = Array.isArray(notifRes.value) ? notifRes.value : notifRes.value.results || [];
          setNotifications(nList.slice(0, 3));
        }
      })
      .catch((err) => {
        if (isMounted) setError('Failed to load portal metrics.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id]);

  const todayStr = new Date().toDateString();

  const upcomingCount = appointments.filter(
    (a) => ['CONFIRMED', 'PENDING'].includes(a.status) && new Date(a.start_datetime) > new Date()
  ).length;

  const todayAppts = appointments.filter(
    (a) => new Date(a.start_datetime).toDateString() === todayStr
  );

  const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;

  const todayNextAppt = todayAppts.find((a) =>
    ['CONFIRMED', 'CHECKED_IN', 'WAITING', 'CALLED', 'IN_PROGRESS'].includes(a.status)
  );

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1100px', margin: '0 auto' }}>
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
              👤 Customer Portal
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
              Welcome back, {user?.first_name || user?.email?.split('@')[0]}!
            </h1>
            <p style={{ color: '#E6E1D9', margin: 0, fontSize: '0.95rem', opacity: 0.9 }}>
              Managing your service schedule at <strong>{currentOrg?.name || 'SmartQueue Network'}</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                transition: 'all 0.2s ease',
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

      {/* Active Queue Banner if Customer is in Queue */}
      {activeQueueEntry && (
        <div
          style={{
            background: '#FAF8F3',
            border: '2px solid #5F7A70',
            borderRadius: '16px',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.75rem',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 4px 20px rgba(95, 122, 112, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#5F7A70',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                fontWeight: 800,
                fontSize: '1.2rem',
              }}
            >
              #{activeQueueEntry.token_number}
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase' }}>
                Active Queue Session
              </div>
              <h4 style={{ margin: '0.1rem 0 0 0', fontSize: '1.1rem', color: '#211C19' }}>
                {activeQueueEntry.service_name || 'Service Appointment'}
              </h4>
              <div style={{ fontSize: '0.85rem', color: '#78716C' }}>
                Status: <strong style={{ color: '#211C19' }}>{activeQueueEntry.status}</strong>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate(`/customer/queue/${activeQueueEntry.id}`)}
            style={{
              padding: '0.65rem 1.25rem',
              background: '#2F2520',
              color: '#FAF8F3',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Open Live Telemetry →
          </button>
        </div>
      )}

      {/* Real Summary Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>
            Upcoming Bookings
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#211C19', marginTop: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
            {upcomingCount}
          </div>
          <Link to="/customer/appointments" style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600, textDecoration: 'none' }}>
            View upcoming →
          </Link>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>
            Today's Schedule
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#B06D2E', marginTop: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
            {todayAppts.length}
          </div>
          <Link to="/customer/appointments" style={{ fontSize: '0.8rem', color: '#B06D2E', fontWeight: 600, textDecoration: 'none' }}>
            View today's schedule →
          </Link>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>
            Completed Services
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#5F7A70', marginTop: '0.25rem', fontFamily: 'Outfit, sans-serif' }}>
            {completedCount}
          </div>
          <Link to="/customer/reviews" style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 600, textDecoration: 'none' }}>
            Leave a review →
          </Link>
        </div>
      </div>

      {/* Main Grid: Today's Next Appointment & Quick Shortcuts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
        {/* Today's Next Appointment Card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #FAF8F3' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#211C19', fontWeight: 700 }}>
              Today's Next Appointment
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#78716C' }}>{new Date().toLocaleDateString()}</span>
          </div>

          {!currentOrg ? (
            <EmptyState title="No Organization Selected" message="Select an organization above." />
          ) : loading ? (
            <LoadingState message="Checking today's schedule..." />
          ) : !todayNextAppt ? (
            <EmptyState
              title="No Appointments Today"
              message="You have no appointments scheduled for today."
              actionText="Book Appointment"
              onAction={() => navigate('/customer/book')}
            />
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <StatusBadge status={todayNextAppt.status} />
                <span style={{ fontSize: '0.8rem', color: '#78716C', fontFamily: 'monospace' }}>
                  #{todayNextAppt.id.slice(0, 8)}
                </span>
              </div>

              <h4 style={{ fontSize: '1.2rem', color: '#211C19', margin: '0 0 0.35rem 0', fontWeight: 700 }}>
                {todayNextAppt.service_name || 'Service Appointment'}
              </h4>

              <div style={{ fontSize: '0.9rem', color: '#5F7A70', fontWeight: 600, marginBottom: '0.75rem' }}>
                👨‍⚕️ {todayNextAppt.provider_name || 'Assigned Provider'}
              </div>

              <div style={{ background: '#FAF8F3', borderRadius: '10px', padding: '0.85rem', fontSize: '0.85rem', color: '#211C19', marginBottom: '1.25rem', border: '1px solid #E6E1D9' }}>
                ⏰ <strong>{new Date(todayNextAppt.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
              </div>

              <button
                onClick={() => navigate(`/customer/appointments/${todayNextAppt.id}`)}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  background: '#5F7A70',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                View Appointment & Check-In →
              </button>
            </div>
          )}
        </div>

        {/* Quick Navigation Shortcuts */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', color: '#211C19', fontWeight: 700, paddingBottom: '0.75rem', borderBottom: '1px solid #FAF8F3' }}>
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
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#211C19' }}>Explore Clinics</div>
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>Find top-rated partner providers</div>
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
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>Manage past & upcoming bookings</div>
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
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>View queue calls & reminders</div>
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
                    <div style={{ fontSize: '0.75rem', color: '#78716C' }}>Share feedback for completed care</div>
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
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#211C19', fontWeight: 700 }}>
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
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#211C19', fontWeight: 700 }}>
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
