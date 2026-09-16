import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { formatApiError } from '../../utils/errorUtils';

const DOC_TYPE_LABELS = {
  BUSINESS_LICENSE: 'Business License',
  TAX_CERTIFICATE: 'Tax Certificate',
  FACILITY_PERMIT: 'Facility Permit',
  OTHER: 'Other Document',
};

const VERIFICATION_STATUS_CONFIG = {
  SETUP_INCOMPLETE: {
    label: 'Setup Incomplete',
    badgeBg: '#F3F4F6',
    badgeColor: '#4B5563',
    bannerBg: '#FFFBEB',
    bannerBorder: '#FCD34D',
    bannerTextColor: '#92400E',
    icon: '📝',
    message: 'Your organization setup is incomplete. Fill out all contact fields and upload at least one verification document before submitting for review.',
  },
  SUBMITTED: {
    label: 'Submitted for Review',
    badgeBg: '#FEF3C7',
    badgeColor: '#B45309',
    bannerBg: '#FEF3C7',
    bannerBorder: '#F59E0B',
    bannerTextColor: '#92400E',
    icon: '⏳',
    message: 'Verification request submitted. Your profile and documents are currently in queue for admin review. Document edits are locked.',
  },
  UNDER_REVIEW: {
    label: 'Under Active Review',
    badgeBg: '#DBEAFE',
    badgeColor: '#1E40AF',
    bannerBg: '#EFF6FF',
    bannerBorder: '#60A5FA',
    bannerTextColor: '#1E40AF',
    icon: '🔍',
    message: 'An administrator is actively reviewing your verification documents. Document edits remain locked.',
  },
  APPROVED: {
    label: 'Approved & Verified',
    badgeBg: 'rgba(95, 122, 112, 0.15)',
    badgeColor: '#5F7A70',
    bannerBg: 'rgba(95, 122, 112, 0.08)',
    bannerBorder: '#5F7A70',
    bannerTextColor: '#2D4B40',
    icon: '✅',
    message: 'Your organization is officially verified and fully operational on SmartQueue.',
  },
  REJECTED: {
    label: 'Verification Rejected',
    badgeBg: '#FEE2E2',
    badgeColor: '#991B1B',
    bannerBg: '#FEF2F2',
    bannerBorder: '#FCA5A5',
    bannerTextColor: '#991B1B',
    icon: '❌',
    message: 'Verification request was rejected by administration. Please review feedback below, update your details/documents, and resubmit.',
  },
  SUSPENDED: {
    label: 'Organization Suspended',
    badgeBg: '#7F1D1D',
    badgeColor: '#FFFFFF',
    bannerBg: '#FEF2F2',
    bannerBorder: '#991B1B',
    bannerTextColor: '#7F1D1D',
    icon: '⛔',
    message: 'Your organization has been suspended by administration. Public discovery and provider operational features are disabled.',
  },
};

