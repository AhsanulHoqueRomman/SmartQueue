import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';
import notificationService from '../services/notificationService';

export const NotificationBell = ({ onNewNotification }) => {
  const { currentOrg, effectiveRole } = useTenant();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const prevIdsRef = useRef(new Set());

  const fetchNotifications = async () => {
    if (!currentOrg?.id) {
      setNotifications([]);
      return;
    }
    try {
      const data = await notificationService.getNotifications(currentOrg.id);
      const list = Array.isArray(data) ? data : data.results || [];
      
      // Check for new unread notifications to trigger toast
      if (onNewNotification) {
        list.forEach((n) => {
          if (!n.read_at && !prevIdsRef.current.has(n.id)) {
            onNewNotification(n);
          }
        });
      }
      prevIdsRef.current = new Set(list.map((n) => n.id));
      setNotifications(list);
    } catch (e) {
      // Background poll fail silence
    }
  };

  useEffect(() => {
    fetchNotifications();

    // 20-second HTTP polling loop
    const timer = setInterval(() => {
      fetchNotifications();
    }, 20000);

    return () => clearInterval(timer);
  }, [currentOrg?.id]);

  // Handle outside click & Escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const unreadList = notifications.filter((n) => !n.read_at);
  const unreadCount = unreadList.length;

  const handleMarkRead = async (e, n) => {
    e.stopPropagation();
    if (!currentOrg?.id || n.read_at) return;
    try {
      await notificationService.markRead(currentOrg.id, n.id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item))
      );
    } catch (err) {}
  };

  const handleMarkAllRead = async () => {
    if (!currentOrg?.id || unreadCount === 0) return;
    try {
      await notificationService.markAllRead(currentOrg.id);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
    } catch (err) {}
  };

  const handleItemClick = async (n) => {
    if (!n.read_at && currentOrg?.id) {
      notificationService.markRead(currentOrg.id, n.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item))
      );
    }
    setIsOpen(false);

    // Contextual routing
    if (n.queue_entry_id) {
      if (effectiveRole === 'PROVIDER') {
        navigate('/provider/queue');
      } else {
        navigate(`/customer/queue/${n.queue_entry_id}`);
      }
    } else if (n.appointment_id) {
      if (effectiveRole === 'PROVIDER') {
        navigate('/provider/appointments');
      } else {
        navigate(`/customer/appointments/${n.appointment_id}`);
      }
    } else if (effectiveRole === 'MANAGER') {
      navigate('/manager/dashboard');
    } else {
      navigate('/customer/notifications');
    }
  };

  const notificationsPath = effectiveRole === 'STAFF' ? '/staff/notifications' : '/customer/notifications';

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          padding: '0.45rem',
          cursor: 'pointer',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-main)',
          fontSize: '1.2rem',
          transition: 'background 0.2s ease',
        }}
        aria-label={`Notifications (${unreadCount} unread)`}
        title="Notifications"
      >
        <span>🔔</span>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: '#EF4444',
              color: '#FFFFFF',
              fontSize: '0.7rem',
              fontWeight: 800,
              borderRadius: '9999px',
              minWidth: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4)',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: '0',
            width: '350px',
            maxWidth: '90vw',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E6E1D9',
            borderRadius: '16px',
            boxShadow: '0 12px 36px rgba(47, 37, 32, 0.12)',
            zIndex: 1000,
            overflow: 'hidden',
            animation: 'toastSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.85rem 1rem',
              backgroundColor: '#FAF8F3',
              borderBottom: '1px solid #E6E1D9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <strong style={{ fontSize: '0.9rem', color: '#211C19' }}>Notifications</strong>
              {unreadCount > 0 && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', background: '#F5EFE6', padding: '0.1rem 0.4rem', borderRadius: '6px' }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#5F7A70',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Body List */}
          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#78716C', fontSize: '0.85rem' }}>
                No notifications received yet.
              </div>
            ) : (
              notifications.slice(0, 8).map((n) => {
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid #FAF8F3',
                      backgroundColor: isUnread ? '#FAF8F3' : '#FFFFFF',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F5EFE6')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isUnread ? '#FAF8F3' : '#FFFFFF')}
                  >
                    <div style={{ marginTop: '3px' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: isUnread ? '#5F7A70' : 'transparent',
                          display: 'inline-block',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: isUnread ? 700 : 600, color: '#211C19', marginBottom: '0.15rem' }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#78716C', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#A8A29E', marginTop: '0.25rem' }}>
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '0.65rem',
              backgroundColor: '#FAF8F3',
              borderTop: '1px solid #E6E1D9',
              textAlign: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate(notificationsPath);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#5F7A70',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              View All Notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
