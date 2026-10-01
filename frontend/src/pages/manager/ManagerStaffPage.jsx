import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';

export function ManagerStaffPage() {
  const { currentOrg } = useTenant();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'inactive' | 'invitations'
  const [staffMembers, setStaffMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [createdInviteToken, setCreatedInviteToken] = useState(null);

  const fetchData = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);

    try {
      const [membersData, invData] = await Promise.all([
        organizationService.getStaffMembers(currentOrg.id),
        organizationService.getStaffInvitations(currentOrg.id).catch(() => []),
      ]);
      setStaffMembers(Array.isArray(membersData) ? membersData : membersData.results || []);
      setInvitations(Array.isArray(invData) ? invData : invData.results || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load staff management data.');
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
    setCreatedInviteToken(null);
    try {
      const res = await organizationService.createStaffInvitation(currentOrg.id, { email: inviteEmail.trim() });
      setCreatedInviteToken(res.token);
      showSuccess(`Staff invitation created for ${inviteEmail}`);
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.email?.[0] || err.response?.data?.detail || 'Failed to create staff invitation.';
      showError(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (invitationId) => {
    if (!window.confirm('Are you sure you want to cancel this staff invitation?')) return;
    try {
      await organizationService.cancelStaffInvitation(currentOrg.id, invitationId);
      showSuccess('Staff invitation cancelled.');
      fetchData();
    } catch (err) {
      showError(err.response?.data?.detail || 'Failed to cancel staff invitation.');
    }
  };

  const handleActivate = async (membershipId, email) => {
    try {
      await organizationService.activateStaffMember(currentOrg.id, membershipId);
      showSuccess(`Activated staff member ${email}.`);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.detail || 'Failed to activate staff member.');
    }
  };

  const handleDeactivate = async (membershipId, email) => {
    if (!window.confirm(`Deactivate staff member ${email}? They will lose access until re-activated.`)) return;
    try {
      await organizationService.deactivateStaffMember(currentOrg.id, membershipId);
      showSuccess(`Deactivated staff member ${email}.`);
      fetchData();
    } catch (err) {
      showError(err.response?.data?.detail || 'Failed to deactivate staff member.');
    }
  };

  const activeStaff = staffMembers.filter((m) => m.is_active);
  const inactiveStaff = staffMembers.filter((m) => !m.is_active);
  const pendingInvitations = invitations.filter((inv) => inv.is_valid);

  if (loading && !staffMembers.length) {
    return <LoadingState message="Loading staff team management..." />;
  }

  return (
    <div className="app-container animate-page-entrance">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            Staff & Team Management
          </h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            Invite operational staff, manage active team memberships, and toggle access controls.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setInviteModalOpen(true);
            setCreatedInviteToken(null);
            setInviteEmail('');
          }}
        >
          <span>➕</span> Invite Staff Member
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid var(--color-error-border)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Tabs Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'active' ? '3px solid var(--lp-accent)' : '3px solid transparent',
            color: activeTab === 'active' ? 'var(--lp-accent)' : 'var(--lp-text-subtle)',
            fontWeight: activeTab === 'active' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          Active Staff ({activeStaff.length})
        </button>
        <button
          onClick={() => setActiveTab('inactive')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'inactive' ? '3px solid var(--lp-accent)' : '3px solid transparent',
            color: activeTab === 'inactive' ? 'var(--lp-accent)' : 'var(--lp-text-subtle)',
            fontWeight: activeTab === 'inactive' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          Inactive Staff ({inactiveStaff.length})
        </button>
        <button
          onClick={() => setActiveTab('invitations')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'invitations' ? '3px solid var(--lp-accent)' : '3px solid transparent',
            color: activeTab === 'invitations' ? 'var(--lp-accent)' : 'var(--lp-text-subtle)',
            fontWeight: activeTab === 'invitations' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          Pending Invitations ({pendingInvitations.length})
        </button>
      </div>

      {/* Active Staff Tab */}
      {activeTab === 'active' && (
        <div>
          {activeStaff.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No Active Staff Members"
              message="You haven't added any active staff members yet. Invite a team member to get started."
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>STAFF MEMBER</th>
                    <th>EMAIL</th>
                    <th>ROLE</th>
                    <th>STATUS</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map((member) => (
                    <tr key={member.id}>
                      <td className="font-semibold">
                        {member.user_first_name || member.user_last_name
                          ? `${member.user_first_name} ${member.user_last_name}`.trim()
                          : 'Staff Member'}
                      </td>
                      <td className="text-muted text-xs">
                        {member.user_email}
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                          STAFF
                        </span>
                      </td>
                      <td>
                        <StatusBadge status="ACTIVE" />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeactivate(member.id, member.user_email)}
                        >
                          Deactivate Access
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Inactive Staff Tab */}
      {activeTab === 'inactive' && (
        <div>
          {inactiveStaff.length === 0 ? (
            <EmptyState
              icon="🔒"
              title="No Inactive Staff Members"
              message="All registered staff members are currently active."
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>STAFF MEMBER</th>
                    <th>EMAIL</th>
                    <th>ROLE</th>
                    <th>STATUS</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveStaff.map((member) => (
                    <tr key={member.id}>
                      <td className="font-semibold text-muted">
                        {member.user_first_name || member.user_last_name
                          ? `${member.user_first_name} ${member.user_last_name}`.trim()
                          : 'Staff Member'}
                      </td>
                      <td className="text-muted text-xs">
                        {member.user_email}
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                          STAFF
                        </span>
                      </td>
                      <td>
                        <StatusBadge status="INACTIVE" />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleActivate(member.id, member.user_email)}
                        >
                          Re-Activate Access
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pending Invitations Tab */}
      {activeTab === 'invitations' && (
        <div>
          {pendingInvitations.length === 0 ? (
            <EmptyState
              icon="📨"
              title="No Pending Staff Invitations"
              message="There are currently no active staff invitation links waiting for acceptance."
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>RECIPIENT EMAIL</th>
                    <th>ROLE</th>
                    <th>SENT DATE</th>
                    <th>EXPIRES</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-semibold">
                        {inv.email}
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                          {inv.role}
                        </span>
                      </td>
                      <td className="text-muted text-xs">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td className="text-muted text-xs">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleCancelInvite(inv.id)}
                        >
                          Cancel Invitation
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {inviteModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '500px', padding: '2rem', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 0, marginBottom: '0.5rem' }}>
              Invite Staff Member
            </h2>
            <p className="subtitle" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Send an email invitation for a new staff member to join <strong>{currentOrg?.name}</strong>.
            </p>

            {createdInviteToken ? (
              <div>
                <div style={{ padding: '1rem', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  <strong>Invitation Link Generated!</strong>
                  <p style={{ margin: '0.5rem 0 0 0', wordBreak: 'break-all', fontSize: '0.85rem' }}>
                    {`${window.location.origin}/invitations/staff/${createdInviteToken}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setInviteModalOpen(false)}
                  style={{ width: '100%' }}
                >
                  Close Window
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendInvite}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label">
                    Staff Member Email Address *
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="staff@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setInviteModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={inviting}
                  >
                    {inviting ? 'Generating Link...' : 'Send Staff Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerStaffPage;
