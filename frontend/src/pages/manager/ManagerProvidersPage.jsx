import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import providerManagementService from '../../services/providerManagementService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';

export function ManagerProvidersPage() {
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();

  const [providers, setProviders] = useState([]);
  const [members, setMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    membership_id: '',
    title: '',
    bio: '',
  });

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [assignForm, setAssignForm] = useState({
    service_id: '',
    custom_duration_minutes: '',
    custom_price: '',
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (createModalOpen) setCreateModalOpen(false);
        if (assignModalOpen) setAssignModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createModalOpen, assignModalOpen]);

  const fetchData = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);

    try {
      const [provData, memData, svcData] = await Promise.all([
        managerService.getProviders(currentOrg.id),
        managerService.getMembers(currentOrg.id),
        managerService.getServices(currentOrg.id),
      ]);
      setProviders(Array.isArray(provData) ? provData : provData.results || []);
      setMembers(Array.isArray(memData) ? memData : memData.results || []);
      setServices(Array.isArray(svcData) ? svcData : svcData.results || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load provider management data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentOrg?.id]);

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setError(null);

    try {
      await managerService.createProviderProfile(currentOrg.id, {
        membership_id: parseInt(profileForm.membership_id, 10),
        title: profileForm.title,
        bio: profileForm.bio,
      });
      setFeedback({ type: 'success', message: 'Provider Profile created!' });
      setCreateModalOpen(false);
      setProfileForm({ membership_id: '', title: '', bio: '' });
      fetchData();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.membership_id?.[0] ||
        'Failed to create provider profile. Ensure member has PROVIDER role.';
      setError(msg);
    }
  };

  const handleAssignService = async (e) => {
    e.preventDefault();
    if (!selectedProvider) return;
    setFeedback(null);
    setError(null);

    const payload = { service_id: assignForm.service_id };
    if (assignForm.custom_duration_minutes) {
      payload.custom_duration_minutes = parseInt(assignForm.custom_duration_minutes, 10);
    }
    if (assignForm.custom_price) {
      payload.custom_price = parseFloat(assignForm.custom_price);
    }

    try {
      await providerManagementService.assignService(
        currentOrg.id,
        selectedProvider.id,
        payload
      );
      setFeedback({ type: 'success', message: 'Service assigned to provider!' });
      setAssignModalOpen(false);
      fetchData();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.service_id?.[0] ||
        'Failed to assign service.';
      setError(msg);
    }
  };

  const handleDeleteProfile = async (providerId) => {
    if (!window.confirm('Delete this provider profile?')) return;
    try {
      await managerService.deleteProviderProfile(currentOrg.id, providerId);
      setFeedback({ type: 'success', message: 'Provider profile deleted.' });
      fetchData();
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to delete provider profile.' });
    }
  };

  const providerMembers = members.filter(
    (m) =>
      m.role === 'PROVIDER' &&
      !providers.some((p) => p.membership_id === m.id)
  );

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the header selector."
      />
    );
  }

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Provider Roster</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Manage provider profiles, titles, bios, and service assignments in {currentOrg.name}.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateModalOpen(true)}>
          + Add Provider Profile
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

      <div className="card animate-section stagger-1">
        {loading ? (
          <LoadingState type="skeleton-table" rows={4} cols={5} />
        ) : providers.length === 0 ? (
          <EmptyState
            title="No Providers Onboarded"
            message={`No provider profiles registered yet in ${currentOrg.name}.`}
            actionLabel="Add Provider Profile"
            onAction={() => setCreateModalOpen(true)}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Provider / Email</th>
                  <th>Title</th>
                  <th>Bio</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((prov) => (
                  <tr key={prov.id}>
                    <td>
                      <div className="font-semibold">{prov.user_email || `User #${prov.user_id}`}</div>
                      <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>#{prov.id.slice(0, 8)}</div>
                    </td>
                    <td>{prov.title || 'N/A'}</td>
                    <td>{prov.bio || 'N/A'}</td>
                    <td>
                      <span className={`badge ${prov.is_active !== false ? 'badge-success' : 'badge-neutral'}`}>
                        {prov.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex justify-end gap-xs">
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => {
                            setSelectedProvider(prov);
                            setAssignModalOpen(true);
                          }}
                        >
                          + Assign Service
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeleteProfile(prov.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Create Profile */}
      {createModalOpen && (
        <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Provider Profile</h3>
              <button className="modal-close-btn" onClick={() => setCreateModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateProfile}>
              <div className="modal-body flex flex-col gap-md">
                <div className="form-group">
                  <label className="form-label">Select Organization Member (PROVIDER Role)</label>
                  <select
                    className="form-control"
                    value={profileForm.membership_id}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, membership_id: e.target.value })
                    }
                    required
                  >
                    <option value="">-- Select Member --</option>
                    {providerMembers.length === 0 ? (
                      <option value="" disabled>
                        No available members with role PROVIDER
                      </option>
                    ) : (
                      providerMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.user_email} (Membership #{m.id})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Professional Title</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Dr. Specialist, Senior Consultant..."
                    value={profileForm.title}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, title: e.target.value })
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Bio (optional)</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="Qualifications, experience..."
                    value={profileForm.bio}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, bio: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Assign Service */}
      {assignModalOpen && selectedProvider && (
        <div className="modal-backdrop" onClick={() => setAssignModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Service to {selectedProvider.user_email}</h3>
              <button className="modal-close-btn" onClick={() => setAssignModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleAssignService}>
              <div className="modal-body flex flex-col gap-md">
                <div className="form-group">
                  <label className="form-label">Select Service</label>
                  <select
                    className="form-control"
                    value={assignForm.service_id}
                    onChange={(e) =>
                      setAssignForm({ ...assignForm, service_id: e.target.value })
                    }
                    required
                  >
                    <option value="">-- Select Service --</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name} ({svc.duration_minutes} min)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid-responsive grid-cols-2">
                  <div className="form-group">
                    <label className="form-label">Custom Duration (min)</label>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Default"
                      value={assignForm.custom_duration_minutes}
                      onChange={(e) =>
                        setAssignForm({
                          ...assignForm,
                          custom_duration_minutes: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Custom Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      placeholder="Default"
                      value={assignForm.custom_price}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, custom_price: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAssignModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Assign Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerProvidersPage;
