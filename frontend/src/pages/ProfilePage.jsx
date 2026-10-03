import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { authService } from '../services/authService';

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
      const errDetail = err.response?.data?.detail || err.response?.data?.avatar?.[0] || err.response?.data?.phone_number?.[0] || 'Failed to update profile.';
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

  const getRoleBadgeStyle = () => {
    switch (effectiveRole) {
      case 'ADMIN': return { bg: 'var(--color-danger-light)', color: 'var(--color-danger)', border: 'var(--color-danger)' };
      case 'MANAGER': return { bg: 'var(--lp-sage-bg)', color: 'var(--lp-sage)', border: 'var(--lp-sage-border)' };
      case 'STAFF': return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)', border: 'var(--color-warning)' };
      case 'PROVIDER': return { bg: 'var(--lp-sage-bg)', color: 'var(--lp-accent)', border: 'var(--lp-border)' };
      default: return { bg: 'var(--lp-bg-subtle)', color: 'var(--lp-text-subtle)', border: 'var(--lp-border)' };
    }
  };
  const roleStyle = getRoleBadgeStyle();

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '950px', margin: '0 auto', padding: '0 1rem' }}>
      {/* Header Banner */}
      <div
        style={{
          padding: '2.25rem',
          marginBottom: '1.75rem',
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border)',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '1.75rem',
          flexWrap: 'wrap',
          boxShadow: 'var(--card-shadow)'
        }}
      >
        <div style={{ position: 'relative' }}>
          {currentAvatarUrl && !removeAvatar ? (
            <img
              src={currentAvatarUrl}
              alt="Profile Avatar"
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid var(--lp-accent)',
                boxShadow: 'var(--shadow-sm)'
              }}
            />
          ) : (
            <div
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                backgroundColor: 'var(--lp-accent)',
                color: 'var(--lp-btn-text)',
                fontSize: '2rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-sm)',
                fontFamily: 'Cinzel, serif',
              }}
            >
              {getUserInitials()}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--lp-text)', margin: 0, fontFamily: 'Cinzel, serif' }}>
              {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'User Profile'}
            </h1>
            <span
              style={{
                backgroundColor: roleStyle.bg,
                color: roleStyle.color,
                border: `1px solid ${roleStyle.border}`,
                fontWeight: '700',
                padding: '0.2rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              {effectiveRole || 'GLOBAL CUSTOMER'}
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--lp-text-subtle)', fontSize: '0.95rem' }}>
            {user?.email}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
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
            style={{
              padding: '0.75rem 1.25rem',
              background: isEditing ? 'var(--lp-bg-subtle)' : 'var(--lp-surface)',
              color: 'var(--lp-text)',
              border: '1px solid var(--lp-border)',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            {isEditing ? 'Cancel Editing' : '✏️ Edit Profile'}
          </button>
          <button
            onClick={() => {
              setPasswordMessage(null);
              setShowPasswordModal(true);
            }}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'var(--lp-accent)',
              color: 'var(--lp-btn-text)',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(95, 122, 112, 0.25)',
            }}
          >
            🔒 Change Password
          </button>
        </div>
      </div>

      {profileMessage && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            backgroundColor: profileMessage.type === 'success' ? 'var(--lp-sage-bg)' : 'var(--color-danger-light)',
            color: profileMessage.type === 'success' ? 'var(--lp-sage)' : 'var(--color-danger)',
            border: `1px solid ${profileMessage.type === 'success' ? 'var(--lp-sage-border)' : 'var(--color-danger)'}`,
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          {profileMessage.text}
        </div>
      )}

      {/* Edit Form Card */}
      {isEditing && (
        <div
          style={{
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
            borderRadius: '18px',
            padding: '1.75rem',
            marginBottom: '1.75rem',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1.25rem', color: 'var(--lp-text)', fontFamily: 'Cinzel, serif' }}>
            Update Profile Information
          </h2>
          <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Avatar Upload Field */}
            <div style={{ background: 'var(--lp-bg-subtle)', border: '1px solid var(--lp-border)', borderRadius: '12px', padding: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Profile Photo / Avatar
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                {currentAvatarUrl && !removeAvatar ? (
                  <img
                    src={currentAvatarUrl}
                    alt="Preview"
                    style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--lp-accent)' }}
                  />
                ) : (
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--lp-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', color: 'var(--lp-text-subtle)' }}>
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
                  <label
                    htmlFor="avatar-file-input"
                    style={{
                      padding: '0.6rem 1rem',
                      background: 'var(--lp-surface)',
                      color: 'var(--lp-text)',
                      border: '1px solid var(--lp-border)',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    📷 {user?.avatar ? 'Replace Photo' : 'Upload Photo'}
                  </label>

                  {(user?.avatar || avatarFile) && !removeAvatar && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      style={{
                        padding: '0.6rem 1rem',
                        background: 'var(--color-danger-light)',
                        color: 'var(--color-danger)',
                        border: '1px solid var(--color-danger)',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      🗑️ Remove Photo
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle)', marginTop: '0.5rem' }}>
                Supported formats: JPG, PNG, WEBP, GIF. Max file size: 5MB.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }} htmlFor="profile-first-name">First Name</label>
                <input
                  id="profile-first-name"
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="e.g. Sadia"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: '1px solid var(--lp-border)',
                    backgroundColor: 'var(--lp-surface)',
                    color: 'var(--lp-text)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }} htmlFor="profile-last-name">Last Name</label>
                <input
                  id="profile-last-name"
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="e.g. Rahman"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: '1px solid var(--lp-border)',
                    backgroundColor: 'var(--lp-surface)',
                    color: 'var(--lp-text)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }} htmlFor="profile-phone-number">Phone Number</label>
              <input
                id="profile-phone-number"
                type="text"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="e.g. +8801700000000"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: '1px solid var(--lp-border)',
                  backgroundColor: 'var(--lp-surface)',
                  color: 'var(--lp-text)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{
                  padding: '0.7rem 1.25rem',
                  background: 'var(--lp-bg-subtle)',
                  color: 'var(--lp-text)',
                  border: '1px solid var(--lp-border)',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileSaving}
                style={{
                  padding: '0.7rem 1.4rem',
                  background: 'var(--lp-accent)',
                  color: 'var(--lp-btn-text)',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                {profileSaving ? 'Saving Changes...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profile Sections Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Personal Details Card */}
        <div
          style={{
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
            borderRadius: '18px',
            padding: '1.75rem',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1.25rem', color: 'var(--lp-text)', fontFamily: 'Cinzel, serif' }}>
            Personal Account Details
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.65rem', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)' }}>Email Address:</span>
              <span style={{ fontWeight: '700', color: 'var(--lp-text)' }}>{user?.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.65rem', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)' }}>Full Name:</span>
              <span style={{ fontWeight: '700', color: 'var(--lp-text)' }}>
                {user?.first_name} {user?.last_name || ''}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.65rem', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)' }}>Phone Number:</span>
              <span style={{ fontWeight: '700', color: 'var(--lp-text)' }}>
                {user?.phone_number || 'Not provided'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.65rem', borderBottom: '1px solid var(--lp-border)' }}>
              <span style={{ color: 'var(--lp-text-subtle)' }}>Account Created:</span>
              <span style={{ fontWeight: '700', color: 'var(--lp-text)' }}>
                {user?.date_joined ? new Date(user.date_joined).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--lp-text-subtle)' }}>System Role:</span>
              <span style={{ fontWeight: '700', color: 'var(--lp-accent)' }}>
                {user?.is_superuser ? 'Superuser' : user?.is_staff ? 'Staff Administrator' : 'Global Customer'}
              </span>
            </div>
          </div>
        </div>

        {/* Organization Memberships Card */}
        {user?.memberships && user.memberships.length > 0 && (
          <div
            style={{
              background: 'var(--lp-surface)',
              border: '1px solid var(--lp-border)',
              borderRadius: '18px',
              padding: '1.75rem',
              boxShadow: 'var(--card-shadow)'
            }}
          >
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1.25rem', color: 'var(--lp-text)', fontFamily: 'Cinzel, serif' }}>
              Organization Memberships
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {user.memberships.map((mem) => (
                <div
                  key={mem.id}
                  style={{
                    padding: '1rem',
                    borderRadius: '12px',
                    border: '1px solid var(--lp-border)',
                    backgroundColor: 'var(--lp-bg-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: '700', color: 'var(--lp-text)', fontSize: '0.95rem' }}>
                      🏢 {mem.organization_name}
                    </span>
                  </div>
                  <span
                    style={{
                      backgroundColor: 'var(--lp-surface)',
                      border: '1px solid var(--lp-border)',
                      color: 'var(--lp-accent)',
                      fontWeight: '700',
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {mem.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--color-overlay, rgba(0,0,0,0.5))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            style={{
              background: 'var(--lp-surface)',
              border: '1px solid var(--lp-border)',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '460px',
              padding: '1.75rem',
              boxShadow: 'var(--card-shadow)',
              animation: 'fadeIn 0.2s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem', color: 'var(--lp-text)', fontFamily: 'Cinzel, serif' }}>
              Change Password
            </h2>

            {passwordMessage && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  marginBottom: '1.25rem',
                  backgroundColor: passwordMessage.type === 'success' ? 'var(--lp-sage-bg)' : 'var(--color-danger-light)',
                  color: passwordMessage.type === 'success' ? 'var(--lp-sage)' : 'var(--color-danger)',
                  border: `1px solid ${passwordMessage.type === 'success' ? 'var(--lp-sage-border)' : 'var(--color-danger)'}`,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                {passwordMessage.text}
              </div>
            )}

            <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }} htmlFor="old-password-input">Current Password</label>
                <input
                  id="old-password-input"
                  type="password"
                  value={passwordData.old_password}
                  onChange={(e) => setPasswordData({ ...passwordData, old_password: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: '1px solid var(--lp-border)',
                    backgroundColor: 'var(--lp-surface)',
                    color: 'var(--lp-text)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }} htmlFor="new-password-input">New Password</label>
                <input
                  id="new-password-input"
                  type="password"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: '1px solid var(--lp-border)',
                    backgroundColor: 'var(--lp-surface)',
                    color: 'var(--lp-text)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-text)', marginBottom: '0.35rem' }} htmlFor="confirm-new-password-input">Confirm New Password</label>
                <input
                  id="confirm-new-password-input"
                  type="password"
                  value={passwordData.new_password_confirm}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password_confirm: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: '1px solid var(--lp-border)',
                    backgroundColor: 'var(--lp-surface)',
                    color: 'var(--lp-text)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  style={{
                    padding: '0.7rem 1.25rem',
                    background: 'var(--lp-bg-subtle)',
                    color: 'var(--lp-text)',
                    border: '1px solid var(--lp-border)',
                    borderRadius: '10px',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordSaving}
                  style={{
                    padding: '0.7rem 1.4rem',
                    background: 'var(--lp-accent)',
                    color: 'var(--lp-btn-text)',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
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
