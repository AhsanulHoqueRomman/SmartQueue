import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { authService } from '../services/authService';

export const ProfilePage = () => {
  const { user, setUser } = useAuth();
  const { effectiveRole } = useTenant();

  // Profile Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone_number: user?.phone_number || '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);

  // Password Change State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    old_password: '',
    new_password: '',
    new_password_confirm: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const updatedUser = await authService.updateProfile(formData);
      setUser(updatedUser);
      setProfileMessage({ type: 'success', text: 'Profile information updated successfully.' });
      setIsEditing(false);
    } catch (err) {
      const errDetail = err.response?.data?.detail || err.response?.data?.phone_number?.[0] || 'Failed to update profile.';
      setProfileMessage({ type: 'error', text: errDetail });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.new_password_confirm) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage(null);
    try {
      await authService.changePassword(passwordData);
      setPasswordMessage({ type: 'success', text: 'Password changed successfully.' });
      setPasswordData({ old_password: '', new_password: '', new_password_confirm: '' });
      setTimeout(() => setShowPasswordModal(false), 1500);
    } catch (err) {
      const errData = err.response?.data;
      let errMsg = 'Failed to change password.';
      if (errData?.old_password?.[0]) errMsg = errData.old_password[0];
      else if (errData?.new_password?.[0]) errMsg = errData.new_password[0];
      else if (errData?.detail) errMsg = errData.detail;
      setPasswordMessage({ type: 'error', text: errMsg });
    } finally {
      setPasswordSaving(false);
    }
  };

  const getUserInitials = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    return user?.email ? user.email[0].toUpperCase() : 'U';
  };

  return (
    <div className="container" style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div
        className="card animate-fade-in"
        style={{
          padding: '2rem',
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-bg-subtle) 100%)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap'
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-primary)',
            color: '#FFFFFF',
            fontSize: '1.75rem',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          {getUserInitials()}
        </div>

        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-sm" style={{ flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--color-text-main)', margin: 0 }}>
              {user?.first_name} {user?.last_name || '(No name set)'}
            </h1>
            <span
              className="status-badge"
              style={{
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary-text)',
                border: '1px solid var(--color-primary-border)',
                fontWeight: '600',
                padding: '0.2rem 0.6rem'
              }}
            >
              {effectiveRole}
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            {user?.email}
          </p>
        </div>

        <div className="flex gap-sm">
          <button
            onClick={() => {
              setFormData({
                first_name: user?.first_name || '',
                last_name: user?.last_name || '',
                phone_number: user?.phone_number || '',
              });
              setIsEditing(!isEditing);
            }}
            className="btn btn-outline"
          >
            {isEditing ? 'Cancel Edit' : 'Edit Details'}
          </button>
          <button
            onClick={() => {
              setPasswordMessage(null);
              setShowPasswordModal(true);
            }}
            className="btn btn-primary"
          >
            Change Password
          </button>
        </div>
      </div>

      {profileMessage && (
        <div
          className="animate-fade-in"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            backgroundColor: profileMessage.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: profileMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${profileMessage.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
            fontSize: '0.9rem'
          }}
        >
          {profileMessage.text}
        </div>
      )}

      {/* Edit Form Card (if editing) */}
      {isEditing && (
        <div className="card animate-fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--color-text-main)' }}>
            Update Profile Information
          </h2>
          <form onSubmit={handleProfileSave} className="flex flex-col gap-md">
            <div className="grid grid-cols-2 gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div>
                <label className="label" htmlFor="profile-first-name">First Name</label>
                <input
                  id="profile-first-name"
                  type="text"
                  className="input"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="e.g. Sadia"
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="profile-last-name">Last Name</label>
                <input
                  id="profile-last-name"
                  type="text"
                  className="input"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="e.g. Rahman"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="profile-phone-number">Phone Number</label>
              <input
                id="profile-phone-number"
                type="text"
                className="input"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="e.g. +8801700000000"
              />
            </div>

            <div className="flex justify-end gap-sm" style={{ marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setIsEditing(false)} className="btn btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={profileSaving} className="btn btn-primary">
                {profileSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account Details & Organization Memberships */}
      <div className="grid gap-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
        {/* Personal Info Summary */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--color-text-main)' }}>
            Personal Details
          </h2>
          <div className="flex flex-col gap-sm" style={{ fontSize: '0.9rem' }}>
            <div className="flex justify-between border-b pb-xs" style={{ borderColor: 'var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Email Address:</span>
              <span style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>{user?.email}</span>
            </div>
            <div className="flex justify-between border-b pb-xs" style={{ borderColor: 'var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Full Name:</span>
              <span style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>
                {user?.first_name} {user?.last_name || ''}
              </span>
            </div>
            <div className="flex justify-between border-b pb-xs" style={{ borderColor: 'var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Phone Number:</span>
              <span style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>
                {user?.phone_number || 'Not provided'}
              </span>
            </div>
            <div className="flex justify-between border-b pb-xs" style={{ borderColor: 'var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Account Created:</span>
              <span style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>
                {user?.date_joined ? new Date(user.date_joined).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-text-muted)' }}>System Staff / Admin:</span>
              <span style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>
                {user?.is_superuser ? 'Superuser' : user?.is_staff ? 'Staff Member' : 'Standard User'}
              </span>
            </div>
          </div>
        </div>

        {/* Organization Memberships */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--color-text-main)' }}>
            Organization Memberships
          </h2>
          {user?.memberships && user.memberships.length > 0 ? (
            <div className="flex flex-col gap-sm">
              {user.memberships.map((mem) => (
                <div
                  key={mem.id}
                  style={{
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-subtle)'
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span style={{ fontWeight: '700', color: 'var(--color-text-main)', fontSize: '0.95rem' }}>
                      {mem.organization_name}
                    </span>
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-main)',
                        fontWeight: '600',
                        fontSize: '0.75rem'
                      }}
                    >
                      {mem.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
              No organization memberships linked to this account. (Global Customer)
            </p>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            className="card animate-scale-up"
            style={{ width: '100%', maxWidth: '440px', padding: '1.75rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--color-text-main)' }}>
              Change Password
            </h2>

            {passwordMessage && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1rem',
                  backgroundColor: passwordMessage.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                  color: passwordMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                  border: `1px solid ${passwordMessage.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
                  fontSize: '0.85rem'
                }}
              >
                {passwordMessage.text}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="flex flex-col gap-md">
              <div>
                <label className="label" htmlFor="old-password-input">Current Password</label>
                <input
                  id="old-password-input"
                  type="password"
                  className="input"
                  value={passwordData.old_password}
                  onChange={(e) => setPasswordData({ ...passwordData, old_password: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label" htmlFor="new-password-input">New Password</label>
                <input
                  id="new-password-input"
                  type="password"
                  className="input"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label" htmlFor="confirm-new-password-input">Confirm New Password</label>
                <input
                  id="confirm-new-password-input"
                  type="password"
                  className="input"
                  value={passwordData.new_password_confirm}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password_confirm: e.target.value })}
                  required
                />
              </div>

              <div className="flex justify-end gap-sm" style={{ marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowPasswordModal(false)} className="btn btn-outline">
                  Cancel
                </button>
                <button type="submit" disabled={passwordSaving} className="btn btn-primary">
                  {passwordSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
