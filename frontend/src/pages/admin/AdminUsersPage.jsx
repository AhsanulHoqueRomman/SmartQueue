import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import adminService from '../../services/adminService';
import apiClient from '../../api/client';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import '../../styles/AdminUsers.css';

const ROLE_TABS = [
  { key: 'ALL', label: 'All Roles' },
  { key: 'MANAGER', label: 'Managers' },
  { key: 'STAFF', label: 'Staff' },
  { key: 'PROVIDER', label: 'Providers' },
];

const PAGE_SIZE = 15;
const ALL_FACILITIES_SAMPLE_LIMIT = 15;

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();

  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Partial load tracking for All-Facilities mode
  const [partialStats, setPartialStats] = useState({
    attempted: 0,
    successful: 0,
    failed: 0,
    isSampled: false,
  });

  // Filters & Search
  const [activeRole, setActiveRole] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(1);

  // Inspection Modal
  const [inspectMember, setInspectMember] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && inspectMember) {
        setInspectMember(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectMember]);

  // Load organizations on mount and default to the first facility
  useEffect(() => {
    let isMounted = true;
    async function loadOrgs() {
      try {
        const data = await adminService.getOrganizations();
        const list = Array.isArray(data) ? data : data?.results || [];
        if (isMounted) {
          setOrganizations(list);
          if (list.length > 0) {
            // Prefer an explicitly selected single facility as the default scope
            setSelectedOrgId(String(list[0].id));
          } else {
            setSelectedOrgId('ALL');
          }
        }
      } catch (err) {
        console.error('Failed to load organizations for users roster:', err);
        if (isMounted) {
          setSelectedOrgId('ALL');
        }
      }
    }
    loadOrgs();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch memberships based on selected organization
  const fetchMembers = useCallback(async () => {
    if (!selectedOrgId) return;

    setLoading(true);
    setError('');
    setPartialStats({ attempted: 0, successful: 0, failed: 0, isSampled: false });

    try {
      if (selectedOrgId === 'ALL') {
        const targetOrgs = organizations.slice(0, ALL_FACILITIES_SAMPLE_LIMIT);
        const attempted = targetOrgs.length;

        if (attempted === 0) {
          setMemberships([]);
          setLoading(false);
          return;
        }

        const results = await Promise.allSettled(
          targetOrgs.map(async (org) => {
            const res = await apiClient.get(`/organizations/${org.id}/members/`);
            const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
            return list.map((m) => ({
              ...m,
              orgName: org.name,
              orgSlug: org.slug,
              orgId: org.id,
            }));
          })
        );

        let successful = 0;
        let failed = 0;
        const merged = [];

        for (const r of results) {
          if (r.status === 'fulfilled') {
            successful += 1;
            merged.push(...r.value);
          } else {
            failed += 1;
          }
        }

        setPartialStats({
          attempted,
          successful,
          failed,
          isSampled: organizations.length > ALL_FACILITIES_SAMPLE_LIMIT,
        });
        setMemberships(merged);
      } else {
        const org = organizations.find((o) => String(o.id) === String(selectedOrgId));
        const res = await apiClient.get(`/organizations/${selectedOrgId}/members/`);
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setMemberships(
          list.map((m) => ({
            ...m,
            orgName: org?.name || 'Selected Facility',
            orgSlug: org?.slug || '',
            orgId: selectedOrgId,
          }))
        );
        setPartialStats({
          attempted: 1,
          successful: 1,
          failed: 0,
          isSampled: false,
        });
      }
    } catch (err) {
      console.error('Failed to fetch user memberships:', err);
      setError('Unable to load organization user memberships. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, organizations]);

  useEffect(() => {
    if (selectedOrgId) {
      fetchMembers();
    }
  }, [fetchMembers, selectedOrgId]);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [selectedOrgId, activeRole, searchQuery]);

  // Filtered roster
  const filteredMembers = useMemo(() => {
    return memberships.filter((m) => {
      // Role filter
      if (activeRole !== 'ALL' && m.role !== activeRole) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const u = m.user || {};
        const fullName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        const phone = (u.phone_number || '').toLowerCase();
        const orgName = (m.orgName || '').toLowerCase();
        return fullName.includes(q) || email.includes(q) || phone.includes(q) || orgName.includes(q);
      }
      return true;
    });
  }, [memberships, activeRole, searchQuery]);

  // Client-side pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredMembers.length);
  const paginatedMembers = useMemo(() => {
    return filteredMembers.slice(startIndex, endIndex);
  }, [filteredMembers, startIndex, endIndex]);

  // Selected organization object
  const currentOrg = useMemo(() => {
    if (selectedOrgId === 'ALL') return null;
    return organizations.find((o) => String(o.id) === String(selectedOrgId)) || null;
  }, [selectedOrgId, organizations]);

  // Metrics derived truthfully and labeled accurately
  const metrics = useMemo(() => {
    const total = memberships.length;
    const managers = memberships.filter((m) => m.role === 'MANAGER').length;
    const staff = memberships.filter((m) => m.role === 'STAFF').length;
    const providers = memberships.filter((m) => m.role === 'PROVIDER').length;
    return { total, managers, staff, providers };
  }, [memberships]);

  const isAllMode = selectedOrgId === 'ALL';

  return (
    <div className="admin-users animate-page-entrance">
      {/* Editorial Header */}
      <header className="admin-users__header">
        <div className="admin-users__header-main">
          <span className="admin-users__eyebrow">⚡ Platform Administration</span>
          <h1 className="admin-users__title">Platform Users & Access Governance</h1>
          <p className="admin-users__subtitle">
            Facility-scoped membership directory, role assignments, and administrative security overview.
          </p>
        </div>
      </header>

      {/* Superuser Security Overview */}
      <section className="admin-users__security-card" aria-label="Administrator Identity">
        <div className="admin-users__superuser-badge-icon" aria-hidden="true">
          👑
        </div>
        <div className="admin-users__security-info">
          <h2 className="admin-users__superuser-title">
            System Administrator: {currentUser?.email}
            <span className="admin-users__pill-superuser">Root Superuser</span>
          </h2>
          <p className="admin-users__security-note">
            The platform enforces strict tenant isolation across organizations. Organization roles
            (Managers, Staff, Providers) operate under bounded tenant scopes (<code>UserMembership</code>).
            Platform administrators govern cross-tenant integrity without mutating independent provider
            obligations or customer privacy records.
          </p>
        </div>
      </section>

      {/* Sampling or Partial Failure Banners */}
      {isAllMode && partialStats.isSampled && (
        <aside className="admin-users__notice-banner" role="note">
          <span aria-hidden="true">ℹ️</span>
          <div>
            <strong>Sampled Directory Notice:</strong> Displaying memberships loaded from the first{' '}
            <strong>{partialStats.attempted}</strong> facilities (out of {organizations.length} registered
            facilities). To view complete, unsampled records for any organization, select an explicit
            facility scope below.
          </div>
        </aside>
      )}

      {isAllMode && partialStats.failed > 0 && (
        <aside className="admin-users__partial-alert" role="alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span aria-hidden="true">⚠️</span>
            <span>
              <strong>Partial Results:</strong> {partialStats.failed} of {partialStats.attempted}{' '}
              facility request(s) failed to respond (e.g. inactive facility status or network timeout).
              Displayed membership counts reflect only successfully loaded facilities ({partialStats.successful}/
              {partialStats.attempted}).
            </span>
          </div>
          <button
            type="button"
            className="admin-users__btn-inspect"
            onClick={fetchMembers}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
          >
            Retry
          </button>
        </aside>
      )}

      {/* Metrics Row (Truthfully Scoped) */}
      <section className="admin-users__metrics-grid" aria-label="User metrics">
        <div className="admin-users__metric-card">
          <span className="admin-users__metric-label">
            {isAllMode ? 'Sampled Memberships' : 'Facility Members'}
          </span>
          <span className="admin-users__metric-val">{metrics.total}</span>
          <span className="admin-users__metric-scope">
            {isAllMode
              ? `From ${partialStats.successful} loaded facilities`
              : currentOrg?.name || 'Selected Facility'}
          </span>
        </div>
        <div className="admin-users__metric-card">
          <span className="admin-users__metric-label">
            {isAllMode ? 'Sampled Managers' : 'Facility Managers'}
          </span>
          <span className="admin-users__metric-val">{metrics.managers}</span>
          <span className="admin-users__metric-scope">
            {isAllMode ? `Sampled view` : currentOrg?.name || 'Selected Facility'}
          </span>
        </div>
        <div className="admin-users__metric-card">
          <span className="admin-users__metric-label">
            {isAllMode ? 'Sampled Staff' : 'Front-Desk Staff'}
          </span>
          <span className="admin-users__metric-val">{metrics.staff}</span>
          <span className="admin-users__metric-scope">
            {isAllMode ? `Sampled view` : currentOrg?.name || 'Selected Facility'}
          </span>
        </div>
        <div className="admin-users__metric-card">
          <span className="admin-users__metric-label">
            {isAllMode ? 'Sampled Providers' : 'Healthcare Providers'}
          </span>
          <span className="admin-users__metric-val">{metrics.providers}</span>
          <span className="admin-users__metric-scope">
            {isAllMode ? `Sampled view` : currentOrg?.name || 'Selected Facility'}
          </span>
        </div>
      </section>

      {/* Controls Card: Org Selector, Role Tabs, Search */}
      <div className="admin-users__controls-card">
        <div className="admin-users__controls-top">
          <div className="admin-users__org-select-wrap">
            <label htmlFor="admin-org-select" className="admin-users__label">
              Facility Scope:
            </label>
            <select
              id="admin-org-select"
              className="admin-users__select"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              aria-label="Filter by facility organization"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
              <option value="ALL">
                All Facilities (Sampled — Top {Math.min(ALL_FACILITIES_SAMPLE_LIMIT, organizations.length)})
              </option>
            </select>
          </div>

          <nav className="admin-users__role-tabs" role="tablist" aria-label="User role filters">
            {ROLE_TABS.map((tab) => {
              const isActive = activeRole === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`admin-users__tab ${isActive ? 'admin-users__tab--active' : ''}`}
                  onClick={() => setActiveRole(tab.key)}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="admin-users__search-row">
          <div className="admin-users__search-wrap">
            <span className="admin-users__search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="admin-users__search-input"
              placeholder="Search by user name, email, phone, or organization..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search users"
            />
          </div>

          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #78716C)', fontWeight: 600 }}>
            Showing <strong>{filteredMembers.length}</strong> matching record{filteredMembers.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <LoadingState message="Loading facility user directory..." />
      ) : error ? (
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: 'var(--color-error-bg, rgba(180, 83, 75, 0.1))',
            borderRadius: '12px',
            border: '1px solid var(--color-error-border, rgba(180, 83, 75, 0.25))',
            color: 'var(--color-error, #B4534B)',
          }}
          role="alert"
        >
          <span>⚠️ {error}</span>
          <button
            type="button"
            className="admin-users__btn-inspect"
            onClick={fetchMembers}
            style={{ marginLeft: '1rem' }}
          >
            Retry
          </button>
        </div>
      ) : filteredMembers.length === 0 ? (
        <EmptyState
          title="No Users Found"
          message={
            searchQuery
              ? `No user records match "${searchQuery}".`
              : activeRole !== 'ALL'
              ? `No user records found with role "${activeRole}".`
              : 'No organization user records found for the selected scope.'
          }
        />
      ) : (
        <div className="admin-users__table-card">
          <div className="admin-users__table-wrap">
            <table className="admin-users__table">
              <thead>
                <tr>
                  <th className="admin-users__th">User Identity</th>
                  <th className="admin-users__th">Organization / Facility</th>
                  <th className="admin-users__th">Operational Role</th>
                  <th className="admin-users__th">Status</th>
                  <th className="admin-users__th">Membership Joined</th>
                  <th className="admin-users__th admin-users__th--right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedMembers.map((m) => {
                  const u = m.user || {};
                  const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unnamed Account';
                  const roleKey = m.role || 'DEFAULT';

                  return (
                    <tr key={m.id} className="admin-users__tr">
                      <td className="admin-users__td">
                        <div className="admin-users__user-name">{fullName}</div>
                        <div className="admin-users__user-email">{u.email}</div>
                        {u.phone_number && (
                          <div className="admin-users__user-phone">📞 {u.phone_number}</div>
                        )}
                      </td>
                      <td className="admin-users__td">
                        <div style={{ fontWeight: 600 }}>{m.orgName}</div>
                        {m.orgSlug && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #78716C)', fontFamily: 'monospace' }}>
                            {m.orgSlug}
                          </div>
                        )}
                      </td>
                      <td className="admin-users__td">
                        <span className={`admin-users__role-badge admin-users__role-badge--${roleKey}`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="admin-users__td">
                        <span
                          className={`admin-users__status-chip ${
                            m.is_active
                              ? 'admin-users__status-chip--active'
                              : 'admin-users__status-chip--inactive'
                          }`}
                        >
                          {m.is_active ? '● Active' : '○ Inactive'}
                        </span>
                      </td>
                      <td className="admin-users__td" style={{ color: 'var(--color-text-muted, #78716C)' }}>
                        {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="admin-users__td admin-users__td--right">
                        <button
                          type="button"
                          className="admin-users__btn-inspect"
                          onClick={() => setInspectMember(m)}
                        >
                          👁️ Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Client-Side Table Pagination Footer */}
          {filteredMembers.length > 0 && (
            <nav className="admin-users__pagination" aria-label="Table pagination">
              <span className="admin-users__pagination-info">
                Page {safePage} of {totalPages} • Showing {startIndex + 1}–{endIndex} of {filteredMembers.length} loaded records
              </span>

              <div className="admin-users__pagination-actions">
                <button
                  type="button"
                  className="admin-users__pagination-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Go to previous page"
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="admin-users__pagination-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Go to next page"
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </div>
      )}

      {/* Member Details Modal */}
      {inspectMember && (
        <div
          className="admin-users__modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-modal-title"
          onClick={() => setInspectMember(null)}
        >
          <div className="admin-users__modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-users__modal-header">
              <div>
                <span className="admin-users__eyebrow">User Membership Governance</span>
                <h3 id="member-modal-title" className="admin-users__modal-title">
                  {[inspectMember.user?.first_name, inspectMember.user?.last_name].filter(Boolean).join(' ') || 'User Record'}
                </h3>
              </div>
              <button
                type="button"
                className="admin-users__modal-close"
                onClick={() => setInspectMember(null)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="admin-users__details-list">
              <div className="admin-users__detail-row">
                <span className="admin-users__detail-label">Email Address</span>
                <span className="admin-users__detail-val">{inspectMember.user?.email}</span>
              </div>
              <div className="admin-users__detail-row">
                <span className="admin-users__detail-label">Phone Number</span>
                <span className="admin-users__detail-val">{inspectMember.user?.phone_number || '—'}</span>
              </div>
              <div className="admin-users__detail-row">
                <span className="admin-users__detail-label">Facility Organization</span>
                <span className="admin-users__detail-val">{inspectMember.orgName}</span>
              </div>
              <div className="admin-users__detail-row">
                <span className="admin-users__detail-label">Assigned Role</span>
                <span className="admin-users__detail-val">
                  <span className={`admin-users__role-badge admin-users__role-badge--${inspectMember.role}`}>
                    {inspectMember.role}
                  </span>
                </span>
              </div>
              <div className="admin-users__detail-row">
                <span className="admin-users__detail-label">Membership Status</span>
                <span className="admin-users__detail-val">
                  {inspectMember.is_active ? 'Active Membership' : 'Inactive / Suspended'}
                </span>
              </div>
              <div className="admin-users__detail-row">
                <span className="admin-users__detail-label">Member Since</span>
                <span className="admin-users__detail-val">
                  {inspectMember.created_at ? new Date(inspectMember.created_at).toLocaleString() : '—'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--color-border, #E6E1D9)' }}>
              <button
                type="button"
                className="admin-users__btn-inspect"
                onClick={() => setInspectMember(null)}
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsersPage;
