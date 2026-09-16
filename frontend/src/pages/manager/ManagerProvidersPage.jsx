import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import providerManagementService from '../../services/providerManagementService';
import organizationService from '../../services/organizationService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';

export function ManagerProvidersPage() {
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'pending' | 'rejected' | 'invitations'
  const [providers, setProviders] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [members, setMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Review Application Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // Assign Service Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [assignForm, setAssignForm] = useState({
    service_id: '',
    custom_duration_minutes: '',
    custom_price: '',
  });

  const fetchData = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);

    try {
      const [provData, invData, memData, svcData] = await Promise.all([
        managerService.getProviders(currentOrg.id),
        organizationService.getInvitations(currentOrg.id).catch(() => []),
        managerService.getMembers(currentOrg.id),
        managerService.getServices(currentOrg.id),
      ]);
      setProviders(Array.isArray(provData) ? provData : provData.results || []);
      setInvitations(Array.isArray(invData) ? invData : invData.results || []);
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

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const res = await organizationService.createInvitation(currentOrg.id, { email: inviteEmail.trim() });
      showSuccess(`Invitation created for ${inviteEmail}. Share link: /invitations/provider/${res.token}`);
      setInviteModalOpen(false);
      setInviteEmail('');
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.email?.[0] || 'Failed to create invitation.';
      showError(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (invitationId) => {
    if (!window.confirm('Cancel this invitation?')) return;
    try {
      await organizationService.cancelInvitation(currentOrg.id, invitationId);
      showSuccess('Invitation cancelled.');
      fetchData();
    } catch (err) {
      showError('Failed to cancel invitation.');
    }
  };

  const handleApproveApplication = async (profileId) => {
    setReviewing(true);
    try {
      await providerManagementService.reviewApplication(currentOrg.id, profileId, {
        action: 'APPROVE',
      });
      showSuccess('Provider application approved successfully.');
      setReviewModalOpen(false);
      setSelectedProfile(null);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.detail || 'Failed to approve application.');
    } finally {
      setReviewing(false);
    }
  };

  const handleRejectApplication = async (profileId) => {
    if (!reviewReason.trim()) {
      showError('Rejection reason is mandatory.');
      return;
    }
    setReviewing(true);
    try {
      await providerManagementService.reviewApplication(currentOrg.id, profileId, {
        action: 'REJECT',
        reason: reviewReason.trim(),
      });
      showSuccess('Provider application rejected.');
      setReviewModalOpen(false);
      setSelectedProfile(null);
      setReviewReason('');
      fetchData();
    } catch (err) {
      showError(err.response?.data?.detail || 'Failed to reject application.');
    } finally {
      setReviewing(false);
    }
  };

  const handleAssignService = async (e) => {
    e.preventDefault();
    if (!selectedProvider) return;
    const payload = { service_id: assignForm.service_id };
    if (assignForm.custom_duration_minutes) {
      payload.custom_duration_minutes = parseInt(assignForm.custom_duration_minutes, 10);
    }
    if (assignForm.custom_price) {
      payload.custom_price = parseFloat(assignForm.custom_price);
    }

    try {
      await providerManagementService.assignService(currentOrg.id, selectedProvider.id, payload);
      showSuccess('Service assigned to provider!');
      setAssignModalOpen(false);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.detail || 'Failed to assign service.');
    }
  };

  const handleDeleteProfile = async (providerId) => {
    if (!window.confirm('Delete this provider profile?')) return;
    try {
      await managerService.deleteProviderProfile(currentOrg.id, providerId);
      showSuccess('Provider profile deleted.');
      fetchData();
    } catch (err) {
      showError('Failed to delete provider profile.');
    }
  };

  // Filtering profiles by tab
  const activeProviders = providers.filter((p) => p.application_status === 'APPROVED' && p.membership_is_active !== false);
  const pendingApplications = providers.filter((p) => p.application_status === 'PENDING_REVIEW' || (p.application_status === 'INCOMPLETE' && !p.membership_is_active));
  const rejectedApplications = providers.filter((p) => p.application_status === 'REJECTED');
  const activeInvitations = invitations.filter((i) => i.is_valid);

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Please select an organization from the header selector." />;
  }

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Provider Management & Roster</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            Manage approved providers, review pending self-registrations, and invite new providers to {currentOrg.name}.
          </p>
        </div>
        <div className="flex gap-sm">
          <button className="btn btn-secondary" onClick={() => setInviteModalOpen(true)}>
            ✉️ Invite Provider via Email
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ padding: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #E6E1D9', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '10px',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: activeTab === 'active' ? '#2F2520' : 'transparent',
            color: activeTab === 'active' ? '#FAF8F3' : '#78716C',
          }}
        >
          Active Providers ({activeProviders.length})
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '10px',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: activeTab === 'pending' ? '#B06D2E' : 'transparent',
            color: activeTab === 'pending' ? '#FAF8F3' : '#78716C',
          }}
        >
          Pending Applications ({pendingApplications.length})
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '10px',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: activeTab === 'rejected' ? '#B4534B' : 'transparent',
            color: activeTab === 'rejected' ? '#FAF8F3' : '#78716C',
          }}
        >
          Rejected Applications ({rejectedApplications.length})
        </button>
        <button
          onClick={() => setActiveTab('invitations')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '10px',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: activeTab === 'invitations' ? '#5F7A70' : 'transparent',
            color: activeTab === 'invitations' ? '#FAF8F3' : '#78716C',
          }}
        >
          Invitations ({activeInvitations.length})
        </button>
      </div>

      <div className="card animate-section stagger-1">
        {loading ? (
          <LoadingState type="skeleton-table" rows={4} cols={5} />
        ) : (
          <>
            {/* TAB 1: ACTIVE PROVIDERS */}
            {activeTab === 'active' && (
              activeProviders.length === 0 ? (
                <EmptyState
                  title="No Active Providers"
                  message={`No active approved providers currently in ${currentOrg.name}.`}
                  actionLabel="Invite Provider"
                  onAction={() => setInviteModalOpen(true)}
                />
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Provider / Email</th>
                        <th>Title</th>
                        <th>Operational Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeProviders.map((prov) => (
                        <tr key={prov.id}>
                          <td>
                            <div className="font-semibold">{prov.user_first_name} {prov.user_last_name}</div>
                            <div className="text-xs text-muted">{prov.user_email}</div>
                          </td>
                          <td>{prov.title || 'Service Provider'}</td>
                          <td>
                            <span className={`badge ${prov.is_operationally_active ? 'badge-success' : 'badge-warning'}`}>
                              {prov.is_operationally_active ? 'Active & Verifiably Ready' : 'Pending Org Verification'}
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
                              <button className="btn btn-sm btn-danger" onClick={() => handleDeleteProfile(prov.id)}>
                                Delete Profile
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* TAB 2: PENDING APPLICATIONS */}
            {activeTab === 'pending' && (
              pendingApplications.length === 0 ? (
                <EmptyState
                  title="No Pending Applications"
                  message="There are no self-registered provider applications waiting for approval."
                />
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Applicant</th>
                        <th>Requested Title</th>
                        <th>Status</th>
                        <th>Submitted At</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingApplications.map((prov) => (
                        <tr key={prov.id}>
                          <td>
                            <div className="font-semibold">{prov.user_first_name} {prov.user_last_name}</div>
                            <div className="text-xs text-muted">{prov.user_email}</div>
                          </td>
                          <td>{prov.title || 'N/A'}</td>
                          <td>
                            <span className="badge badge-warning">PENDING REVIEW</span>
                          </td>
                          <td>{new Date(prov.created_at).toLocaleDateString()}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setSelectedProfile(prov);
                                setReviewModalOpen(true);
                              }}
                            >
                              🔍 Review Application
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* TAB 3: REJECTED APPLICATIONS */}
            {activeTab === 'rejected' && (
              rejectedApplications.length === 0 ? (
                <EmptyState title="No Rejected Applications" message="No provider applications have been rejected." />
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Applicant</th>
                        <th>Title</th>
                        <th>Rejection Reason</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedApplications.map((prov) => (
                        <tr key={prov.id}>
                          <td>
                            <div className="font-semibold">{prov.user_first_name} {prov.user_last_name}</div>
                            <div className="text-xs text-muted">{prov.user_email}</div>
                          </td>
                          <td>{prov.title || 'N/A'}</td>
                          <td style={{ color: '#B4534B', fontSize: '0.875rem' }}>
                            {prov.application_rejection_reason || 'No reason provided'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => {
                                setSelectedProfile(prov);
                                setReviewModalOpen(true);
                              }}
                            >
                              Re-evaluate
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* TAB 4: INVITATIONS */}
            {activeTab === 'invitations' && (
              invitations.length === 0 ? (
                <EmptyState
                  title="No Pending Invitations"
                  message="No active invitations sent to providers."
                  actionLabel="Send Invitation"
                  onAction={() => setInviteModalOpen(true)}
                />
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Invited Email</th>
                        <th>Created By</th>
                        <th>Expires At</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map((inv) => (
                        <tr key={inv.id}>
                          <td className="font-semibold">{inv.email}</td>
                          <td>{inv.created_by_email || 'Manager'}</td>
                          <td>{new Date(inv.expires_at).toLocaleString()}</td>
                          <td>
                            <span className={`badge ${inv.is_valid ? 'badge-info' : 'badge-neutral'}`}>
                              {inv.used_at ? 'Accepted' : inv.cancelled_at ? 'Cancelled' : inv.is_valid ? 'Pending Link' : 'Expired'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {inv.is_valid && (
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => handleCancelInvite(inv.id)}
                              >
                                Cancel Link
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* MODAL: Invite Provider */}
      {inviteModalOpen && (
        <div className="modal-backdrop" onClick={() => setInviteModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Invite Provider via Email</h3>
              <button className="modal-close-btn" onClick={() => setInviteModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleSendInvite}>
              <div className="modal-body">
                <p style={{ fontSize: '0.9rem', color: '#78716C', marginBottom: '1.25rem' }}>
                  Invited providers will receive an instant 7-day onboarding link to create their account and join <strong>{currentOrg.name}</strong> directly with APPROVED status.
                </p>
                <div className="form-group">
                  <label className="form-label">Provider Email Address *</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="doctor@clinic.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setInviteModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={inviting}>
                  {inviting ? 'Generating Invitation...' : 'Generate & Send Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Review Application */}
      {reviewModalOpen && selectedProfile && (
        <div className="modal-backdrop" onClick={() => setReviewModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3>Application Review — {selectedProfile.user_first_name} {selectedProfile.user_last_name}</h3>
              <button className="modal-close-btn" onClick={() => setReviewModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body flex flex-col gap-md">
              <div style={{ backgroundColor: '#FAF8F3', padding: '1rem', borderRadius: '12px', border: '1px solid #E6E1D9' }}>
                <div><strong>Applicant Email:</strong> {selectedProfile.user_email}</div>
                <div style={{ marginTop: '0.35rem' }}><strong>Title:</strong> {selectedProfile.title || 'N/A'}</div>
                <div style={{ marginTop: '0.35rem' }}><strong>Bio:</strong> {selectedProfile.bio || 'None provided'}</div>
              </div>

              <div className="form-group">
                <label className="form-label">Rejection Reason (Mandatory if rejecting)</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Provide feedback on why the application is rejected..."
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer flex justify-between">
              <button
                type="button"
                className="btn btn-danger"
                disabled={reviewing}
                onClick={() => handleRejectApplication(selectedProfile.id)}
              >
                Reject Application
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={reviewing}
                onClick={() => handleApproveApplication(selectedProfile.id)}
              >
                Approve Application
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Assign Service */}
      {assignModalOpen && selectedProvider && (
        <div className="modal-backdrop" onClick={() => setAssignModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Service to {selectedProvider.user_first_name}</h3>
              <button className="modal-close-btn" onClick={() => setAssignModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAssignService}>
              <div className="modal-body flex flex-col gap-md">
                <div className="form-group">
                  <label className="form-label">Select Service</label>
                  <select
                    className="form-control"
                    value={assignForm.service_id}
                    onChange={(e) => setAssignForm({ ...assignForm, service_id: e.target.value })}
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAssignModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">Assign Service</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerProvidersPage;