export function ManagerSettingsPage() {
  const { currentOrg, refreshOrganizations } = useTenant();

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    email: '',
    phone_number: '',
    address: '',
    is_active: true,
  });
  const [orgDetails, setOrgDetails] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingVerification, setSubmittingVerification] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [docError, setDocError] = useState('');

  // Upload Form state
  const [docType, setDocType] = useState('BUSINESS_LICENSE');
  const [docTitle, setDocTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const loadDetails = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError('');
    try {
      const [data, docs] = await Promise.all([
        organizationService.getOrganizationDetail(currentOrg.id),
        organizationService.getDocuments(currentOrg.id),
      ]);
      setOrgDetails(data);
      setDocuments(Array.isArray(docs) ? docs : docs.results || []);
      setFormData({
        name: data.name || '',
        slug: data.slug || '',
        email: data.email || data.contact_email || '',
        phone_number: data.phone_number || '',
        address: data.address || '',
        is_active: data.is_active ?? true,
      });
    } catch (err) {
      setError(formatApiError(err, 'Failed to load organization settings or verification documents.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [currentOrg?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentOrg?.id) return;

    setSaving(true);
    setSuccessMsg('');
    setError('');

    try {
      const payload = {
        name: formData.name,
        slug: formData.slug,
        email: formData.email,
        phone_number: formData.phone_number,
        address: formData.address,
        is_active: formData.is_active,
      };
      const updated = await organizationService.updateOrganization(currentOrg.id, payload);
      setOrgDetails(updated);
      setSuccessMsg('Organization profile updated successfully!');
      if (refreshOrganizations) refreshOrganizations();
    } catch (err) {
      setError(formatApiError(err, 'Failed to update organization profile.'));
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!selectedFile || !currentOrg?.id) return;

    setUploadingDoc(true);
    setDocError('');

    try {
      const data = new FormData();
      data.append('document_type', docType);
      if (docTitle.trim()) {
        data.append('title', docTitle.trim());
      }
      data.append('file', selectedFile);

      await organizationService.uploadDocument(currentOrg.id, data);
      setSuccessMsg('Document uploaded successfully!');
      setDocTitle('');
      setSelectedFile(null);
      // Reset file input element
      const fileInput = document.getElementById('org_doc_file_input');
      if (fileInput) fileInput.value = '';

      // Reload documents and details
      const docs = await organizationService.getDocuments(currentOrg.id);
      setDocuments(Array.isArray(docs) ? docs : docs.results || []);
    } catch (err) {
      setDocError(formatApiError(err, 'Failed to upload document.'));
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    setDeletingDocId(docId);
    setDocError('');

    try {
      await organizationService.deleteDocument(currentOrg.id, docId);
      setSuccessMsg('Document deleted.');
      setDocuments(documents.filter((d) => d.id !== docId));
    } catch (err) {
      setDocError(formatApiError(err, 'Failed to delete document.'));
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleSubmitVerification = async () => {
    if (!currentOrg?.id) return;
    setSubmittingVerification(true);
    setError('');

    try {
      const updated = await organizationService.submitVerification(currentOrg.id);
      setOrgDetails(updated);
      setSuccessMsg('Organization submitted for verification successfully!');
      if (refreshOrganizations) refreshOrganizations();
    } catch (err) {
      setError(formatApiError(err, 'Failed to submit verification request.'));
    } finally {
      setSubmittingVerification(false);
    }
  };

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to manage settings." />;
  }

  if (loading) {
    return <LoadingState message="Loading organization settings & verification data..." />;
  }

  const vStatus = orgDetails?.verification_status || 'SETUP_INCOMPLETE';
  const vConfig = VERIFICATION_STATUS_CONFIG[vStatus] || VERIFICATION_STATUS_CONFIG.SETUP_INCOMPLETE;
  const isEditable = vStatus === 'SETUP_INCOMPLETE' || vStatus === 'REJECTED';

  // Check profile completion for verification submission requirement
  const isProfileComplete = Boolean(
    orgDetails?.name?.trim() &&
    (orgDetails?.email?.trim() || orgDetails?.contact_email?.trim()) &&
    orgDetails?.phone_number?.trim() &&
    orgDetails?.address?.trim()
  );
  const hasDocuments = documents.length > 0;
  const canSubmitVerification = isEditable && isProfileComplete && hasDocuments;

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '950px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          🏢 Organization Administration
        </div>
        <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
          Organization Settings & Verification
        </h1>
        <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
          Manage parameters, verification status, and credentials for <strong>{orgDetails?.name}</strong>.
        </p>
      </div>

      {/* Verification Lifecycle Status Banner */}
      <div
        style={{
          background: vConfig.bannerBg,
          border: `1.5px solid ${vConfig.bannerBorder}`,
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '1.75rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.4rem' }}>{vConfig.icon}</span>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: vConfig.bannerTextColor, fontWeight: 700 }}>
                Verification Status: {vConfig.label}
              </h3>
            </div>
            <p style={{ margin: 0, color: vConfig.bannerTextColor, fontSize: '0.92rem', lineHeight: 1.5, maxWidth: '650px' }}>
              {vConfig.message}
            </p>
          </div>

          <span
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 700,
              background: vConfig.badgeBg,
              color: vConfig.badgeColor,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {vConfig.label}
          </span>
        </div>

        {/* Rejection / Suspension Feedback Display */}
        {vStatus === 'REJECTED' && orgDetails?.verification_rejection_reason && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #FCA5A5', color: '#991B1B' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Rejection Reason & Auditor Notes:
            </div>
            <div style={{ background: '#FFFFFF', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #FCA5A5', fontSize: '0.9rem', lineHeight: 1.5 }}>
              "{orgDetails.verification_rejection_reason}"
            </div>
          </div>
        )}

        {vStatus === 'SUSPENDED' && orgDetails?.verification_suspension_reason && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #991B1B', color: '#7F1D1D' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
              Suspension Reason & Notice:
            </div>
            <div style={{ background: '#FFFFFF', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #991B1B', fontSize: '0.9rem', lineHeight: 1.5 }}>
              "{orgDetails.verification_suspension_reason}"
            </div>
          </div>
        )}

        {/* Resubmit / Action button inside Banner */}
        {isEditable && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${vConfig.bannerBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: vConfig.bannerTextColor }}>
              {!isProfileComplete ? (
                <span>⚠️ Profile incomplete (Name, Email, Phone, Address required).</span>
              ) : !hasDocuments ? (
                <span>⚠️ At least 1 verification document (e.g. Business License) required.</span>
              ) : (
                <span> Ready for review submission.</span>
              )}
            </div>
            <button
              onClick={handleSubmitVerification}
              disabled={!canSubmitVerification || submittingVerification}
              style={{
                padding: '0.65rem 1.4rem',
                background: canSubmitVerification ? '#2F2520' : '#A8A29E',
                color: '#FAF8F3',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: canSubmitVerification && !submittingVerification ? 'pointer' : 'not-allowed',
                boxShadow: canSubmitVerification ? '0 2px 8px rgba(47, 37, 32, 0.2)' : 'none',
              }}
            >
              {submittingVerification
                ? 'Submitting...'
                : vStatus === 'REJECTED'
                ? '🔄 Resubmit for Verification Review'
                : '🚀 Submit for Verification Review'}
            </button>
          </div>
        )}
      </div>

      {/* Organization Overview Statistics Banner */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '1.75rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#211C19', fontWeight: 700 }}>
          Facility Overview Summary
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Operational Switch</div>
            <div style={{ fontWeight: 700, color: orgDetails?.is_active ? '#5F7A70' : '#B91C1C', marginTop: '0.2rem' }}>
              {orgDetails?.is_active ? '● Operational (Active)' : '○ Paused (Inactive)'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Verification Lifecycle</div>
            <div style={{ fontWeight: 700, color: vConfig.badgeColor, marginTop: '0.2rem' }}>
              {vConfig.label}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Services Offered</div>
            <div style={{ fontWeight: 700, color: '#211C19', marginTop: '0.2rem', fontSize: '1.1rem' }}>
              {orgDetails?.services_count ?? 0} Services
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Active Providers</div>
            <div style={{ fontWeight: 700, color: '#211C19', marginTop: '0.2rem', fontSize: '1.1rem' }}>
              {orgDetails?.providers_count ?? 0} Providers
            </div>
          </div>
        </div>
      </div>

      {/* Document Management Card */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '16px',
          padding: '1.75rem',
          marginBottom: '1.75rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #FAF8F3' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#211C19', fontWeight: 700 }}>
              Verification Documents ({documents.length})
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#78716C' }}>
              Upload business licenses, tax ID documents, or health permits for compliance verification.
            </p>
          </div>
        </div>

        {docError && (
          <div style={{ padding: '0.75rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
            ⚠️ {docError}
          </div>
        )}

        {/* Upload Form if editable */}
        {isEditable ? (
          <form onSubmit={handleUploadDocument} style={{ background: '#FAF8F3', padding: '1.25rem', borderRadius: '12px', border: '1px dashed #D6D3D1', marginBottom: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.95rem', color: '#211C19', fontWeight: 700 }}>
              ➕ Upload New Document
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#211C19', marginBottom: '0.3rem' }}>
                  Document Type *
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.9rem' }}
                >
                  <option value="BUSINESS_LICENSE">Business License</option>
                  <option value="TAX_CERTIFICATE">Tax Certificate</option>
                  <option value="FACILITY_PERMIT">Facility Permit</option>
                  <option value="OTHER">Other Document</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#211C19', marginBottom: '0.3rem' }}>
                  Title / Description
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. 2026 Trade License"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FFFFFF', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#211C19', marginBottom: '0.3rem' }}>
                  Select File (PDF/Image/Doc) *
                </label>
                <input
                  id="org_doc_file_input"
                  type="file"
                  required
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={uploadingDoc || !selectedFile}
              style={{
                padding: '0.6rem 1.25rem',
                background: '#5F7A70',
                color: '#FAF8F3',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: uploadingDoc || !selectedFile ? 'not-allowed' : 'pointer',
                opacity: uploadingDoc || !selectedFile ? 0.7 : 1,
              }}
            >
              {uploadingDoc ? 'Uploading...' : 'Upload Document'}
            </button>
          </form>
        ) : (
          <div style={{ background: '#FAF8F3', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #E6E1D9', color: '#78716C', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            🔒 Document uploads and deletions are locked while organization status is <strong>{vConfig.label}</strong>.
          </div>
        )}

        {/* List of uploaded documents */}
        {documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#78716C', fontSize: '0.9rem' }}>
            📄 No verification documents uploaded yet. Upload required documents to submit for verification.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#FAF8F3', borderBottom: '1px solid #E6E1D9', color: '#78716C', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Document Type</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Title</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Uploaded Date</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>File</th>
                  {isEditable && <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid #FAF8F3' }}>
                    <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: '#211C19' }}>
                      {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                    </td>
                    <td style={{ padding: '0.65rem 0.85rem', color: '#211C19' }}>
                      {doc.title || '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.85rem', color: '#78716C', fontSize: '0.82rem' }}>
                      {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.85rem' }}>
                      {doc.file ? (
                        <a
                          href={doc.file.startsWith('/') ? `http://127.0.0.1:8000${doc.file}` : doc.file}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#5F7A70', fontWeight: 600, textDecoration: 'underline' }}
                        >
                          View File ↗
                        </a>
                      ) : (
                        <span style={{ color: '#A8A29E' }}>No file link</span>
                      )}
                    </td>
                    {isEditable && (
                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          disabled={deletingDocId === doc.id}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#DC2626',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {deletingDocId === doc.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Organization Profile Form */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '16px',
          padding: '1.75rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
        }}
      >
        <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.2rem', color: '#211C19', fontWeight: 700, paddingBottom: '0.75rem', borderBottom: '1px solid #FAF8F3' }}>
          Edit Organization Information
        </h3>

        {successMsg && (
          <div style={{ padding: '0.85rem 1rem', background: 'rgba(95, 122, 112, 0.1)', border: '1px solid #5F7A70', color: '#5F7A70', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.9rem', fontWeight: 600 }}>
            ✓ {successMsg}
          </div>
        )}

        {error && (
          <div style={{ padding: '0.85rem 1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                Organization Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                URL Slug (Unique Key) *
              </label>
              <input
                type="text"
                required
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                Contact Email *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contact@clinic.com"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                Phone Number *
              </label>
              <input
                type="text"
                required
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="+1 (555) 123-4567"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
              Physical Address / Location *
            </label>
            <textarea
              rows={3}
              required
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Full street address, suite, city, state, zip..."
              style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.75rem' }}>
            <input
              type="checkbox"
              id="is_active_check"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              style={{ width: '18px', height: '18px', accentColor: '#5F7A70', cursor: 'pointer' }}
            />
            <label htmlFor="is_active_check" style={{ fontSize: '0.9rem', color: '#211C19', cursor: 'pointer', fontWeight: 500 }}>
              Facility Active (Operational state switch for customer bookings and search)
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.75rem 2rem',
              background: '#2F2520',
              color: '#FAF8F3',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving Profile...' : 'Save Organization Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ManagerSettingsPage;

