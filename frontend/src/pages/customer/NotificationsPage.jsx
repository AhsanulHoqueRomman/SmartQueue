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

    if (n.queue_entry_id) {
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
              color: '#211C19',
            }}
          >
            Notifications Center
          </h1>
          <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
            Cross-clinic updates for your appointments, queue calls, and booking status.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            style={{
              padding: '0.55rem 1.15rem',
              background: '#5F7A70',
              color: '#FFFFFF',
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
          borderBottom: '1px solid #E6E1D9',
          paddingBottom: '0.75rem',
        }}
      >
        <button
          onClick={() => setFilterTab('ALL')}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '20px',
            border: filterTab === 'ALL' ? 'none' : '1px solid #E6E1D9',
            background: filterTab === 'ALL' ? '#5F7A70' : '#FFFFFF',
            color: filterTab === 'ALL' ? '#FFFFFF' : '#78716C',
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
            border: filterTab === 'UNREAD' ? 'none' : '1px solid #E6E1D9',
            background: filterTab === 'UNREAD' ? '#5F7A70' : '#FFFFFF',
            color: filterTab === 'UNREAD' ? '#FFFFFF' : '#78716C',
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
            border: filterTab === 'READ' ? 'none' : '1px solid #E6E1D9',
            background: filterTab === 'READ' ? '#5F7A70' : '#FFFFFF',
            color: filterTab === 'READ' ? '#FFFFFF' : '#78716C',
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
                  background: isUnread ? '#FFFFFF' : '#FAF8F3',
                  borderRadius: '14px',
                  border: isUnread ? '1.5px solid #5F7A70' : '1px solid #E6E1D9',
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  boxShadow: isUnread ? '0 4px 16px rgba(95, 122, 112, 0.1)' : 'none',
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
                          background: '#5F7A70',
                          display: 'inline-block',
                        }}
                      />
                    )}
                    <span
                      style={{
                        background: '#FAF8F3',
                        color: '#5F7A70',
                        border: '1px solid #E6E1D9',
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
                          color: '#211C19',
                          background: '#F5EFE6',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                        }}
                      >
                        🏥 {n.organization_name}
                      </span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: '#78716C' }}>
                      {new Date(n.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: '#211C19', fontWeight: 700 }}>
                    {n.title || 'Notification Update'}
                  </h4>

                  <p style={{ margin: 0, color: '#5C544E', fontSize: '0.9rem', lineHeight: 1.45 }}>
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
                  <span style={{ fontSize: '0.8rem', color: '#5F7A70', fontWeight: 700 }}>
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
