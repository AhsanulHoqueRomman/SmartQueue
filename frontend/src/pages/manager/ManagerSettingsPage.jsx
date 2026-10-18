import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import PrivateDocumentButton from '../../components/PrivateDocumentButton';
import { formatApiError } from '../../utils/errorUtils';
import '../../styles/ManagerSettings.css';

const DOC_TYPE_LABELS = {
  BUSINESS_LICENSE: 'Business License',
  TAX_CERTIFICATE: 'Tax Certificate',
  FACILITY_PERMIT: 'Facility Permit',
  OTHER: 'Other Document',
};

const FALLBACK_CATEGORIES = [
  { id: 'HEALTHCARE', name: 'Healthcare & Medical' },
  { id: 'LEGAL', name: 'Legal & Law Firm' },
  { id: 'BEAUTY', name: 'Beauty, Salon & Wellness' },
  { id: 'REPAIR', name: 'Technical Repair & Service' },
  { id: 'CONSULTING', name: 'Consulting & Professional Services' },
  { id: 'OTHER', name: 'Other Services' },
];

const BUFFER_CHOICES = [15, 20, 25, 30];

const VERIFICATION_STATUS_CONFIG = {
  SETUP_INCOMPLETE: {
    label: 'Setup Incomplete',
    badgeBg: 'rgba(120, 113, 108, 0.15)',
    badgeColor: '#78716C',
    bannerBg: 'rgba(245, 158, 11, 0.08)',
    bannerBorder: 'rgba(245, 158, 11, 0.3)',
    bannerTextColor: '#B45309',
    icon: '📝',
    message: 'Your organization setup is incomplete. Fill out all required contact fields and upload at least one verification document before submitting for review.',
  },
  SUBMITTED: {
    label: 'Submitted for Review',
    badgeBg: 'rgba(245, 158, 11, 0.18)',
    badgeColor: '#B45309',
    bannerBg: 'rgba(245, 158, 11, 0.08)',
    bannerBorder: 'rgba(245, 158, 11, 0.3)',
    bannerTextColor: '#B45309',
    icon: '⏳',
    message: 'Verification request submitted. Your profile and documents are currently in queue for administrator review. Document edits are locked.',
  },
  UNDER_REVIEW: {
    label: 'Under Active Review',
    badgeBg: 'rgba(14, 165, 233, 0.18)',
    badgeColor: '#0284C7',
    bannerBg: 'rgba(14, 165, 233, 0.08)',
    bannerBorder: 'rgba(14, 165, 233, 0.3)',
    bannerTextColor: '#0284C7',
    icon: '🔍',
    message: 'An administrator is actively reviewing your verification documents. Document edits remain locked.',
  },
  APPROVED: {
    label: 'Approved & Verified',
    badgeBg: 'rgba(34, 197, 94, 0.18)',
    badgeColor: '#15803D',
    bannerBg: 'rgba(34, 197, 94, 0.08)',
    bannerBorder: 'rgba(34, 197, 94, 0.3)',
    bannerTextColor: '#15803D',
    icon: '✅',
    message: 'Your organization is officially verified and fully operational on QueueTurn.',
  },
  REJECTED: {
    label: 'Verification Rejected',
    badgeBg: 'rgba(239, 68, 68, 0.18)',
    badgeColor: '#B91C1C',
    bannerBg: 'rgba(239, 68, 68, 0.08)',
    bannerBorder: 'rgba(239, 68, 68, 0.3)',
    bannerTextColor: '#B91C1C',
    icon: '❌',
    message: 'Verification request was rejected by administration. Please review feedback below, update your details/documents, and resubmit.',
  },
  SUSPENDED: {
    label: 'Organization Suspended',
    badgeBg: 'rgba(239, 68, 68, 0.25)',
    badgeColor: '#991B1B',
    bannerBg: 'rgba(239, 68, 68, 0.12)',
    bannerBorder: 'rgba(239, 68, 68, 0.4)',
    bannerTextColor: '#991B1B',
    icon: '⛔',
    message: 'Your organization has been suspended by administration. Public discovery and provider operational features are disabled.',
  },
};

