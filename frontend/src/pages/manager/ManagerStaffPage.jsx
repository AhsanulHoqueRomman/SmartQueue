import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  isStaleResponse,
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

const TABS = [
  { id: 'active', label: 'Active Staff' },
  { id: 'inactive', label: 'Inactive Staff' },
  { id: 'invitations', label: 'Pending Invitations' },
];

const TAB_CONFIG = {
  active: {
    placeholder: 'Search staff by name or email...',
    label: 'Search active staff members',
    emptyIcon: '👥',
    emptyTitle: 'No Active Staff Members',
    emptyMsg: "You haven't added any active staff members yet. Send an email invitation to authorize a team member.",
    noMatchTitle: 'No Matching Active Staff',
    noMatchMsg: (q) => `No active staff members match "${q}". Clear your search query to see all records.`,
  },
  inactive: {
    placeholder: 'Search inactive staff by name or email...',
    label: 'Search inactive staff members',
    emptyIcon: '🔒',
    emptyTitle: 'No Inactive Staff Members',
    emptyMsg: 'All registered staff members in this organization are currently active.',
    noMatchTitle: 'No Matching Inactive Staff',
    noMatchMsg: (q) => `No inactive staff members match "${q}". Clear your search query to see all records.`,
  },
  invitations: {
    placeholder: 'Search invitations by email...',
    label: 'Search pending staff invitations',
    emptyIcon: '📨',
    emptyTitle: 'No Pending Staff Invitations',
    emptyMsg: 'There are currently no active staff invitation links waiting for acceptance.',
    noMatchTitle: 'No Matching Invitations',
    noMatchMsg: (q) => `No pending invitations match "${q}". Clear your search query to see all records.`,
  },
};

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

  // Consolidated Confirmation Dialog State: { type: 'deactivate' | 'activate' | 'cancel_invite', target }
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Request & Mutation Safety Refs
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);
  const mutationInProgressRef = useRef(false);
  const lastFocusedElementRef = useRef(null);

  // Input refs for dialog focus management
  const inviteEmailInputRef = useRef(null);
  const inviteCloseBtnRef = useRef(null);
  const confirmCancelBtnRef = useRef(null);

  // Render-time tenant ownership checks
  const isCurrentOrg = staffData.orgId === currentOrg?.id;
  const isInvitationsCurrentOrg = invitationsData.orgId === currentOrg?.id;
  const rawStaff = isCurrentOrg ? staffData.items : [];
  const rawInvitations = isInvitationsCurrentOrg ? invitationsData.items : [];

  // Categorized records
  const activeStaff = rawStaff.filter((m) => Boolean(m.is_active));
  const inactiveStaff = rawStaff.filter((m) => !m.is_active);
  const pendingInvitations = rawInvitations.filter((inv) => Boolean(inv.is_valid));

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
        if (isStaleResponse(requestId, activeRequestIdRef.current, orgIdToFetch, currentOrg?.id)) {
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
        if (isStaleResponse(requestId, activeRequestIdRef.current, orgIdToFetch, currentOrg?.id)) {
          return;
        }
        setError(err.response?.data?.detail || 'Failed to load staff management records.');
      } finally {
        if (!isStaleResponse(requestId, activeRequestIdRef.current, orgIdToFetch, currentOrg?.id)) {
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
      activeRequestIdRef.current++;

      // Close all active modals and dialogs
      setInviteModalOpen(false);
      setConfirmDialog(null);
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
    const tabKeys = ['active', 'inactive', 'invitations'];
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

  // Current tab items
  const currentTabItems =
    activeTab === 'active'
      ? activeStaff
      : activeTab === 'inactive'
      ? inactiveStaff
      : pendingInvitations;

  // Filter items by applied search
  const query = appliedSearch.trim().toLowerCase();
  const filteredItems = query
    ? activeTab === 'invitations'
      ? currentTabItems.filter((inv) => {
          const email = (inv.email || '').toLowerCase();
          const creator = (inv.created_by_email || '').toLowerCase();
          return email.includes(query) || creator.includes(query);
        })
      : currentTabItems.filter((member) => {
          const fullName = `${member.user_first_name || ''} ${member.user_last_name || ''}`.toLowerCase();
          const email = (member.user_email || '').toLowerCase();
          return fullName.includes(query) || email.includes(query);
        })
    : currentTabItems;

  // Client-side pagination calculations
  const totalFilteredCount = filteredItems.length;
  const totalPages = calculateTotalPages(totalFilteredCount, DEFAULT_PAGE_SIZE);
  const safePage = clampPage(page, totalPages);
  const start = (safePage - 1) * DEFAULT_PAGE_SIZE;
  const paginatedItems = filteredItems.slice(start, start + DEFAULT_PAGE_SIZE);
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
    const isAnyModalOpen = Boolean(inviteModalOpen || confirmDialog);
    if (!isAnyModalOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (mutationInProgressRef.current) return;
        if (confirmDialog) {
          setConfirmDialog(null);
          if (lastFocusedElementRef.current?.focus) {
            lastFocusedElementRef.current.focus();
          }
          return;
        }
        if (inviteModalOpen) {
          setInviteModalOpen(false);
          setCreatedInviteToken(null);
          setInviteEmail('');
          setCopied(false);
          if (lastFocusedElementRef.current?.focus) {
            lastFocusedElementRef.current.focus();
          }
          return;
        }
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
  }, [inviteModalOpen, confirmDialog]);

  // Focus management on dialog opening
  useEffect(() => {
    if (confirmDialog) {
      confirmCancelBtnRef.current?.focus();
    } else if (inviteModalOpen) {
      if (createdInviteToken) {
        inviteCloseBtnRef.current?.focus();
      } else {
        inviteEmailInputRef.current?.focus();
      }
    }
  }, [confirmDialog, inviteModalOpen, createdInviteToken]);

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
    if (!inviteEmail.trim() || !currentOrg?.id || currentOrg.id !== staffData.orgId) return;
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

  // 2. Open Consolidated Confirmation Dialogs
  const handleOpenConfirmDialog = (type, target) => {
    lastFocusedElementRef.current = document.activeElement;
    setConfirmDialog({ type, target });
  };

  const handleCloseConfirmDialog = () => {
    if (confirmBusy) return;
    setConfirmDialog(null);
    if (lastFocusedElementRef.current?.focus) {
      lastFocusedElementRef.current.focus();
    }
  };

  const handleConfirmAction = async () => {
    if (
      !confirmDialog ||
      !confirmDialog.target?.id ||
      !['deactivate', 'activate', 'cancel_invite'].includes(confirmDialog.type) ||
      !currentOrg?.id ||
      currentOrg.id !== staffData.orgId
    ) {
      return;
    }
    if (mutationInProgressRef.current) return;

    mutationInProgressRef.current = true;
    setConfirmBusy(true);
    const orgIdAtMutation = currentOrg.id;
    const { type, target } = confirmDialog;

    try {
      if (type === 'deactivate') {
        await organizationService.deactivateStaffMember(orgIdAtMutation, target.id);
        if (currentOrg?.id === orgIdAtMutation) {
          showSuccess(`Deactivated staff member ${target.user_email}.`);
        }
      } else if (type === 'activate') {
        await organizationService.activateStaffMember(orgIdAtMutation, target.id);
        if (currentOrg?.id === orgIdAtMutation) {
          showSuccess(`Activated staff member ${target.user_email}.`);
        }
      } else if (type === 'cancel_invite') {
        await organizationService.cancelStaffInvitation(orgIdAtMutation, target.id);
        if (currentOrg?.id === orgIdAtMutation) {
          showSuccess(`Staff invitation cancelled for ${target.email}.`);
        }
      }

      if (currentOrg?.id === orgIdAtMutation) {
        setConfirmDialog(null);
        if (lastFocusedElementRef.current?.focus) {
          lastFocusedElementRef.current.focus();
        }
        fetchData(orgIdAtMutation);
      }
    } catch (err) {
      if (currentOrg?.id === orgIdAtMutation) {
        const fallback =
          type === 'deactivate'
            ? 'Failed to deactivate staff member.'
            : type === 'activate'
            ? 'Failed to activate staff member.'
            : 'Failed to cancel staff invitation.';
        showError(err.response?.data?.detail || fallback);
      }
    } finally {
      mutationInProgressRef.current = false;
      setConfirmBusy(false);
    }
  };

  // Loading presentation for fresh organization fetch
  const isDataLoading = loading || !isCurrentOrg;
  if (isDataLoading && rawStaff.length === 0 && rawInvitations.length === 0 && !error) {
    return <LoadingState message="Loading staff and team management..." />;
  }

  const isMutatingAny = Boolean(inviting || confirmBusy);
  const activeTabConfig = TAB_CONFIG[activeTab];

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
        {TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          const count =
            tab.id === 'active'
              ? activeStaff.length
              : tab.id === 'inactive'
              ? inactiveStaff.length
              : pendingInvitations.length;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              className="manager-staff__tab"
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
            >
              <span>{tab.label}</span>
              <span className="manager-staff__tab-badge">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Unified Tab Panel Content */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="manager-staff__tabpanel"
      >
        {currentTabItems.length > 0 && (
          <div className="manager-staff__toolbar">
            <SearchFilterBar
              searchValue={searchInput}
              onSearchChange={(val) => setSearchInput(val)}
              onSearchSubmit={handleSearchSubmit}
              searchPlaceholder={activeTabConfig.placeholder}
              searchLabel={activeTabConfig.label}
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

        {currentTabItems.length === 0 ? (
          <EmptyState
            icon={activeTabConfig.emptyIcon}
            title={activeTabConfig.emptyTitle}
            message={activeTabConfig.emptyMsg}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon="🔍"
            title={activeTabConfig.noMatchTitle}
            message={activeTabConfig.noMatchMsg(appliedSearch)}
          />
        ) : (
          <>
            <div className="manager-staff__table-card">
              {activeTab === 'invitations' ? (
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
                            onClick={() => handleOpenConfirmDialog('cancel_invite', inv)}
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
              ) : (
                <ResponsiveTable
                  caption={`${activeTab === 'active' ? 'Active' : 'Inactive'} staff members in the current organization`}
                  columns={STAFF_COLUMNS}
                >
                  {paginatedItems.map((member) => {
                    const fullName = `${member.user_first_name || ''} ${member.user_last_name || ''}`.trim();
                    const displayName = fullName || 'Staff Member';
                    const isMemberActive = activeTab === 'active';

                    return (
                      <tr key={member.id}>
                        <td>
                          <div
                            className={`manager-staff__member-name${
                              isMemberActive ? '' : ' manager-staff__member-name--inactive'
                            }`}
                          >
                            {displayName}
                          </div>
                        </td>
                        <td>
                          <div className="manager-staff__member-email">{member.user_email}</div>
                        </td>
                        <td>
                          <span
                            className={`manager-staff__role-tag${
                              isMemberActive ? '' : ' manager-staff__role-tag--inactive'
                            }`}
                          >
                            STAFF
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={isMemberActive ? 'ACTIVE' : 'INACTIVE'} />
                        </td>
                        <td>
                          <div className="manager-staff__actions">
                            {isMemberActive ? (
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm manager-staff__action-btn"
                                onClick={() => handleOpenConfirmDialog('deactivate', member)}
                                disabled={isMutatingAny}
                                aria-label={`Deactivate operational access for ${displayName}`}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm manager-staff__action-btn"
                                onClick={() => handleOpenConfirmDialog('activate', member)}
                                disabled={isMutatingAny}
                                aria-label={`Re-activate operational access for ${displayName}`}
                              >
                                Re-Activate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </ResponsiveTable>
              )}
            </div>

            {totalPages > 1 && (
              <div className="manager-staff__pagination">
                <Pagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  totalCount={totalFilteredCount}
                  itemRange={itemRange}
                  onPageChange={(p) => setPage(p)}
                  ariaLabel={`${activeTabConfig.label} pagination`}
                />
              </div>
            )}
          </>
        )}
      </div>

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
          Consolidated Confirmation Dialog (Deactivate / Activate / Cancel Invite)
          ====================================================================== */}
      {confirmDialog && (
        <div
          className="manager-staff__dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !confirmBusy) {
              handleCloseConfirmDialog();
            }
          }}
        >
          <div
            className="manager-staff__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
          >
            <div className="manager-staff__dialog-header">
              <div>
                <h2 id="confirm-dialog-title" className="manager-staff__dialog-title">
                  {confirmDialog.type === 'deactivate'
                    ? 'Deactivate Staff Access'
                    : confirmDialog.type === 'activate'
                    ? 'Re-Activate Staff Access'
                    : 'Cancel Staff Invitation'}
                </h2>
                <p id="confirm-dialog-desc" className="manager-staff__dialog-desc">
                  {confirmDialog.type === 'deactivate'
                    ? 'Are you sure you want to deactivate operational access for this team member?'
                    : confirmDialog.type === 'activate'
                    ? (
                      <>
                        Restore operational queue privileges for this staff member in{' '}
                        <strong>{currentOrg?.name || 'this organization'}</strong>.
                      </>
                    )
                    : 'Are you sure you want to revoke this pending staff invitation? The invitation link will immediately become invalid.'}
                </p>
              </div>
            </div>

            <div className="manager-staff__dialog-highlight">
              {confirmDialog.type === 'cancel_invite' ? (
                <>
                  <div className="manager-staff__dialog-highlight-row">
                    <span className="manager-staff__dialog-highlight-label">Recipient:</span>
                    <span className="manager-staff__dialog-highlight-value">
                      {confirmDialog.target.email}
                    </span>
                  </div>
                  <div className="manager-staff__dialog-highlight-row">
                    <span className="manager-staff__dialog-highlight-label">Role:</span>
                    <span className="manager-staff__dialog-highlight-value">
                      {confirmDialog.target.role || 'STAFF'}
                    </span>
                  </div>
                  <div className="manager-staff__dialog-highlight-row">
                    <span className="manager-staff__dialog-highlight-label">Sent Date:</span>
                    <span className="manager-staff__dialog-highlight-value">
                      {formatDhakaDateTime(confirmDialog.target.created_at)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="manager-staff__dialog-highlight-row">
                    <span className="manager-staff__dialog-highlight-label">Staff Member:</span>
                    <span className="manager-staff__dialog-highlight-value">
                      {`${confirmDialog.target.user_first_name || ''} ${confirmDialog.target.user_last_name || ''}`.trim() || 'Staff Member'}
                    </span>
                  </div>
                  <div className="manager-staff__dialog-highlight-row">
                    <span className="manager-staff__dialog-highlight-label">Email:</span>
                    <span className="manager-staff__dialog-highlight-value">
                      {confirmDialog.target.user_email}
                    </span>
                  </div>
                  {confirmDialog.type === 'deactivate' && (
                    <div className="manager-staff__dialog-highlight-row">
                      <span className="manager-staff__dialog-highlight-label">Impact:</span>
                      <span className="manager-staff__dialog-highlight-value">
                        Immediate loss of operational queue access
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="manager-staff__dialog-actions">
              <button
                ref={confirmCancelBtnRef}
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseConfirmDialog}
                disabled={confirmBusy}
              >
                {confirmDialog.type === 'deactivate'
                  ? 'Keep Active'
                  : confirmDialog.type === 'activate'
                  ? 'Cancel'
                  : 'Keep Invitation'}
              </button>
              <button
                type="button"
                className={`btn ${confirmDialog.type === 'activate' ? 'btn-primary' : 'btn-danger'}`}
                onClick={handleConfirmAction}
                disabled={confirmBusy}
              >
                {confirmBusy
                  ? confirmDialog.type === 'deactivate'
                    ? 'Deactivating...'
                    : confirmDialog.type === 'activate'
                    ? 'Activating...'
                    : 'Revoking...'
                  : confirmDialog.type === 'deactivate'
                  ? 'Confirm Deactivation'
                  : confirmDialog.type === 'activate'
                  ? 'Restore Access'
                  : 'Revoke Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerStaffPage;
