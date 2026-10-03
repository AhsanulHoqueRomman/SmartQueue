import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { getRoleDashboardPath } from '../routes/RoleRoute';

export const UserAccountMenu = () => {
  const { user, logout } = useAuth();
  const { effectiveRole } = useTenant();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const menuRef = useRef(null);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    navigate('/login');
  };

  const getUserInitials = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    if (user?.first_name) {
      return user.first_name[0].toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  const getUserFirstName = () => {
    if (user?.first_name) return user.first_name;
    if (user?.email) return user.email.split('@')[0];
    return 'Account';
  };

  const getUserFullName = () => {
    if (user?.first_name || user?.last_name) {
      return `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
    }
    return user?.email || 'User Account';
  };

  const avatarSrc = user?.avatar_url || user?.avatar;

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const dashboardPath = getRoleDashboardPath(effectiveRole);

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User Account Menu"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'var(--lp-bg-subtle, var(--color-bg-subtle, #f5f3ef))',
          border: '1px solid var(--lp-border, var(--color-border, #e2ddd5))',
          borderRadius: '9999px',
          padding: '0.25rem 0.65rem 0.25rem 0.25rem',
          cursor: 'pointer',
          color: 'var(--lp-text, var(--color-text-main, #1c1815))',
          fontWeight: 600,
          fontSize: '0.85rem',
          transition: 'all 0.15s ease',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: 'var(--lp-accent, var(--color-primary, #5f7a70))',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.8rem',
            flexShrink: 0,
          }}
        >
          {avatarSrc && !imgError ? (
            <img
              src={avatarSrc}
              alt={getUserFullName()}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span>{getUserInitials()}</span>
          )}
        </div>

        <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getUserFirstName()}
        </span>
        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{isOpen ? '▲' : '▾'}</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 0.5rem)',
            width: '240px',
            background: 'var(--lp-surface, var(--color-surface, #ffffff))',
            border: '1px solid var(--lp-border, var(--color-border, #e2ddd5))',
            borderRadius: '16px',
            boxShadow: 'var(--lp-shadow-sm, 0 10px 25px rgba(0,0,0,0.15))',
            padding: '0.5rem 0',
            zIndex: 1000,
            animation: 'sqPageFadeIn 0.15s ease-out forwards',
          }}
        >
          {/* Menu Header */}
          <div style={{ padding: '0.75rem 1rem 0.5rem 1rem', borderBottom: '1px solid var(--lp-border, var(--color-border, #e2ddd5))' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--lp-text, var(--color-text-main, #1c1815))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getUserFullName()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-subtle, var(--color-text-muted, #78716c))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email}
            </div>
            <div style={{ display: 'inline-block', marginTop: '0.35rem', background: 'var(--lp-bg-subtle, #f5f3ef)', border: '1px solid var(--lp-border, #e2ddd5)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--lp-accent, #5f7a70)', textTransform: 'uppercase' }}>
              {effectiveRole || 'CUSTOMER'}
            </div>
          </div>

          {/* Navigation Links */}
          <div style={{ padding: '0.35rem 0' }}>
            <Link
              to={dashboardPath}
              onClick={() => setIsOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.55rem 1rem',
                color: 'var(--lp-text, var(--color-text-main, #1c1815))',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 600,
                transition: 'background 0.15s ease',
              }}
            >
              <span>📊</span> Dashboard
            </Link>

            <Link
              to="/profile"
              onClick={() => setIsOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.55rem 1rem',
                color: 'var(--lp-text, var(--color-text-main, #1c1815))',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 600,
                transition: 'background 0.15s ease',
              }}
            >
              <span>👤</span> My Profile
            </Link>
          </div>

          {/* Sign Out */}
          <div style={{ borderTop: '1px solid var(--lp-border, var(--color-border, #e2ddd5))', paddingTop: '0.35rem' }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.55rem 1rem',
                color: 'var(--color-danger, #b4534b)',
                background: 'none',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>🚪</span> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAccountMenu;
