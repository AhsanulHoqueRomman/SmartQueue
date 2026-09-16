import React, { useState, useEffect } from 'react';
import organizationService from '../../services/organizationService';
import adminService from '../../services/adminService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';

const STATUS_TABS = [
  { key: 'ALL', label: 'All Organizations' },
  { key: 'SUBMITTED', label: 'Needs Review', badgeBg: '#FEF3C7', badgeColor: '#B45309' },
  { key: 'UNDER_REVIEW', label: 'Under Review', badgeBg: '#DBEAFE', badgeColor: '#1E40AF' },
  { key: 'APPROVED', label: 'Approved', badgeBg: 'rgba(95, 122, 112, 0.15)', badgeColor: '#5F7A70' },
  { key: 'REJECTED', label: 'Rejected', badgeBg: '#FEE2E2', badgeColor: '#991B1B' },
  { key: 'SUSPENDED', label: 'Suspended', badgeBg: '#7F1D1D', badgeColor: '#FFFFFF' },
  { key: 'SETUP_INCOMPLETE', label: 'Incomplete', badgeBg: '#F3F4F6', badgeColor: '#4B5563' },
];

const STATUS_BADGE_STYLE = {
  SETUP_INCOMPLETE: { bg: '#F3F4F6', color: '#4B5563', label: 'Incomplete Setup' },
  SUBMITTED: { bg: '#FEF3C7', color: '#B45309', label: 'Submitted' },
  UNDER_REVIEW: { bg: '#DBEAFE', color: '#1E40AF', label: 'Under Review' },
  APPROVED: { bg: 'rgba(95, 122, 112, 0.15)', color: '#5F7A70', label: 'Approved' },
  REJECTED: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
  SUSPENDED: { bg: '#7F1D1D', color: '#FFFFFF', label: 'Suspended' },
};

const DOC_TYPE_LABELS = {
  BUSINESS_LICENSE: 'Business License',
  TAX_CERTIFICATE: 'Tax Certificate',
  FACILITY_PERMIT: 'Facility Permit',
  OTHER: 'Other Document',
};

