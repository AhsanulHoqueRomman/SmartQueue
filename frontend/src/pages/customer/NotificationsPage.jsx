import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import notificationService from '../../services/notificationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function NotificationsPage() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTab, setFilterTab] = useState('ALL'); // 'ALL' | 'UNREAD' | 'READ'
  const [markingId, setMarkingId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await notificationService.getCustomerNotifications();
      const list = Array.isArray(data) ? data : data.results || [];
      setNotifications(list);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load customer notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkRead = async (e, n) => {
    e.stopPropagation();
    if (n.read_at) return;

    setMarkingId(n.id);
    try {
      await notificationService.markRead(n.organization, n.id);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationService.markAllCustomerNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleCardClick = (n) => {
    if (!n.read_at) {
      notificationService.markRead(n.organization, n.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
    }

    const kind = n.kind || n.type;
    if (['APPOINTMENT_BOOKED', 'APPOINTMENT_CANCELLED', 'SERVICE_COMPLETED'].includes(kind) && n.appointment_id) {
      navigate(`/customer/appointments/${n.appointment_id}`);
    } else if (n.queue_entry_id) {
      navigate(`/customer/queue/${n.queue_entry_id}`);
    } else if (n.appointment_id) {
      navigate(`/customer/appointments/${n.appointment_id}`);
    } else {
      navigate('/customer/dashboard');
    }
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const readCount = notifications.filter((n) => n.read_at).length;

  const filteredNotifications = notifications.filter((n) => {
    if (filterTab === 'UNREAD') return !n.read_at;
    if (filterTab === 'READ') return !!n.read_at;
    return true;
  });

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '850px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.75rem',
              marginBottom: '0.25rem',
              fontFamily: 'Cinzel, serif',
              color: 'var(--lp-text)',
            }}
          >
            Notifications Center
          </h1>
          <p style={{ color: 'var(--lp-text-subtle)', margin: 0, fontSize: '0.95rem' }}>
            Cross-clinic updates for your appointments, queue calls, and booking status.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            style={{
              padding: '0.55rem 1.15rem',
              background: 'var(--lp-accent)',
              color: 'var(--lp-btn-text)',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(95, 122, 112, 0.25)',
              transition: 'all 0.2s ease',
            }}
          >
            {markingAll ? 'Marking...' : `Mark All as Read (${unreadCount})`}
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--lp-border)',
          paddingBottom: '0.75rem',
        }}
      >
        <button
          onClick={() => setFilterTab('ALL')}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '20px',
            border: filterTab === 'ALL' ? 'none' : '1px solid var(--lp-border)',
            background: filterTab === 'ALL' ? 'var(--lp-accent)' : 'var(--lp-surface)',
            color: filterTab === 'ALL' ? 'var(--lp-btn-text)' : 'var(--lp-text-subtle)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilterTab('UNREAD')}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '20px',
            border: filterTab === 'UNREAD' ? 'none' : '1px solid var(--lp-border)',
            background: filterTab === 'UNREAD' ? 'var(--lp-accent)' : 'var(--lp-surface)',
            color: filterTab === 'UNREAD' ? 'var(--lp-btn-text)' : 'var(--lp-text-subtle)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Unread ({unreadCount})
        </button>
        <button
          onClick={() => setFilterTab('READ')}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '20px',
            border: filterTab === 'READ' ? 'none' : '1px solid var(--lp-border)',
            background: filterTab === 'READ' ? 'var(--lp-accent)' : 'var(--lp-surface)',
            color: filterTab === 'READ' ? 'var(--lp-btn-text)' : 'var(--lp-text-subtle)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Read ({readCount})
        </button>
      </div>

      {error && <div className="banner banner-danger" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      {loading ? (
        <LoadingState message="Fetching your notifications across clinics..." />
      ) : filteredNotifications.length === 0 ? (
        <EmptyState
          title={
            filterTab === 'UNREAD'
              ? 'No Unread Notifications'
              : filterTab === 'READ'
              ? 'No Read Notifications'
              : 'You haven\'t received any notifications'
          }
          message="Important updates regarding your appointments and queue status will appear here."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filteredNotifications.map((n) => {
            const isUnread = !n.read_at;
            const kindLabel = n.kind ? n.kind.replace(/_/g, ' ') : 'NOTIFICATION';

            return (
              <div
                key={n.id}
                onClick={() => handleCardClick(n)}
                style={{
                  background: isUnread ? 'var(--lp-surface)' : 'var(--lp-bg-subtle)',
                  borderRadius: '14px',
                  border: isUnread ? '1.5px solid var(--lp-accent)' : '1px solid var(--lp-border)',
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  boxShadow: isUnread ? 'var(--lp-shadow-sm)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    {isUnread && (
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--lp-accent)',
                          display: 'inline-block',
                        }}
                      />
                    )}
                    <span
                      style={{
                        background: 'var(--lp-bg-subtle)',
                        color: 'var(--lp-accent)',
                        border: '1px solid var(--lp-border)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {kindLabel}
                    </span>
                    {n.organization_name && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: 'var(--lp-text)',
                          background: 'var(--lp-bg-subtle)',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                        }}
                      >
                        🏥 {n.organization_name}
                      </span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)' }}>
                      {new Date(n.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: 'var(--lp-text)', fontWeight: 700 }}>
                    {n.title || 'Notification Update'}
                  </h4>

                  <p style={{ margin: 0, color: 'var(--lp-text-subtle)', fontSize: '0.9rem', lineHeight: 1.45 }}>
                    {n.message}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  {isUnread && (
                    <button
                      onClick={(e) => handleMarkRead(e, n)}
                      disabled={markingId === n.id}
                      style={{
                        padding: '0.35rem 0.75rem',
                        background: 'none',
                        border: '1px solid var(--lp-border)',
                        borderRadius: '6px',
                        color: 'var(--lp-accent)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {markingId === n.id ? 'Marking...' : 'Mark as Read'}
                    </button>
                  )}
                  <span style={{ fontSize: '0.8rem', color: 'var(--lp-accent)', fontWeight: 700 }}>
                    View details →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationsPage;
