import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { OrgSelector } from './OrgSelector';
import { NotificationBell } from './NotificationBell';
import { useToast } from '../contexts/ToastContext';
import { getApiDocsUrl } from '../api/client';

export const AppShell = ({ children }) => {
  const { user, logout } = useAuth();
  const { effectiveRole, currentOrg } = useTenant();
  const { showInfo } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleNewNotification = (n) => {
    showInfo(`${n.title}: ${n.message}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getUserInitials = () => {
    if (user?.first_name && user?.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  // Role-specific nav items with exact functional routes
  const getNavItems = () => {
    switch (effectiveRole) {
      case 'ADMIN':
        return [
          { label: 'System Overview', path: '/admin/dashboard', icon: '⚡' },
          { label: 'Organizations', path: '/admin/organizations', icon: '🏢' },
          { label: 'Platform Users', path: '/admin/users', icon: '👥' },
          { label: 'Contact Messages', path: '/admin/contact', icon: '📬' },
        ];
      case 'MANAGER':
        return [
          { label: 'Dashboard', path: '/manager/dashboard', icon: '📊' },
          { label: 'Appointments', path: '/manager/appointments', icon: '📅' },
          { label: 'Live Queue', path: '/manager/queue', icon: '⏳' },
          { label: 'Services Catalog', path: '/manager/services', icon: '⚙️' },
          { label: 'Provider Roster', path: '/manager/providers', icon: '🩺' },
          { label: 'Members & Roles', path: '/manager/members', icon: '👥' },
          { label: 'Reviews Summary', path: '/manager/reviews', icon: '★' },
          { label: 'Analytics', path: '/manager/analytics', icon: '📈' },
          { label: 'Audit Logs', path: '/manager/audit', icon: '📜' },
          { label: 'Org Settings', path: '/manager/settings', icon: '🏢' },
        ];
      case 'STAFF':
        return [
          { label: 'Dashboard', path: '/staff/dashboard', icon: '📋' },
          { label: 'Appointments', path: '/staff/appointments', icon: '📅' },
          { label: 'Queue Monitor', path: '/staff/queue', icon: '⏳' },
          { label: 'Customer Roster', path: '/staff/customers', icon: '👥' },
          { label: 'Provider Directory', path: '/staff/providers', icon: '🩺' },
          { label: 'Services', path: '/staff/services', icon: '⚙️' },
          { label: 'Notifications', path: '/staff/notifications', icon: '🔔' },
        ];
      case 'PROVIDER':
        return [
          { label: 'Dashboard', path: '/provider/dashboard', icon: '👨‍⚕️' },
          { label: 'My Appointments', path: '/provider/appointments', icon: '📅' },
          { label: 'Live Queue', path: '/provider/queue', icon: '🔔' },
          { label: 'My Services', path: '/provider/services', icon: '⚙️' },
          { label: 'My Schedule', path: '/provider/schedule', icon: '📆' },
          { label: 'Patient Reviews', path: '/provider/reviews', icon: '★' },
        ];
      case 'CUSTOMER':
      default:
        return [
          { label: 'Dashboard', path: '/customer/dashboard', icon: '👤' },
          { label: 'Explore Clinics', path: '/organizations', icon: '🏥' },
          { label: 'Saved Clinics', path: '/customer/favorites', icon: '❤️' },
          { label: 'Book Appointment', path: '/customer/book', icon: '✨' },
          { label: 'My Appointments', path: '/customer/appointments', icon: '📋' },
          { label: 'Notifications', path: '/customer/notifications', icon: '🔔' },
          { label: 'My Reviews', path: '/customer/reviews', icon: '★' },
        ];
    }
  };

  const navItems = [
    ...getNavItems(),
    { label: 'My Profile', path: '/profile', icon: '👤' },
  ];

  const getRoleBadgeStyle = () => {
    switch (effectiveRole) {
      case 'ADMIN': return { bg: 'var(--color-error-bg)', color: 'var(--color-error)', border: 'var(--color-error-border)' };
      case 'MANAGER': return { bg: 'var(--color-primary-light)', color: 'var(--color-primary-text)', border: 'var(--color-primary-border)' };
      case 'STAFF': return { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: 'var(--color-warning-border)' };
      case 'PROVIDER': return { bg: 'var(--color-info-bg)', color: 'var(--color-info)', border: 'var(--color-info-border)' };
      default: return { bg: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', border: 'var(--color-border)' };
    }
  };

  const roleStyle = getRoleBadgeStyle();

  return (
    <div className="app-shell animate-page-entrance">
      {/* Top Navigation Header */}
      <header className="app-navbar">
        <div className="flex items-center gap-md">
          <button
            className="mobile-toggle-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation"
          >
            ☰
          </button>
          <Link
            to="/"
            className="navbar-brand"
            onClick={(e) => {
              if (window.location.pathname === '/') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            <span className="brand-icon">⚡</span>
            <span className="brand-title">SmartQueue</span>
          </Link>
        </div>

        <div className="flex items-center gap-md nav-actions-group">
          <OrgSelector />
          <NotificationBell onNewNotification={handleNewNotification} />

          <div className="flex items-center gap-sm user-meta-group">
            <span
              className="status-badge role-badge-pill"
              style={{ backgroundColor: roleStyle.bg, color: roleStyle.color, border: `1px solid ${roleStyle.border}` }}
            >
              {effectiveRole}
            </span>

            <Link
              to="/profile"
              className="flex items-center gap-xs user-info-pill"
              style={{ marginLeft: '0.25rem', textDecoration: 'none', cursor: 'pointer' }}
              title="View Profile"
            >
              <div className="user-avatar-btn" title={user?.email}>
                {getUserInitials()}
              </div>
              <span className="user-name-text" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                {user?.first_name || user?.email?.split('@')[0]}
              </span>
            </Link>

            <button onClick={handleLogout} className="btn btn-outline btn-sm logout-btn" style={{ marginLeft: '0.5rem' }}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Overlay Backdrop */}
      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
      )}

      <div className="app-layout-body">
        {/* Sidebar Navigation */}
        <aside className={`app-sidebar ${mobileMenuOpen ? 'app-sidebar--open' : ''}`}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.05em', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
              Navigation
            </div>
            <nav className="flex flex-col gap-xs">
              {navItems.map((item, idx) => (
                <NavLink
                  key={idx}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.5rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? '#FFFFFF' : 'var(--color-text-main)',
                    backgroundColor: isActive ? 'var(--color-primary)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                  })}
                >
                  <span className="nav-icon-span">{item.icon}</span>
                  <span className="nav-label-span">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          {effectiveRole === 'ADMIN' ? (
            <div className="card active-org-card" style={{ padding: '0.875rem', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', marginTop: '1.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>System Governance</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-main)', marginTop: '0.2rem' }}>All System Tenants</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginTop: '0.1rem', fontWeight: 600 }}>Scope: Global Admin</div>
            </div>
          ) : effectiveRole !== 'CUSTOMER' && currentOrg && (
            <div className="card active-org-card" style={{ padding: '0.875rem', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', marginTop: '1.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Active Organization</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-main)', marginTop: '0.2rem' }}>{currentOrg.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>Role: {currentOrg.role}</div>
            </div>
          )}
        </aside>

        {/* Main Workspace Area */}
        <main className="app-workspace flex-1">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;