export function AdminOrganizationsPage() {
  const { showSuccess, showError } = useToast();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState({
    name: '',
    slug: '',
    contact_email: '',
    phone_number: '',
    address: '',
  });
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');

  // Review & Action Modal
  const [reviewOrg, setReviewOrg] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showCreateModal) setShowCreateModal(false);
        if (reviewOrg) setReviewOrg(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal, reviewOrg]);

  const fetchOrgs = async () => {
    setLoading(true);
    setError('');
    try {
      const statusFilter = activeTab === 'ALL' ? '' : activeTab;
      const data = await adminService.getVerificationQueue(statusFilter);
      const list = Array.isArray(data) ? data : data.results || [];
      setOrganizations(list);
    } catch (err) {
      setError('Failed to fetch system organizations roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, [activeTab]);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setCreating(true);
    setModalError('');

    try {
      await organizationService.createOrganization(newOrgForm);
      showSuccess(`Organization "${newOrgForm.name}" created successfully!`);
      setShowCreateModal(false);
      setNewOrgForm({ name: '', slug: '', contact_email: '', phone_number: '', address: '' });
      fetchOrgs();
    } catch (err) {
      const respErr = err.response?.data;
      if (respErr && typeof respErr === 'object') {
        const msg = Object.entries(respErr)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join(' | ');
        setModalError(msg || 'Failed to create organization.');
      } else {
        setModalError('Failed to create organization.');
      }
    } finally {
      setCreating(false);
    }
  };

  // Review Actions
  const handleStartReview = async (orgId) => {
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminService.startReview(orgId);
      showSuccess(`Started review for "${updated.name}".`);
      setReviewOrg(updated);
      fetchOrgs();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to start review.';
      setActionError(msg);
      showError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (orgId) => {
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminService.approveOrg(orgId);
      showSuccess(`Organization "${updated.name}" has been APPROVED!`);
      setReviewOrg(null);
      fetchOrgs();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to approve organization.';
      setActionError(msg);
      showError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (orgId) => {
    if (!actionReason.trim()) {
      setActionError('Rejection reason is required.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminService.rejectOrg(orgId, actionReason.trim());
      showSuccess(`Organization "${updated.name}" has been REJECTED.`);
      setReviewOrg(null);
      setShowRejectForm(false);
      setActionReason('');
      fetchOrgs();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to reject organization.';
      setActionError(msg);
      showError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (orgId) => {
    if (!actionReason.trim()) {
      setActionError('Suspension reason is required.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminService.suspendOrg(orgId, actionReason.trim());
      showSuccess(`Organization "${updated.name}" has been SUSPENDED.`);
      setReviewOrg(null);
      setShowSuspendForm(false);
      setActionReason('');
      fetchOrgs();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to suspend organization.';
      setActionError(msg);
      showError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsuspend = async (orgId) => {
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminService.unsuspendOrg(orgId);
      showSuccess(`Organization "${updated.name}" has been UNSUSPENDED and restored to Approved.`);
      setReviewOrg(null);
      fetchOrgs();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to unsuspend organization.';
      setActionError(msg);
      showError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const openReviewModal = (org) => {
    setReviewOrg(org);
    setActionReason('');
    setShowRejectForm(false);
    setShowSuspendForm(false);
    setActionError('');
  };

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1150px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            ⚡ System Admin Console
          </div>
          <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
            Organization Verification Queue & Roster
          </h1>
          <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
            Review verification applications, inspect legal documents, and govern platform tenants.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '0.75rem 1.25rem',
            background: '#2F2520',
            color: '#FAF8F3',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          ➕ Register New Organization
        </button>
      </div>

      {/* Verification Status Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid #E6E1D9',
        }}
      >
        {STATUS_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                border: isActive ? '1.5px solid #2F2520' : '1px solid #E6E1D9',
                background: isActive ? '#2F2520' : '#FFFFFF',
                color: isActive ? '#FAF8F3' : '#78716C',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <LoadingState message="Fetching organization verification queue..." />
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : organizations.length === 0 ? (
        <EmptyState title="No Organizations Found" message={`No organizations match the filter criteria "${activeTab}".`} />
      ) : (
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#FAF8F3', borderBottom: '1px solid #E6E1D9', color: '#78716C', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Facility Name</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Contact Info</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Verification Status</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Docs Count</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Submitted Date</th>
                  <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => {
                  const badge = STATUS_BADGE_STYLE[org.verification_status] || STATUS_BADGE_STYLE.SETUP_INCOMPLETE;
                  const docsCount = org.documents ? org.documents.length : (org.documents_count ?? 0);
                  return (
                    <tr key={org.id} style={{ borderBottom: '1px solid #FAF8F3' }}>
                      <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: '#211C19' }}>
                        <div>🏢 {org.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#5F7A70', fontFamily: 'monospace', fontWeight: 400 }}>{org.slug}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', color: '#78716C', fontSize: '0.85rem' }}>
                        <div>{org.contact_email || 'No email'}</div>
                        <div>{org.phone_number || 'No phone'}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <span
                          style={{
                            padding: '0.3rem 0.65rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.color,
                            textTransform: 'uppercase',
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', fontWeight: 600, color: '#211C19' }}>
                        📄 {docsCount} File{docsCount === 1 ? '' : 's'}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', color: '#78716C', fontSize: '0.82rem' }}>
                        {org.verification_submitted_at ? new Date(org.verification_submitted_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                        <button
                          onClick={() => openReviewModal(org)}
                          style={{
                            padding: '0.45rem 0.85rem',
                            background: '#FAF8F3',
                            border: '1px solid #E6E1D9',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            color: '#211C19',
                            cursor: 'pointer',
                          }}
                        >
                          {org.verification_status === 'SUBMITTED'
                            ? '🔍 Review Submission'
                            : '👁️ Inspect Details'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Verification & Inspection Modal */}
      {reviewOrg && (
        <div
          onClick={() => setReviewOrg(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(33, 28, 25, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            padding: '1.5rem',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E6E1D9',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #E6E1D9' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>
                  Verification Review Inspection
                </div>
                <h2 style={{ margin: '0.2rem 0 0 0', fontSize: '1.4rem', color: '#211C19', fontFamily: 'Cinzel, serif' }}>
                  🏢 {reviewOrg.name}
                </h2>
              </div>
              <button onClick={() => setReviewOrg(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            {actionError && (
              <div style={{ padding: '0.75rem 1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
                ⚠️ {actionError}
              </div>
            )}

            {/* Verification Status Badge & Meta */}
            <div style={{ background: '#FAF8F3', padding: '1rem', borderRadius: '12px', border: '1px solid #E6E1D9', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Current Status</div>
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: '0.2rem',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: (STATUS_BADGE_STYLE[reviewOrg.verification_status] || STATUS_BADGE_STYLE.SETUP_INCOMPLETE).bg,
                    color: (STATUS_BADGE_STYLE[reviewOrg.verification_status] || STATUS_BADGE_STYLE.SETUP_INCOMPLETE).color,
                    textTransform: 'uppercase',
                  }}
                >
                  {(STATUS_BADGE_STYLE[reviewOrg.verification_status] || STATUS_BADGE_STYLE.SETUP_INCOMPLETE).label}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Submitted At</div>
                <div style={{ fontWeight: 600, color: '#211C19', fontSize: '0.88rem', marginTop: '0.2rem' }}>
                  {reviewOrg.verification_submitted_at ? new Date(reviewOrg.verification_submitted_at).toLocaleString() : 'Not submitted yet'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Reviewed At / By</div>
                <div style={{ fontWeight: 600, color: '#211C19', fontSize: '0.88rem', marginTop: '0.2rem' }}>
                  {reviewOrg.verification_reviewed_at ? new Date(reviewOrg.verification_reviewed_at).toLocaleDateString() : 'Pending review'}
                </div>
              </div>
            </div>

            {/* Rejection / Suspension details if present */}
            {reviewOrg.verification_rejection_reason && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '0.85rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', color: '#991B1B' }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase' }}>Rejection Reason:</div>
                <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>"{reviewOrg.verification_rejection_reason}"</div>
              </div>
            )}
            {reviewOrg.verification_suspension_reason && (
              <div style={{ background: '#FEF2F2', border: '1px solid #991B1B', padding: '0.85rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', color: '#7F1D1D' }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase' }}>Suspension Reason:</div>
                <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>"{reviewOrg.verification_suspension_reason}"</div>
              </div>
            )}

            {/* Facility Details */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#211C19', fontWeight: 700 }}>
                Facility Details & Contact Information
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', fontSize: '0.9rem' }}>
                <div><strong style={{ color: '#78716C' }}>Email:</strong> {reviewOrg.contact_email || '—'}</div>
                <div><strong style={{ color: '#78716C' }}>Phone:</strong> {reviewOrg.phone_number || '—'}</div>
                <div><strong style={{ color: '#78716C' }}>URL Slug:</strong> {reviewOrg.slug}</div>
                <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: '#78716C' }}>Address:</strong> {reviewOrg.address || '—'}</div>
              </div>
            </div>

            {/* Document Viewer Section */}
            <div style={{ marginBottom: '1.75rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#211C19', fontWeight: 700 }}>
                Uploaded Verification Documents ({reviewOrg.documents ? reviewOrg.documents.length : 0})
              </h4>
              {!reviewOrg.documents || reviewOrg.documents.length === 0 ? (
                <div style={{ padding: '1rem', background: '#FAF8F3', borderRadius: '8px', color: '#78716C', fontSize: '0.85rem' }}>
                  ⚠️ No verification documents uploaded for this organization.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #E6E1D9', borderRadius: '10px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#FAF8F3', borderBottom: '1px solid #E6E1D9', color: '#78716C', textAlign: 'left' }}>
                        <th style={{ padding: '0.65rem 0.85rem' }}>Type</th>
                        <th style={{ padding: '0.65rem 0.85rem' }}>Title</th>
                        <th style={{ padding: '0.65rem 0.85rem' }}>Uploaded Date</th>
                        <th style={{ padding: '0.65rem 0.85rem' }}>File Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewOrg.documents.map((doc) => (
                        <tr key={doc.id} style={{ borderBottom: '1px solid #FAF8F3' }}>
                          <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>{DOC_TYPE_LABELS[doc.document_type] || doc.document_type}</td>
                          <td style={{ padding: '0.65rem 0.85rem' }}>{doc.title || '—'}</td>
                          <td style={{ padding: '0.65rem 0.85rem', color: '#78716C' }}>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '—'}</td>
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            {doc.file ? (
                              <a href={doc.file} target="_blank" rel="noopener noreferrer" style={{ color: '#5F7A70', fontWeight: 600, textDecoration: 'underline' }}>
                                View Document ↗
                              </a>
                            ) : (
                              'No File'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Action Bar based on state */}
            <div style={{ paddingTop: '1.25rem', borderTop: '1px solid #E6E1D9' }}>
              {/* If SUBMITTED: Start Review */}
              {reviewOrg.verification_status === 'SUBMITTED' && (
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handleStartReview(reviewOrg.id)}
                    disabled={actionLoading}
                    style={{
                      padding: '0.65rem 1.5rem',
                      background: '#1E40AF',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionLoading ? 'Starting...' : '🔍 Start Active Review'}
                  </button>
                </div>
              )}

              {/* If UNDER_REVIEW: Approve or Reject */}
              {reviewOrg.verification_status === 'UNDER_REVIEW' && !showRejectForm && (
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    disabled={actionLoading}
                    style={{
                      padding: '0.65rem 1.25rem',
                      background: '#FEF2F2',
                      border: '1px solid #FCA5A5',
                      color: '#991B1B',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ❌ Reject Verification
                  </button>
                  <button
                    onClick={() => handleApprove(reviewOrg.id)}
                    disabled={actionLoading}
                    style={{
                      padding: '0.65rem 1.5rem',
                      background: '#5F7A70',
                      color: '#FAF8F3',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionLoading ? 'Approving...' : '✅ Approve Verification'}
                  </button>
                </div>
              )}

              {/* Reject Reason Form */}
              {showRejectForm && (
                <div style={{ background: '#FEF2F2', padding: '1.25rem', borderRadius: '12px', border: '1px solid #FCA5A5' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#991B1B', fontSize: '0.95rem' }}>
                    Specify Rejection Reason (Required)
                  </h4>
                  <textarea
                    rows={3}
                    required
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Enter explicit rejection details for manager feedback..."
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #FCA5A5', fontSize: '0.9rem', marginBottom: '0.85rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(false)}
                      style={{ padding: '0.5rem 1rem', background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(reviewOrg.id)}
                      disabled={actionLoading || !actionReason.trim()}
                      style={{ padding: '0.5rem 1.25rem', background: '#991B1B', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}

              {/* If APPROVED: Option to Suspend */}
              {reviewOrg.verification_status === 'APPROVED' && !showSuspendForm && (
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowSuspendForm(true)}
                    disabled={actionLoading}
                    style={{
                      padding: '0.65rem 1.25rem',
                      background: '#7F1D1D',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ⛔ Suspend Organization
                  </button>
                </div>
              )}

              {/* Suspend Reason Form */}
              {showSuspendForm && (
                <div style={{ background: '#FEF2F2', padding: '1.25rem', borderRadius: '12px', border: '1px solid #991B1B' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#7F1D1D', fontSize: '0.95rem' }}>
                    Specify Suspension Reason (Required)
                  </h4>
                  <textarea
                    rows={3}
                    required
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Enter compliance or policy violation reason for suspension..."
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #991B1B', fontSize: '0.9rem', marginBottom: '0.85rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setShowSuspendForm(false)}
                      style={{ padding: '0.5rem 1rem', background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSuspend(reviewOrg.id)}
                      disabled={actionLoading || !actionReason.trim()}
                      style={{ padding: '0.5rem 1.25rem', background: '#7F1D1D', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      {actionLoading ? 'Suspending...' : 'Confirm Suspension'}
                    </button>
                  </div>
                </div>
              )}

              {/* If SUSPENDED: Option to Unsuspend */}
              {reviewOrg.verification_status === 'SUSPENDED' && (
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handleUnsuspend(reviewOrg.id)}
                    disabled={actionLoading}
                    style={{
                      padding: '0.65rem 1.5rem',
                      background: '#5F7A70',
                      color: '#FAF8F3',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionLoading ? 'Restoring...' : '🔄 Unsuspend & Restore Approval'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div onClick={() => setShowCreateModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(33, 28, 25, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000, backdropFilter: 'blur(3px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E6E1D9', padding: '1.75rem', width: '100%', maxWidth: '500px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#211C19' }}>Register New Organization Tenant</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            {modalError && (
              <div style={{ padding: '0.75rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleCreateOrg}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Facility Name *</label>
                <input
                  type="text"
                  required
                  value={newOrgForm.name}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-') })}
                  placeholder="Metro Care Hospital"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>URL Slug *</label>
                <input
                  type="text"
                  required
                  value={newOrgForm.slug}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, slug: e.target.value })}
                  placeholder="metro-care"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Contact Email</label>
                <input
                  type="email"
                  value={newOrgForm.contact_email}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, contact_email: e.target.value })}
                  placeholder="admin@metrocare.com"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Phone Number</label>
                <input
                  type="text"
                  value={newOrgForm.phone_number}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, phone_number: e.target.value })}
                  placeholder="+1 555-0192"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '0.65rem 1.25rem', background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{ padding: '0.65rem 1.25rem', background: '#2F2520', color: '#FAF8F3', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {creating ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminOrganizationsPage;

