import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import organizationService from '../../services/organizationService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { Pagination } from '../../components/common/Pagination';
import {
  calculateTotalPages,
  clampPage,
  getPageItemRange,
  DEFAULT_PAGE_SIZE,
} from '../../utils/paginationUtils';
import '../../styles/OperationalPrimitives.css';
import '../../styles/ManagerStaff.css';

/**
 * Table column definitions for staff and invitation listings.
 */
const STAFF_COLUMNS = [
  { key: 'name', label: 'Staff Member', width: '28%' },
  { key: 'email', label: 'Email Address', width: '32%' },
  { key: 'role', label: 'Role', width: '12%' },
  { key: 'status', label: 'Status', width: '14%' },
  { key: 'actions', label: 'Actions', width: '14%', align: 'right' },
];

const INVITATION_COLUMNS = [
  { key: 'email', label: 'Recipient Email', width: '34%' },
  { key: 'role', label: 'Role', width: '14%' },
  { key: 'created_at', label: 'Sent Date', width: '18%' },
  { key: 'expires_at', label: 'Expires', width: '18%' },
  { key: 'actions', label: 'Actions', width: '16%', align: 'right' },
];

/**
 * Formats ISO date string in Asia/Dhaka time zone.
 */
function formatDhakaDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(dt);
  } catch {
    return '—';
  }
}

