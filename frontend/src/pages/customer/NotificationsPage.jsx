import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import notificationService from '../../services/notificationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function NotificationsPage() {
  const { currentOrg } = useTenant();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [markingId, setMarkingId] = useState(null);

  const fetchNotifications = async () => {
    if (!currentOrg?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await notificationService.getNotifications(currentOrg.id);
      const list = Array.isArray(data) ? data : data.results || [];
      setNotifications(list);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [currentOrg?.id]);

  const handleMarkRead = async (notificationId) => {
    if (!currentOrg?.id) return;
    setMarkingId(notificationId);
    try {
      await notificationService.markRead(currentOrg.id, notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (!currentOrg?.id) return;
    const unread = notifications.filter((n) => !n.read_at);
    for (const n of unread) {
      try {
        await notificationService.markRead(currentOrg.id, n.id);
      } catch (e) {}
    }
    fetchNotifications();
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '850px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', fontFamily: 'Cinzel, serif', color: '#211C19' }}>
            Notifications Center
          </h1>
          <p style={{ color: '#78716C', margin: 0 }}>
            Stay informed about your appointments, queue calls, and clinic updates.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{
              padding: '0.5rem 1rem',
              background: '#FAF8F3',
              color: '#5F7A70',
              border: '1px solid #E6E1D9',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Mark All as Read ({unreadCount})
          </button>
        )}
      </div>

      {error && <div className="banner banner-danger" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      {!currentOrg ? (
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the header dropdown above to view notifications."
        />
      ) : loading ? (
        <LoadingState message="Fetching your notifications..." />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="You haven't received any notifications"
          message="Important updates regarding your appointments and queue status will appear here."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {notifications.map((n) => {
            const isUnread = !n.read_at;
            const kindLabel = n.kind ? n.kind.replace('_', ' ') : 'NOTIFICATION';

            return (
              <div
                key={n.id}
                style={{
                  background: isUnread ? '#FFFFFF' : '#FAF8F3',
                  borderRadius: '12px',
                  border: isUnread ? '1px solid #5F7A70' : '1px solid #E6E1D9',
                  padding: '1.25rem',
                  display: 'flex',
                  justify: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  boxShadow: isUnread ? '0 4px 12px rgba(95, 122, 112, 0.08)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    {isUnread && (
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5F7A70', display: 'inline-block' }} />
                    )}
                    <span style={{ background: '#FAF8F3', color: '#5F7A70', border: '1px solid #E6E1D9', fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                      {kindLabel}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#78716C' }}>
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>

                  <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: '#211C19', fontWeight: 700 }}>
                    {n.title || 'Notification Update'}
                  </h4>

                  <p style={{ margin: 0, color: '#5C544E', fontSize: '0.9rem', lineHeight: 1.4 }}>
                    {n.message}
                  </p>
                </div>

                {isUnread && (
                  <button
                    onClick={() => handleMarkRead(n.id)}
                    disabled={markingId === n.id}
                    style={{
                      padding: '0.35rem 0.75rem',
                      background: 'none',
                      border: '1px solid #E6E1D9',
                      borderRadius: '6px',
                      color: '#5F7A70',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {markingId === n.id ? 'Marking...' : 'Mark as Read'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationsPage;
