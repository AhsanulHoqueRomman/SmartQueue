import React, { useState, useEffect, useMemo } from 'react';
import PrivateDocumentButton from '../../components/PrivateDocumentButton';
import organizationService from '../../services/organizationService';
import adminService from '../../services/adminService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';
import '../../styles/AdminOrganizations.css';

const STATUS_TABS = [
  { key: 'ALL', label: 'All Organizations' },
  { key: 'SUBMITTED', label: 'Needs Review' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'SETUP_INCOMPLETE', label: 'Incomplete' },
];

const STATUS_BADGE_LABELS = {
  SETUP_INCOMPLETE: 'Incomplete Setup',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
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
  const [searchQuery, setSearchQuery] = useState('');

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
      const list = Array.isArray(data) ? data : data?.results || [];
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

  const filteredOrganizations = useMemo(() => {
    if (!searchQuery.trim()) return organizations;
    const q = searchQuery.toLowerCase().trim();
    return organizations.filter(
      (org) =>
        org.name?.toLowerCase().includes(q) ||
        org.slug?.toLowerCase().includes(q) ||
        (org.email && org.email.toLowerCase().includes(q)) ||
        (org.contact_email && org.contact_email.toLowerCase().includes(q))
    );
  }, [organizations, searchQuery]);

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

  const openReviewModal = async (org) => {
    setReviewOrg(org);
    setActionReason('');
    setShowRejectForm(false);
    setShowSuspendForm(false);
    setActionError('');

    try {
      const docs = await organizationService.getDocuments(org.id);
      const docsList = Array.isArray(docs) ? docs : docs?.results || [];
      setReviewOrg((prev) => (prev && prev.id === org.id ? { ...prev, documents: docsList } : prev));
    } catch (err) {
      // Keep existing documents if fetch fails
    }
  };

  return (
    <div className="admin-orgs animate-page-entrance">
      {/* Editorial Header */}
      <header className="admin-orgs__header">
        <div className="admin-orgs__header-main">
          <span className="admin-orgs__eyebrow">⚡ System Admin Console</span>
          <h1 className="admin-orgs__title">Organization Verification Queue & Roster</h1>
          <p className="admin-orgs__subtitle">
            Review verification applications, inspect legal documents, and govern platform tenants.
          </p>
        </div>

        <button
          type="button"
          className="admin-orgs__btn-register"
          onClick={() => setShowCreateModal(true)}
        >
          <span>➕</span> Register New Organization
        </button>
      </header>

      {/* Controls Card: Tabs & Search */}
      <div className="admin-orgs__controls-card">
        <nav className="admin-orgs__tabs" role="tablist" aria-label="Organization status filters">
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`admin-orgs__tab ${isActive ? 'admin-orgs__tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="admin-orgs__search-row">
          <div className="admin-orgs__search-wrap">
            <span className="admin-orgs__search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="admin-orgs__search-input"
              placeholder="Search by facility name, slug, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search organizations"
            />
          </div>

          <div className="admin-orgs__count-badge">
            Showing <strong>{filteredOrganizations.length}</strong> organization{filteredOrganizations.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* Roster Table Content */}
      {loading ? (
        <LoadingState message="Fetching organization verification queue..." />
      ) : error ? (
        <div className="admin-orgs__reason-alert admin-orgs__reason-alert--rejection" role="alert">
          <span>⚠️ {error}</span>
          <button
            type="button"
            className="admin-orgs__btn-review"
            onClick={fetchOrgs}
            style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
          >
            Retry Loading
          </button>
        </div>
      ) : filteredOrganizations.length === 0 ? (
        <EmptyState
          title="No Organizations Found"
          message={
            searchQuery
              ? `No organizations match "${searchQuery}".`
              : `No organizations match the filter criteria "${activeTab}".`
          }
        />
      ) : (
        <div className="admin-orgs__table-card">
          <div className="admin-orgs__table-wrap">
            <table className="admin-orgs__table">
              <thead>
                <tr>
                  <th className="admin-orgs__th">Facility Name</th>
                  <th className="admin-orgs__th">Contact Info</th>
                  <th className="admin-orgs__th">Verification Status</th>
                  <th className="admin-orgs__th">Docs Count</th>
                  <th className="admin-orgs__th">Submitted Date</th>
                  <th className="admin-orgs__th admin-orgs__th--right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrganizations.map((org) => {
                  const statusKey = org.verification_status || 'SETUP_INCOMPLETE';
                  const statusLabel = STATUS_BADGE_LABELS[statusKey] || statusKey;
                  const docsCount = org.documents ? org.documents.length : (org.documents_count ?? 0);

                  return (
                    <tr key={org.id} className="admin-orgs__tr">
                      <td className="admin-orgs__td">
                        <div className="admin-orgs__facility-title">
                          <span>🏢</span> {org.name}
                        </div>
                        <div className="admin-orgs__facility-slug">{org.slug}</div>
                      </td>
                      <td className="admin-orgs__td">
                        <div className="admin-orgs__contact-meta">
                          <div>{org.email || org.contact_email || 'No email'}</div>
                          <div>{org.phone_number || 'No phone'}</div>
                        </div>
                      </td>
                      <td className="admin-orgs__td">
                        <span className={`admin-orgs__status-badge admin-orgs__status-badge--${statusKey}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="admin-orgs__td">
                        <span style={{ fontWeight: 600 }}>
                          📄 {docsCount} File{docsCount === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="admin-orgs__td" style={{ color: 'var(--color-text-muted, #78716C)' }}>
                        {org.verification_submitted_at
                          ? new Date(org.verification_submitted_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="admin-orgs__td admin-orgs__td--right">
                        <button
                          type="button"
                          className="admin-orgs__btn-review"
                          onClick={() => openReviewModal(org)}
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
          className="admin-orgs__modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
          onClick={() => setReviewOrg(null)}
        >
          <div className="admin-orgs__modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-orgs__modal-header">
              <div>
                <span className="admin-orgs__eyebrow">Verification Review Inspection</span>
                <h2 id="review-modal-title" className="admin-orgs__modal-title">
                  🏢 {reviewOrg.name}
                </h2>
              </div>
              <button
                type="button"
                className="admin-orgs__modal-close"
                onClick={() => setReviewOrg(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="admin-orgs__reason-alert admin-orgs__reason-alert--rejection" role="alert">
                <span>⚠️ {actionError}</span>
              </div>
            )}

            {/* Status & Dates Metadata Grid */}
            <div className="admin-orgs__meta-grid">
              <div className="admin-orgs__meta-item">
                <span className="admin-orgs__meta-label">Current Status</span>
                <div>
                  <span className={`admin-orgs__status-badge admin-orgs__status-badge--${reviewOrg.verification_status || 'SETUP_INCOMPLETE'}`}>
                    {STATUS_BADGE_LABELS[reviewOrg.verification_status] || reviewOrg.verification_status || 'Incomplete Setup'}
                  </span>
                </div>
              </div>

              <div className="admin-orgs__meta-item">
                <span className="admin-orgs__meta-label">Submitted At</span>
                <span className="admin-orgs__meta-val">
                  {reviewOrg.verification_submitted_at
                    ? new Date(reviewOrg.verification_submitted_at).toLocaleString()
                    : 'Not submitted yet'}
                </span>
              </div>

              <div className="admin-orgs__meta-item">
                <span className="admin-orgs__meta-label">Reviewed At / By</span>
                <span className="admin-orgs__meta-val">
                  {reviewOrg.verification_reviewed_at
                    ? new Date(reviewOrg.verification_reviewed_at).toLocaleDateString()
                    : 'Pending review'}
                </span>
              </div>
            </div>

            {/* Rejection / Suspension Notice */}
            {reviewOrg.verification_rejection_reason && (
              <div className="admin-orgs__reason-alert admin-orgs__reason-alert--rejection">
                <strong style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>Rejection Reason:</strong>
                <div>"{reviewOrg.verification_rejection_reason}"</div>
              </div>
            )}
            {reviewOrg.verification_suspension_reason && (
              <div className="admin-orgs__reason-alert admin-orgs__reason-alert--suspension">
                <strong style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>Suspension Reason:</strong>
                <div>"{reviewOrg.verification_suspension_reason}"</div>
              </div>
            )}

            {/* Facility Details */}
            <div>
              <h3 className="admin-orgs__section-title">Facility Details & Contact Information</h3>
              <div className="admin-orgs__meta-grid">
                <div><strong style={{ color: 'var(--color-text-muted, #78716C)' }}>Email:</strong> {reviewOrg.email || reviewOrg.contact_email || '—'}</div>
                <div><strong style={{ color: 'var(--color-text-muted, #78716C)' }}>Phone:</strong> {reviewOrg.phone_number || '—'}</div>
                <div><strong style={{ color: 'var(--color-text-muted, #78716C)' }}>URL Slug:</strong> {reviewOrg.slug}</div>
                <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--color-text-muted, #78716C)' }}>Address:</strong> {reviewOrg.address || '—'}</div>
              </div>
            </div>

            {/* Uploaded Documents */}
            <div>
              <h3 className="admin-orgs__section-title">
                Uploaded Verification Documents ({reviewOrg.documents ? reviewOrg.documents.length : 0})
              </h3>
              {!reviewOrg.documents || reviewOrg.documents.length === 0 ? (
                <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-subtle, #F3F0EA)', borderRadius: '10px', color: 'var(--color-text-muted, #78716C)', fontSize: '0.85rem' }}>
                  ⚠️ No verification documents uploaded for this organization.
                </div>
              ) : (
                <div className="admin-orgs__docs-table-wrap">
                  <table className="admin-orgs__table">
                    <thead>
                      <tr>
                        <th className="admin-orgs__th">Type</th>
                        <th className="admin-orgs__th">Title</th>
                        <th className="admin-orgs__th">Uploaded Date</th>
                        <th className="admin-orgs__th admin-orgs__th--right">File Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewOrg.documents.map((doc) => (
                        <tr key={doc.id} className="admin-orgs__tr">
                          <td className="admin-orgs__td" style={{ fontWeight: 600 }}>
                            {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                          </td>
                          <td className="admin-orgs__td">{doc.title || '—'}</td>
                          <td className="admin-orgs__td" style={{ color: 'var(--color-text-muted, #78716C)' }}>
                            {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="admin-orgs__td admin-orgs__td--right">
                            {doc.file ? (
                              <PrivateDocumentButton url={doc.file} filename={doc.original_filename} />
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

            {/* Action Bar Based on State */}
            <div className="admin-orgs__action-bar">
              {/* SUBMITTED: Start Review */}
              {reviewOrg.verification_status === 'SUBMITTED' && (
                <button
                  type="button"
                  className="admin-orgs__btn-action-start"
                  onClick={() => handleStartReview(reviewOrg.id)}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Starting...' : '🔍 Start Active Review'}
                </button>
              )}

              {/* UNDER_REVIEW: Approve or Reject */}
              {reviewOrg.verification_status === 'UNDER_REVIEW' && !showRejectForm && (
                <>
                  <button
                    type="button"
                    className="admin-orgs__btn-action-reject"
                    onClick={() => setShowRejectForm(true)}
                    disabled={actionLoading}
                  >
                    ❌ Reject Verification
                  </button>
                  <button
                    type="button"
                    className="admin-orgs__btn-action-approve"
                    onClick={() => handleApprove(reviewOrg.id)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Approving...' : '✅ Approve Verification'}
                  </button>
                </>
              )}

              {/* Reject Reason Form */}
              {showRejectForm && (
                <div className="admin-orgs__reason-form" style={{ width: '100%' }}>
                  <h4 style={{ margin: 0, color: 'var(--color-error, #B4534B)', fontSize: '0.95rem' }}>
                    Specify Rejection Reason (Required)
                  </h4>
                  <textarea
                    rows={3}
                    required
                    className="admin-orgs__textarea"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Enter explicit rejection details for manager feedback..."
                  />
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="admin-orgs__btn-review"
                      onClick={() => setShowRejectForm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="admin-orgs__btn-action-reject"
                      onClick={() => handleReject(reviewOrg.id)}
                      disabled={actionLoading || !actionReason.trim()}
                    >
                      {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}

              {/* APPROVED: Suspend */}
              {reviewOrg.verification_status === 'APPROVED' && !showSuspendForm && (
                <button
                  type="button"
                  className="admin-orgs__btn-action-suspend"
                  onClick={() => setShowSuspendForm(true)}
                  disabled={actionLoading}
                >
                  ⛔ Suspend Organization
                </button>
              )}

              {/* Suspend Reason Form */}
              {showSuspendForm && (
                <div className="admin-orgs__reason-form" style={{ width: '100%' }}>
                  <h4 style={{ margin: 0, color: '#7F1D1D', fontSize: '0.95rem' }}>
                    Specify Suspension Reason (Required)
                  </h4>
                  <textarea
                    rows={3}
                    required
                    className="admin-orgs__textarea"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Enter compliance or policy violation reason for suspension..."
                  />
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="admin-orgs__btn-review"
                      onClick={() => setShowSuspendForm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="admin-orgs__btn-action-suspend"
                      onClick={() => handleSuspend(reviewOrg.id)}
                      disabled={actionLoading || !actionReason.trim()}
                    >
                      {actionLoading ? 'Suspending...' : 'Confirm Suspension'}
                    </button>
                  </div>
                </div>
              )}

              {/* SUSPENDED: Unsuspend */}
              {reviewOrg.verification_status === 'SUSPENDED' && (
                <button
                  type="button"
                  className="admin-orgs__btn-action-unsuspend"
                  onClick={() => handleUnsuspend(reviewOrg.id)}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Restoring...' : '🔄 Unsuspend & Restore Approval'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div
          className="admin-orgs__modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-org-modal-title"
          onClick={() => setShowCreateModal(false)}
        >
          <div className="admin-orgs__modal-card admin-orgs__modal-card--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="admin-orgs__modal-header">
              <h3 id="create-org-modal-title" className="admin-orgs__modal-title">
                Register New Organization
              </h3>
              <button
                type="button"
                className="admin-orgs__modal-close"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="admin-orgs__reason-alert admin-orgs__reason-alert--rejection" role="alert">
                <span>⚠️ {modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateOrg} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-text-main, #211C19)' }}>
                  Facility Name *
                </label>
                <input
                  type="text"
                  required
                  className="admin-orgs__search-input"
                  style={{ paddingLeft: '0.85rem' }}
                  value={newOrgForm.name}
                  onChange={(e) =>
                    setNewOrgForm({
                      ...newOrgForm,
                      name: e.target.value,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    })
                  }
                  placeholder="Metro Care Hospital"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-text-main, #211C19)' }}>
                  URL Slug *
                </label>
                <input
                  type="text"
                  required
                  className="admin-orgs__search-input"
                  style={{ paddingLeft: '0.85rem' }}
                  value={newOrgForm.slug}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, slug: e.target.value })}
                  placeholder="metro-care"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-text-main, #211C19)' }}>
                  Contact Email
                </label>
                <input
                  type="email"
                  className="admin-orgs__search-input"
                  style={{ paddingLeft: '0.85rem' }}
                  value={newOrgForm.contact_email}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, contact_email: e.target.value })}
                  placeholder="admin@metrocare.com"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-text-main, #211C19)' }}>
                  Phone Number
                </label>
                <input
                  type="text"
                  className="admin-orgs__search-input"
                  style={{ paddingLeft: '0.85rem' }}
                  value={newOrgForm.phone_number}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, phone_number: e.target.value })}
                  placeholder="+1 555-0192"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
                <button
                  type="button"
                  className="admin-orgs__btn-review"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="admin-orgs__btn-register"
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
