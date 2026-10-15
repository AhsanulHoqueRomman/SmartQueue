import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import adminService from '../../services/adminService';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import '../../styles/AdminDashboard.css';

export const AdminDashboard = () => {
  const { user } = useAuth();
  const { refreshTenant } = useTenant();

  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [orgForm, setOrgForm] = useState({
    name: '',
    slug: '',
  });

  const modalRef = useRef(null);

  // Modal accessibility: Escape key, focus trapping, and focus restoration
  useEffect(() => {
    if (!modalOpen) return;

    const previousActiveElement = document.activeElement;

    const focusTimer = setTimeout(() => {
      if (modalRef.current) {
        const firstInput =
          modalRef.current.querySelector('#admin-org-name') ||
          modalRef.current.querySelector('input, button');
        firstInput?.focus?.();
      }
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setModalOpen(false);
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    };
  }, [modalOpen]);

  const fetchOrgs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.getOrganizations();
      setOrganizations(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load system organizations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setError(null);

    try {
      await adminService.createOrganization(orgForm);
      setFeedback({ type: 'success', message: 'New organization created successfully!' });
      setModalOpen(false);
      setOrgForm({ name: '', slug: '' });
      fetchOrgs();
      refreshTenant();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.name?.[0] ||
        err.response?.data?.slug?.[0] ||
        'Failed to create organization.';
      setError(msg);
    }
  };

  return (
    <div className="qt-admin-dashboard animate-page-entrance">
      {/* Admin Command Center Header */}
      <header className="qt-admin-dashboard__header">
        <div className="qt-admin-dashboard__header-info">
          <div className="qt-admin-dashboard__header-badges">
            <span className="qt-admin-dashboard__role-badge">System Admin</span>
            <span className="qt-admin-dashboard__scope-badge">Global Tenant Registry</span>
          </div>
          <h1 className="qt-admin-dashboard__title">System Admin Portal</h1>
          <p className="qt-admin-dashboard__subtitle">
            Global tenant administration & organization registry. Welcome back, {user?.first_name || user?.email}!
          </p>
        </div>
        <div className="qt-admin-dashboard__header-actions">
          <button
            type="button"
            className="btn btn-primary qt-admin-dashboard__create-btn"
            onClick={() => setModalOpen(true)}
            aria-haspopup="dialog"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Create Organization
          </button>
        </div>
      </header>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`qt-admin-dashboard__banner qt-admin-dashboard__banner--${feedback.type === 'success' ? 'success' : 'error'}`}
          role="status"
          aria-live="polite"
        >
          <div className="qt-admin-dashboard__banner-icon" aria-hidden="true">
            {feedback.type === 'success' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            )}
          </div>
          <div className="qt-admin-dashboard__banner-content">
            {feedback.message}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          className="qt-admin-dashboard__banner qt-admin-dashboard__banner--error"
          role="alert"
          aria-live="assertive"
        >
          <div className="qt-admin-dashboard__banner-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <div className="qt-admin-dashboard__banner-content">
            {error}
          </div>
        </div>
      )}

      {/* Key Administrative Metrics */}
      <section className="qt-admin-dashboard__metrics animate-section stagger-1" aria-label="System Metrics">
        <StatCard
          title="Total Organizations"
          value={organizations.length}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 21h18M3 7v14M21 7v14M6 21V10a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11" />
            </svg>
          }
          subtitle="Registered tenant instances"
          color="primary"
        />
        <StatCard
          title="Superuser Context"
          value={user?.email || 'Admin'}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
          subtitle="Global administrative privileges"
          color="info"
        />
      </section>

      {/* Organization Registry Card */}
      <section className="qt-admin-dashboard__registry-card animate-section stagger-2" aria-label="Organization Registry Section">
        <div className="qt-admin-dashboard__registry-header">
          <div className="qt-admin-dashboard__registry-title-group">
            <h2 className="qt-admin-dashboard__section-title">
              System Organization Registry
              {!loading && organizations.length > 0 && (
                <span className="qt-admin-dashboard__count-badge" aria-label={`${organizations.length} organizations registered`}>
                  {organizations.length}
                </span>
              )}
            </h2>
            <p className="qt-admin-dashboard__section-desc">
              Manage all active tenant organizations across QueueTurn.
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading system organizations..." />
        ) : organizations.length === 0 ? (
          <EmptyState
            title="No Organizations Found"
            message="No system organizations are registered in the platform yet."
            actionText="Create First Organization"
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <div
            className="qt-admin-dashboard__table-wrapper"
            role="region"
            aria-label="Organizations Registry Table"
            tabIndex={0}
          >
            <table className="qt-admin-dashboard__table">
              <thead>
                <tr>
                  <th scope="col">Organization Name</th>
                  <th scope="col">Slug</th>
                  <th scope="col">ID</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <strong className="qt-admin-dashboard__org-name">{org.name}</strong>
                    </td>
                    <td>
                      <code className="qt-admin-dashboard__org-slug">{org.slug}</code>
                    </td>
                    <td>
                      <small className="qt-admin-dashboard__org-id">{org.id}</small>
                    </td>
                    <td>
                      <StatusBadge status="ACTIVE" customLabel="Active" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal Create Organization */}
      {modalOpen && (
        <div
          className="qt-admin-dashboard__modal-backdrop"
          onClick={() => setModalOpen(false)}
          role="presentation"
        >
          <div
            ref={modalRef}
            className="qt-admin-dashboard__modal-container"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qt-admin-create-org-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qt-admin-dashboard__modal-header">
              <h2 id="qt-admin-create-org-title" className="qt-admin-dashboard__modal-title">
                Create New Organization
              </h2>
              <button
                type="button"
                className="qt-admin-dashboard__modal-close-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Close dialog"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateOrg}>
              <div className="qt-admin-dashboard__modal-body">
                <div className="qt-admin-dashboard__form-group">
                  <label htmlFor="admin-org-name" className="qt-admin-dashboard__form-label">
                    Organization Name
                  </label>
                  <input
                    id="admin-org-name"
                    type="text"
                    className="qt-admin-dashboard__form-input"
                    placeholder="e.g. City Health Clinic"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="qt-admin-dashboard__form-group">
                  <label htmlFor="admin-org-slug" className="qt-admin-dashboard__form-label">
                    Organization Slug (unique URL identifier)
                  </label>
                  <input
                    id="admin-org-slug"
                    type="text"
                    className="qt-admin-dashboard__form-input"
                    placeholder="e.g. city-health-clinic"
                    value={orgForm.slug}
                    onChange={(e) => setOrgForm({ ...orgForm, slug: e.target.value })}
                    required
                  />
                  <span className="qt-admin-dashboard__form-help">
                    Used for unique subdomain and routing identifiers. Lowercase alphanumeric with hyphens.
                  </span>
                </div>
              </div>
              <div className="qt-admin-dashboard__modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Organization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