export function ManagerStaffPage() {
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();

  // Navigation tab: 'active' | 'inactive' | 'invitations'
  const [activeTab, setActiveTab] = useState('active');

  // Search & Client Pagination
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Tenant-scoped datasets
  const [staffData, setStaffData] = useState({
    orgId: null,
    items: [],
  });
  const [invitationsData, setInvitationsData] = useState({
    orgId: null,
    items: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [createdInviteToken, setCreatedInviteToken] = useState(null);
  const [copied, setCopied] = useState(false);

  // Mutation Confirmation Dialog States
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const [activateTarget, setActivateTarget] = useState(null);
  const [isActivating, setIsActivating] = useState(false);

  const [cancelInviteTarget, setCancelInviteTarget] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Request & Mutation Safety Refs
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);
  const mutationInProgressRef = useRef(false);
  const lastFocusedElementRef = useRef(null);

  // Input refs for dialog focus management
  const inviteEmailInputRef = useRef(null);
  const inviteCloseBtnRef = useRef(null);
  const deactivateCancelBtnRef = useRef(null);
  const activateCancelBtnRef = useRef(null);
  const cancelInviteCancelBtnRef = useRef(null);

  // Render-time tenant ownership checks
  const rawStaff = useMemo(
    () => (staffData.orgId === currentOrg?.id ? staffData.items : []),
    [staffData, currentOrg?.id]
  );
  const rawInvitations = useMemo(
    () => (invitationsData.orgId === currentOrg?.id ? invitationsData.items : []),
    [invitationsData, currentOrg?.id]
  );

  // Categorized records
  const activeStaff = useMemo(
    () => rawStaff.filter((m) => Boolean(m.is_active)),
    [rawStaff]
  );
  const inactiveStaff = useMemo(
    () => rawStaff.filter((m) => !m.is_active),
    [rawStaff]
  );
  const pendingInvitations = useMemo(
    () => rawInvitations.filter((inv) => Boolean(inv.is_valid)),
    [rawInvitations]
  );

  /**
   * Primary asynchronous fetch function with request-ticket isolation.
   */
  const fetchData = useCallback(
    async (targetOrgId) => {
      const orgIdToFetch = targetOrgId || currentOrg?.id;
      if (!orgIdToFetch) return;

      const requestId = ++activeRequestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const [membersResult, invResult] = await Promise.allSettled([
          organizationService.getStaffMembers(orgIdToFetch),
          organizationService.getStaffInvitations(orgIdToFetch),
        ]);

        // Discard response if organization switched or newer query started
        if (requestId !== activeRequestIdRef.current || orgIdToFetch !== currentOrg?.id) {
          return;
        }

        let fetchError = null;
        let members = [];
        let invs = [];

        if (membersResult.status === 'fulfilled') {
          const val = membersResult.value;
          members = Array.isArray(val) ? val : val?.results || [];
        } else {
          fetchError =
            membersResult.reason?.response?.data?.detail ||
            'Failed to load staff members.';
        }

        if (invResult.status === 'fulfilled') {
          const val = invResult.value;
          invs = Array.isArray(val) ? val : val?.results || [];
        } else {
          if (!fetchError) {
            fetchError =
              invResult.reason?.response?.data?.detail ||
              'Failed to load staff invitations.';
          }
        }

        if (membersResult.status === 'rejected' && invResult.status === 'rejected') {
          setError(fetchError || 'Failed to load staff management records.');
        } else if (fetchError) {
          setError(fetchError);
          if (membersResult.status === 'fulfilled') {
            setStaffData({ orgId: orgIdToFetch, items: members });
          }
          if (invResult.status === 'fulfilled') {
            setInvitationsData({ orgId: orgIdToFetch, items: invs });
          }
        } else {
          setStaffData({ orgId: orgIdToFetch, items: members });
          setInvitationsData({ orgId: orgIdToFetch, items: invs });
        }
      } catch (err) {
        if (requestId !== activeRequestIdRef.current || orgIdToFetch !== currentOrg?.id) {
          return;
        }
        setError(err.response?.data?.detail || 'Failed to load staff management records.');
      } finally {
        if (requestId === activeRequestIdRef.current && orgIdToFetch === currentOrg?.id) {
          setLoading(false);
        }
      }
    },
    [currentOrg?.id]
  );

  // Organization switch watcher: resets state, dismisses modals, clears stale data
  useEffect(() => {
    if (prevOrgIdRef.current !== currentOrg?.id) {
      prevOrgIdRef.current = currentOrg?.id;

      // Close all active modals and dialogs
      setInviteModalOpen(false);
      setDeactivateTarget(null);
      setActivateTarget(null);
      setCancelInviteTarget(null);
      setCreatedInviteToken(null);
      setInviteEmail('');
      setCopied(false);
      setSearchInput('');
      setAppliedSearch('');
      setActiveTab('active');
      setPage(1);

      // Clear previous organization records to prevent UI leakage
      setStaffData({ orgId: currentOrg?.id || null, items: [] });
      setInvitationsData({ orgId: currentOrg?.id || null, items: [] });
    }

    if (currentOrg?.id) {
      fetchData(currentOrg.id);
    }
  }, [currentOrg?.id, fetchData]);

  // Tab change handler: resets page and search
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchInput('');
    setAppliedSearch('');
    setPage(1);
  };

  // Accessible keyboard navigation for tabs
  const handleTabKeyDown = (e, currentTabKey) => {
    const tabs = ['active', 'inactive', 'invitations'];
    const currentIndex = tabs.indexOf(currentTabKey);
    let nextIndex = null;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== null) {
      const nextTab = tabs[nextIndex];
      handleTabChange(nextTab);
      const nextBtn = document.getElementById(`tab-${nextTab}`);
      if (nextBtn) nextBtn.focus();
    }
  };

  // Filter items by applied search
  const currentTabItems = useMemo(() => {
    if (activeTab === 'active') return activeStaff;
    if (activeTab === 'inactive') return inactiveStaff;
    return pendingInvitations;
  }, [activeTab, activeStaff, inactiveStaff, pendingInvitations]);

  const filteredItems = useMemo(() => {
    if (!appliedSearch) return currentTabItems;
    const query = appliedSearch.toLowerCase();

    if (activeTab === 'invitations') {
      return currentTabItems.filter((inv) => {
        const email = (inv.email || '').toLowerCase();
        const creator = (inv.created_by_email || '').toLowerCase();
        return email.includes(query) || creator.includes(query);
      });
    }

    return currentTabItems.filter((member) => {
      const fullName = `${member.user_first_name || ''} ${member.user_last_name || ''}`.toLowerCase();
      const email = (member.user_email || '').toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }, [currentTabItems, appliedSearch, activeTab]);

  // Client-side pagination calculations
  const totalFilteredCount = filteredItems.length;
  const totalPages = calculateTotalPages(totalFilteredCount, DEFAULT_PAGE_SIZE);
  const safePage = clampPage(page, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * DEFAULT_PAGE_SIZE;
    return filteredItems.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [filteredItems, safePage]);
  const itemRange = getPageItemRange(safePage, DEFAULT_PAGE_SIZE, totalFilteredCount);

  // Search submit & clear
  const handleSearchSubmit = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
    setPage(1);
  };

  // Global escape and focus trap for active modal/dialogs
  useEffect(() => {
    const isAnyModalOpen = Boolean(
      inviteModalOpen || deactivateTarget || activateTarget || cancelInviteTarget
    );

    if (!isAnyModalOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (mutationInProgressRef.current) return;
        if (inviteModalOpen) {
          setInviteModalOpen(false);
          setCreatedInviteToken(null);
          setInviteEmail('');
          setCopied(false);
          if (lastFocusedElementRef.current?.focus) {
            lastFocusedElementRef.current.focus();
          }
        }
        if (deactivateTarget) {
          setDeactivateTarget(null);
          if (lastFocusedElementRef.current?.focus) {
            lastFocusedElementRef.current.focus();
          }
        }
        if (activateTarget) {
          setActivateTarget(null);
          if (lastFocusedElementRef.current?.focus) {
            lastFocusedElementRef.current.focus();
          }
        }
        if (cancelInviteTarget) {
          setCancelInviteTarget(null);
          if (lastFocusedElementRef.current?.focus) {
            lastFocusedElementRef.current.focus();
          }
        }
        return;
      }

      if (e.key === 'Tab') {
        const activeModal = document.querySelector('.manager-staff__modal, .manager-staff__dialog');
        if (!activeModal) return;

        const focusable = activeModal.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [inviteModalOpen, deactivateTarget, activateTarget, cancelInviteTarget]);

  // Focus management on dialog opening
  useEffect(() => {
    if (inviteModalOpen) {
      if (createdInviteToken) {
        inviteCloseBtnRef.current?.focus();
      } else {
        inviteEmailInputRef.current?.focus();
      }
    }
  }, [inviteModalOpen, createdInviteToken]);

  useEffect(() => {
    if (deactivateTarget) {
      deactivateCancelBtnRef.current?.focus();
    }
  }, [deactivateTarget]);

  useEffect(() => {
    if (activateTarget) {
      activateCancelBtnRef.current?.focus();
    }
  }, [activateTarget]);

  useEffect(() => {
    if (cancelInviteTarget) {
      cancelInviteCancelBtnRef.current?.focus();
    }
  }, [cancelInviteTarget]);

  // ==========================================
  // MUTATION WORKFLOWS
  // ==========================================

  // 1. Create Staff Invitation
  const handleOpenInviteModal = () => {
    lastFocusedElementRef.current = document.activeElement;
    setInviteModalOpen(true);
    setCreatedInviteToken(null);
    setInviteEmail('');
    setCopied(false);
  };

  const handleCloseInviteModal = () => {
    if (inviting) return;
    setInviteModalOpen(false);
    setCreatedInviteToken(null);
    setInviteEmail('');
    setCopied(false);
    if (lastFocusedElementRef.current?.focus) {
      lastFocusedElementRef.current.focus();
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !currentOrg?.id) return;
    if (mutationInProgressRef.current) return;

    mutationInProgressRef.current = true;
    setInviting(true);
    const orgIdAtMutation = currentOrg.id;
    const targetEmail = inviteEmail.trim();

    try {
      const res = await organizationService.createStaffInvitation(orgIdAtMutation, {
        email: targetEmail,
      });

      if (currentOrg?.id !== orgIdAtMutation) return;

      setCreatedInviteToken(res.token);
      showSuccess(`Staff invitation created for ${targetEmail}`);
      fetchData(orgIdAtMutation);
    } catch (err) {
      if (currentOrg?.id !== orgIdAtMutation) return;
      const msg =
        err.response?.data?.message ||
        err.response?.data?.email?.[0] ||
        err.response?.data?.detail ||
        'Failed to create staff invitation.';
      showError(msg);
    } finally {
      mutationInProgressRef.current = false;
      setInviting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdInviteToken) return;
    const inviteUrl = `${window.location.origin}/invitations/staff/${createdInviteToken}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is unavailable
    }
  };

  // 2. Deactivate Staff Member
  const handleOpenDeactivateDialog = (member) => {
    lastFocusedElementRef.current = document.activeElement;
    setDeactivateTarget(member);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget || !currentOrg?.id) return;
    if (mutationInProgressRef.current) return;

    mutationInProgressRef.current = true;
    setIsDeactivating(true);
    const orgIdAtMutation = currentOrg.id;
    const membershipId = deactivateTarget.id;
    const targetEmail = deactivateTarget.user_email;

    try {
      await organizationService.deactivateStaffMember(orgIdAtMutation, membershipId);

      if (currentOrg?.id !== orgIdAtMutation) return;

      setDeactivateTarget(null);
      showSuccess(`Deactivated staff member ${targetEmail}.`);
      fetchData(orgIdAtMutation);
    } catch (err) {
      if (currentOrg?.id !== orgIdAtMutation) return;
      const msg = err.response?.data?.detail || 'Failed to deactivate staff member.';
      showError(msg);
    } finally {
      mutationInProgressRef.current = false;
      setIsDeactivating(false);
      if (lastFocusedElementRef.current?.focus) {
        lastFocusedElementRef.current.focus();
      }
    }
  };

  // 3. Re-Activate Staff Member
  const handleOpenActivateDialog = (member) => {
    lastFocusedElementRef.current = document.activeElement;
    setActivateTarget(member);
  };

  const handleConfirmActivate = async () => {
    if (!activateTarget || !currentOrg?.id) return;
    if (mutationInProgressRef.current) return;

    mutationInProgressRef.current = true;
    setIsActivating(true);
    const orgIdAtMutation = currentOrg.id;
    const membershipId = activateTarget.id;
    const targetEmail = activateTarget.user_email;

    try {
      await organizationService.activateStaffMember(orgIdAtMutation, membershipId);

      if (currentOrg?.id !== orgIdAtMutation) return;

      setActivateTarget(null);
      showSuccess(`Activated staff member ${targetEmail}.`);
      fetchData(orgIdAtMutation);
    } catch (err) {
      if (currentOrg?.id !== orgIdAtMutation) return;
      const msg = err.response?.data?.detail || 'Failed to activate staff member.';
      showError(msg);
    } finally {
      mutationInProgressRef.current = false;
      setIsActivating(false);
      if (lastFocusedElementRef.current?.focus) {
        lastFocusedElementRef.current.focus();
      }
    }
  };

  // 4. Cancel Staff Invitation
  const handleOpenCancelInviteDialog = (invitation) => {
    lastFocusedElementRef.current = document.activeElement;
    setCancelInviteTarget(invitation);
  };

  const handleConfirmCancelInvite = async () => {
    if (!cancelInviteTarget || !currentOrg?.id) return;
    if (mutationInProgressRef.current) return;

    mutationInProgressRef.current = true;
    setIsCancelling(true);
    const orgIdAtMutation = currentOrg.id;
    const invitationId = cancelInviteTarget.id;
    const targetEmail = cancelInviteTarget.email;

    try {
      await organizationService.cancelStaffInvitation(orgIdAtMutation, invitationId);

      if (currentOrg?.id !== orgIdAtMutation) return;

      setCancelInviteTarget(null);
      showSuccess(`Staff invitation cancelled for ${targetEmail}.`);
      fetchData(orgIdAtMutation);
    } catch (err) {
      if (currentOrg?.id !== orgIdAtMutation) return;
      const msg = err.response?.data?.detail || 'Failed to cancel staff invitation.';
      showError(msg);
    } finally {
      mutationInProgressRef.current = false;
      setIsCancelling(false);
      if (lastFocusedElementRef.current?.focus) {
        lastFocusedElementRef.current.focus();
      }
    }
  };

  // Loading presentation for fresh organization fetch
  if (loading && rawStaff.length === 0 && rawInvitations.length === 0 && !error) {
    return <LoadingState message="Loading staff and team management..." />;
  }

  const isMutatingAny = isDeactivating || isActivating || isCancelling;

  return (
    <div className="manager-staff app-container animate-page-entrance">
      {/* Header */}
      <header className="manager-staff__header">
        <div className="manager-staff__header-info">
          <div className="manager-staff__eyebrow">
            <span aria-hidden="true">🛡️</span> Access Control & Operations
          </div>
          <div className="manager-staff__title-row">
            <h1 className="manager-staff__title">Staff & Team Management</h1>
            <span className="manager-staff__role-badge">MANAGER CONSOLE</span>
          </div>
          <p className="manager-staff__subtitle">
            Manage operational team memberships, invite new staff, and control queue authorizations for{' '}
            <span className="manager-staff__subtitle-org">{currentOrg?.name || 'Organization'}</span>.
          </p>
        </div>

        <div className="manager-staff__controls">
          <button
            type="button"
            className="manager-staff__btn-refresh"
            onClick={() => fetchData()}
            disabled={loading || isMutatingAny}
            aria-label="Refresh staff and invitations data"
          >
            <span aria-hidden="true">{loading ? '⏳' : '🔄'}</span>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            className="manager-staff__btn-invite"
            onClick={handleOpenInviteModal}
            disabled={isMutatingAny}
          >
            <span aria-hidden="true">➕</span>
            <span>Invite Staff Member</span>
          </button>
        </div>
      </header>

      {/* Honest Error Banner */}
      {error && (
        <div className="manager-staff__error-banner" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="manager-staff__error-retry"
            onClick={() => fetchData()}
          >
            Retry Fetch
          </button>
        </div>
      )}

      {/* Accessible Tabs Bar */}
      <div
        role="tablist"
        aria-label="Staff management navigation tabs"
        className="manager-staff__tablist"
      >
        <button
          type="button"
          role="tab"
          id="tab-active"
          aria-selected={activeTab === 'active'}
          aria-controls="panel-active"
          tabIndex={activeTab === 'active' ? 0 : -1}
          className="manager-staff__tab"
          onClick={() => handleTabChange('active')}
          onKeyDown={(e) => handleTabKeyDown(e, 'active')}
        >
          <span>Active Staff</span>
          <span className="manager-staff__tab-badge">{activeStaff.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-inactive"
          aria-selected={activeTab === 'inactive'}
          aria-controls="panel-inactive"
          tabIndex={activeTab === 'inactive' ? 0 : -1}
          className="manager-staff__tab"
          onClick={() => handleTabChange('inactive')}
          onKeyDown={(e) => handleTabKeyDown(e, 'inactive')}
        >
          <span>Inactive Staff</span>
          <span className="manager-staff__tab-badge">{inactiveStaff.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-invitations"
          aria-selected={activeTab === 'invitations'}
          aria-controls="panel-invitations"
          tabIndex={activeTab === 'invitations' ? 0 : -1}
          className="manager-staff__tab"
          onClick={() => handleTabChange('invitations')}
          onKeyDown={(e) => handleTabKeyDown(e, 'invitations')}
        >
          <span>Pending Invitations</span>
          <span className="manager-staff__tab-badge">{pendingInvitations.length}</span>
        </button>
      </div>

      {/* Tab Panel: Active Staff */}
      {activeTab === 'active' && (
        <div
          role="tabpanel"
          id="panel-active"
          aria-labelledby="tab-active"
          className="manager-staff__tabpanel"
        >
          {activeStaff.length > 0 && (
            <div className="manager-staff__toolbar">
              <SearchFilterBar
                searchValue={searchInput}
                onSearchChange={(val) => setSearchInput(val)}
                onSearchSubmit={handleSearchSubmit}
                searchPlaceholder="Search staff by name or email..."
                searchLabel="Search active staff members"
                isFiltered={Boolean(appliedSearch)}
                onClear={handleClearSearch}
                isLoading={loading}
              />
              {appliedSearch && (
                <div className="manager-staff__search-feedback">
                  <span>
                    Showing results for <strong>&ldquo;{appliedSearch}&rdquo;</strong> ({totalFilteredCount} found)
                  </span>
                  <button
                    type="button"
                    className="manager-staff__clear-search-link"
                    onClick={handleClearSearch}
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          )}

          {activeStaff.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No Active Staff Members"
              message="You haven't added any active staff members yet. Send an email invitation to authorize a team member."
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No Matching Active Staff"
              message={`No active staff members match "${appliedSearch}". Clear your search query to see all records.`}
            />
          ) : (
            <>
              <div className="manager-staff__table-card">
                <ResponsiveTable
                  caption="Active staff members in the current organization"
                  columns={STAFF_COLUMNS}
                >
                  {paginatedItems.map((member) => {
                    const fullName = `${member.user_first_name || ''} ${member.user_last_name || ''}`.trim();
                    const displayName = fullName || 'Staff Member';

                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="manager-staff__member-name">{displayName}</div>
                        </td>
                        <td>
                          <div className="manager-staff__member-email">{member.user_email}</div>
                        </td>
                        <td>
                          <span className="manager-staff__role-tag">STAFF</span>
                        </td>
                        <td>
                          <StatusBadge status="ACTIVE" />
                        </td>
                        <td>
                          <div className="manager-staff__actions">
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm manager-staff__action-btn"
                              onClick={() => handleOpenDeactivateDialog(member)}
                              disabled={isMutatingAny}
                              aria-label={`Deactivate operational access for ${displayName}`}
                            >
                              Deactivate
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </ResponsiveTable>
              </div>

              {totalPages > 1 && (
                <div className="manager-staff__pagination">
                  <Pagination
                    currentPage={safePage}
                    totalPages={totalPages}
                    totalCount={totalFilteredCount}
                    itemRange={itemRange}
                    onPageChange={(p) => setPage(p)}
                    ariaLabel="Active staff pagination"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab Panel: Inactive Staff */}
      {activeTab === 'inactive' && (
        <div
          role="tabpanel"
          id="panel-inactive"
          aria-labelledby="tab-inactive"
          className="manager-staff__tabpanel"
        >
          {inactiveStaff.length > 0 && (
            <div className="manager-staff__toolbar">
              <SearchFilterBar
                searchValue={searchInput}
                onSearchChange={(val) => setSearchInput(val)}
                onSearchSubmit={handleSearchSubmit}
                searchPlaceholder="Search inactive staff by name or email..."
                searchLabel="Search inactive staff members"
                isFiltered={Boolean(appliedSearch)}
                onClear={handleClearSearch}
                isLoading={loading}
              />
              {appliedSearch && (
                <div className="manager-staff__search-feedback">
                  <span>
                    Showing results for <strong>&ldquo;{appliedSearch}&rdquo;</strong> ({totalFilteredCount} found)
                  </span>
                  <button
                    type="button"
                    className="manager-staff__clear-search-link"
                    onClick={handleClearSearch}
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          )}

          {inactiveStaff.length === 0 ? (
            <EmptyState
              icon="🔒"
              title="No Inactive Staff Members"
              message="All registered staff members in this organization are currently active."
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No Matching Inactive Staff"
              message={`No inactive staff members match "${appliedSearch}". Clear your search query to see all records.`}
            />
          ) : (
            <>
              <div className="manager-staff__table-card">
                <ResponsiveTable
                  caption="Inactive staff members in the current organization"
                  columns={STAFF_COLUMNS}
                >
                  {paginatedItems.map((member) => {
                    const fullName = `${member.user_first_name || ''} ${member.user_last_name || ''}`.trim();
                    const displayName = fullName || 'Staff Member';

                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="manager-staff__member-name manager-staff__member-name--inactive">
                            {displayName}
                          </div>
                        </td>
                        <td>
                          <div className="manager-staff__member-email">{member.user_email}</div>
                        </td>
                        <td>
                          <span className="manager-staff__role-tag manager-staff__role-tag--inactive">STAFF</span>
                        </td>
                        <td>
                          <StatusBadge status="INACTIVE" />
                        </td>
                        <td>
                          <div className="manager-staff__actions">
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm manager-staff__action-btn"
                              onClick={() => handleOpenActivateDialog(member)}
                              disabled={isMutatingAny}
                              aria-label={`Re-activate operational access for ${displayName}`}
                            >
                              Re-Activate
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </ResponsiveTable>
              </div>

              {totalPages > 1 && (
                <div className="manager-staff__pagination">
                  <Pagination
                    currentPage={safePage}
                    totalPages={totalPages}
                    totalCount={totalFilteredCount}
                    itemRange={itemRange}
                    onPageChange={(p) => setPage(p)}
                    ariaLabel="Inactive staff pagination"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab Panel: Pending Invitations */}
      {activeTab === 'invitations' && (
        <div
          role="tabpanel"
          id="panel-invitations"
          aria-labelledby="tab-invitations"
          className="manager-staff__tabpanel"
        >
          {pendingInvitations.length > 0 && (
            <div className="manager-staff__toolbar">
              <SearchFilterBar
                searchValue={searchInput}
                onSearchChange={(val) => setSearchInput(val)}
                onSearchSubmit={handleSearchSubmit}
                searchPlaceholder="Search invitations by email..."
                searchLabel="Search pending staff invitations"
                isFiltered={Boolean(appliedSearch)}
                onClear={handleClearSearch}
                isLoading={loading}
              />
              {appliedSearch && (
                <div className="manager-staff__search-feedback">
                  <span>
                    Showing results for <strong>&ldquo;{appliedSearch}&rdquo;</strong> ({totalFilteredCount} found)
                  </span>
                  <button
                    type="button"
                    className="manager-staff__clear-search-link"
                    onClick={handleClearSearch}
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          )}

          {pendingInvitations.length === 0 ? (
            <EmptyState
              icon="📨"
              title="No Pending Staff Invitations"
              message="There are currently no active staff invitation links waiting for acceptance."
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No Matching Invitations"
              message={`No pending invitations match "${appliedSearch}". Clear your search query to see all records.`}
            />
          ) : (
            <>
              <div className="manager-staff__table-card">
                <ResponsiveTable
                  caption="Pending staff invitations for the current organization"
                  columns={INVITATION_COLUMNS}
                >
                  {paginatedItems.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <div className="manager-staff__member-name">{inv.email}</div>
                      </td>
                      <td>
                        <span className="manager-staff__role-tag">{inv.role || 'STAFF'}</span>
                      </td>
                      <td>
                        <span className="manager-staff__date-text">
                          {formatDhakaDateTime(inv.created_at)}
                        </span>
                      </td>
                      <td>
                        <span className="manager-staff__date-text">
                          {formatDhakaDateTime(inv.expires_at)}
                        </span>
                      </td>
                      <td>
                        <div className="manager-staff__actions">
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm manager-staff__action-btn"
                            onClick={() => handleOpenCancelInviteDialog(inv)}
                            disabled={isMutatingAny}
                            aria-label={`Cancel invitation for ${inv.email}`}
                          >
                            Cancel Invite
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </ResponsiveTable>
              </div>

              {totalPages > 1 && (
                <div className="manager-staff__pagination">
                  <Pagination
                    currentPage={safePage}
                    totalPages={totalPages}
                    totalCount={totalFilteredCount}
                    itemRange={itemRange}
                    onPageChange={(p) => setPage(p)}
                    ariaLabel="Pending invitations pagination"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ======================================================================
          Invite Staff Modal
          ====================================================================== */}
      {inviteModalOpen && (
        <div
          className="manager-staff__modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !inviting) {
              handleCloseInviteModal();
            }
          }}
        >
          <div
            className="manager-staff__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-modal-title"
            aria-describedby="invite-modal-desc"
          >
            <div className="manager-staff__modal-header">
              <div>
                <h2 id="invite-modal-title" className="manager-staff__modal-title">
                  Invite Staff Member
                </h2>
                <p id="invite-modal-desc" className="manager-staff__modal-desc">
                  Generate an invitation link for a new staff member to join{' '}
                  <strong>{currentOrg?.name || 'this organization'}</strong>.
                </p>
              </div>
              <button
                type="button"
                className="manager-staff__modal-close-btn"
                onClick={handleCloseInviteModal}
                disabled={inviting}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {createdInviteToken ? (
              <div className="manager-staff__invite-success">
                <div className="manager-staff__invite-success-title">
                  <span aria-hidden="true">✓</span> Invitation Link Generated!
                </div>
                <p className="manager-staff__invite-success-desc">
                  Share this secure link with the invited staff member. They will set up their name and password to join:
                </p>

                <div className="manager-staff__link-display">
                  <input
                    type="text"
                    readOnly
                    className="manager-staff__link-input"
                    value={`${window.location.origin}/invitations/staff/${createdInviteToken}`}
                    aria-label="Staff invitation link"
                  />
                  <button
                    type="button"
                    className="manager-staff__btn-copy"
                    onClick={handleCopyLink}
                  >
                    <span>{copied ? '✓ Copied' : '📋 Copy Link'}</span>
                  </button>
                </div>

                {copied && (
                  <div className="manager-staff__copy-feedback" role="status">
                    <span>✓ Link copied to clipboard</span>
                  </div>
                )}

                <div className="manager-staff__modal-actions">
                  <button
                    ref={inviteCloseBtnRef}
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCloseInviteModal}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite}>
                <div className="manager-staff__form-group">
                  <label htmlFor="staff-invite-email" className="manager-staff__form-label">
                    Colleague&apos;s Email Address *
                  </label>
                  <input
                    ref={inviteEmailInputRef}
                    id="staff-invite-email"
                    type="email"
                    className="form-control"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    disabled={inviting}
                    autoComplete="off"
                  />
                  <div className="manager-staff__form-hint">
                    An organization invitation link will be created for the STAFF role.
                  </div>
                </div>

                <div className="manager-staff__modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCloseInviteModal}
                    disabled={inviting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={inviting || !inviteEmail.trim()}
                  >
                    {inviting ? 'Generating Invitation...' : 'Send Staff Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ======================================================================
          Deactivate Staff Confirmation Dialog
          ====================================================================== */}
      {deactivateTarget && (
        <div
          className="manager-staff__dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeactivating) {
              setDeactivateTarget(null);
            }
          }}
        >
          <div
            className="manager-staff__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="deactivate-dialog-title"
            aria-describedby="deactivate-dialog-desc"
          >
            <div className="manager-staff__dialog-header">
              <div>
                <h2 id="deactivate-dialog-title" className="manager-staff__dialog-title">
                  Deactivate Staff Access
                </h2>
                <p id="deactivate-dialog-desc" className="manager-staff__dialog-desc">
                  Are you sure you want to deactivate operational access for this team member?
                </p>
              </div>
            </div>

            <div className="manager-staff__dialog-highlight">
              <div className="manager-staff__dialog-highlight-row">
                <span className="manager-staff__dialog-highlight-label">Staff Member:</span>
                <span className="manager-staff__dialog-highlight-value">
                  {`${deactivateTarget.user_first_name || ''} ${deactivateTarget.user_last_name || ''}`.trim() || 'Staff Member'}
                </span>
              </div>
              <div className="manager-staff__dialog-highlight-row">
                <span className="manager-staff__dialog-highlight-label">Email:</span>
                <span className="manager-staff__dialog-highlight-value">
                  {deactivateTarget.user_email}
                </span>
              </div>
              <div className="manager-staff__dialog-highlight-row">
                <span className="manager-staff__dialog-highlight-label">Impact:</span>
                <span className="manager-staff__dialog-highlight-value">
                  Immediate loss of operational queue access
                </span>
              </div>
            </div>

            <div className="manager-staff__dialog-actions">
              <button
                ref={deactivateCancelBtnRef}
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeactivateTarget(null)}
                disabled={isDeactivating}
              >
                Keep Active
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDeactivate}
                disabled={isDeactivating}
              >
                {isDeactivating ? 'Deactivating...' : 'Confirm Deactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          Re-Activate Staff Confirmation Dialog
          ====================================================================== */}
      {activateTarget && (
        <div
          className="manager-staff__dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isActivating) {
              setActivateTarget(null);
            }
          }}
        >
          <div
            className="manager-staff__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="activate-dialog-title"
            aria-describedby="activate-dialog-desc"
          >
            <div className="manager-staff__dialog-header">
              <div>
                <h2 id="activate-dialog-title" className="manager-staff__dialog-title">
                  Re-Activate Staff Access
                </h2>
                <p id="activate-dialog-desc" className="manager-staff__dialog-desc">
                  Restore operational queue privileges for this staff member in{' '}
                  <strong>{currentOrg?.name || 'this organization'}</strong>.
                </p>
              </div>
            </div>

            <div className="manager-staff__dialog-highlight">
              <div className="manager-staff__dialog-highlight-row">
                <span className="manager-staff__dialog-highlight-label">Staff Member:</span>
                <span className="manager-staff__dialog-highlight-value">
                  {`${activateTarget.user_first_name || ''} ${activateTarget.user_last_name || ''}`.trim() || 'Staff Member'}
                </span>
              </div>
              <div className="manager-staff__dialog-highlight-row">
                <span className="manager-staff__dialog-highlight-label">Email:</span>
                <span className="manager-staff__dialog-highlight-value">
                  {activateTarget.user_email}
                </span>
              </div>
            </div>

            <div className="manager-staff__dialog-actions">
              <button
                ref={activateCancelBtnRef}
                type="button"
                className="btn btn-secondary"
                onClick={() => setActivateTarget(null)}
                disabled={isActivating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmActivate}
                disabled={isActivating}
              >
                {isActivating ? 'Activating...' : 'Restore Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          Cancel Staff Invitation Confirmation Dialog
          ====================================================================== */}
      {cancelInviteTarget && (
        <div
          className="manager-staff__dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isCancelling) {
              setCancelInviteTarget(null);
            }
          }}
        >
          <div
            className="manager-staff__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-invite-dialog-title"
            aria-describedby="cancel-invite-dialog-desc"
          >
            <div className="manager-staff__dialog-header">
              <div>
                <h2 id="cancel-invite-dialog-title" className="manager-staff__dialog-title">
                  Cancel Staff Invitation
                </h2>
                <p id="cancel-invite-dialog-desc" className="manager-staff__dialog-desc">
                  Are you sure you want to revoke this pending staff invitation? The invitation link will immediately become invalid.
                </p>
              </div>
            </div>

            <div className="manager-staff__dialog-highlight">
              <div className="manager-staff__dialog-highlight-row">
                <span className="manager-staff__dialog-highlight-label">Recipient:</span>
                <span className="manager-staff__dialog-highlight-value">
                  {cancelInviteTarget.email}
                </span>
              </div>
              <div className="manager-staff__dialog-highlight-row">
                <span className="manager-staff__dialog-highlight-label">Role:</span>
                <span className="manager-staff__dialog-highlight-value">
                  {cancelInviteTarget.role || 'STAFF'}
                </span>
              </div>
              <div className="manager-staff__dialog-highlight-row">
                <span className="manager-staff__dialog-highlight-label">Sent Date:</span>
                <span className="manager-staff__dialog-highlight-value">
                  {formatDhakaDateTime(cancelInviteTarget.created_at)}
                </span>
              </div>
            </div>

            <div className="manager-staff__dialog-actions">
              <button
                ref={cancelInviteCancelBtnRef}
                type="button"
                className="btn btn-secondary"
                onClick={() => setCancelInviteTarget(null)}
                disabled={isCancelling}
              >
                Keep Invitation
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmCancelInvite}
                disabled={isCancelling}
              >
                {isCancelling ? 'Revoking...' : 'Revoke Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerStaffPage;
