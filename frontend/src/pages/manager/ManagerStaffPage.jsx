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
    <div style={{ padding: '1.5rem 2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#211C19', margin: 0, fontFamily: 'Cinzel, serif' }}>
            Staff & Team Management
          </h1>
          <p style={{ color: '#78716C', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Invite operational staff, manage active team memberships, and toggle access controls.
          </p>
        </div>
        <button
          onClick={() => {
            setInviteModalOpen(true);
            setCreatedInviteToken(null);
            setInviteEmail('');
          }}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#B06D2E',
            color: '#FAF8F3',
            border: 'none',
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(176, 109, 46, 0.2)',
          }}
        >
          <span>➕</span> Invite Staff Member
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#FDF2F2', color: '#B4534B', border: '1px solid #F87171', borderRadius: '12px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Tabs Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E6E1D9', marginBottom: '1.5rem', gap: '1rem' }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'active' ? '3px solid #B06D2E' : '3px solid transparent',
            color: activeTab === 'active' ? '#B06D2E' : '#78716C',
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
            borderBottom: activeTab === 'inactive' ? '3px solid #B06D2E' : '3px solid transparent',
            color: activeTab === 'inactive' ? '#B06D2E' : '#78716C',
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
            borderBottom: activeTab === 'invitations' ? '3px solid #B06D2E' : '3px solid transparent',
            color: activeTab === 'invitations' ? '#B06D2E' : '#78716C',
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
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E6E1D9', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#FAF8F3', borderBottom: '1px solid #E6E1D9' }}>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>STAFF MEMBER</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>EMAIL</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>ROLE</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>STATUS</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map((member) => (
                    <tr key={member.id} style={{ borderBottom: '1px solid #F0ECE1' }}>
                      <td style={{ padding: '1.25rem 1.5rem', fontWeight: 600, color: '#211C19' }}>
                        {member.user_first_name || member.user_last_name
                          ? `${member.user_first_name} ${member.user_last_name}`.trim()
                          : 'Staff Member'}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', color: '#554F4A', fontSize: '0.9rem' }}>
                        {member.user_email}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <span style={{ backgroundColor: '#EBF6F0', color: '#5F7A70', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
                          STAFF
                        </span>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <StatusBadge status="ACTIVE" />
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeactivate(member.id, member.user_email)}
                          style={{
                            padding: '0.45rem 1rem',
                            backgroundColor: '#FDF2F2',
                            color: '#B4534B',
                            border: '1px solid #F87171',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
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
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E6E1D9', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#FAF8F3', borderBottom: '1px solid #E6E1D9' }}>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>STAFF MEMBER</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>EMAIL</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>ROLE</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>STATUS</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveStaff.map((member) => (
                    <tr key={member.id} style={{ borderBottom: '1px solid #F0ECE1' }}>
                      <td style={{ padding: '1.25rem 1.5rem', fontWeight: 600, color: '#78716C' }}>
                        {member.user_first_name || member.user_last_name
                          ? `${member.user_first_name} ${member.user_last_name}`.trim()
                          : 'Staff Member'}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', color: '#78716C', fontSize: '0.9rem' }}>
                        {member.user_email}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <span style={{ backgroundColor: '#F0ECE1', color: '#78716C', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
                          STAFF
                        </span>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <StatusBadge status="INACTIVE" />
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleActivate(member.id, member.user_email)}
                          style={{
                            padding: '0.45rem 1rem',
                            backgroundColor: '#EBF6F0',
                            color: '#5F7A70',
                            border: '1px solid #A3CCA8',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
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
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E6E1D9', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#FAF8F3', borderBottom: '1px solid #E6E1D9' }}>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>RECIPIENT EMAIL</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>ROLE</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>SENT DATE</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600 }}>EXPIRES</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#78716C', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #F0ECE1' }}>
                      <td style={{ padding: '1.25rem 1.5rem', fontWeight: 600, color: '#211C19' }}>
                        {inv.email}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <span style={{ backgroundColor: '#EBF6F0', color: '#5F7A70', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
                          {inv.role}
                        </span>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', color: '#554F4A', fontSize: '0.85rem' }}>
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', color: '#554F4A', fontSize: '0.85rem' }}>
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleCancelInvite(inv.id)}
                          style={{
                            padding: '0.45rem 1rem',
                            backgroundColor: '#FDF2F2',
                            color: '#B4534B',
                            border: '1px solid #F87171',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '24px', width: '100%', maxWidth: '500px', padding: '2rem', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#211C19', marginTop: 0, marginBottom: '0.5rem', fontFamily: 'Cinzel, serif' }}>
              Invite Staff Member
            </h2>
            <p style={{ color: '#78716C', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Send an email invitation for a new staff member to join <strong>{currentOrg?.name}</strong>.
            </p>

            {createdInviteToken ? (
              <div>
                <div style={{ padding: '1rem', backgroundColor: '#EBF6F0', color: '#5F7A70', border: '1px solid #A3CCA8', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  <strong>Invitation Link Generated!</strong>
                  <p style={{ margin: '0.5rem 0 0 0', wordBreak: 'break-all', fontSize: '0.85rem' }}>
                    {`${window.location.origin}/invitations/staff/${createdInviteToken}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#2F2520',
                    color: '#FAF8F3',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Close Window
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendInvite}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.5rem' }}>
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
                    onClick={() => setInviteModalOpen(false)}
                    style={{
                      padding: '0.75rem 1.25rem',
                      backgroundColor: 'transparent',
                      color: '#78716C',
                      border: '1px solid #E6E1D9',
                      borderRadius: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#B06D2E',
                      color: '#FAF8F3',
                      border: 'none',
                      borderRadius: '12px',
                      fontWeight: 600,
                      cursor: inviting ? 'not-allowed' : 'pointer',
                    }}
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