export function ManagerSettingsPage() {
  const { currentOrg, refreshOrganizations } = useTenant();

  // Active Tab: 'profile' | 'operational' | 'compliance'
  const [activeTab, setActiveTab] = useState('profile');

  // Loading and feedback state
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOperational, setSavingOperational] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [submittingVerification, setSubmittingVerification] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [docError, setDocError] = useState('');

  // Authoritative server data
  const [orgDetails, setOrgDetails] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);

  // General profile and operational form state (Note: is_active is deliberately omitted)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    industry_type: 'OTHER',
    email: '',
    phone_number: '',
    address: '',
    tagline: '',
    description: '',
    logo: '',
    cover_image: '',
    arrival_buffer_minutes: 15,
  });

  // Document Upload Form State
  const [docType, setDocType] = useState('BUSINESS_LICENSE');
  const [docTitle, setDocTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // Confirmation Modals State
  const [deleteModalDoc, setDeleteModalDoc] = useState(null);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  // Concurrency, Ticket, and Focus Management Refs
  const requestTicketRef = useRef(0);
  const mutationLockRef = useRef(false);
  const deleteTriggerRef = useRef(null);
  const submitTriggerRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const submitDialogRef = useRef(null);

  // --------------------------------------------------------------------------
  // Data Loading with Generation Ticket Guard
  // --------------------------------------------------------------------------
  const loadDetails = useCallback(async () => {
    if (!currentOrg?.id) return;
    const ticket = ++requestTicketRef.current;
    const targetOrgId = currentOrg.id;

    setLoading(true);
    setError('');
    setDocError('');

    try {
      const [detailsData, docsData, categoriesData] = await Promise.all([
        organizationService.getOrganizationDetail(targetOrgId),
        organizationService.getDocuments(targetOrgId),
        organizationService.getGlobalCategories().catch(() => FALLBACK_CATEGORIES),
      ]);

      // Stale response discard: verify ticket and current selected organization
      if (ticket !== requestTicketRef.current || currentOrg?.id !== targetOrgId) {
        return;
      }

      setOrgDetails(detailsData);
      setDocuments(Array.isArray(docsData) ? docsData : docsData.results || []);
      if (Array.isArray(categoriesData) && categoriesData.length > 0) {
        setCategories(categoriesData);
      }

      setFormData({
        name: detailsData.name || '',
        slug: detailsData.slug || '',
        industry_type: detailsData.industry_type || 'OTHER',
        email: detailsData.email || detailsData.contact_email || '',
        phone_number: detailsData.phone_number || '',
        address: detailsData.address || '',
        tagline: detailsData.tagline || '',
        description: detailsData.description || '',
        logo: detailsData.logo || '',
        cover_image: detailsData.cover_image || '',
        arrival_buffer_minutes: BUFFER_CHOICES.includes(detailsData.arrival_buffer_minutes)
          ? detailsData.arrival_buffer_minutes
          : 15,
      });
    } catch (err) {
      if (ticket === requestTicketRef.current) {
        setError(formatApiError(err, 'Failed to load organization settings or verification data.'));
      }
    } finally {
      if (ticket === requestTicketRef.current) {
        setLoading(false);
      }
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  // --------------------------------------------------------------------------
  // Tab Navigation & Keyboard Handling
  // --------------------------------------------------------------------------
  const tabsList = ['profile', 'operational', 'compliance'];

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSuccessMsg('');
    setError('');
    setDocError('');
  };

  const handleTabKeyDown = (e, currentTab) => {
    const currentIndex = tabsList.indexOf(currentTab);
    let nextIndex = null;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabsList.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabsList.length) % tabsList.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabsList.length - 1;
    }

    if (nextIndex !== null) {
      const nextTab = tabsList[nextIndex];
      handleTabChange(nextTab);
      const nextBtn = document.getElementById(`tab-${nextTab}`);
      if (nextBtn) nextBtn.focus();
    }
  };

  // --------------------------------------------------------------------------
  // Tab 1: General Profile Save Handler
  // --------------------------------------------------------------------------
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!currentOrg?.id || mutationLockRef.current) return;

    mutationLockRef.current = true;
    setSavingProfile(true);
    setSuccessMsg('');
    setError('');

    const targetOrgId = currentOrg.id;

    try {
      const payload = {
        name: formData.name.trim(),
        slug: formData.slug.trim(),
        industry_type: formData.industry_type || 'OTHER',
        email: formData.email.trim(),
        phone_number: formData.phone_number.trim(),
        address: formData.address.trim(),
        tagline: formData.tagline.trim(),
        description: formData.description.trim(),
        logo: formData.logo.trim(),
        cover_image: formData.cover_image.trim(),
      };

      const updated = await organizationService.updateOrganization(targetOrgId, payload);

      if (currentOrg?.id === targetOrgId) {
        setOrgDetails(updated);
        setFormData((prev) => ({
          ...prev,
          name: updated.name || '',
          slug: updated.slug || '',
          industry_type: updated.industry_type || 'OTHER',
          email: updated.email || '',
          phone_number: updated.phone_number || '',
          address: updated.address || '',
          tagline: updated.tagline || '',
          description: updated.description || '',
          logo: updated.logo || '',
          cover_image: updated.cover_image || '',
        }));
        setSuccessMsg('Organization profile updated successfully.');
        if (refreshOrganizations) refreshOrganizations();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        setError(formatApiError(err, 'Failed to update organization profile.'));
      }
    } finally {
      mutationLockRef.current = false;
      setSavingProfile(false);
    }
  };

  // --------------------------------------------------------------------------
  // Tab 2: Operational Rules Save Handler (Explicitly excludes is_active)
  // --------------------------------------------------------------------------
  const handleSaveOperational = async (e) => {
    e.preventDefault();
    if (!currentOrg?.id || mutationLockRef.current) return;

    mutationLockRef.current = true;
    setSavingOperational(true);
    setSuccessMsg('');
    setError('');

    const targetOrgId = currentOrg.id;

    try {
      const payload = {
        arrival_buffer_minutes: Number(formData.arrival_buffer_minutes),
      };

      const updated = await organizationService.updateOrganization(targetOrgId, payload);

      if (currentOrg?.id === targetOrgId) {
        setOrgDetails(updated);
        setFormData((prev) => ({
          ...prev,
          arrival_buffer_minutes: updated.arrival_buffer_minutes ?? 15,
        }));
        setSuccessMsg('Operational rules saved successfully.');
        if (refreshOrganizations) refreshOrganizations();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        setError(formatApiError(err, 'Failed to update operational settings.'));
      }
    } finally {
      mutationLockRef.current = false;
      setSavingOperational(false);
    }
  };

  // --------------------------------------------------------------------------
  // Tab 3: Verification Documents Upload Handler
  // --------------------------------------------------------------------------
  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!selectedFile || !currentOrg?.id || mutationLockRef.current) return;

    // Strict client-side validation for bounded file sizes and formats
    if (!selectedFile.size || selectedFile.size > 5 * 1024 * 1024) {
      setDocError('Upload a nonempty file no larger than 5 MB.');
      return;
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(selectedFile.name)) {
      setDocError('Allowed document formats: PDF, JPG, JPEG or PNG.');
      return;
    }

    mutationLockRef.current = true;
    setUploadingDoc(true);
    setDocError('');
    setSuccessMsg('');

    const targetOrgId = currentOrg.id;

    try {
      const data = new FormData();
      data.append('document_type', docType);
      if (docTitle.trim()) {
        data.append('title', docTitle.trim());
      }
      data.append('file', selectedFile);

      await organizationService.uploadDocument(targetOrgId, data);

      if (currentOrg?.id === targetOrgId) {
        setSuccessMsg('Document uploaded successfully.');
        setDocTitle('');
        setSelectedFile(null);
        const fileInput = document.getElementById('org_doc_file_input');
        if (fileInput) fileInput.value = '';

        // Authoritative document list refresh
        const docs = await organizationService.getDocuments(targetOrgId);
        setDocuments(Array.isArray(docs) ? docs : docs.results || []);
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        setDocError(formatApiError(err, 'Failed to upload document.'));
      }
    } finally {
      mutationLockRef.current = false;
      setUploadingDoc(false);
    }
  };

  // --------------------------------------------------------------------------
  // Tab 3: Delete Document Confirmation & Handler
  // --------------------------------------------------------------------------
  const openDeleteModal = (doc, e) => {
    deleteTriggerRef.current = e.currentTarget;
    setDeleteModalDoc(doc);
    setDocError('');
  };

  const closeDeleteModal = () => {
    if (deletingDocId) return; // Prevent dismissing while mutation in flight
    setDeleteModalDoc(null);
    if (deleteTriggerRef.current) {
      deleteTriggerRef.current.focus();
    }
  };

  const handleConfirmDeleteDocument = async () => {
    if (!deleteModalDoc || !currentOrg?.id || mutationLockRef.current) return;

    const docId = deleteModalDoc.id;
    const targetOrgId = currentOrg.id;

    mutationLockRef.current = true;
    setDeletingDocId(docId);
    setDocError('');

    try {
      await organizationService.deleteDocument(targetOrgId, docId);
      if (currentOrg?.id === targetOrgId) {
        setSuccessMsg('Verification document deleted successfully.');
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        closeDeleteModal();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        setDocError(formatApiError(err, 'Failed to delete verification document.'));
      }
    } finally {
      mutationLockRef.current = false;
      setDeletingDocId(null);
    }
  };

  // --------------------------------------------------------------------------
  // Tab 3: Submit Verification Confirmation & Handler
  // --------------------------------------------------------------------------
  const openSubmitModal = (e) => {
    submitTriggerRef.current = e.currentTarget;
    setSubmitModalOpen(true);
    setError('');
  };

  const closeSubmitModal = () => {
    if (submittingVerification) return; // Prevent dismissing while mutation in flight
    setSubmitModalOpen(false);
    if (submitTriggerRef.current) {
      submitTriggerRef.current.focus();
    }
  };

  const handleConfirmSubmitVerification = async () => {
    if (!currentOrg?.id || mutationLockRef.current) return;

    const targetOrgId = currentOrg.id;

    mutationLockRef.current = true;
    setSubmittingVerification(true);
    setError('');

    try {
      const updated = await organizationService.submitVerification(targetOrgId);
      if (currentOrg?.id === targetOrgId) {
        setOrgDetails(updated);
        setSuccessMsg('Organization verification submitted successfully for review.');
        closeSubmitModal();
        if (refreshOrganizations) refreshOrganizations();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        setError(formatApiError(err, 'Failed to submit verification request.'));
      }
    } finally {
      mutationLockRef.current = false;
      setSubmittingVerification(false);
    }
  };

  // --------------------------------------------------------------------------
  // Keyboard Escape & Focus Trapping for Modals
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (deleteModalDoc && !deletingDocId) {
          e.preventDefault();
          closeDeleteModal();
        } else if (submitModalOpen && !submittingVerification) {
          e.preventDefault();
          closeSubmitModal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteModalDoc, deletingDocId, submitModalOpen, submittingVerification]);

  // Initial focus placement on modal open
  useEffect(() => {
    if (deleteModalDoc && deleteDialogRef.current) {
      const cancelBtn = deleteDialogRef.current.querySelector('button.manager-settings__btn-secondary');
      if (cancelBtn) cancelBtn.focus();
    }
  }, [deleteModalDoc]);

  useEffect(() => {
    if (submitModalOpen && submitDialogRef.current) {
      const cancelBtn = submitDialogRef.current.querySelector('button.manager-settings__btn-secondary');
      if (cancelBtn) cancelBtn.focus();
    }
  }, [submitModalOpen]);

  // --------------------------------------------------------------------------
  // Status & Validation Rules
  // --------------------------------------------------------------------------
  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the header selector to manage settings."
      />
    );
  }

  if (loading) {
    return <LoadingState message="Loading organization settings & verification data..." />;
  }

  const vStatus = orgDetails?.verification_status || 'SETUP_INCOMPLETE';
  const vConfig = VERIFICATION_STATUS_CONFIG[vStatus] || VERIFICATION_STATUS_CONFIG.SETUP_INCOMPLETE;
  const isDocEditable = vStatus === 'SETUP_INCOMPLETE' || vStatus === 'REJECTED';

  const isProfileComplete = Boolean(
    formData.name.trim() &&
    formData.email.trim() &&
    formData.phone_number.trim() &&
    formData.address.trim()
  );
  const hasDocuments = documents.length > 0;
  const canSubmitVerification = isDocEditable && isProfileComplete && hasDocuments;

  return (
    <div className="manager-settings animate-page-entrance">
      {/* Page Header */}
      <div className="manager-settings__header">
        <div className="manager-settings__eyebrow">
          <span>🏢 Facility Administration</span>
        </div>
        <h1 className="manager-settings__title">Organization Settings & Rules</h1>
        <p className="manager-settings__subtitle">
          Manage identity parameters, operational booking buffers, and compliance verification for{' '}
          <span className="manager-settings__subtitle-org">{orgDetails?.name || currentOrg.name}</span>.
        </p>
      </div>

      {/* Global Alerts */}
      {successMsg && (
        <div role="status" className="manager-settings__alert manager-settings__alert--success">
          <span>✓</span>
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="manager-settings__alert manager-settings__alert--error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Verification Lifecycle Status Banner */}
      <div
        className="manager-settings__banner"
        style={{
          backgroundColor: vConfig.bannerBg,
          borderColor: vConfig.bannerBorder,
          color: vConfig.bannerTextColor,
        }}
      >
        <div className="manager-settings__banner-top">
          <div className="manager-settings__banner-lead">
            <span className="manager-settings__banner-icon" aria-hidden="true">
              {vConfig.icon}
            </span>
            <div>
              <h2 className="manager-settings__banner-heading">
                Status: {vConfig.label}
              </h2>
              <p className="manager-settings__banner-msg">{vConfig.message}</p>
            </div>
          </div>
          <span
            className="manager-settings__banner-badge"
            style={{
              backgroundColor: vConfig.badgeBg,
              color: vConfig.badgeColor,
            }}
          >
            {vConfig.label}
          </span>
        </div>

        {/* Rejection / Suspension Feedback */}
        {vStatus === 'REJECTED' && orgDetails?.verification_rejection_reason && (
          <div className="manager-settings__banner-reason">
            <div className="manager-settings__banner-reason-title">
              Auditor Rejection Feedback:
            </div>
            <div className="manager-settings__banner-reason-text">
              &ldquo;{orgDetails.verification_rejection_reason}&rdquo;
            </div>
          </div>
        )}

        {vStatus === 'SUSPENDED' && orgDetails?.verification_suspension_reason && (
          <div className="manager-settings__banner-reason">
            <div className="manager-settings__banner-reason-title">
              Administrative Suspension Notice:
            </div>
            <div className="manager-settings__banner-reason-text">
              &ldquo;{orgDetails.verification_suspension_reason}&rdquo;
            </div>
          </div>
        )}
      </div>

      {/* Accessible Tabs Bar (WAI-ARIA) */}
      <div
        role="tablist"
        aria-label="Organization settings tabs"
        className="manager-settings__tablist"
      >
        <button
          type="button"
          role="tab"
          id="tab-profile"
          aria-selected={activeTab === 'profile'}
          aria-controls="panel-profile"
          tabIndex={activeTab === 'profile' ? 0 : -1}
          className={`manager-settings__tab ${activeTab === 'profile' ? 'manager-settings__tab--active' : ''}`}
          onClick={() => handleTabChange('profile')}
          onKeyDown={(e) => handleTabKeyDown(e, 'profile')}
        >
          <span>General Profile</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-operational"
          aria-selected={activeTab === 'operational'}
          aria-controls="panel-operational"
          tabIndex={activeTab === 'operational' ? 0 : -1}
          className={`manager-settings__tab ${activeTab === 'operational' ? 'manager-settings__tab--active' : ''}`}
          onClick={() => handleTabChange('operational')}
          onKeyDown={(e) => handleTabKeyDown(e, 'operational')}
        >
          <span>Operational Rules</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-compliance"
          aria-selected={activeTab === 'compliance'}
          aria-controls="panel-compliance"
          tabIndex={activeTab === 'compliance' ? 0 : -1}
          className={`manager-settings__tab ${activeTab === 'compliance' ? 'manager-settings__tab--active' : ''}`}
          onClick={() => handleTabChange('compliance')}
          onKeyDown={(e) => handleTabKeyDown(e, 'compliance')}
        >
          <span>Verification & Compliance</span>
          <span className="manager-settings__tab-badge">{documents.length}</span>
        </button>
      </div>

      {/* ====================================================================
          TAB PANEL 1: General Profile
          ==================================================================== */}
      {activeTab === 'profile' && (
        <div
          role="tabpanel"
          id="panel-profile"
          aria-labelledby="tab-profile"
          className="manager-settings__tabpanel"
        >
          <div className="manager-settings__card">
            <div className="manager-settings__card-header">
              <h2 className="manager-settings__card-title">Facility Profile & Identity</h2>
              <p className="manager-settings__card-description">
                Public directory information, unique booking URL, and verified contact parameters.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="manager-settings__form">
              <div className="manager-settings__form-grid">
                {/* Organization Name */}
                <div className="manager-settings__form-group">
                  <label htmlFor="settings-name" className="manager-settings__label">
                    <span>Facility Name<span className="manager-settings__label-required">*</span></span>
                  </label>
                  <input
                    id="settings-name"
                    type="text"
                    required
                    disabled={savingProfile}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="manager-settings__input"
                    placeholder="e.g. Apex Health Center"
                  />
                </div>

                {/* Slug */}
                <div className="manager-settings__form-group">
                  <label htmlFor="settings-slug" className="manager-settings__label">
                    <span>Unique URL Slug<span className="manager-settings__label-required">*</span></span>
                  </label>
                  <input
                    id="settings-slug"
                    type="text"
                    required
                    disabled={savingProfile}
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                    className="manager-settings__input"
                    placeholder="e.g. apex-health"
                  />
                  <span className="manager-settings__help-text">
                    Unique identifier used in your public booking and discovery URL.
                  </span>
                </div>

                {/* Industry Category */}
                <div className="manager-settings__form-group">
                  <label htmlFor="settings-industry" className="manager-settings__label">
                    <span>Industry Category</span>
                  </label>
                  <select
                    id="settings-industry"
                    disabled={savingProfile}
                    value={formData.industry_type}
                    onChange={(e) => setFormData({ ...formData, industry_type: e.target.value })}
                    className="manager-settings__select"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id || cat.industry_type} value={cat.id || cat.industry_type}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Contact Email */}
                <div className="manager-settings__form-group">
                  <label htmlFor="settings-email" className="manager-settings__label">
                    <span>Contact Email<span className="manager-settings__label-required">*</span></span>
                  </label>
                  <input
                    id="settings-email"
                    type="email"
                    required
                    disabled={savingProfile}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="manager-settings__input"
                    placeholder="contact@facility.com"
                  />
                </div>

                {/* Phone Number */}
                <div className="manager-settings__form-group">
                  <label htmlFor="settings-phone" className="manager-settings__label">
                    <span>Phone Number<span className="manager-settings__label-required">*</span></span>
                  </label>
                  <input
                    id="settings-phone"
                    type="tel"
                    required
                    disabled={savingProfile}
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    className="manager-settings__input"
                    placeholder="+880 1700-000000"
                  />
                </div>

                {/* Tagline */}
                <div className="manager-settings__form-group">
                  <label htmlFor="settings-tagline" className="manager-settings__label">
                    <span>Tagline / Motto</span>
                  </label>
                  <input
                    id="settings-tagline"
                    type="text"
                    disabled={savingProfile}
                    value={formData.tagline}
                    onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                    className="manager-settings__input"
                    placeholder="e.g. Caring for your family every step of the way"
                  />
                </div>

                {/* Physical Address */}
                <div className="manager-settings__form-group manager-settings__form-group--full">
                  <label htmlFor="settings-address" className="manager-settings__label">
                    <span>Physical Address<span className="manager-settings__label-required">*</span></span>
                  </label>
                  <textarea
                    id="settings-address"
                    rows={3}
                    required
                    disabled={savingProfile}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="manager-settings__textarea"
                    placeholder="Full street address, suite, floor, city..."
                  />
                </div>

                {/* Description */}
                <div className="manager-settings__form-group manager-settings__form-group--full">
                  <label htmlFor="settings-description" className="manager-settings__label">
                    <span>Public Overview & Description</span>
                  </label>
                  <textarea
                    id="settings-description"
                    rows={4}
                    disabled={savingProfile}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="manager-settings__textarea"
                    placeholder="Describe your organization, available specializations, and patient guidance..."
                  />
                </div>

                {/* Logo Image URL */}
                <div className="manager-settings__form-group">
                  <label htmlFor="settings-logo" className="manager-settings__label">
                    <span>Logo Image URL</span>
                  </label>
                  <input
                    id="settings-logo"
                    type="url"
                    disabled={savingProfile}
                    value={formData.logo}
                    onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                    className="manager-settings__input"
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                {/* Cover Image URL */}
                <div className="manager-settings__form-group">
                  <label htmlFor="settings-cover" className="manager-settings__label">
                    <span>Cover Banner URL</span>
                  </label>
                  <input
                    id="settings-cover"
                    type="url"
                    disabled={savingProfile}
                    value={formData.cover_image}
                    onChange={(e) => setFormData({ ...formData, cover_image: e.target.value })}
                    className="manager-settings__input"
                    placeholder="https://example.com/cover.jpg"
                  />
                </div>
              </div>

              <div className="manager-settings__actions">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="manager-settings__btn-primary"
                >
                  {savingProfile ? 'Saving Profile...' : 'Save Profile Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB PANEL 2: Operational Rules
          ==================================================================== */}
      {activeTab === 'operational' && (
        <div
          role="tabpanel"
          id="panel-operational"
          aria-labelledby="tab-operational"
          className="manager-settings__tabpanel"
        >
          <div className="manager-settings__card">
            <div className="manager-settings__card-header">
              <h2 className="manager-settings__card-title">Operational Booking & Capacity Rules</h2>
              <p className="manager-settings__card-description">
                Control customer arrival windows and observe platform-governed operational activation.
              </p>
            </div>

            {/* Read-Only Platform Activation Badge (Defect Correction) */}
            <div className="manager-settings__status-block">
              <div className="manager-settings__status-badge-container">
                <span
                  className={`manager-settings__status-badge ${
                    orgDetails?.is_active
                      ? 'manager-settings__status-badge--active'
                      : 'manager-settings__status-badge--inactive'
                  }`}
                >
                  {orgDetails?.is_active ? '● Facility Operational' : '○ Facility Inactive / Suspended'}
                </span>
              </div>
              <div className="manager-settings__status-details">
                <h3 className="manager-settings__status-title">Platform Activation Status (Read-Only)</h3>
                <p className="manager-settings__status-explanation">
                  Organization activation and suspension are governed authoritatively by QueueTurn platform
                  administration. When active, verified services and providers appear in public booking and search.
                  To request status changes or discuss facility suspension, please contact platform support.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveOperational} className="manager-settings__form">
              <div className="manager-settings__form-grid">
                {/* Arrival Buffer Minutes */}
                <div className="manager-settings__form-group">
                  <label htmlFor="settings-buffer" className="manager-settings__label">
                    <span>Customer Arrival Buffer<span className="manager-settings__label-required">*</span></span>
                  </label>
                  <select
                    id="settings-buffer"
                    disabled={savingOperational}
                    value={formData.arrival_buffer_minutes}
                    onChange={(e) =>
                      setFormData({ ...formData, arrival_buffer_minutes: Number(e.target.value) })
                    }
                    className="manager-settings__select"
                  >
                    {BUFFER_CHOICES.map((mins) => (
                      <option key={mins} value={mins}>
                        {mins} Minutes
                      </option>
                    ))}
                  </select>
                  <span className="manager-settings__help-text">
                    Influences customer arrival advisory notices. The first eligible serial is guided to arrive 5
                    minutes before scheduled consultation start; subsequent serials receive dynamic guidance based
                    on this buffer.
                  </span>
                </div>
              </div>

              <div className="manager-settings__actions">
                <button
                  type="submit"
                  disabled={savingOperational}
                  className="manager-settings__btn-primary"
                >
                  {savingOperational ? 'Saving Rules...' : 'Save Operational Rules'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB PANEL 3: Verification & Compliance
          ==================================================================== */}
      {activeTab === 'compliance' && (
        <div
          role="tabpanel"
          id="panel-compliance"
          aria-labelledby="tab-compliance"
          className="manager-settings__tabpanel"
        >
          <div className="manager-settings__card">
            <div className="manager-settings__card-header">
              <h2 className="manager-settings__card-title">Verification Documents & Review Submission</h2>
              <p className="manager-settings__card-description">
                Upload verified business licenses, permits, or certificates to earn official platform certification.
              </p>
            </div>

            {docError && (
              <div role="alert" className="manager-settings__alert manager-settings__alert--error">
                <span>⚠️</span>
                <span>{docError}</span>
              </div>
            )}

            {/* Document Upload Box or Locked Notice */}
            {isDocEditable ? (
              <div className="manager-settings__upload-card">
                <h3 className="manager-settings__upload-title">➕ Upload New Compliance Document</h3>
                <form onSubmit={handleUploadDocument}>
                  <div className="manager-settings__upload-grid">
                    <div className="manager-settings__form-group">
                      <label htmlFor="doc-type-select" className="manager-settings__label">
                        <span>Document Type<span className="manager-settings__label-required">*</span></span>
                      </label>
                      <select
                        id="doc-type-select"
                        disabled={uploadingDoc}
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        className="manager-settings__select"
                      >
                        <option value="BUSINESS_LICENSE">Business License</option>
                        <option value="TAX_CERTIFICATE">Tax Certificate</option>
                        <option value="FACILITY_PERMIT">Facility Permit</option>
                        <option value="OTHER">Other Document</option>
                      </select>
                    </div>

                    <div className="manager-settings__form-group">
                      <label htmlFor="doc-title-input" className="manager-settings__label">
                        <span>Document Title / Reference</span>
                      </label>
                      <input
                        id="doc-title-input"
                        type="text"
                        disabled={uploadingDoc}
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        placeholder="e.g. 2026 Trade License"
                        className="manager-settings__input"
                      />
                    </div>

                    <div className="manager-settings__form-group">
                      <label htmlFor="org_doc_file_input" className="manager-settings__label">
                        <span>Attachment File (Max 5 MB)<span className="manager-settings__label-required">*</span></span>
                      </label>
                      <input
                        id="org_doc_file_input"
                        type="file"
                        required
                        disabled={uploadingDoc}
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setSelectedFile(e.target.files[0] || null)}
                        className="manager-settings__input"
                      />
                      <span className="manager-settings__help-text">
                        Accepted file formats: PDF, JPG, JPEG, PNG. Maximum file size: 5 MB.
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={uploadingDoc || !selectedFile}
                    className="manager-settings__btn-primary"
                  >
                    {uploadingDoc ? 'Uploading Document...' : 'Upload Document'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="manager-settings__lock-notice">
                <span>🔒</span>
                <span>
                  Document uploads and deletions are locked while organization status is{' '}
                  <strong>{vConfig.label}</strong>.
                </span>
              </div>
            )}

            {/* Uploaded Documents Table */}
            <h3 className="manager-settings__card-title" style={{ fontSize: '1.05rem', marginBottom: '0.85rem' }}>
              Uploaded Verification Documents ({documents.length})
            </h3>

            {documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-muted)' }}>
                📄 No verification documents uploaded yet. Upload at least one document to submit for review.
              </div>
            ) : (
              <div className="manager-settings__table-wrapper">
                <table className="manager-settings__table">
                  <thead>
                    <tr>
                      <th scope="col">Document Type</th>
                      <th scope="col">Title</th>
                      <th scope="col">Uploaded Date</th>
                      <th scope="col">File Attachment</th>
                      {isDocEditable && <th scope="col" style={{ textAlign: 'right' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td style={{ fontWeight: 600 }}>
                          {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                        </td>
                        <td>{doc.title || '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                          {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          {doc.file ? (
                            <PrivateDocumentButton url={doc.file} filename={doc.original_filename} />
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>No file link</span>
                          )}
                        </td>
                        {isDocEditable && (
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={(e) => openDeleteModal(doc, e)}
                              disabled={deletingDocId === doc.id}
                              className="manager-settings__btn-danger"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Submission Checklist and Trigger */}
            {isDocEditable && (
              <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
                <h3 className="manager-settings__card-title" style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>
                  Verification Submission Readiness
                </h3>
                <div className="manager-settings__checklist">
                  <div
                    className={`manager-settings__checklist-item ${
                      isProfileComplete
                        ? 'manager-settings__checklist-item--pass'
                        : 'manager-settings__checklist-item--fail'
                    }`}
                  >
                    <span>{isProfileComplete ? '✓' : '✗'}</span>
                    <span>Required contact fields complete (Name, Email, Phone, Physical Address)</span>
                  </div>
                  <div
                    className={`manager-settings__checklist-item ${
                      hasDocuments
                        ? 'manager-settings__checklist-item--pass'
                        : 'manager-settings__checklist-item--fail'
                    }`}
                  >
                    <span>{hasDocuments ? '✓' : '✗'}</span>
                    <span>At least 1 verification document uploaded (e.g. Business License)</span>
                  </div>
                </div>

                <div className="manager-settings__actions" style={{ borderTop: 'none', paddingTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={openSubmitModal}
                    disabled={!canSubmitVerification || submittingVerification}
                    className="manager-settings__btn-primary"
                  >
                    {submittingVerification
                      ? 'Submitting...'
                      : vStatus === 'REJECTED'
                      ? '🔄 Resubmit for Verification Review'
                      : '🚀 Submit for Verification Review'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          CONFIRMATION MODAL: Delete Document
          ==================================================================== */}
      {deleteModalDoc && (
        <div
          className="manager-settings__modal-backdrop"
          onClick={closeDeleteModal}
          role="presentation"
        >
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="manager-settings__modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-settings__modal-header">
              <h3 id="delete-dialog-title" className="manager-settings__modal-title">
                Confirm Document Deletion
              </h3>
              <button
                type="button"
                className="manager-settings__modal-close"
                onClick={closeDeleteModal}
                disabled={Boolean(deletingDocId)}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <div className="manager-settings__modal-body">
              <p>
                Are you sure you want to delete{' '}
                <strong>
                  {deleteModalDoc.title || DOC_TYPE_LABELS[deleteModalDoc.document_type] || 'this document'}
                </strong>
                ?
              </p>
              <p style={{ color: 'var(--color-danger, #B91C1C)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                This file will be permanently removed from private verification storage. This action cannot be undone.
              </p>
            </div>
            <div className="manager-settings__modal-footer">
              <button
                type="button"
                disabled={Boolean(deletingDocId)}
                onClick={closeDeleteModal}
                className="manager-settings__btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingDocId)}
                onClick={handleConfirmDeleteDocument}
                className="manager-settings__btn-primary"
                style={{ backgroundColor: 'var(--color-danger, #DC2626)' }}
              >
                {deletingDocId ? 'Deleting...' : 'Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          CONFIRMATION MODAL: Submit Verification
          ==================================================================== */}
      {submitModalOpen && (
        <div
          className="manager-settings__modal-backdrop"
          onClick={closeSubmitModal}
          role="presentation"
        >
          <div
            ref={submitDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-dialog-title"
            className="manager-settings__modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-settings__modal-header">
              <h3 id="submit-dialog-title" className="manager-settings__modal-title">
                Submit for Official Verification
              </h3>
              <button
                type="button"
                className="manager-settings__modal-close"
                onClick={closeSubmitModal}
                disabled={submittingVerification}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <div className="manager-settings__modal-body">
              <p>
                You are about to submit <strong>{formData.name}</strong> and{' '}
                <strong>{documents.length} uploaded document(s)</strong> for administrative compliance review.
              </p>
              <div
                style={{
                  background: 'var(--color-bg-subtle, #FAF8F3)',
                  border: '1px solid var(--color-border, #E6E1D9)',
                  borderRadius: '8px',
                  padding: '0.85rem 1rem',
                  fontSize: '0.85rem',
                  marginTop: '0.75rem',
                  lineHeight: 1.45,
                }}
              >
                🔒 <strong>Notice:</strong> Once submitted, your documents and verification parameters will be locked
                from further edits or deletions while the QueueTurn platform administration reviews your application.
              </div>
            </div>
            <div className="manager-settings__modal-footer">
              <button
                type="button"
                disabled={submittingVerification}
                onClick={closeSubmitModal}
                className="manager-settings__btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingVerification}
                onClick={handleConfirmSubmitVerification}
                className="manager-settings__btn-primary"
              >
                {submittingVerification ? 'Submitting Application...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerSettingsPage;
