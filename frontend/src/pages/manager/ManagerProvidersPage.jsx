import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import managerService from '../../services/managerService';
import providerManagementService from '../../services/providerManagementService';
import organizationService from '../../services/organizationService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import PrivateDocumentButton from '../../components/PrivateDocumentButton';
import { ScheduleRequestsPanel, SchedulePreview } from '../../components/ScheduleRequestsPanel';
import { LeaveRequestsPanel } from '../../components/LeaveRequestsPanel';
import { EmergencyPanel } from '../../components/EmergencyPanel';
import { formatCurrency, bookingError, currentBusinessDate } from '../../utils/bookingDisplay';
import '../../styles/ManagerProviders.css';

/**
 * AssignedChargeEditor: Inline editor for customer-facing charge override on an assigned service.
 */
function AssignedChargeEditor({ assignment, basePrice, onSave, onUnassign, disabled }) {
  const [value, setValue] = useState(assignment.custom_price ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || disabled) return;
    setSaving(true);
    try {
      await onSave(value === '' ? null : value);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setValue('');
  };

  return (
    <div className="manager-providers__charge-editor">
      <div className="manager-providers__charge-header">
        <span className="manager-providers__charge-service-name">
          {assignment.service_name}
        </span>
        <button
          type="button"
          disabled={saving || disabled}
          onClick={() => onUnassign(assignment)}
          className="manager-providers__btn-danger"
          title="Unassign this service from provider"
        >
          Unassign Service
        </button>
      </div>

      <div className="manager-providers__charge-pricing-info">
        Default Service Charge: {formatCurrency(basePrice)} · Current Customer Charge:{' '}
        <strong>{formatCurrency(assignment.effective_customer_charge)}</strong>
      </div>

      <form onSubmit={handleSubmit} className="manager-providers__charge-row">
        <label htmlFor={`charge-input-${assignment.id}`} style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          Customer Charge:
        </label>
        <input
          id={`charge-input-${assignment.id}`}
          type="number"
          min="0"
          step="0.01"
          disabled={saving || disabled}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Use default"
          className="manager-providers__charge-input"
        />
        <button
          type="button"
          className="manager-providers__btn-secondary"
          onClick={handleClear}
          disabled={saving || disabled || value === ''}
        >
          Clear Override
        </button>
        <button
          type="submit"
          className="manager-providers__btn-primary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}
          disabled={saving || disabled}
        >
          {saving ? 'Saving...' : 'Save Charge'}
        </button>
      </form>
    </div>
  );
}

