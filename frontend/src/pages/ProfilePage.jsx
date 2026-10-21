import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { authService } from '../services/authService';
import '../styles/ProfilePage.css';

export const ProfilePage = () => {
  const { user, setUser } = useAuth();
  const { effectiveRole } = useTenant();

  const fileInputRef = useRef(null);

  // Profile Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone_number: user?.phone_number || '',
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
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

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Supplementary client-side check (<5MB)
      if (file.size > 5 * 1024 * 1024) {
        setProfileMessage({ type: 'error', text: 'Image file size must not exceed 5MB.' });
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setRemoveAvatar(false);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);

    try {
      let payload;
      if (avatarFile || removeAvatar) {
        payload = new FormData();
        payload.append('first_name', formData.first_name);
        payload.append('last_name', formData.last_name);
        payload.append('phone_number', formData.phone_number);
        if (avatarFile) {
          payload.append('avatar', avatarFile);
        } else if (removeAvatar) {
          payload.append('avatar', '');
        }
      } else {
        payload = formData;
      }

      const updatedUser = await authService.updateProfile(payload);
      setUser(updatedUser);
      setProfileMessage({ type: 'success', text: 'Profile information updated successfully.' });
      setIsEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      setRemoveAvatar(false);
    } catch (err) {
      const errDetail =
        err.response?.data?.detail ||
        err.response?.data?.avatar?.[0] ||
        err.response?.data?.phone_number?.[0] ||
        'Failed to update profile. Please verify your input.';
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

  const currentAvatarUrl = avatarPreview || user?.avatar_url || user?.avatar;

  const getRoleBadgeClass = () => {
    switch (effectiveRole) {
      case 'ADMIN':
        return 'profile-role-badge--admin';
      case 'MANAGER':
        return 'profile-role-badge--manager';
      case 'STAFF':
        return 'profile-role-badge--staff';
      case 'PROVIDER':
        return 'profile-role-badge--provider';
      default:
        return '';
    }
  };

  return (
    <div className="profile-page" role="main">
      {/* Editorial Account Header */}
      <header className="profile-header">
        <div className="profile-avatar-wrap">
          {currentAvatarUrl && !removeAvatar ? (
            <img
              src={currentAvatarUrl}
              alt="Profile Avatar"
              className="profile-avatar-img"
            />
          ) : (
            <div className="profile-avatar-initials" aria-hidden="true">
              {getUserInitials()}
            </div>
          )}
        </div>

        <div className="profile-header-info">
          <div className="profile-name-row">
            <h1 className="profile-name">
              {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'User Profile'}
            </h1>
            <span className={`profile-role-badge ${getRoleBadgeClass()}`}>
              {effectiveRole || 'GLOBAL CUSTOMER'}
            </span>
          </div>
          <p className="profile-email">{user?.email}</p>
        </div>

        <div className="profile-header-actions">
          <button
            type="button"
            className={`profile-btn-edit ${isEditing ? 'profile-btn-edit--active' : ''}`}
            onClick={() => {
              setFormData({
                first_name: user?.first_name || '',
                last_name: user?.last_name || '',
                phone_number: user?.phone_number || '',
              });
              setAvatarFile(null);
              setAvatarPreview(null);
              setRemoveAvatar(false);
              setIsEditing(!isEditing);
            }}
          >
            {isEditing ? 'Cancel Editing' : '✏️ Edit Profile'}
          </button>

          <button
            type="button"
            className="profile-btn-password"
            onClick={() => {
              setPasswordMessage(null);
              setShowPasswordModal(true);
            }}
          >
            🔒 Change Password
          </button>
        </div>
      </header>

      {/* Profile Feedback Alert */}
      {profileMessage && (
        <div
          className={`profile-alert ${
            profileMessage.type === 'success' ? 'profile-alert--success' : 'profile-alert--error'
          }`}
          role="status"
        >
          {profileMessage.type === 'success' ? '✓' : '⚠️'} {profileMessage.text}
        </div>
      )}

      {/* Edit Form Card */}
      {isEditing && (
        <section className="profile-form-card" aria-label="Edit Profile">
          <h2 className="profile-form-title">Update Profile Information</h2>
          <form onSubmit={handleProfileSave} className="profile-form">
            {/* Avatar Upload Control */}
            <div className="profile-avatar-upload-zone">
              <span className="profile-avatar-upload-label">Profile Photo / Avatar</span>
              <div className="profile-avatar-upload-controls">
                {currentAvatarUrl && !removeAvatar ? (
                  <img
                    src={currentAvatarUrl}
                    alt="Avatar preview"
                    className="profile-avatar-preview-img"
                  />
                ) : (
                  <div className="profile-avatar-placeholder" aria-hidden="true">
                    👤
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleAvatarChange}
                    style={{ display: 'none' }}
                    id="avatar-file-input"
                  />
                  <label htmlFor="avatar-file-input" className="profile-btn-upload">
                    📷 {user?.avatar ? 'Replace Photo' : 'Upload Photo'}
                  </label>

                  {(user?.avatar || avatarFile) && !removeAvatar && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="profile-btn-remove-avatar"
                    >
                      🗑️ Remove Photo
                    </button>
                  )}
                </div>
              </div>
              <span className="profile-avatar-hint">
                Supported formats: JPG, PNG, WEBP, GIF. Maximum file size: 5MB.
              </span>
            </div>

            <div className="profile-form-row">
              <div className="profile-form-group">
                <label className="profile-label" htmlFor="profile-first-name">
                  First Name
                </label>
                <input
                  id="profile-first-name"
                  type="text"
                  className="profile-input"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="e.g. Sadia"
                  required
                />
              </div>

              <div className="profile-form-group">
                <label className="profile-label" htmlFor="profile-last-name">
                  Last Name
                </label>
                <input
                  id="profile-last-name"
                  type="text"
                  className="profile-input"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="e.g. Rahman"
                />
              </div>
            </div>

            <div className="profile-form-group">
              <label className="profile-label" htmlFor="profile-phone-number">
                Phone Number
              </label>
              <input
                id="profile-phone-number"
                type="text"
                className="profile-input"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="e.g. +8801700000000"
              />
            </div>

            <div className="profile-form-actions">
              <button
                type="button"
                className="profile-btn-cancel"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileSaving}
                className="profile-btn-save"
              >
                {profileSaving ? 'Saving Changes...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Details Grid */}
      <section className="profile-grid" aria-label="Account details and memberships">
        {/* Personal Details Card */}
        <article className="profile-card">
          <h2 className="profile-card-title">Personal Account Details</h2>
          <div className="profile-details-list">
            <div className="profile-detail-row">
              <span className="profile-detail-label">Email Address:</span>
              <span className="profile-detail-val">{user?.email}</span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">Full Name:</span>
              <span className="profile-detail-val">
                {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Not set'}
              </span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">Phone Number:</span>
              <span className="profile-detail-val">
                {user?.phone_number || 'Not provided'}
              </span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">Account Created:</span>
              <span className="profile-detail-val">
                {user?.date_joined
                  ? new Date(user.date_joined).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">System Role:</span>
              <span className="profile-detail-val profile-detail-val--accent">
                {user?.is_superuser
                  ? 'Superuser'
                  : user?.is_staff
                  ? 'Staff Administrator'
                  : 'Global Customer'}
              </span>
            </div>
          </div>
        </article>

        {/* Organization Memberships Card */}
        {user?.memberships && user.memberships.length > 0 && (
          <article className="profile-card">
            <h2 className="profile-card-title">Organization Memberships</h2>
            <div className="profile-memberships-list">
              {user.memberships.map((mem) => (
                <div key={mem.id} className="profile-membership-item">
                  <span className="profile-membership-name">
                    🏥 {mem.organization_name}
                  </span>
                  <span className="profile-membership-role">{mem.role}</span>
                </div>
              ))}
            </div>
          </article>
        )}
      </section>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div
          className="profile-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-modal-title"
          onClick={() => setShowPasswordModal(false)}
        >
          <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="password-modal-title" className="profile-modal-title">
              Change Password
            </h2>

            {passwordMessage && (
              <div
                className={`profile-alert ${
                  passwordMessage.type === 'success'
                    ? 'profile-alert--success'
                    : 'profile-alert--error'
                }`}
                role="status"
              >
                {passwordMessage.type === 'success' ? '✓' : '⚠️'} {passwordMessage.text}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="profile-modal-form">
              <div className="profile-form-group">
                <label className="profile-label" htmlFor="old-password-input">
                  Current Password
                </label>
                <input
                  id="old-password-input"
                  type="password"
                  className="profile-input"
                  value={passwordData.old_password}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, old_password: e.target.value })
                  }
                  required
                />
              </div>

              <div className="profile-form-group">
                <label className="profile-label" htmlFor="new-password-input">
                  New Password
                </label>
                <input
                  id="new-password-input"
                  type="password"
                  className="profile-input"
                  value={passwordData.new_password}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, new_password: e.target.value })
                  }
                  required
                />
              </div>

              <div className="profile-form-group">
                <label className="profile-label" htmlFor="confirm-new-password-input">
                  Confirm New Password
                </label>
                <input
                  id="confirm-new-password-input"
                  type="password"
                  className="profile-input"
                  value={passwordData.new_password_confirm}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, new_password_confirm: e.target.value })
                  }
                  required
                />
              </div>

              <div className="profile-form-actions">
                <button
                  type="button"
                  className="profile-btn-cancel"
                  onClick={() => setShowPasswordModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="profile-btn-save"
                >
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
