import React, { useState, useEffect, useCallback } from 'react';
import adminService from '../../services/adminService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';
import '../../styles/AdminContact.css';

const STATUS_TABS = [
  { key: 'ALL', label: 'All Inquiries' },
  { key: 'NEW', label: 'New' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'REPLIED', label: 'Replied' },
  { key: 'CLOSED', label: 'Closed' },
];

const STATUS_BADGE_LABELS = {
  NEW: 'New',
  IN_REVIEW: 'In Review',
  REPLIED: 'Replied',
  CLOSED: 'Closed',
};

export function AdminContactPage() {
  const { showSuccess, showError } = useToast();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & Pagination
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);

  // Detail / Reply Modal State
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        page_size: 15,
      };
      if (activeTab !== 'ALL') {
        params.status = activeTab;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const data = await adminService.getContactMessages(params);
      if (Array.isArray(data)) {
        setMessages(data);
        setTotalCount(data.length);
        setHasNextPage(false);
        setHasPrevPage(false);
      } else {
        setMessages(data.results || []);
        setTotalCount(data.count || 0);
        setHasNextPage(!!data.next);
        setHasPrevPage(!!data.previous);
      }
    } catch (err) {
      console.error('Failed to fetch contact messages:', err);
      setError('Failed to load contact messages. Please refresh or try again.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, page]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedMessage) {
        setSelectedMessage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMessage]);

  const handleOpenDetail = async (msg) => {
    setDetailLoading(true);
    setSelectedMessage(msg);
    setReplyText('');
    try {
      // Auto-mark review if status is NEW
      const detail = await adminService.getContactMessageDetail(msg.id, msg.status === 'NEW');
      setSelectedMessage(detail);
      // Refresh list to update status badge if it transitioned from NEW to IN_REVIEW
      if (msg.status === 'NEW') {
        fetchMessages();
      }
    } catch (err) {
      console.error('Failed to load message detail:', err);
      showError('Failed to load message details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedMessage || statusUpdating) return;
    setStatusUpdating(true);
    try {
      const updated = await adminService.updateContactStatus(selectedMessage.id, newStatus);
      setSelectedMessage(updated);
      showSuccess(`Inquiry status updated to ${STATUS_BADGE_LABELS[newStatus] || newStatus}.`);
      fetchMessages();
    } catch (err) {
      console.error('Failed to update status:', err);
      showError('Failed to update status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || replySubmitting || !selectedMessage) return;

    setReplySubmitting(true);
    try {
      const updated = await adminService.replyToContactMessage(selectedMessage.id, replyText.trim());
      setSelectedMessage(updated);
      setReplyText('');
      showSuccess('Reply saved successfully. Email delivery is handled via Resend.');
      fetchMessages();
    } catch (err) {
      console.error('Failed to submit reply:', err);
      showError(err.response?.data?.message?.[0] || 'Failed to submit reply.');
    } finally {
      setReplySubmitting(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="admin-contact animate-page-entrance">
      {/* Editorial Header */}
      <header className="admin-contact__header">
        <div className="admin-contact__header-main">
          <span className="admin-contact__eyebrow">⚡ Platform Support & Governance</span>
          <h1 className="admin-contact__title">Admin Contact Inbox</h1>
          <p className="admin-contact__subtitle">
            System-wide customer support inquiries and visitor feedback management.
          </p>
        </div>
      </header>

      {/* Controls Card: Tabs, Search & Counter */}
      <div className="admin-contact__controls-card">
        <nav className="admin-contact__tabs" role="tablist" aria-label="Inquiry status filters">
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`admin-contact__tab ${isActive ? 'admin-contact__tab--active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="admin-contact__search-row">
          <div className="admin-contact__search-wrap">
            <span className="admin-contact__search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="admin-contact__search-input"
              placeholder="Search by name, email, subject, or message text..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              aria-label="Search inquiries"
            />
          </div>

          <div className="admin-contact__count-badge">
            Total Inquiries: <strong>{totalCount}</strong>
          </div>
        </div>
      </div>

      {/* Table Content Card */}
      {loading ? (
        <LoadingState message="Loading contact messages..." />
      ) : error ? (
        <div style={{ padding: '1.5rem', backgroundColor: 'var(--color-error-bg, rgba(180, 83, 75, 0.1))', borderRadius: '12px', border: '1px solid var(--color-error-border, rgba(180, 83, 75, 0.25))', color: 'var(--color-error, #B4534B)', textAlign: 'center' }} role="alert">
          <p style={{ margin: '0 0 1rem 0' }}>{error}</p>
          <button
            type="button"
            className="admin-contact__btn-handle"
            onClick={fetchMessages}
          >
            Retry Loading
          </button>
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon="📬"
          title="No Contact Messages Found"
          message={
            searchQuery
              ? `No inquiries match "${searchQuery}". Try adjusting your search query or status filter.`
              : activeTab !== 'ALL'
              ? `There are currently no inquiries with status "${activeTab}".`
              : 'No customer or visitor support inquiries have been submitted yet.'
          }
          actionLabel={searchQuery || activeTab !== 'ALL' ? 'Reset Filters' : undefined}
          onAction={() => {
            setSearchQuery('');
            setActiveTab('ALL');
            setPage(1);
          }}
        />
      ) : (
        <div className="admin-contact__table-card">
          <div className="admin-contact__table-wrap">
            <table className="admin-contact__table">
              <thead>
                <tr>
                  <th className="admin-contact__th">Sender</th>
                  <th className="admin-contact__th">Subject & Message</th>
                  <th className="admin-contact__th">Status</th>
                  <th className="admin-contact__th">Date</th>
                  <th className="admin-contact__th admin-contact__th--right">Action</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => {
                  const statusKey = msg.status || 'NEW';
                  const statusLabel = STATUS_BADGE_LABELS[statusKey] || statusKey;

                  return (
                    <tr key={msg.id} className="admin-contact__tr">
                      <td className="admin-contact__td">
                        <div className="admin-contact__sender-name">{msg.name}</div>
                        <div className="admin-contact__sender-email">{msg.email}</div>
                        {msg.phone && (
                          <div className="admin-contact__sender-phone">📞 {msg.phone}</div>
                        )}
                      </td>
                      <td className="admin-contact__td">
                        <div className="admin-contact__subject">{msg.subject}</div>
                        <div className="admin-contact__snippet">{msg.message}</div>
                      </td>
                      <td className="admin-contact__td">
                        <span className={`admin-contact__status-badge admin-contact__status-badge--${statusKey}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="admin-contact__td" style={{ color: 'var(--color-text-muted, #78716C)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {formatDate(msg.created_at)}
                      </td>
                      <td className="admin-contact__td admin-contact__td--right">
                        <button
                          type="button"
                          className="admin-contact__btn-handle"
                          onClick={() => handleOpenDetail(msg)}
                        >
                          View & Handle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {(hasNextPage || hasPrevPage || page > 1) && (
            <div className="admin-contact__pagination">
              <span className="admin-contact__pagination-page">Page {page}</span>
              <div className="admin-contact__pagination-actions">
                <button
                  type="button"
                  className="admin-contact__btn-handle"
                  disabled={!hasPrevPage && page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="admin-contact__btn-handle"
                  disabled={!hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail & Reply Modal */}
      {selectedMessage && (
        <div
          className="admin-contact__modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
          onClick={() => setSelectedMessage(null)}
        >
          <div className="admin-contact__modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="admin-contact__modal-header">
              <div>
                <span className="admin-contact__eyebrow">Support Inquiry Detail</span>
                <h2 id="contact-modal-title" className="admin-contact__modal-title">
                  {selectedMessage.subject}
                </h2>
              </div>
              <button
                type="button"
                className="admin-contact__modal-close"
                onClick={() => setSelectedMessage(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            {detailLoading ? (
              <LoadingState message="Fetching message details..." />
            ) : (
              <>
                {/* Sender Metadata Box */}
                <div className="admin-contact__sender-grid">
                  <div className="admin-contact__sender-item">
                    <span className="admin-contact__sender-label">Sender Name</span>
                    <span className="admin-contact__sender-val">{selectedMessage.name}</span>
                  </div>
                  <div className="admin-contact__sender-item">
                    <span className="admin-contact__sender-label">Email Address</span>
                    <span className="admin-contact__sender-val">
                      <a
                        href={`mailto:${selectedMessage.email}`}
                        style={{ color: 'var(--color-secondary-accent, #5F7A70)', textDecoration: 'none' }}
                      >
                        {selectedMessage.email}
                      </a>
                    </span>
                  </div>
                  {selectedMessage.phone && (
                    <div className="admin-contact__sender-item">
                      <span className="admin-contact__sender-label">Phone Number</span>
                      <span className="admin-contact__sender-val">{selectedMessage.phone}</span>
                    </div>
                  )}
                  <div className="admin-contact__sender-item">
                    <span className="admin-contact__sender-label">Submitted At</span>
                    <span className="admin-contact__sender-val">{formatDate(selectedMessage.created_at)}</span>
                  </div>
                </div>

                {/* Status & Quick Transition Controls */}
                <div className="admin-contact__status-control-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #78716C)', fontWeight: 600 }}>
                      Current Status:
                    </span>
                    <span className={`admin-contact__status-badge admin-contact__status-badge--${selectedMessage.status || 'NEW'}`}>
                      {STATUS_BADGE_LABELS[selectedMessage.status] || selectedMessage.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {selectedMessage.status === 'NEW' && (
                      <button
                        type="button"
                        className="admin-contact__btn-handle"
                        disabled={statusUpdating}
                        onClick={() => handleStatusChange('IN_REVIEW')}
                      >
                        {statusUpdating ? 'Updating...' : 'Mark In Review'}
                      </button>
                    )}
                    {selectedMessage.status !== 'CLOSED' ? (
                      <button
                        type="button"
                        className="admin-contact__btn-handle"
                        disabled={statusUpdating}
                        onClick={() => handleStatusChange('CLOSED')}
                      >
                        {statusUpdating ? 'Updating...' : 'Mark Closed'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin-contact__btn-handle"
                        disabled={statusUpdating}
                        onClick={() => handleStatusChange('IN_REVIEW')}
                      >
                        {statusUpdating ? 'Updating...' : 'Reopen Inquiry'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Message Body Box */}
                <div>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted, #78716C)', margin: '0 0 0.5rem 0' }}>
                    Inquiry Message Body
                  </h3>
                  <div className="admin-contact__message-box">
                    {selectedMessage.message}
                  </div>
                </div>

                {/* Previous Reply Information */}
                {selectedMessage.status === 'REPLIED' && selectedMessage.replied_at && (
                  <div className="admin-contact__reply-banner">
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-success, #4F7A5A)' }}>
                      ✓ Admin Reply Recorded
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-main, #211C19)' }}>
                      Replied by{' '}
                      <strong>
                        {selectedMessage.replied_by_detail?.name ||
                          selectedMessage.replied_by_detail?.email ||
                          'System Admin'}
                      </strong>{' '}
                      on {formatDate(selectedMessage.replied_at)}.
                    </span>
                  </div>
                )}

                {/* Reply Form */}
                <form onSubmit={handleSendReply} className="admin-contact__reply-form">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label htmlFor="admin-reply-textarea" style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--color-text-main, #211C19)' }}>
                      Submit Admin Reply
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #78716C)' }}>
                      {replyText.length} / 5000 chars
                    </span>
                  </div>

                  <textarea
                    id="admin-reply-textarea"
                    rows={4}
                    className="admin-contact__textarea"
                    placeholder="Type your response to the visitor here..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    maxLength={5000}
                    required
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #78716C)', fontStyle: 'italic' }}>
                      Note: Saving a reply will set status to REPLIED. Email delivery is handled via Resend.
                    </span>

                    <button
                      type="submit"
                      className="admin-contact__btn-send"
                      disabled={replySubmitting || !replyText.trim()}
                    >
                      {replySubmitting ? 'Saving Reply...' : 'Send Reply'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminContactPage;
