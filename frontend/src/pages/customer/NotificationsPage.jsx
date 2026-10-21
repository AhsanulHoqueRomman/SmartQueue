import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import notificationService from '../../services/notificationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import '../../styles/Notifications.css';

/* ─── SVG Bell Icon ──────────────────────────────────────────────────────── */
const BellIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

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
      setError(err.response?.data?.detail || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkRead = async (e, n) => {
    e.stopPropagation();
    if (n.read_at || markingId === n.id) return;

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
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await notificationService.markAllCustomerNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
    } catch (e) {
      console.error('Failed to mark all notifications as read:', e);
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

  const handleCardKeyDown = (e, n) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(n);
    }
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read_at).length, [notifications]);
  const readCount = useMemo(() => notifications.filter((n) => !!n.read_at).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (filterTab === 'UNREAD') return notifications.filter((n) => !n.read_at);
    if (filterTab === 'READ') return notifications.filter((n) => !!n.read_at);
    return notifications;
  }, [notifications, filterTab]);

  return (
    <div className="notifications" role="main">
      {/* Editorial Header */}
      <header className="notifications__header">
        <div className="notifications__header-main">
          <span className="notifications__eyebrow">
            <BellIcon size={14} /> Activity & Updates
          </span>
          <h1 className="notifications__title">Notifications Center</h1>
          <p className="notifications__subtitle">
            Cross-clinic updates for your appointments, queue calls, and booking status.
          </p>
        </div>

        <div className="notifications__header-actions">
          {unreadCount > 0 && (
            <button
              type="button"
              className="notifications__btn-mark-all"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              aria-label={`Mark all ${unreadCount} unread notifications as read`}
            >
              {markingAll ? 'Marking All...' : `Mark All as Read (${unreadCount})`}
            </button>
          )}
        </div>
      </header>

      {/* Filter Tabs */}
      <nav className="notifications__tabs" aria-label="Notification filters">
        <button
          type="button"
          className={`notifications__tab ${filterTab === 'ALL' ? 'notifications__tab--active' : ''}`}
          onClick={() => setFilterTab('ALL')}
          aria-pressed={filterTab === 'ALL'}
        >
          All <span className="notifications__tab-count">{notifications.length}</span>
        </button>

        <button
          type="button"
          className={`notifications__tab ${filterTab === 'UNREAD' ? 'notifications__tab--active' : ''}`}
          onClick={() => setFilterTab('UNREAD')}
          aria-pressed={filterTab === 'UNREAD'}
        >
          Unread <span className="notifications__tab-count">{unreadCount}</span>
        </button>

        <button
          type="button"
          className={`notifications__tab ${filterTab === 'READ' ? 'notifications__tab--active' : ''}`}
          onClick={() => setFilterTab('READ')}
          aria-pressed={filterTab === 'READ'}
        >
          Read <span className="notifications__tab-count">{readCount}</span>
        </button>
      </nav>

      {/* Error State */}
      {error && (
        <div className="notifications__error-banner" role="alert">
          <span>⚠️ {error}</span>
          <button
            type="button"
            className="notifications__btn-mark-read"
            onClick={fetchNotifications}
          >
            Retry
          </button>
        </div>
      )}

      {/* Content States */}
      {loading ? (
        <LoadingState message="Fetching your notifications across clinics..." />
      ) : filteredNotifications.length === 0 ? (
        <EmptyState
          title={
            filterTab === 'UNREAD'
              ? 'No Unread Notifications'
              : filterTab === 'READ'
              ? 'No Read Notifications'
              : 'You have no notifications yet'
          }
          message="Important updates regarding your appointments and queue status will appear here."
        />
      ) : (
        <div className="notifications__list" role="feed" aria-label="Notifications list">
          {filteredNotifications.map((n) => {
            const isUnread = !n.read_at;
            const kindLabel = n.kind ? n.kind.replace(/_/g, ' ') : 'NOTIFICATION';

            return (
              <article
                key={n.id}
                tabIndex={0}
                role="article"
                className={`notifications__card ${
                  isUnread ? 'notifications__card--unread' : 'notifications__card--read'
                }`}
                onClick={() => handleCardClick(n)}
                onKeyDown={(e) => handleCardKeyDown(e, n)}
                aria-label={`${isUnread ? 'Unread notification' : 'Notification'}: ${n.title || kindLabel}`}
              >
                <div className="notifications__card-main">
                  <div className="notifications__card-meta">
                    {isUnread && (
                      <span className="notifications__unread-dot" title="Unread notification" />
                    )}
                    <span className="notifications__kind-badge">{kindLabel}</span>
                    {n.organization_name && (
                      <span className="notifications__org-badge">
                        🏥 {n.organization_name}
                      </span>
                    )}
                    <time
                      className="notifications__timestamp"
                      dateTime={n.created_at}
                    >
                      {new Date(n.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>

                  <h2 className="notifications__card-title">
                    {n.title || 'Notification Update'}
                  </h2>

                  <p className="notifications__card-message">{n.message}</p>
                </div>

                <div className="notifications__card-side">
                  {isUnread && (
                    <button
                      type="button"
                      className="notifications__btn-mark-read"
                      onClick={(e) => handleMarkRead(e, n)}
                      disabled={markingId === n.id}
                      aria-label="Mark this notification as read"
                    >
                      {markingId === n.id ? 'Marking...' : 'Mark as Read'}
                    </button>
                  )}
                  <span className="notifications__card-link" aria-hidden="true">
                    View details →
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationsPage;
