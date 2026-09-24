import React, { useState, useEffect, useCallback } from 'react';
import adminService from '../../services/adminService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';

const STATUS_TABS = [
  { key: 'ALL', label: 'All Inquiries' },
  { key: 'NEW', label: 'New', badgeBg: '#FEF3C7', badgeColor: '#B45309' },
  { key: 'IN_REVIEW', label: 'In Review', badgeBg: '#DBEAFE', badgeColor: '#1E40AF' },
  { key: 'REPLIED', label: 'Replied', badgeBg: 'rgba(95, 122, 112, 0.15)', badgeColor: '#5F7A70' },
  { key: 'CLOSED', label: 'Closed', badgeBg: '#F3F4F6', badgeColor: '#4B5563' },
];

const STATUS_BADGE_STYLE = {
  NEW: { bg: '#FEF3C7', color: '#B45309', label: 'New' },
  IN_REVIEW: { bg: '#DBEAFE', color: '#1E40AF', label: 'In Review' },
  REPLIED: { bg: 'rgba(95, 122, 112, 0.15)', color: '#5F7A70', label: 'Replied' },
  CLOSED: { bg: '#F3F4F6', color: '#4B5563', label: 'Closed' },
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
      showSuccess(`Inquiry status updated to ${STATUS_BADGE_STYLE[newStatus]?.label || newStatus}.`);
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
      showSuccess('Reply saved successfully. Email delivery will be available after email integration is configured.');
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
    <div className="animate-page-entrance" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', marginBottom: '0.25rem', letterSpacing: '0.05em' }}>
          ⚡ Platform Support & Governance
        </div>
        <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
          Admin Contact Inbox
        </h1>
        <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
          System-wide customer support inquiries and visitor feedback management.
        </p>
      </div>

      {/* Main Inbox Container */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '16px',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Status Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #E6E1D9',
            backgroundColor: '#FAF8F5',
            overflowX: 'auto',
          }}
        >
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  border: isActive ? '1px solid #2F2520' : '1px solid #E6E1D9',
                  background: isActive ? '#2F2520' : '#FFFFFF',
                  color: isActive ? '#FAF8F3' : '#44403C',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Filter Controls */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #F0ECE1', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ position: 'relative', minWidth: '280px', flex: 1 }}>
            <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#A8A29E' }}>
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by name, email, subject, or message..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                padding: '0.55rem 0.85rem 0.55rem 2.4rem',
                fontSize: '0.875rem',
                border: '1px solid #E6E1D9',
                borderRadius: '8px',
                background: '#FFFFFF',
                color: '#211C19',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>
            Total Inquiries: <span style={{ color: '#211C19', fontWeight: 800 }}>{totalCount}</span>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div style={{ padding: '3rem' }}>
            <LoadingState message="Loading contact messages..." />
          </div>
        ) : error ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#DC2626' }}>
            <p>{error}</p>
            <button className="btn btn-outline btn-sm" onClick={fetchMessages}>
              Retry Loading
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ padding: '3rem' }}>
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
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#FAF8F5', borderBottom: '1px solid #E6E1D9', color: '#78716C', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1.5rem', fontWeight: 700 }}>Sender</th>
                  <th style={{ padding: '0.85rem 1.5rem', fontWeight: 700 }}>Subject & Message</th>
                  <th style={{ padding: '0.85rem 1.5rem', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '0.85rem 1.5rem', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '0.85rem 1.5rem', fontWeight: 700, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => {
                  const badge = STATUS_BADGE_STYLE[msg.status] || { bg: '#F3F4F6', color: '#4B5563', label: msg.status };
                  return (
                    <tr
                      key={msg.id}
                      style={{
                        borderBottom: '1px solid #F0ECE1',
                        transition: 'background 0.15s ease',
                      }}
                      className="hover-row"
                    >
                      <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#211C19' }}>{msg.name}</div>
                        <div style={{ color: '#5F7A70', fontSize: '0.8rem', fontWeight: 500 }}>{msg.email}</div>
                        {msg.phone && (
                          <div style={{ color: '#78716C', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                            📞 {msg.phone}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top', maxWidth: '380px' }}>
                        <div style={{ fontWeight: 700, color: '#211C19', marginBottom: '0.2rem' }}>
                          {msg.subject}
                        </div>
                        <div
                          style={{
                            color: '#57534E',
                            fontSize: '0.825rem',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.4,
                          }}
                        >
                          {msg.message}
                        </div>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '9999px',
                            backgroundColor: badge.bg,
                            color: badge.color,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top', color: '#78716C', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {formatDate(msg.created_at)}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top', textAlign: 'right' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleOpenDetail(msg)}
                          style={{
                            fontSize: '0.8rem',
                            padding: '0.35rem 0.75rem',
                            borderColor: '#D6D1C7',
                            color: '#2F2520',
                            fontWeight: 600,
                          }}
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
        )}

        {/* Pagination Footer */}
        {(hasNextPage || hasPrevPage || page > 1) && (
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #E6E1D9',
              background: '#FAF8F5',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.85rem', color: '#78716C' }}>Page {page}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-outline btn-sm"
                disabled={!hasPrevPage && page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={!hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail & Reply Modal */}
      {selectedMessage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(33, 28, 25, 0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
          onClick={() => setSelectedMessage(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid #E6E1D9',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.75rem',
                borderBottom: '1px solid #E6E1D9',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                background: '#FAF8F5',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Support Inquiry Detail
                </span>
                <h3 style={{ margin: '0.1rem 0 0 0', color: '#211C19', fontSize: '1.2rem', fontFamily: 'Cinzel, serif' }}>
                  {selectedMessage.subject}
                </h3>
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  color: '#78716C',
                  cursor: 'pointer',
                  padding: '0.2rem',
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.75rem' }}>
              {detailLoading ? (
                <LoadingState message="Fetching message details..." />
              ) : (
                <>
                  {/* Sender Metadata Box */}
                  <div
                    style={{
                      background: '#FAF8F5',
                      border: '1px solid #E6E1D9',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      marginBottom: '1.5rem',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#78716C', fontWeight: 600, textTransform: 'uppercase' }}>Sender Name</div>
                      <div style={{ fontWeight: 700, color: '#211C19', fontSize: '0.95rem', marginTop: '0.1rem' }}>{selectedMessage.name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#78716C', fontWeight: 600, textTransform: 'uppercase' }}>Email Address</div>
                      <div style={{ fontWeight: 600, color: '#5F7A70', fontSize: '0.9rem', marginTop: '0.1rem' }}>
                        <a href={`mailto:${selectedMessage.email}`} style={{ color: '#5F7A70', textDecoration: 'none' }}>
                          {selectedMessage.email}
                        </a>
                      </div>
                    </div>
                    {selectedMessage.phone && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#78716C', fontWeight: 600, textTransform: 'uppercase' }}>Phone Number</div>
                        <div style={{ fontWeight: 600, color: '#211C19', fontSize: '0.9rem', marginTop: '0.1rem' }}>{selectedMessage.phone}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#78716C', fontWeight: 600, textTransform: 'uppercase' }}>Submitted At</div>
                      <div style={{ color: '#44403C', fontSize: '0.85rem', marginTop: '0.1rem' }}>{formatDate(selectedMessage.created_at)}</div>
                    </div>
                  </div>

                  {/* Status & Quick Transition Controls */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      marginBottom: '1.5rem',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      paddingBottom: '1rem',
                      borderBottom: '1px solid #F0ECE1',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>Current Status:</span>
                      <span
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          backgroundColor: (STATUS_BADGE_STYLE[selectedMessage.status] || {}).bg,
                          color: (STATUS_BADGE_STYLE[selectedMessage.status] || {}).color,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        {(STATUS_BADGE_STYLE[selectedMessage.status] || {}).label || selectedMessage.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {selectedMessage.status === 'NEW' && (
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={statusUpdating}
                          onClick={() => handleStatusChange('IN_REVIEW')}
                        >
                          Mark In Review
                        </button>
                      )}
                      {selectedMessage.status !== 'CLOSED' ? (
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={statusUpdating}
                          onClick={() => handleStatusChange('CLOSED')}
                        >
                          Mark Closed
                        </button>
                      ) : (
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={statusUpdating}
                          onClick={() => handleStatusChange('IN_REVIEW')}
                        >
                          Reopen Inquiry
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message Body Box */}
                  <div style={{ marginBottom: '1.75rem' }}>
                    <h4 style={{ fontSize: '0.875rem', color: '#78716C', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Inquiry Message Body
                    </h4>
                    <div
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E6E1D9',
                        borderRadius: '8px',
                        padding: '1.25rem',
                        color: '#211C19',
                        fontSize: '0.925rem',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {selectedMessage.message}
                    </div>
                  </div>

                  {/* Previous Reply Information */}
                  {selectedMessage.status === 'REPLIED' && selectedMessage.replied_at && (
                    <div
                      style={{
                        background: 'rgba(95, 122, 112, 0.08)',
                        border: '1px solid rgba(95, 122, 112, 0.2)',
                        borderRadius: '10px',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                        ✓ Admin Reply Recorded
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#211C19' }}>
                        Replied by <strong>{selectedMessage.replied_by_detail?.name || selectedMessage.replied_by_detail?.email || 'Admin'}</strong> on {formatDate(selectedMessage.replied_at)}.
                      </div>
                    </div>
                  )}

                  {/* Reply Form */}
                  <form onSubmit={handleSendReply}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#211C19' }}>
                        Submit Admin Reply
                      </label>
                      <span style={{ fontSize: '0.75rem', color: '#78716C' }}>
                        {replyText.length} / 5000 chars
                      </span>
                    </div>

                    <textarea
                      rows={4}
                      placeholder="Type your response to the visitor here..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      maxLength={5000}
                      required
                      style={{
                        width: '100%',
                        padding: '0.85rem',
                        fontSize: '0.875rem',
                        border: '1px solid #E6E1D9',
                        borderRadius: '8px',
                        outline: 'none',
                        resize: 'vertical',
                        color: '#211C19',
                        marginBottom: '0.75rem',
                      }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#78716C', fontStyle: 'italic' }}>
                        Note: Reply will update inquiry status to REPLIED. Email delivery will be active after Brevo integration.
                      </span>

                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={replySubmitting || !replyText.trim()}
                        style={{ padding: '0.55rem 1.25rem', whiteSpace: 'nowrap' }}
                      >
                        {replySubmitting ? 'Saving Reply...' : 'Send Reply'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminContactPage;
