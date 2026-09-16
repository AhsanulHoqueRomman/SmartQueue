import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';

export function ManagerMembersPage() {
  const { currentOrg, refreshTenant } = useTenant();
  const { showSuccess, showError } = useToast();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    user_email: '',
    role: 'PROVIDER',
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && modalOpen) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  const fetchMembers = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);

    try {
      const data = await managerService.getMembers(currentOrg.id);
      setMembers(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load organization members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [currentOrg?.id]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      await managerService.addMember(currentOrg.id, {
        user_email: addForm.user_email,
        role: addForm.role,
      });
      showSuccess(`Member ${addForm.user_email} added to organization!`);
      setModalOpen(false);
      setAddForm({ user_email: '', role: 'PROVIDER' });
      fetchMembers();
      refreshTenant();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.user_email?.[0] ||
        'Failed to add member.';
      showError(msg);
      setError(msg);
    }
  };

  const handleRoleChange = async (membershipId, newRole) => {
    setError(null);

    try {
      await managerService.updateMember(currentOrg.id, membershipId, {
        role: newRole,
      });
      showSuccess('Member role updated successfully.');
      fetchMembers();
      refreshTenant();
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;

      if (status === 409 || detail?.includes('manager') || detail?.includes('last')) {
        showError('Cannot demote the sole active manager of this organization.');
      } else {
        showError(detail || 'Failed to update member role.');
      }
    }
  };

  const handleToggleActive = async (membership, currentActive) => {
    setError(null);

    try {
      await managerService.updateMember(currentOrg.id, membership.id, {
        is_active: !currentActive,
      });
      showSuccess(`Member ${!currentActive ? 'activated' : 'deactivated'}.`);
      fetchMembers();
      refreshTenant();
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;

      if (status === 409 || detail?.includes('manager') || detail?.includes('last')) {
        showError('Cannot deactivate the sole active manager of this organization.');
      } else {
        showError(detail || 'Failed to update member active status.');
      }
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'MANAGER': return 'badge-purple';
      case 'PROVIDER': return 'badge-info';
      case 'STAFF': return 'badge-success';
      default: return 'badge-neutral';
    }
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the top selector."
      />
    );
  }

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Members & Role Grants</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Manage user access and roles for {currentOrg.name}.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          + Add Member
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
        ) : members.length === 0 ? (
          <EmptyState
            title="No Members Found"
            message={`No registered members found in ${currentOrg.name}.`}
            actionLabel="Add Member"
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>User Email</th>
                  <th>Current Role</th>
                  <th>Status</th>
                  <th>Change Role</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const userEmail = m.user_email || m.user?.email;
                  const userId = m.user_id || m.user?.id;
                  const userName = m.user?.first_name ? `${m.user.first_name} ${m.user.last_name || ''}`.trim() : null;
                  const displayName = userName ? `${userName} (${userEmail})` : (userEmail || `User #${userId}`);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="font-semibold">{displayName}</div>
                        <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>Membership #{m.id}</div>
                      </td>
                    <td>
                      <span className={`badge ${getRoleBadgeClass(m.role)}`}>{m.role}</span>
                    </td>
                    <td>
                      <span className={`badge ${m.is_active !== false ? 'badge-success' : 'badge-neutral'}`}>
                        {m.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <select
                        className="form-control role-select-inline"
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        style={{ padding: '0.35rem 0.55rem', fontSize: '0.85rem', width: 'auto' }}
                      >
                        <option value="MANAGER">MANAGER</option>
                        <option value="PROVIDER">PROVIDER</option>
                        <option value="STAFF">STAFF</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className={`btn btn-sm ${m.is_active !== false ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => handleToggleActive(m, m.is_active !== false)}
                      >
                        {m.is_active !== false ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add Member */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Organization Member</h3>
              <button className="modal-close-btn" onClick={() => setModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleAddMember}>
              <div className="modal-body flex flex-col gap-md">
                <div className="form-group">
                  <label className="form-label">User Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="user@example.com"
                    value={addForm.user_email}
                    onChange={(e) => setAddForm({ ...addForm, user_email: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Assign Role</label>
                  <select
                    className="form-control"
                    value={addForm.role}
                    onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                  >
                    <option value="PROVIDER">PROVIDER</option>
                    <option value="STAFF">STAFF</option>
                    <option value="MANAGER">MANAGER</option>
                  </select>
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
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerMembersPage;