export function ManagerProvidersPage() {
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();

  // Active Tab: 'active' | 'pending' | 'rejected' | 'invitations'
  const [activeTab, setActiveTab] = useState('active');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Authoritative server data
  const [providers, setProviders] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Cancel Invite Confirmation Modal
  const [cancellingInvite, setCancellingInvite] = useState(null);
  const [cancellingBusy, setCancellingBusy] = useState(false);

  // Review Application Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [initialReviewSchedule, setInitialReviewSchedule] = useState(null);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // Services & Charges Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [averageMinutes, setAverageMinutes] = useState('');
  const [savingAverage, setSavingAverage] = useState(false);
  const [assignedCharges, setAssignedCharges] = useState([]);
  const [loadingCharges, setLoadingCharges] = useState(false);
  const [assigningService, setAssigningService] = useState(false);
  const [assignForm, setAssignForm] = useState({
    service_id: '',
    custom_price: '',
  });

  // Unassign Service Confirmation Modal State
  const [unassignConfirmTarget, setUnassignConfirmTarget] = useState(null);
  const [unassigning, setUnassigning] = useState(false);

  // Governance Workspace Modal State (Reorganizes D5 Governance panels)
  const [governanceProvider, setGovernanceProvider] = useState(null);
  const [emergencyDate, setEmergencyDate] = useState(currentBusinessDate());

  // Concurrency & Focus Management Refs
  const requestTicketRef = useRef(0);
  const mutationBusyRef = useRef(false);
  const inviteTriggerRef = useRef(null);
  const reviewTriggerRef = useRef(null);
  const servicesTriggerRef = useRef(null);
  const governanceTriggerRef = useRef(null);
  const unassignTriggerRef = useRef(null);
  const cancelInviteTriggerRef = useRef(null);

  // Dialog Container Refs for initial focus
  const inviteDialogRef = useRef(null);
  const reviewDialogRef = useRef(null);
  const servicesDialogRef = useRef(null);
  const unassignDialogRef = useRef(null);
  const cancelInviteDialogRef = useRef(null);
  const governanceDialogRef = useRef(null);

  // --------------------------------------------------------------------------
  // Data Fetching with Generation Ticket Guard
  // --------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!currentOrg?.id) return;
    const ticket = ++requestTicketRef.current;
    const targetOrgId = currentOrg.id;

    setLoading(true);
    setError(null);

    try {
      const [provData, invData, svcData] = await Promise.all([
        managerService.getProviders(targetOrgId),
        organizationService.getInvitations(targetOrgId).catch(() => []),
        managerService.getServices(targetOrgId).catch(() => []),
      ]);

      // Stale response discard: ensure target organization remains active
      if (ticket !== requestTicketRef.current || currentOrg?.id !== targetOrgId) {
        return;
      }

      setProviders(Array.isArray(provData) ? provData : provData?.results || []);
      setInvitations(Array.isArray(invData) ? invData : invData?.results || []);
      setServices(Array.isArray(svcData) ? svcData : svcData?.results || []);
    } catch (err) {
      if (ticket === requestTicketRef.current) {
        setError(err.response?.data?.detail || 'Failed to load provider management data.');
      }
    } finally {
      if (ticket === requestTicketRef.current) {
        setLoading(false);
      }
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load applicant initial proposed schedule when review modal opens
  useEffect(() => {
    if (!reviewModalOpen || !selectedProfile || !currentOrg?.id) return;
    let active = true;
    const targetOrgId = currentOrg.id;
    const targetProfileId = selectedProfile.id;

    setInitialReviewSchedule(null);
    providerManagementService
      .getSchedules(targetOrgId, targetProfileId)
      .then((days) => {
        if (active && currentOrg?.id === targetOrgId) {
          setInitialReviewSchedule(days);
        }
      })
      .catch(() => {
        if (active && currentOrg?.id === targetOrgId) {
          setInitialReviewSchedule([]);
        }
      });

    return () => {
      active = false;
    };
  }, [reviewModalOpen, selectedProfile, currentOrg?.id]);

  // Load provider service assignments when assign modal opens
  useEffect(() => {
    if (!assignModalOpen || !selectedProvider || !currentOrg?.id) return;
    let active = true;
    const targetOrgId = currentOrg.id;
    const targetProviderId = selectedProvider.id;

    setLoadingCharges(true);
    setAssignedCharges([]);

    providerManagementService
      .getProviderServices(targetOrgId, targetProviderId)
      .then((data) => {
        if (active && currentOrg?.id === targetOrgId) {
          setAssignedCharges(Array.isArray(data) ? data : data?.results || []);
        }
      })
      .catch((err) => {
        if (active && currentOrg?.id === targetOrgId) {
          showError(bookingError(err, 'Failed to load assigned services.'));
        }
      })
      .finally(() => {
        if (active && currentOrg?.id === targetOrgId) {
          setLoadingCharges(false);
        }
      });

    return () => {
      active = false;
    };
  }, [assignModalOpen, selectedProvider, currentOrg?.id, showError]);

  // --------------------------------------------------------------------------
  // Tab Navigation & Accessible Keyboard Handling
  // --------------------------------------------------------------------------
  const tabKeys = ['active', 'pending', 'rejected', 'invitations'];

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchQuery('');
  };

  const handleTabKeyDown = (e, currentTabKey) => {
    const currentIndex = tabKeys.indexOf(currentTabKey);
    let nextIndex = null;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabKeys.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabKeys.length) % tabKeys.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabKeys.length - 1;
    }

    if (nextIndex !== null) {
      const nextTab = tabKeys[nextIndex];
      handleTabChange(nextTab);
      const nextBtn = document.getElementById(`tab-${nextTab}`);
      if (nextBtn) nextBtn.focus();
    }
  };

  // --------------------------------------------------------------------------
  // Provider Invitation Handlers
  // --------------------------------------------------------------------------
  const handleOpenInviteModal = (e) => {
    inviteTriggerRef.current = e.currentTarget;
    setInviteEmail('');
    setInviteModalOpen(true);
  };

  const handleCloseInviteModal = () => {
    if (inviting) return;
    setInviteModalOpen(false);
    if (inviteTriggerRef.current) inviteTriggerRef.current.focus();
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !currentOrg?.id || mutationBusyRef.current) return;

    mutationBusyRef.current = true;
    setInviting(true);
    const targetOrgId = currentOrg.id;
    const emailToInvite = inviteEmail.trim();

    try {
      const res = await organizationService.createInvitation(targetOrgId, { email: emailToInvite });
      if (currentOrg?.id === targetOrgId) {
        showSuccess(`Invitation created for ${emailToInvite}. Share link: /invitations/provider/${res.token}`);
        setInviteModalOpen(false);
        setInviteEmail('');
        fetchData();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        const msg =
          err.response?.data?.message ||
          err.response?.data?.email?.[0] ||
          'Failed to create provider invitation.';
        showError(msg);
      }
    } finally {
      mutationBusyRef.current = false;
      setInviting(false);
    }
  };

  const handleOpenCancelInviteModal = (inv, e) => {
    cancelInviteTriggerRef.current = e.currentTarget;
    setCancellingInvite(inv);
  };

  const handleCloseCancelInviteModal = () => {
    if (cancellingBusy) return;
    setCancellingInvite(null);
    if (cancelInviteTriggerRef.current) cancelInviteTriggerRef.current.focus();
  };

  const handleConfirmCancelInvite = async () => {
    if (!cancellingInvite || !currentOrg?.id || mutationBusyRef.current) return;

    mutationBusyRef.current = true;
    setCancellingBusy(true);
    const targetOrgId = currentOrg.id;
    const invId = cancellingInvite.id;

    try {
      await organizationService.cancelInvitation(targetOrgId, invId);
      if (currentOrg?.id === targetOrgId) {
        showSuccess('Invitation cancelled successfully.');
        setCancellingInvite(null);
        fetchData();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        showError('Failed to cancel invitation.');
      }
    } finally {
      mutationBusyRef.current = false;
      setCancellingBusy(false);
    }
  };

  // --------------------------------------------------------------------------
  // Application Review Handlers
  // --------------------------------------------------------------------------
  const handleOpenReviewModal = (profile, e) => {
    reviewTriggerRef.current = e.currentTarget;
    setSelectedProfile(profile);
    setReviewReason('');
    setReviewModalOpen(true);
  };

  const handleCloseReviewModal = () => {
    if (reviewing) return;
    setReviewModalOpen(false);
    setSelectedProfile(null);
    if (reviewTriggerRef.current) reviewTriggerRef.current.focus();
  };

  const handleApproveApplication = async (profileId) => {
    if (!currentOrg?.id || mutationBusyRef.current) return;

    mutationBusyRef.current = true;
    setReviewing(true);
    const targetOrgId = currentOrg.id;

    try {
      await providerManagementService.reviewApplication(targetOrgId, profileId, {
        action: 'APPROVE',
      });
      if (currentOrg?.id === targetOrgId) {
        showSuccess('Provider application approved successfully.');
        setReviewModalOpen(false);
        setSelectedProfile(null);
        fetchData();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        showError(err.response?.data?.detail || 'Failed to approve provider application.');
      }
    } finally {
      mutationBusyRef.current = false;
      setReviewing(false);
    }
  };

  const handleRejectApplication = async (profileId) => {
    if (!reviewReason.trim()) {
      showError('A mandatory rejection reason is required.');
      return;
    }
    if (!currentOrg?.id || mutationBusyRef.current) return;

    mutationBusyRef.current = true;
    setReviewing(true);
    const targetOrgId = currentOrg.id;
    const reasonText = reviewReason.trim();

    try {
      await providerManagementService.reviewApplication(targetOrgId, profileId, {
        action: 'REJECT',
        reason: reasonText,
      });
      if (currentOrg?.id === targetOrgId) {
        showSuccess('Provider application rejected.');
        setReviewModalOpen(false);
        setSelectedProfile(null);
        setReviewReason('');
        fetchData();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        showError(err.response?.data?.detail || 'Failed to reject provider application.');
      }
    } finally {
      mutationBusyRef.current = false;
      setReviewing(false);
    }
  };

  // --------------------------------------------------------------------------
  // Services & Charges Handlers
  // --------------------------------------------------------------------------
  const handleOpenAssignModal = (prov, e) => {
    servicesTriggerRef.current = e.currentTarget;
    setSelectedProvider(prov);
    setAverageMinutes(prov.average_service_minutes ?? '');
    setAssignForm({ service_id: '', custom_price: '' });
    setAssignModalOpen(true);
  };

  const handleCloseAssignModal = () => {
    if (savingAverage || assigningService || unassigning) return;
    setAssignModalOpen(false);
    setSelectedProvider(null);
    if (servicesTriggerRef.current) servicesTriggerRef.current.focus();
  };

  const handleSaveAverageMinutes = async () => {
    const mins = Number(averageMinutes);
    if (!selectedProvider || !currentOrg?.id || mutationBusyRef.current || !Number.isInteger(mins) || mins < 1) {
      return;
    }

    mutationBusyRef.current = true;
    setSavingAverage(true);
    const targetOrgId = currentOrg.id;
    const targetProviderId = selectedProvider.id;

    try {
      const updated = await providerManagementService.updateProviderProfile(targetOrgId, targetProviderId, {
        average_service_minutes: mins,
      });
      if (currentOrg?.id === targetOrgId) {
        setSelectedProvider(updated);
        setAverageMinutes(updated.average_service_minutes);
        showSuccess('Provider planning average service time saved.');
        fetchData();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        showError(bookingError(err, 'Failed to update average service time.'));
      }
    } finally {
      mutationBusyRef.current = false;
      setSavingAverage(false);
    }
  };

  const handleSaveServiceCharge = async (assignment, price) => {
    if (!selectedProvider || !currentOrg?.id || mutationBusyRef.current) return;

    mutationBusyRef.current = true;
    const targetOrgId = currentOrg.id;
    const targetProviderId = selectedProvider.id;

    try {
      const updated = await providerManagementService.updateServiceCharge(
        targetOrgId,
        targetProviderId,
        assignment.id,
        price
      );
      if (currentOrg?.id === targetOrgId) {
        setAssignedCharges((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
        showSuccess('Customer service charge override saved.');
        fetchData();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        showError(bookingError(err, 'Failed to save customer service charge.'));
      }
    } finally {
      mutationBusyRef.current = false;
    }
  };

  const handleAssignNewService = async (e) => {
    e.preventDefault();
    if (!assignForm.service_id || !selectedProvider || !currentOrg?.id || mutationBusyRef.current) return;

    mutationBusyRef.current = true;
    setAssigningService(true);
    const targetOrgId = currentOrg.id;
    const targetProviderId = selectedProvider.id;

    const payload = { service_id: assignForm.service_id };
    if (assignForm.custom_price !== '') {
      payload.custom_price = assignForm.custom_price;
    }

    try {
      await providerManagementService.assignService(targetOrgId, targetProviderId, payload);
      if (currentOrg?.id === targetOrgId) {
        showSuccess('Service assigned to provider successfully!');
        setAssignForm({ service_id: '', custom_price: '' });
        // Refresh authoritative assigned charges
        const fresh = await providerManagementService.getProviderServices(targetOrgId, targetProviderId);
        setAssignedCharges(Array.isArray(fresh) ? fresh : fresh?.results || []);
        fetchData();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        showError(bookingError(err, 'Failed to assign service.'));
      }
    } finally {
      mutationBusyRef.current = false;
      setAssigningService(false);
    }
  };

  // --------------------------------------------------------------------------
  // Safe Service Unassignment Handlers (Decision D4)
  // --------------------------------------------------------------------------
  const handleOpenUnassignModal = (assignment) => {
    setUnassignConfirmTarget(assignment);
  };

  const handleCloseUnassignModal = () => {
    if (unassigning) return;
    setUnassignConfirmTarget(null);
  };

  const handleConfirmUnassignService = async () => {
    if (!unassignConfirmTarget || !selectedProvider || !currentOrg?.id || mutationBusyRef.current) return;

    mutationBusyRef.current = true;
    setUnassigning(true);
    const targetOrgId = currentOrg.id;
    const targetProviderId = selectedProvider.id;
    const assignmentId = unassignConfirmTarget.id;

    try {
      await providerManagementService.removeService(targetOrgId, targetProviderId, assignmentId);
      if (currentOrg?.id === targetOrgId) {
        showSuccess(`Service "${unassignConfirmTarget.service_name}" unassigned from provider.`);
        setUnassignConfirmTarget(null);
        // Refresh authoritative assigned services
        const fresh = await providerManagementService.getProviderServices(targetOrgId, targetProviderId);
        setAssignedCharges(Array.isArray(fresh) ? fresh : fresh?.results || []);
        fetchData();
      }
    } catch (err) {
      if (currentOrg?.id === targetOrgId) {
        showError(bookingError(err, 'Failed to unassign service. Server constraints prevented removal.'));
      }
    } finally {
      mutationBusyRef.current = false;
      setUnassigning(false);
    }
  };

  // --------------------------------------------------------------------------
  // Governance Workspace Modal Handlers (Decision D5)
  // --------------------------------------------------------------------------
  const handleOpenGovernanceModal = (prov, e) => {
    governanceTriggerRef.current = e.currentTarget;
    setGovernanceProvider(prov);
    setEmergencyDate(currentBusinessDate());
  };

  const handleCloseGovernanceModal = () => {
    setGovernanceProvider(null);
    if (governanceTriggerRef.current) governanceTriggerRef.current.focus();
  };

  // --------------------------------------------------------------------------
  // Keyboard Escape & Focus Trapping for All Modals
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (unassignConfirmTarget && !unassigning) {
          e.preventDefault();
          handleCloseUnassignModal();
        } else if (cancellingInvite && !cancellingBusy) {
          e.preventDefault();
          handleCloseCancelInviteModal();
        } else if (inviteModalOpen && !inviting) {
          e.preventDefault();
          handleCloseInviteModal();
        } else if (reviewModalOpen && !reviewing) {
          e.preventDefault();
          handleCloseReviewModal();
        } else if (governanceProvider) {
          e.preventDefault();
          handleCloseGovernanceModal();
        } else if (assignModalOpen && !savingAverage && !assigningService && !unassigning) {
          e.preventDefault();
          handleCloseAssignModal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    unassignConfirmTarget,
    unassigning,
    cancellingInvite,
    cancellingBusy,
    inviteModalOpen,
    inviting,
    reviewModalOpen,
    reviewing,
    governanceProvider,
    assignModalOpen,
    savingAverage,
    assigningService,
  ]);

  // Initial focus management
  useEffect(() => {
    if (inviteModalOpen && inviteDialogRef.current) {
      const emailInput = inviteDialogRef.current.querySelector('input[type="email"]');
      if (emailInput) emailInput.focus();
    }
  }, [inviteModalOpen]);

  useEffect(() => {
    if (reviewModalOpen && reviewDialogRef.current) {
      const cancelBtn = reviewDialogRef.current.querySelector('button.manager-providers__btn-secondary');
      if (cancelBtn) cancelBtn.focus();
    }
  }, [reviewModalOpen]);

  useEffect(() => {
    if (assignModalOpen && servicesDialogRef.current) {
      const closeBtn = servicesDialogRef.current.querySelector('button.manager-providers__modal-close');
      if (closeBtn) closeBtn.focus();
    }
  }, [assignModalOpen]);

  useEffect(() => {
    if (unassignConfirmTarget && unassignDialogRef.current) {
      const cancelBtn = unassignDialogRef.current.querySelector('button.manager-providers__btn-secondary');
      if (cancelBtn) cancelBtn.focus();
    }
  }, [unassignConfirmTarget]);

  useEffect(() => {
    if (cancellingInvite && cancelInviteDialogRef.current) {
      const cancelBtn = cancelInviteDialogRef.current.querySelector('button.manager-providers__btn-secondary');
      if (cancelBtn) cancelBtn.focus();
    }
  }, [cancellingInvite]);

  useEffect(() => {
    if (governanceProvider && governanceDialogRef.current) {
      const closeBtn = governanceDialogRef.current.querySelector('button.manager-providers__modal-close');
      if (closeBtn) closeBtn.focus();
    }
  }, [governanceProvider]);

  // --------------------------------------------------------------------------
  // Filtered Lists
  // --------------------------------------------------------------------------
  const activeProviders = useMemo(
    () => providers.filter((p) => p.application_status === 'APPROVED' && p.membership_is_active !== false),
    [providers]
  );
  const pendingApplications = useMemo(
    () =>
      providers.filter(
        (p) =>
          p.application_status === 'PENDING_REVIEW' ||
          (p.application_status === 'INCOMPLETE' && !p.membership_is_active)
      ),
    [providers]
  );
  const rejectedApplications = useMemo(
    () => providers.filter((p) => p.application_status === 'REJECTED'),
    [providers]
  );
  const activeInvitations = useMemo(
    () => invitations.filter((i) => i.is_valid),
    [invitations]
  );

  // Apply search query across active providers
  const filteredActiveProviders = useMemo(() => {
    if (!searchQuery.trim()) return activeProviders;
    const q = searchQuery.toLowerCase();
    return activeProviders.filter(
      (p) =>
        `${p.user_first_name || ''} ${p.user_last_name || ''}`.toLowerCase().includes(q) ||
        (p.title || '').toLowerCase().includes(q) ||
        (p.user_email || '').toLowerCase().includes(q)
    );
  }, [activeProviders, searchQuery]);

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the header selector to view provider management."
      />
    );
  }

  return (
    <div className="manager-providers animate-page-entrance">
      {/* Header and Editorial Row */}
      <div className="manager-providers__header">
        <div className="manager-providers__header-info">
          <div className="manager-providers__eyebrow">
            <span>👨‍⚕️ Clinical & Provider Operations</span>
          </div>
          <h1 className="manager-providers__title">Provider Roster & Management</h1>
          <p className="manager-providers__subtitle">
            Manage approved professionals, review pending applicant registrations, and govern schedules for{' '}
            <span className="manager-providers__subtitle-org">{currentOrg.name}</span>.
          </p>
        </div>
        <div className="manager-providers__header-actions">
          <button
            type="button"
            className="manager-providers__btn-primary"
            onClick={handleOpenInviteModal}
          >
            <span>✉️</span>
            <span>Invite Provider via Email</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="manager-providers__alert manager-providers__alert--error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Accessible Tabs Bar (WAI-ARIA) */}
      <div
        role="tablist"
        aria-label="Provider roster navigation tabs"
        className="manager-providers__tablist"
      >
        <button
          type="button"
          role="tab"
          id="tab-active"
          aria-selected={activeTab === 'active'}
          aria-controls="panel-active"
          tabIndex={activeTab === 'active' ? 0 : -1}
          className={`manager-providers__tab ${activeTab === 'active' ? 'manager-providers__tab--active' : ''}`}
          onClick={() => handleTabChange('active')}
          onKeyDown={(e) => handleTabKeyDown(e, 'active')}
        >
          <span>Active Providers</span>
          <span className="manager-providers__tab-badge">{activeProviders.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-pending"
          aria-selected={activeTab === 'pending'}
          aria-controls="panel-pending"
          tabIndex={activeTab === 'pending' ? 0 : -1}
          className={`manager-providers__tab ${activeTab === 'pending' ? 'manager-providers__tab--active' : ''}`}
          onClick={() => handleTabChange('pending')}
          onKeyDown={(e) => handleTabKeyDown(e, 'pending')}
        >
          <span>Pending Review</span>
          <span className="manager-providers__tab-badge">{pendingApplications.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-rejected"
          aria-selected={activeTab === 'rejected'}
          aria-controls="panel-rejected"
          tabIndex={activeTab === 'rejected' ? 0 : -1}
          className={`manager-providers__tab ${activeTab === 'rejected' ? 'manager-providers__tab--active' : ''}`}
          onClick={() => handleTabChange('rejected')}
          onKeyDown={(e) => handleTabKeyDown(e, 'rejected')}
        >
          <span>Rejected Applications</span>
          <span className="manager-providers__tab-badge">{rejectedApplications.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-invitations"
          aria-selected={activeTab === 'invitations'}
          aria-controls="panel-invitations"
          tabIndex={activeTab === 'invitations' ? 0 : -1}
          className={`manager-providers__tab ${activeTab === 'invitations' ? 'manager-providers__tab--active' : ''}`}
          onClick={() => handleTabChange('invitations')}
          onKeyDown={(e) => handleTabKeyDown(e, 'invitations')}
        >
          <span>Active Invitations</span>
          <span className="manager-providers__tab-badge">{activeInvitations.length}</span>
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading provider roster and management data..." />
      ) : (
        <>
          {/* ================================================================
              TAB PANEL 1: Active Providers
              ================================================================ */}
          {activeTab === 'active' && (
            <div
              role="tabpanel"
              id="panel-active"
              aria-labelledby="tab-active"
              className="manager-providers__tabpanel"
            >
              {/* Search Toolbar */}
              <div className="manager-providers__toolbar">
                <div className="manager-providers__search-box">
                  <span className="manager-providers__search-icon" aria-hidden="true">
                    🔍
                  </span>
                  <input
                    type="search"
                    aria-label="Search active providers by name, title, or email"
                    placeholder="Search by provider name, title, or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="manager-providers__search-input"
                  />
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  Showing {filteredActiveProviders.length} of {activeProviders.length} approved professional(s)
                </div>
              </div>

              {filteredActiveProviders.length === 0 ? (
                <EmptyState
                  title={searchQuery ? 'No Matching Providers' : 'No Active Providers'}
                  message={
                    searchQuery
                      ? 'No active providers matched your search query.'
                      : 'No approved providers are active in this facility. Invite new providers to get started.'
                  }
                  actionLabel={searchQuery ? 'Clear Search' : 'Invite Provider via Email'}
                  onAction={searchQuery ? () => setSearchQuery('') : handleOpenInviteModal}
                />
              ) : (
                <div className="manager-providers__table-wrapper">
                  <table className="manager-providers__table">
                    <thead>
                      <tr>
                        <th scope="col">Provider Identity</th>
                        <th scope="col">Professional Title</th>
                        <th scope="col">Planning Average</th>
                        <th scope="col">Operational Status</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActiveProviders.map((prov) => {
                        const fullName =
                          `${prov.user_first_name || ''} ${prov.user_last_name || ''}`.trim() ||
                          prov.title ||
                          'Professional';
                        return (
                          <tr key={prov.id}>
                            <td>
                              <div className="manager-providers__provider-cell">
                                <span className="manager-providers__provider-name">{fullName}</span>
                                <span className="manager-providers__provider-email">{prov.user_email}</span>
                              </div>
                            </td>
                            <td>{prov.title || '—'}</td>
                            <td>
                              <span style={{ fontWeight: 600 }}>
                                {prov.average_service_minutes ? `${prov.average_service_minutes} min` : 'Not set'}
                              </span>
                            </td>
                            <td>
                              <StatusBadge status="ACTIVE" customLabel="APPROVED & ACTIVE" />
                            </td>
                            <td>
                              <div className="manager-providers__table-actions">
                                <button
                                  type="button"
                                  className="manager-providers__btn-secondary"
                                  onClick={(e) => handleOpenAssignModal(prov, e)}
                                >
                                  <span>🏷️</span>
                                  <span>Services & Charges</span>
                                </button>
                                <button
                                  type="button"
                                  className="manager-providers__btn-secondary"
                                  onClick={(e) => handleOpenGovernanceModal(prov, e)}
                                  title="Review schedule change requests, planned leaves, and emergency recovery"
                                >
                                  <span>📅</span>
                                  <span>Governance</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TAB PANEL 2: Pending Review Applications
              ================================================================ */}
          {activeTab === 'pending' && (
            <div
              role="tabpanel"
              id="panel-pending"
              aria-labelledby="tab-pending"
              className="manager-providers__tabpanel"
            >
              {pendingApplications.length === 0 ? (
                <EmptyState
                  title="No Pending Applications"
                  message="There are no provider self-registration applications waiting for manager review."
                />
              ) : (
                <div className="manager-providers__table-wrapper">
                  <table className="manager-providers__table">
                    <thead>
                      <tr>
                        <th scope="col">Applicant</th>
                        <th scope="col">Requested Title</th>
                        <th scope="col">Application Status</th>
                        <th scope="col">Submission Date</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingApplications.map((prov) => {
                        const fullName =
                          `${prov.user_first_name || ''} ${prov.user_last_name || ''}`.trim() ||
                          'Applicant';
                        return (
                          <tr key={prov.id}>
                            <td>
                              <div className="manager-providers__provider-cell">
                                <span className="manager-providers__provider-name">{fullName}</span>
                                <span className="manager-providers__provider-email">{prov.user_email}</span>
                              </div>
                            </td>
                            <td>{prov.title || '—'}</td>
                            <td>
                              <StatusBadge status="PENDING" customLabel="PENDING REVIEW" />
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                              {prov.created_at ? new Date(prov.created_at).toLocaleDateString() : '—'}
                            </td>
                            <td>
                              <div className="manager-providers__table-actions">
                                <button
                                  type="button"
                                  className="manager-providers__btn-primary"
                                  style={{ padding: '0.45rem 0.95rem', fontSize: '0.82rem' }}
                                  onClick={(e) => handleOpenReviewModal(prov, e)}
                                >
                                  <span>🔍</span>
                                  <span>Review Application</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TAB PANEL 3: Rejected Applications
              ================================================================ */}
          {activeTab === 'rejected' && (
            <div
              role="tabpanel"
              id="panel-rejected"
              aria-labelledby="tab-rejected"
              className="manager-providers__tabpanel"
            >
              {rejectedApplications.length === 0 ? (
                <EmptyState
                  title="No Rejected Applications"
                  message="No provider applications have been rejected for this facility."
                />
              ) : (
                <div className="manager-providers__table-wrapper">
                  <table className="manager-providers__table">
                    <thead>
                      <tr>
                        <th scope="col">Applicant</th>
                        <th scope="col">Title</th>
                        <th scope="col">Auditor Rejection Reason</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedApplications.map((prov) => {
                        const fullName =
                          `${prov.user_first_name || ''} ${prov.user_last_name || ''}`.trim() ||
                          'Applicant';
                        return (
                          <tr key={prov.id}>
                            <td>
                              <div className="manager-providers__provider-cell">
                                <span className="manager-providers__provider-name">{fullName}</span>
                                <span className="manager-providers__provider-email">{prov.user_email}</span>
                              </div>
                            </td>
                            <td>{prov.title || '—'}</td>
                            <td style={{ color: 'var(--color-danger, #B91C1C)', fontSize: '0.85rem', maxWidth: '380px' }}>
                              {prov.application_rejection_reason || 'No rejection notes recorded.'}
                            </td>
                            <td>
                              <div className="manager-providers__table-actions">
                                <button
                                  type="button"
                                  className="manager-providers__btn-secondary"
                                  onClick={(e) => handleOpenReviewModal(prov, e)}
                                >
                                  <span>Re-examine</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TAB PANEL 4: Outstanding Invitations
              ================================================================ */}
          {activeTab === 'invitations' && (
            <div
              role="tabpanel"
              id="panel-invitations"
              aria-labelledby="tab-invitations"
              className="manager-providers__tabpanel"
            >
              {invitations.length === 0 ? (
                <EmptyState
                  title="No Provider Invitations"
                  message="No provider onboarding invitations have been dispatched."
                  actionLabel="Send Invitation"
                  onAction={handleOpenInviteModal}
                />
              ) : (
                <div className="manager-providers__table-wrapper">
                  <table className="manager-providers__table">
                    <thead>
                      <tr>
                        <th scope="col">Invited Email</th>
                        <th scope="col">Dispatched By</th>
                        <th scope="col">Expiration Date</th>
                        <th scope="col">Status</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map((inv) => (
                        <tr key={inv.id}>
                          <td style={{ fontWeight: 600 }}>{inv.email}</td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            {inv.created_by_email || 'Manager'}
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                            {inv.expires_at ? new Date(inv.expires_at).toLocaleString() : '—'}
                          </td>
                          <td>
                            <StatusBadge
                              status={
                                inv.used_at
                                  ? 'COMPLETED'
                                  : inv.cancelled_at
                                  ? 'CANCELLED'
                                  : inv.is_valid
                                  ? 'WAITING'
                                  : 'NO_SHOW'
                              }
                              customLabel={
                                inv.used_at
                                  ? 'Accepted'
                                  : inv.cancelled_at
                                  ? 'Cancelled'
                                  : inv.is_valid
                                  ? 'Active Token'
                                  : 'Expired'
                              }
                            />
                          </td>
                          <td>
                            <div className="manager-providers__table-actions">
                              {inv.is_valid && (
                                <button
                                  type="button"
                                  className="manager-providers__btn-danger"
                                  onClick={(e) => handleOpenCancelInviteModal(inv, e)}
                                >
                                  Cancel Token
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ====================================================================
          MODAL: Invite Provider
          ==================================================================== */}
      {inviteModalOpen && (
        <div
          className="manager-providers__modal-backdrop"
          onClick={handleCloseInviteModal}
          role="presentation"
        >
          <div
            ref={inviteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-dialog-title"
            className="manager-providers__modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-providers__modal-header">
              <h3 id="invite-dialog-title" className="manager-providers__modal-title">
                Invite Provider via Email
              </h3>
              <button
                type="button"
                className="manager-providers__modal-close"
                onClick={handleCloseInviteModal}
                disabled={inviting}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSendInvite}>
              <div className="manager-providers__modal-body">
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                  Invited professionals receive an authenticated 7-day onboarding invitation link to create their
                  account and join <strong>{currentOrg.name}</strong> directly with APPROVED status.
                </p>
                <div>
                  <label htmlFor="invite-email-input" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Provider Email Address *
                  </label>
                  <input
                    id="invite-email-input"
                    type="email"
                    required
                    disabled={inviting}
                    placeholder="doctor@hospital.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="manager-providers__search-input"
                    style={{ paddingLeft: '0.85rem' }}
                  />
                </div>
              </div>
              <div className="manager-providers__modal-footer">
                <button
                  type="button"
                  className="manager-providers__btn-secondary"
                  onClick={handleCloseInviteModal}
                  disabled={inviting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="manager-providers__btn-primary"
                  disabled={inviting || !inviteEmail.trim()}
                >
                  {inviting ? 'Generating Invitation...' : 'Generate & Send Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: Cancel Invite Confirmation
          ==================================================================== */}
      {cancellingInvite && (
        <div
          className="manager-providers__modal-backdrop"
          onClick={handleCloseCancelInviteModal}
          role="presentation"
        >
          <div
            ref={cancelInviteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-invite-title"
            className="manager-providers__modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-providers__modal-header">
              <h3 id="cancel-invite-title" className="manager-providers__modal-title">
                Confirm Invitation Cancellation
              </h3>
              <button
                type="button"
                className="manager-providers__modal-close"
                onClick={handleCloseCancelInviteModal}
                disabled={cancellingBusy}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <div className="manager-providers__modal-body">
              <p>
                Are you sure you want to cancel the invitation dispatched to{' '}
                <strong>{cancellingInvite.email}</strong>?
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: 0 }}>
                The 7-day onboarding token will be invalidated immediately. The recipient will not be able to
                complete registration using this link.
              </p>
            </div>
            <div className="manager-providers__modal-footer">
              <button
                type="button"
                className="manager-providers__btn-secondary"
                onClick={handleCloseCancelInviteModal}
                disabled={cancellingBusy}
              >
                Keep Invitation
              </button>
              <button
                type="button"
                className="manager-providers__btn-danger"
                style={{ padding: '0.65rem 1.25rem' }}
                onClick={handleConfirmCancelInvite}
                disabled={cancellingBusy}
              >
                {cancellingBusy ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: Review Application
          ==================================================================== */}
      {reviewModalOpen && selectedProfile && (
        <div
          className="manager-providers__modal-backdrop"
          onClick={handleCloseReviewModal}
          role="presentation"
        >
          <div
            ref={reviewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-dialog-title"
            className="manager-providers__modal-dialog manager-providers__modal-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-providers__modal-header">
              <h3 id="review-dialog-title" className="manager-providers__modal-title">
                Application Review — {selectedProfile.user_first_name} {selectedProfile.user_last_name}
              </h3>
              <button
                type="button"
                className="manager-providers__modal-close"
                onClick={handleCloseReviewModal}
                disabled={reviewing}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <div className="manager-providers__modal-body">
              {/* Applicant Profile Card */}
              <div
                style={{
                  backgroundColor: 'var(--color-bg-subtle, #FAF8F3)',
                  padding: '1.15rem',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border, #E6E1D9)',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                }}
              >
                <div>
                  <strong>Applicant Email:</strong> {selectedProfile.user_email}
                </div>
                <div style={{ marginTop: '0.35rem' }}>
                  <strong>Requested Professional Title:</strong> {selectedProfile.title || 'N/A'}
                </div>
                <div style={{ marginTop: '0.35rem' }}>
                  <strong>Biography / Summary:</strong> {selectedProfile.bio || 'None provided'}
                </div>
              </div>

              {/* Initial Proposed Weekly Schedule */}
              <div>
                <strong style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  Proposed Schedule (Active upon Approval):
                </strong>
                {initialReviewSchedule === null ? (
                  <LoadingState message="Loading applicant's proposed schedule..." />
                ) : (
                  <SchedulePreview days={initialReviewSchedule} />
                )}
              </div>

              {/* Verification Documents with Private Downloads */}
              {selectedProfile.documents?.length > 0 && (
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Uploaded Credentials & Documents:
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {selectedProfile.documents.map((doc) => (
                      <div
                        key={doc.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.65rem 0.85rem',
                          background: 'var(--color-bg-subtle, #FAF8F3)',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border, #E6E1D9)',
                          fontSize: '0.85rem',
                        }}
                      >
                        <span>
                          {doc.original_filename || doc.document_type} · <strong>{doc.status}</strong>
                        </span>
                        {doc.file && (
                          <PrivateDocumentButton url={doc.file} filename={doc.original_filename} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mandatory Rejection Reason */}
              <div>
                <label htmlFor="review-reason-text" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Rejection Reason (Mandatory if rejecting):
                </label>
                <textarea
                  id="review-reason-text"
                  rows={3}
                  disabled={reviewing}
                  placeholder="Provide explicit feedback on why the application is rejected..."
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  className="manager-providers__search-input"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="manager-providers__modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="manager-providers__btn-danger"
                style={{ padding: '0.65rem 1.25rem' }}
                disabled={reviewing}
                onClick={() => handleRejectApplication(selectedProfile.id)}
              >
                {reviewing ? 'Processing...' : 'Reject Application'}
              </button>
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="manager-providers__btn-secondary"
                  disabled={reviewing}
                  onClick={handleCloseReviewModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="manager-providers__btn-primary"
                  disabled={reviewing}
                  onClick={() => handleApproveApplication(selectedProfile.id)}
                >
                  {reviewing ? 'Approving...' : 'Approve Application'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: Services & Charges Workspace (Decision D4)
          ==================================================================== */}
      {assignModalOpen && selectedProvider && (
        <div
          className="manager-providers__modal-backdrop"
          onClick={handleCloseAssignModal}
          role="presentation"
        >
          <div
            ref={servicesDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="services-dialog-title"
            className="manager-providers__modal-dialog manager-providers__modal-dialog--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-providers__modal-header">
              <h3 id="services-dialog-title" className="manager-providers__modal-title">
                Services & Charges — {selectedProvider.user_first_name} {selectedProvider.user_last_name}
              </h3>
              <button
                type="button"
                className="manager-providers__modal-close"
                onClick={handleCloseAssignModal}
                disabled={savingAverage || assigningService || unassigning}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <div className="manager-providers__modal-body">
              {/* Planning Average Duration Section */}
              <div
                style={{
                  padding: '1.15rem',
                  borderRadius: '12px',
                  backgroundColor: 'var(--color-bg-subtle, #FAF8F3)',
                  border: '1px solid var(--color-border, #E6E1D9)',
                }}
              >
                <label htmlFor="avg-mins-input" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Provider Planning Average Service Time (Minutes):
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    id="avg-mins-input"
                    type="number"
                    min="1"
                    step="1"
                    disabled={savingAverage}
                    value={averageMinutes}
                    onChange={(e) => setAverageMinutes(e.target.value)}
                    placeholder="e.g. 20"
                    className="manager-providers__charge-input"
                    style={{ width: '120px' }}
                  />
                  <button
                    type="button"
                    className="manager-providers__btn-primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}
                    disabled={
                      savingAverage ||
                      !Number.isInteger(Number(averageMinutes)) ||
                      Number(averageMinutes) < 1
                    }
                    onClick={handleSaveAverageMinutes}
                  >
                    {savingAverage ? 'Saving...' : 'Save Average Time'}
                  </button>
                </div>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Controls this professional&apos;s daily consultation capacity and queue estimates.
                </p>
              </div>

              {/* Assigned Services List */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 700 }}>
                  Assigned Services & Price Overrides ({assignedCharges.length})
                </h4>
                <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                  Clear an override to revert to the base catalog price.
                </p>

                {loadingCharges ? (
                  <LoadingState message="Loading assigned services..." />
                ) : assignedCharges.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
                    No services currently assigned to this provider.
                  </div>
                ) : (
                  assignedCharges.map((assignment) => (
                    <AssignedChargeEditor
                      key={assignment.id}
                      assignment={assignment}
                      basePrice={services.find((s) => s.id === assignment.service_id)?.price}
                      onSave={(price) => handleSaveServiceCharge(assignment, price)}
                      onUnassign={handleOpenUnassignModal}
                      disabled={savingAverage || assigningService || unassigning}
                    />
                  ))
                )}
              </div>

              {/* Assign New Service Form */}
              <div
                style={{
                  padding: '1.15rem',
                  borderRadius: '12px',
                  backgroundColor: 'var(--color-bg-subtle, #FAF8F3)',
                  border: '1.5px dashed var(--color-border, #E6E1D9)',
                }}
              >
                <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.95rem', fontWeight: 700 }}>
                  ➕ Assign Additional Service
                </h4>
                <form onSubmit={handleAssignNewService} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                    <div>
                      <label htmlFor="assign-service-select" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Select Service *
                      </label>
                      <select
                        id="assign-service-select"
                        required
                        disabled={assigningService}
                        value={assignForm.service_id}
                        onChange={(e) => setAssignForm({ ...assignForm, service_id: e.target.value })}
                        className="manager-providers__search-input"
                        style={{ paddingLeft: '0.85rem' }}
                      >
                        <option value="">-- Choose unassigned service --</option>
                        {services
                          .filter((svc) => !assignedCharges.some((a) => a.service_id === svc.id))
                          .map((svc) => (
                            <option key={svc.id} value={svc.id}>
                              {svc.name} ({svc.duration_minutes} min) — Base: {formatCurrency(svc.price)}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="assign-price-override" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Customer Charge Override (optional)
                      </label>
                      <input
                        id="assign-price-override"
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={assigningService}
                        placeholder="Use service default"
                        value={assignForm.custom_price}
                        onChange={(e) => setAssignForm({ ...assignForm, custom_price: e.target.value })}
                        className="manager-providers__search-input"
                        style={{ paddingLeft: '0.85rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="submit"
                      disabled={assigningService || !assignForm.service_id}
                      className="manager-providers__btn-primary"
                    >
                      {assigningService ? 'Assigning Service...' : 'Assign Service to Provider'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            <div className="manager-providers__modal-footer">
              <button
                type="button"
                className="manager-providers__btn-secondary"
                onClick={handleCloseAssignModal}
                disabled={savingAverage || assigningService || unassigning}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: Confirm Service Unassignment (Decision D4)
          ==================================================================== */}
      {unassignConfirmTarget && (
        <div
          className="manager-providers__modal-backdrop"
          onClick={handleCloseUnassignModal}
          role="presentation"
          style={{ zIndex: 1100 }}
        >
          <div
            ref={unassignDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unassign-dialog-title"
            className="manager-providers__modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manager-providers__modal-header">
              <h3 id="unassign-dialog-title" className="manager-providers__modal-title">
                Confirm Service Unassignment
              </h3>
              <button
                type="button"
                className="manager-providers__modal-close"
                onClick={handleCloseUnassignModal}
                disabled={unassigning}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <div className="manager-providers__modal-body">
              <p>
                Are you sure you want to unassign{' '}
                <strong>{unassignConfirmTarget.service_name}</strong> from{' '}
                <strong>{selectedProvider?.user_first_name} {selectedProvider?.user_last_name}</strong>?
              </p>
              <div
                style={{
                  backgroundColor: 'var(--color-bg-subtle, #FAF8F3)',
                  padding: '0.85rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #E6E1D9)',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  color: 'var(--color-text-muted, #78716C)',
                }}
              >
                ℹ️ <strong>Operational Impact:</strong> Future bookings for this provider-service pairing will no
                longer be offered. Existing confirmed customer appointments are preserved and not deleted by this
                action.
              </div>
            </div>
            <div className="manager-providers__modal-footer">
              <button
                type="button"
                className="manager-providers__btn-secondary"
                onClick={handleCloseUnassignModal}
                disabled={unassigning}
              >
                Cancel
              </button>
              <button
                type="button"
                className="manager-providers__btn-danger"
                style={{ padding: '0.65rem 1.25rem' }}
                onClick={handleConfirmUnassignService}
                disabled={unassigning}
              >
                {unassigning ? 'Unassigning...' : 'Confirm Unassignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: Schedule, Leave & Emergency Governance Workspace (Decision D5)
          ==================================================================== */}
      {governanceProvider && (
        <div
          className="manager-providers__modal-backdrop"
          onClick={handleCloseGovernanceModal}
          role="presentation"
        >
          <div
            ref={governanceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="governance-dialog-title"
            className="manager-providers__modal-dialog manager-providers__modal-dialog--wide"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '960px' }}
          >
            <div className="manager-providers__modal-header">
              <h3 id="governance-dialog-title" className="manager-providers__modal-title">
                Schedule & Operational Governance — {governanceProvider.user_first_name} {governanceProvider.user_last_name}
              </h3>
              <button
                type="button"
                className="manager-providers__modal-close"
                onClick={handleCloseGovernanceModal}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <div className="manager-providers__modal-body">
              {/* Emergency Date Control */}
              <div className="manager-providers__governance-section">
                <label htmlFor="emergency-date-input" className="manager-providers__governance-label">
                  Emergency Service Date:
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    id="emergency-date-input"
                    type="date"
                    max={currentBusinessDate()}
                    value={emergencyDate}
                    onChange={(e) => setEmergencyDate(e.target.value)}
                    className="manager-providers__charge-input"
                    style={{ width: '160px' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Scoped to current or historical service dates for emergency incident management.
                  </span>
                </div>
              </div>

              {/* Panel 1: Schedule Requests Panel */}
              <div className="manager-providers__governance-section">
                <ScheduleRequestsPanel
                  key={`sched:${currentOrg.id}:${governanceProvider.id}`}
                  orgId={currentOrg.id}
                  providerId={governanceProvider.id}
                  manager
                />
              </div>

              {/* Panel 2: Leave Requests Panel */}
              <div className="manager-providers__governance-section">
                <LeaveRequestsPanel
                  key={`leave:${currentOrg.id}:${governanceProvider.id}`}
                  orgId={currentOrg.id}
                  providerId={governanceProvider.id}
                />
              </div>

              {/* Panel 3: Emergency Panel */}
              <div className="manager-providers__governance-section">
                <EmergencyPanel
                  key={`emerg:${currentOrg.id}:${governanceProvider.id}:${emergencyDate}`}
                  orgId={currentOrg.id}
                  providerId={governanceProvider.id}
                  serviceDate={emergencyDate}
                  mode="manager"
                />
              </div>
            </div>
            <div className="manager-providers__modal-footer">
              <button
                type="button"
                className="manager-providers__btn-secondary"
                onClick={handleCloseGovernanceModal}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerProvidersPage;
