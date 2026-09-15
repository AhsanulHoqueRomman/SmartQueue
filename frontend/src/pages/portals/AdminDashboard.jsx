import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import adminService from '../../services/adminService';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

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
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>System Admin Portal</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            Global tenant administration & organization registry. Welcome back, {user?.first_name || user?.email}!
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Organization
        </button>
      </div>

      {feedback && (
        <div
          className="banner"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            background: feedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ padding: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      <div className="grid-responsive grid-cols-2 animate-section stagger-1" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          title="Total Organizations"
          value={organizations.length}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
          subtitle="Global administrative privileges"
          color="info"
        />
      </div>

      <div className="card animate-section stagger-2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>System Organization Registry</h3>
            <p className="subtitle" style={{ margin: '4px 0 0' }}>Manage all active tenant organizations across SmartQueue.</p>
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
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Organization Name</th>
                  <th>Slug</th>
                  <th>ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <strong className="font-semibold" style={{ color: 'var(--color-text-main)' }}>{org.name}</strong>
                    </td>
                    <td><code style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{org.slug}</code></td>
                    <td><small style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{org.id}</small></td>
                    <td>
                      <StatusBadge status="ACTIVE" customLabel="Active" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Create Organization */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Organization</h3>
              <button className="modal-close-btn" onClick={() => setModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateOrg}>
              <div className="modal-body flex flex-col gap-md">
                <div className="form-group">
                  <label className="form-label">Organization Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. City Health Clinic"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Organization Slug (unique URL identifier)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. city-health-clinic"
                    value={orgForm.slug}
                    onChange={(e) => setOrgForm({ ...orgForm, slug: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
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

