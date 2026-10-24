import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import managerService from '../../services/managerService';
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
import '../../styles/ManagerMembers.css';

/**
 * Table column definitions for membership directory.
 */
const MEMBERS_COLUMNS = [
  { key: 'name', label: 'Member Name', width: '28%' },
  { key: 'email', label: 'Email & Contact', width: '28%' },
  { key: 'role', label: 'Role', width: '14%' },
  { key: 'status', label: 'Status', width: '14%' },
  { key: 'actions', label: 'Actions', width: '16%', align: 'right' },
];

/**
 * Filter dropdown options.
 */
const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'PROVIDER', label: 'Provider' },
  { value: 'STAFF', label: 'Staff' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export function ManagerMembersPage() {
  const navigate = useNavigate();
  const { currentOrg, refreshTenant } = useTenant();
  const { user: authUser } = useAuth();
  const { showSuccess, showError } = useToast();

  // Search, Filters & Pagination State
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Tenant-scoped datasets
  const [membersData, setMembersData] = useState({
    orgId: null,
    items: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Confirmation Dialog States
  // 1. Role Change Dialog
  const [roleChangeTarget, setRoleChangeTarget] = useState(null);
  const [proposedRole, setProposedRole] = useState('');
  const [isChangingRole, setIsChangingRole] = useState(false);

  // 2. Status Toggle Dialog (Activate / Deactivate)
  const [statusToggleTarget, setStatusToggleTarget] = useState(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Request & Mutation Safety Refs
  const activeOrgIdRef = useRef(currentOrg?.id);
  activeOrgIdRef.current = currentOrg?.id;
  const orgContextGenRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);
  const mutationInProgressRef = useRef(false);
  const lastFocusedElementRef = useRef(null);

  // Input refs for dialog focus management
  const roleCancelBtnRef = useRef(null);
  const statusCancelBtnRef = useRef(null);

  // Render-time tenant ownership guard
  const rawMembers = useMemo(
    () => (membersData.orgId === currentOrg?.id ? membersData.items : []),
    [membersData, currentOrg?.id]
  );

  /**
   * Primary asynchronous fetch function with request-ticket and context-generation isolation.
   */
  const fetchMembers = useCallback(
    async (targetOrgId) => {
      const orgIdToFetch = targetOrgId || currentOrg?.id;
      if (!orgIdToFetch) return;

      const requestId = ++activeRequestIdRef.current;
      const requestGen = orgContextGenRef.current;
      setLoading(true);
      setError(null);

      try {
        const data = await managerService.getMembers(orgIdToFetch);

        // Discard response if organization switched, context generation changed, or newer query started
        if (
          requestId !== activeRequestIdRef.current ||
          requestGen !== orgContextGenRef.current ||
          orgIdToFetch !== activeOrgIdRef.current
        ) {
          return;
        }

        const items = Array.isArray(data) ? data : data?.results || [];
        setMembersData({
          orgId: orgIdToFetch,
          items,
        });
      } catch (err) {
        if (
          requestId !== activeRequestIdRef.current ||
          requestGen !== orgContextGenRef.current ||
          orgIdToFetch !== activeOrgIdRef.current
        ) {
          return;
        }
        setError(err.response?.data?.detail || 'Failed to load organization members.');
      } finally {
        if (
          requestId === activeRequestIdRef.current &&
          requestGen === orgContextGenRef.current &&
          orgIdToFetch === activeOrgIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [currentOrg?.id]
  );

  // Organization switch watcher: resets state, dismisses dialogs, clears stale data, increments generation
  useEffect(() => {
    if (prevOrgIdRef.current !== currentOrg?.id) {
      prevOrgIdRef.current = currentOrg?.id;
      orgContextGenRef.current += 1;

      // Close all active confirmation dialogs
      setRoleChangeTarget(null);
      setProposedRole('');
      setStatusToggleTarget(null);
      setSearchInput('');
      setAppliedSearch('');
      setRoleFilter('');
      setStatusFilter('');
      setPage(1);

      // Clear previous organization records to prevent UI leakage
      setMembersData({ orgId: currentOrg?.id || null, items: [] });
    }

    if (currentOrg?.id) {
      fetchMembers(currentOrg.id);
    }
  }, [currentOrg?.id, fetchMembers]);

  // Directory counts derived from actual fetched data
  const counts = useMemo(() => {
    const total = rawMembers.length;
    const active = rawMembers.filter((m) => Boolean(m.is_active)).length;
    const managers = rawMembers.filter((m) => m.role === 'MANAGER' && Boolean(m.is_active)).length;
    const providers = rawMembers.filter((m) => m.role === 'PROVIDER' && Boolean(m.is_active)).length;
    const staff = rawMembers.filter((m) => m.role === 'STAFF' && Boolean(m.is_active)).length;
    return { total, active, managers, providers, staff };
  }, [rawMembers]);

  // Client-side filtering
  const filteredMembers = useMemo(() => {
    let result = rawMembers;

    // Role filter
    if (roleFilter) {
      result = result.filter((m) => m.role === roleFilter);
    }

    // Status filter
    if (statusFilter === 'ACTIVE') {
      result = result.filter((m) => Boolean(m.is_active));
    } else if (statusFilter === 'INACTIVE') {
      result = result.filter((m) => !m.is_active);
    }

    // Search query: name, email, phone
    if (appliedSearch) {
      const query = appliedSearch.toLowerCase();
      result = result.filter((m) => {
        const fullName = `${m.user?.first_name || ''} ${m.user?.last_name || ''}`.toLowerCase();
        const email = (m.user?.email || '').toLowerCase();
        const phone = (m.user?.phone_number || '').toLowerCase();
        return fullName.includes(query) || email.includes(query) || phone.includes(query);
      });
    }

    return result;
  }, [rawMembers, roleFilter, statusFilter, appliedSearch]);

  // Client-side pagination calculations
  const totalFilteredCount = filteredMembers.length;
  const totalPages = calculateTotalPages(totalFilteredCount, DEFAULT_PAGE_SIZE);
  const safePage = clampPage(page, totalPages);
  const paginatedMembers = useMemo(() => {
    const start = (safePage - 1) * DEFAULT_PAGE_SIZE;
    return filteredMembers.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [filteredMembers, safePage]);
  const itemRange = getPageItemRange(safePage, DEFAULT_PAGE_SIZE, totalFilteredCount);

  // Search submission & clearing
  const handleSearchSubmit = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const handleRoleFilterChange = (val) => {
    setRoleFilter(val);
    setPage(1);
  };

  const handleStatusFilterChange = (val) => {
    setStatusFilter(val);
    setPage(1);
  };

  // Global escape and focus trap for active confirmation dialogs
  useEffect(() => {
    const isAnyDialogOpen = Boolean(roleChangeTarget || statusToggleTarget);
    if (!isAnyDialogOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (mutationInProgressRef.current) return;
        if (roleChangeTarget) {
          setRoleChangeTarget(null);
          setProposedRole('');
          if (lastFocusedElementRef.current?.focus) {
            lastFocusedElementRef.current.focus();
          }
        }
        if (statusToggleTarget) {
          setStatusToggleTarget(null);
          if (lastFocusedElementRef.current?.focus) {
            lastFocusedElementRef.current.focus();
          }
        }
        return;
      }

      if (e.key === 'Tab') {
        const activeDialog = document.querySelector('.manager-members__dialog');
        if (!activeDialog) return;

        const focusable = activeDialog.querySelectorAll(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  }, [roleChangeTarget, statusToggleTarget]);

  // Initial focus management when dialogs open
  useEffect(() => {
    if (roleChangeTarget) {
      roleCancelBtnRef.current?.focus();
    }
  }, [roleChangeTarget]);

  useEffect(() => {
    if (statusToggleTarget) {
      statusCancelBtnRef.current?.focus();
    }
  }, [statusToggleTarget]);

  // Helper to detect if a member is the currently logged-in manager
  const isSelfMember = (member) => {
    if (!authUser || !member?.user) return false;
    return Boolean(
      (authUser.id && authUser.id === member.user.id) ||
      (authUser.email && authUser.email.toLowerCase() === member.user.email?.toLowerCase())
    );
  };

  // ==========================================
  // MUTATION WORKFLOWS
  // ==========================================

  // 1. Change Role Workflow
  const handleOpenRoleChange = (member) => {
    lastFocusedElementRef.current = document.activeElement;
    setRoleChangeTarget(member);

    // Initialize proposed role based on allowed transitions
    if (member.role === 'STAFF') {
      setProposedRole('MANAGER'); // Only STAFF -> MANAGER allowed
    } else if (member.role === 'PROVIDER') {
      setProposedRole('MANAGER'); // Only PROVIDER -> MANAGER allowed
    } else if (member.role === 'MANAGER') {
      setProposedRole('STAFF'); // Only MANAGER -> STAFF allowed
    } else {
      setProposedRole('');
    }
  };

  const handleConfirmRoleChange = async () => {
    if (!roleChangeTarget || !proposedRole || !currentOrg?.id) return;
    if (mutationInProgressRef.current) return;

    // Validate against restricted role matrix
    const currentRole = roleChangeTarget.role;
    if (currentRole === proposedRole) return;

    // Block unapproved operational transitions
    if (
      (currentRole === 'STAFF' && proposedRole === 'PROVIDER') ||
      (currentRole === 'PROVIDER' && proposedRole === 'STAFF') ||
      (currentRole === 'MANAGER' && proposedRole === 'PROVIDER')
    ) {
      showError('Direct conversion between Staff and Provider is restricted. Please use the appropriate invitation workflow.');
      return;
    }

    mutationInProgressRef.current = true;
    setIsChangingRole(true);
    const orgIdAtMutation = currentOrg.id;
    const mutationGen = orgContextGenRef.current;
    const membershipId = roleChangeTarget.id;
    const isSelf = isSelfMember(roleChangeTarget);

    try {
      await managerService.updateMember(orgIdAtMutation, membershipId, {
        role: proposedRole,
      });

      // Context safety check: discard if organization changed or re-entered
      if (
        activeOrgIdRef.current !== orgIdAtMutation ||
        orgContextGenRef.current !== mutationGen
      ) {
        return;
      }

      setRoleChangeTarget(null);
      setProposedRole('');
      showSuccess(`Member role updated to ${proposedRole}.`);
      fetchMembers(orgIdAtMutation);

      // If self-role was modified, refresh tenant context to update effective permissions
      if (isSelf && refreshTenant) {
        refreshTenant();
      }
    } catch (err) {
      if (
        activeOrgIdRef.current !== orgIdAtMutation ||
        orgContextGenRef.current !== mutationGen
      ) {
        return;
      }
      const status = err.response?.status;
      const errorCode = err.response?.data?.error?.code || err.response?.data?.code;
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        err.response?.data?.role?.[0];

      if (
        status === 409 ||
        errorCode === 'LAST_MANAGER_PROTECTION' ||
        errorMessage?.includes('manager') ||
        errorMessage?.includes('last')
      ) {
        showError('The organization must have at least one active manager. Action blocked by safety rules.');
      } else {
        showError(errorMessage || 'Failed to update member role.');
      }
    } finally {
      mutationInProgressRef.current = false;
      setIsChangingRole(false);
      if (lastFocusedElementRef.current?.focus) {
        lastFocusedElementRef.current.focus();
      }
    }
  };

  // 2. Toggle Active Status Workflow (Activate / Deactivate)
  const handleOpenStatusToggle = (member) => {
    lastFocusedElementRef.current = document.activeElement;
    setStatusToggleTarget(member);
  };

  const handleConfirmStatusToggle = async () => {
    if (!statusToggleTarget || !currentOrg?.id) return;
    if (mutationInProgressRef.current) return;

    mutationInProgressRef.current = true;
    setIsTogglingStatus(true);
    const orgIdAtMutation = currentOrg.id;
    const mutationGen = orgContextGenRef.current;
    const membershipId = statusToggleTarget.id;
    const currentActive = statusToggleTarget.is_active !== false;
    const nextActive = !currentActive;
    const isSelf = isSelfMember(statusToggleTarget);

    try {
      await managerService.updateMember(orgIdAtMutation, membershipId, {
        is_active: nextActive,
      });

      // Context safety check: discard if organization changed or re-entered
      if (
        activeOrgIdRef.current !== orgIdAtMutation ||
        orgContextGenRef.current !== mutationGen
      ) {
        return;
      }

      setStatusToggleTarget(null);
      showSuccess(`Member ${nextActive ? 'activated' : 'deactivated'} successfully.`);
      fetchMembers(orgIdAtMutation);

      // If self-status was deactivated, refresh tenant context
      if (isSelf && refreshTenant) {
        refreshTenant();
      }
    } catch (err) {
      if (
        activeOrgIdRef.current !== orgIdAtMutation ||
        orgContextGenRef.current !== mutationGen
      ) {
        return;
      }
      const status = err.response?.status;
      const errorCode = err.response?.data?.error?.code || err.response?.data?.code;
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        err.response?.data?.is_active?.[0];

      if (
        status === 409 ||
        errorCode === 'LAST_MANAGER_PROTECTION' ||
        errorMessage?.includes('manager') ||
        errorMessage?.includes('last')
      ) {
        showError('The organization must have at least one active manager. Action blocked by safety rules.');
      } else {
        showError(errorMessage || 'Failed to update member status.');
      }
    } finally {
      mutationInProgressRef.current = false;
      setIsTogglingStatus(false);
      if (lastFocusedElementRef.current?.focus) {
        lastFocusedElementRef.current.focus();
      }
    }
  };

  const isMutatingAny = isChangingRole || isTogglingStatus;

  // Loading presentation for fresh organization load
  if (loading && rawMembers.length === 0 && !error) {
    return <LoadingState message="Loading organization members and role grants..." />;
  }

  return (
    <div className="manager-members app-container animate-page-entrance">
      {/* Header */}
      <header className="manager-members__header">
        <div className="manager-members__header-info">
          <div className="manager-members__eyebrow">
            <span aria-hidden="true">👥</span> Team Access & Roles
          </div>
          <div className="manager-members__title-row">
            <h1 className="manager-members__title">Members & Role Grants</h1>
            <span className="manager-members__role-badge">MANAGER CONSOLE</span>
          </div>
          <p className="manager-members__subtitle">
            Manage organization team memberships, assign administrative roles, and control access permissions for{' '}
            <span className="manager-members__subtitle-org">{currentOrg?.name || 'Organization'}</span>.
          </p>
        </div>

        <div className="manager-members__controls">
          <button
            type="button"
            className="manager-members__btn-refresh"
            onClick={() => fetchMembers()}
            disabled={loading || isMutatingAny}
            aria-label="Refresh member directory"
          >
            <span aria-hidden="true">{loading ? '⏳' : '🔄'}</span>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            className="manager-members__btn-nav manager-members__btn-nav--staff"
            onClick={() => navigate('/manager/staff')}
            disabled={isMutatingAny}
          >
            <span aria-hidden="true">📨</span>
            <span>Invite Staff</span>
          </button>

          <button
            type="button"
            className="manager-members__btn-nav manager-members__btn-nav--provider"
            onClick={() => navigate('/manager/providers')}
            disabled={isMutatingAny}
          >
            <span aria-hidden="true">🩺</span>
            <span>Invite Provider</span>
          </button>
        </div>
      </header>

      {/* Stats Summary Strip */}
      <div className="manager-members__stats-strip">
        <div className="manager-members__stat-chip manager-members__stat-chip--primary">
          <span>Total Members:</span>
          <strong>{counts.total}</strong>
        </div>
        <div className="manager-members__stat-chip">
          <span>Active:</span>
          <strong>{counts.active}</strong>
        </div>
        <div className="manager-members__stat-chip">
          <span>Managers:</span>
          <strong>{counts.managers}</strong>
        </div>
        <div className="manager-members__stat-chip">
          <span>Providers:</span>
          <strong>{counts.providers}</strong>
        </div>
        <div className="manager-members__stat-chip">
          <span>Staff:</span>
          <strong>{counts.staff}</strong>
        </div>
      </div>

      {/* Honest Error Banner */}
      {error && (
        <div className="manager-members__error-banner" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="manager-members__error-retry"
            onClick={() => fetchMembers()}
          >
            Retry Fetch
          </button>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      {rawMembers.length > 0 && (
        <div className="manager-members__toolbar">
          <SearchFilterBar
            searchValue={searchInput}
            onSearchChange={(val) => setSearchInput(val)}
            onSearchSubmit={handleSearchSubmit}
            searchPlaceholder="Search by name, email, or phone..."
            searchLabel="Search members"
            filters={[
              {
                id: 'member-role-filter',
                label: 'Filter by Role',
                value: roleFilter,
                onChange: handleRoleFilterChange,
                options: ROLE_FILTER_OPTIONS,
              },
              {
                id: 'member-status-filter',
                label: 'Filter by Status',
                value: statusFilter,
                onChange: handleStatusFilterChange,
                options: STATUS_FILTER_OPTIONS,
              },
            ]}
            isFiltered={Boolean(appliedSearch || roleFilter || statusFilter)}
            onClear={() => {
              setSearchInput('');
              setAppliedSearch('');
              setRoleFilter('');
              setStatusFilter('');
              setPage(1);
            }}
            isLoading={loading}
          />

          {(appliedSearch || roleFilter || statusFilter) && (
            <div className="manager-members__search-feedback">
              <span>
                Showing <strong>{totalFilteredCount}</strong> of <strong>{rawMembers.length}</strong> members
                {appliedSearch && <> matching &ldquo;{appliedSearch}&rdquo;</>}
                {roleFilter && <> with role {roleFilter}</>}
                {statusFilter && <> ({statusFilter.toLowerCase()})</>}
              </span>
              <button
                type="button"
                className="manager-members__clear-search-link"
                onClick={() => {
                  setSearchInput('');
                  setAppliedSearch('');
                  setRoleFilter('');
                  setStatusFilter('');
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Members Table / Empty States */}
      {rawMembers.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No Organization Members Found"
          message={`No registered members were found for ${currentOrg?.name || 'this organization'}. Use the Invite buttons above to onboard staff or providers.`}
        />
      ) : filteredMembers.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No Matching Members"
          message="No organization members match your current filter and search criteria. Reset your filters to see all records."
        />
      ) : (
        <>
          <div className="manager-members__table-card">
            <ResponsiveTable
              caption="Organization members and assigned role grants"
              columns={MEMBERS_COLUMNS}
            >
              {paginatedMembers.map((member) => {
                const fullName = `${member.user?.first_name || ''} ${member.user?.last_name || ''}`.trim();
                const displayName = fullName || 'Organization Member';
                const userEmail = member.user?.email || '—';
                const phone = member.user?.phone_number;
                const isSelf = isSelfMember(member);
                const isActive = member.is_active !== false;

                // Determine role badge class
                let roleTagClass = 'manager-members__role-tag--staff';
                if (member.role === 'MANAGER') {
                  roleTagClass = 'manager-members__role-tag--manager';
                } else if (member.role === 'PROVIDER') {
                  roleTagClass = 'manager-members__role-tag--provider';
                }

                return (
                  <tr key={member.id}>
                    <td>
                      <div className="manager-members__member-name">
                        <span>{displayName}</span>
                        {isSelf && <span className="manager-members__self-tag">YOU</span>}
                      </div>
                      <div className="manager-members__member-meta">
                        Membership #{member.id}
                      </div>
                    </td>
                    <td>
                      <div className="manager-members__member-email">{userEmail}</div>
                      {phone && <div className="manager-members__member-phone">{phone}</div>}
                    </td>
                    <td>
                      <span className={`manager-members__role-tag ${roleTagClass}`}>
                        {member.role}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={isActive ? 'ACTIVE' : 'INACTIVE'} />
                    </td>
                    <td>
                      <div className="manager-members__actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm manager-members__action-btn"
                          onClick={() => handleOpenRoleChange(member)}
                          disabled={isMutatingAny}
                          aria-label={`Change role for ${displayName}`}
                        >
                          Change Role
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm manager-members__action-btn ${
                            isActive ? 'btn-outline-danger' : 'btn-outline-primary'
                          }`}
                          onClick={() => handleOpenStatusToggle(member)}
                          disabled={isMutatingAny}
                          aria-label={`${isActive ? 'Deactivate' : 'Activate'} access for ${displayName}`}
                        >
                          {isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </ResponsiveTable>
          </div>

          {totalPages > 1 && (
            <div className="manager-members__pagination">
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                totalCount={totalFilteredCount}
                itemRange={itemRange}
                onPageChange={(p) => setPage(p)}
                ariaLabel="Organization members pagination"
              />
            </div>
          )}
        </>
      )}

      {/* ======================================================================
          Change Role Confirmation Dialog
          ====================================================================== */}
      {roleChangeTarget && (
        <div
          className="manager-members__dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isChangingRole) {
              setRoleChangeTarget(null);
              setProposedRole('');
            }
          }}
        >
          <div
            className="manager-members__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-dialog-title"
            aria-describedby="role-dialog-desc"
          >
            <div className="manager-members__dialog-header">
              <h2 id="role-dialog-title" className="manager-members__dialog-title">
                Change Member Role
              </h2>
              <p id="role-dialog-desc" className="manager-members__dialog-desc">
                Review and assign a new administrative or operational role for this organization member.
              </p>
            </div>

            <div className="manager-members__dialog-highlight">
              <div className="manager-members__dialog-highlight-row">
                <span className="manager-members__dialog-highlight-label">Member:</span>
                <span className="manager-members__dialog-highlight-value">
                  {`${roleChangeTarget.user?.first_name || ''} ${roleChangeTarget.user?.last_name || ''}`.trim() || 'Organization Member'}
                  {isSelfMember(roleChangeTarget) && ' (You)'}
                </span>
              </div>
              <div className="manager-members__dialog-highlight-row">
                <span className="manager-members__dialog-highlight-label">Email:</span>
                <span className="manager-members__dialog-highlight-value">
                  {roleChangeTarget.user?.email || '—'}
                </span>
              </div>
              <div className="manager-members__dialog-highlight-row">
                <span className="manager-members__dialog-highlight-label">Current Role:</span>
                <span className="manager-members__dialog-highlight-value">
                  <strong>{roleChangeTarget.role}</strong>
                </span>
              </div>
            </div>

            <div className="manager-members__form-group">
              <label htmlFor="proposed-role-select" className="manager-members__form-label">
                Select Proposed Role:
              </label>
              <select
                id="proposed-role-select"
                className="form-control"
                value={proposedRole}
                onChange={(e) => setProposedRole(e.target.value)}
                disabled={isChangingRole}
              >
                {roleChangeTarget.role === 'STAFF' && (
                  <option value="MANAGER">MANAGER (Promote to Manager)</option>
                )}
                {roleChangeTarget.role === 'PROVIDER' && (
                  <option value="MANAGER">MANAGER (Promote to Manager with Provider Warning)</option>
                )}
                {roleChangeTarget.role === 'MANAGER' && (
                  <option value="STAFF">STAFF (Demote to Staff)</option>
                )}
              </select>
            </div>

            {/* Impact Text & Warnings according to D2 matrix */}
            {roleChangeTarget.role === 'PROVIDER' && proposedRole === 'MANAGER' && (
              <div className="manager-members__dialog-warning">
                <strong>Provider Operational Impact Warning:</strong>
                Promoting this provider to MANAGER grants administrative authority over {currentOrg?.name}.
                Note: changing their primary membership role may affect active clinical scheduling and booking availability in the provider roster. Existing ProviderProfile records are not deleted.
              </div>
            )}

            {roleChangeTarget.role === 'STAFF' && proposedRole === 'MANAGER' && (
              <div className="manager-members__dialog-warning">
                <strong>Administrative Access Grant:</strong>
                Promoting this member to MANAGER will grant full administrative authority over {currentOrg?.name}, including organization settings, verification review, and member permissions.
              </div>
            )}

            {roleChangeTarget.role === 'MANAGER' && proposedRole === 'STAFF' && (
              <div className="manager-members__dialog-danger">
                <strong>Administrative Demotion & Last-Manager Rule:</strong>
                Demoting this member to STAFF will revoke all manager controls and organization configuration privileges.
                If this is the sole active manager, the action will be blocked by system safety rules.
                {isSelfMember(roleChangeTarget) && (
                  <p style={{ marginTop: '0.45rem', fontWeight: 700 }}>
                    Crucial: You are demoting your own account. You will immediately lose access to this Manager console upon confirmation.
                  </p>
                )}
              </div>
            )}

            <div className="manager-members__dialog-actions">
              <button
                ref={roleCancelBtnRef}
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setRoleChangeTarget(null);
                  setProposedRole('');
                }}
                disabled={isChangingRole}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmRoleChange}
                disabled={isChangingRole || !proposedRole || proposedRole === roleChangeTarget.role}
              >
                {isChangingRole ? 'Updating Role...' : 'Confirm Role Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          Status Toggle Confirmation Dialog (Activate / Deactivate)
          ====================================================================== */}
      {statusToggleTarget && (
        <div
          className="manager-members__dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isTogglingStatus) {
              setStatusToggleTarget(null);
            }
          }}
        >
          <div
            className="manager-members__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="status-dialog-title"
            aria-describedby="status-dialog-desc"
          >
            {statusToggleTarget.is_active !== false ? (
              // DEACTIVATE DIALOG
              <>
                <div className="manager-members__dialog-header">
                  <h2 id="status-dialog-title" className="manager-members__dialog-title">
                    Deactivate Member Access
                  </h2>
                  <p id="status-dialog-desc" className="manager-members__dialog-desc">
                    Are you sure you want to disable access for this organization member?
                  </p>
                </div>

                <div className="manager-members__dialog-highlight">
                  <div className="manager-members__dialog-highlight-row">
                    <span className="manager-members__dialog-highlight-label">Member:</span>
                    <span className="manager-members__dialog-highlight-value">
                      {`${statusToggleTarget.user?.first_name || ''} ${statusToggleTarget.user?.last_name || ''}`.trim() || 'Organization Member'}
                      {isSelfMember(statusToggleTarget) && ' (You)'}
                    </span>
                  </div>
                  <div className="manager-members__dialog-highlight-row">
                    <span className="manager-members__dialog-highlight-label">Email:</span>
                    <span className="manager-members__dialog-highlight-value">
                      {statusToggleTarget.user?.email || '—'}
                    </span>
                  </div>
                  <div className="manager-members__dialog-highlight-row">
                    <span className="manager-members__dialog-highlight-label">Current Role:</span>
                    <span className="manager-members__dialog-highlight-value">
                      <strong>{statusToggleTarget.role}</strong>
                    </span>
                  </div>
                </div>

                {statusToggleTarget.role === 'MANAGER' && (
                  <div className="manager-members__dialog-danger">
                    <strong>Last-Active-Manager Protection:</strong>
                    Deactivating this manager will immediately remove all organization access. If this is the sole active manager, the action will be blocked by system safety rules.
                    {isSelfMember(statusToggleTarget) && (
                      <p style={{ marginTop: '0.45rem', fontWeight: 700 }}>
                        Crucial: You are deactivating your own account. You will immediately lose access to this organization.
                      </p>
                    )}
                  </div>
                )}

                {statusToggleTarget.role === 'PROVIDER' && (
                  <div className="manager-members__dialog-warning">
                    <strong>Operational Notice:</strong>
                    Disabling this provider will interrupt their operational queue access. Note that existing customer appointments and schedules are not automatically deleted.
                  </div>
                )}

                {statusToggleTarget.role === 'STAFF' && (
                  <div className="manager-members__dialog-warning">
                    <strong>Staff Access Revocation:</strong>
                    This team member will immediately lose operational access to queues, rosters, and appointments until re-activated.
                  </div>
                )}

                <div className="manager-members__dialog-actions">
                  <button
                    ref={statusCancelBtnRef}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStatusToggleTarget(null)}
                    disabled={isTogglingStatus}
                  >
                    Keep Active
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleConfirmStatusToggle}
                    disabled={isTogglingStatus}
                  >
                    {isTogglingStatus ? 'Deactivating...' : 'Confirm Deactivation'}
                  </button>
                </div>
              </>
            ) : (
              // ACTIVATE DIALOG
              <>
                <div className="manager-members__dialog-header">
                  <h2 id="status-dialog-title" className="manager-members__dialog-title">
                    Activate Member Access
                  </h2>
                  <p id="status-dialog-desc" className="manager-members__dialog-desc">
                    Restore organization access for this member according to their assigned role.
                  </p>
                </div>

                <div className="manager-members__dialog-highlight">
                  <div className="manager-members__dialog-highlight-row">
                    <span className="manager-members__dialog-highlight-label">Member:</span>
                    <span className="manager-members__dialog-highlight-value">
                      {`${statusToggleTarget.user?.first_name || ''} ${statusToggleTarget.user?.last_name || ''}`.trim() || 'Organization Member'}
                    </span>
                  </div>
                  <div className="manager-members__dialog-highlight-row">
                    <span className="manager-members__dialog-highlight-label">Email:</span>
                    <span className="manager-members__dialog-highlight-value">
                      {statusToggleTarget.user?.email || '—'}
                    </span>
                  </div>
                  <div className="manager-members__dialog-highlight-row">
                    <span className="manager-members__dialog-highlight-label">Restored Role:</span>
                    <span className="manager-members__dialog-highlight-value">
                      <strong>{statusToggleTarget.role}</strong>
                    </span>
                  </div>
                </div>

                <div className="manager-members__dialog-actions">
                  <button
                    ref={statusCancelBtnRef}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStatusToggleTarget(null)}
                    disabled={isTogglingStatus}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmStatusToggle}
                    disabled={isTogglingStatus}
                  >
                    {isTogglingStatus ? 'Activating...' : 'Restore Access'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerMembersPage;
