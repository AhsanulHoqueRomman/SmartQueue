import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';
import { OrgSelector } from './OrgSelector';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';
import { UserAccountMenu } from './UserAccountMenu';
import { useToast } from '../contexts/ToastContext';
import '../styles/AppShell.css';

const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" /></>,
  queue: <><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  services: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12c5 3 13 3 18 0M12 12v4" /></>,
  provider: <><circle cx="10" cy="7" r="4" /><path d="M3 21v-2a7 7 0 0 1 11-5M19 14v6M16 17h6" /></>,
  people: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 4a4 4 0 0 1 0 8M22 21v-2a7 7 0 0 0-4-6" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  chart: <path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8" />,
  audit: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 12h6M9 17h4" /></>,
  organization: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21v-5h6v5M8 7h1M15 7h1M8 11h1M15 11h1" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  book: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18M12 14v4M10 16h4" /></>,
  bookmark: <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4-6 4Z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  brand: <path d="m13 2-10 12h8l-1 8 11-13h-8l1-7Z" />,
};

function ShellIcon({ name }) {
  return <svg className="qt-shell__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>;
}

const item = (label, path, icon) => ({ label, path, icon });
const navigation = {
  ADMIN: [item('System Overview', '/admin/dashboard', 'dashboard'), item('Organizations', '/admin/organizations', 'organization'), item('Platform Users', '/admin/users', 'people'), item('Contact Messages', '/admin/contact', 'services'), item('My Profile', '/profile', 'profile')],
  MANAGER: [item('Dashboard', '/manager/dashboard', 'dashboard'), item('Appointments', '/manager/appointments', 'calendar'), item('Live Queue', '/manager/queue', 'queue'), item('Services Catalog', '/manager/services', 'services'), item('Provider Roster', '/manager/providers', 'provider'), item('Members & Roles', '/manager/members', 'people'), item('Staff Management', '/manager/staff', 'people'), item('Reviews Summary', '/manager/reviews', 'star'), item('Analytics', '/manager/analytics', 'chart'), item('Audit Logs', '/manager/audit', 'audit'), item('Org Settings', '/manager/settings', 'organization'), item('My Profile', '/profile', 'profile')],
  STAFF: [item('Dashboard', '/staff/dashboard', 'dashboard'), item('Appointments', '/staff/appointments', 'calendar'), item('Queue Monitor', '/staff/queue', 'queue'), item('Customer Roster', '/staff/customers', 'people'), item('Provider Directory', '/staff/providers', 'provider'), item('Services', '/staff/services', 'services'), item('Notifications', '/staff/notifications', 'bell'), item('My Profile', '/profile', 'profile')],
  PROVIDER: [item('Dashboard', '/provider/dashboard', 'dashboard'), item('My Appointments', '/provider/appointments', 'calendar'), item('Live Queue', '/provider/queue', 'queue'), item('My Services', '/provider/services', 'services'), item('My Schedule', '/provider/schedule', 'calendar'), item('Patient Reviews', '/provider/reviews', 'star'), item('My Profile', '/profile', 'profile')],
  CUSTOMER: [item('Dashboard', '/customer/dashboard', 'dashboard'), item('Book Appointment', '/customer/book', 'book'), item('My Appointments', '/customer/appointments', 'calendar'), item('Notifications', '/customer/notifications', 'bell'), item('My Reviews', '/customer/reviews', 'star'), item('Saved Clinics', '/customer/saved-clinics', 'bookmark')],
};

export const AppShell = ({ children }) => {
  const { effectiveRole, currentOrg } = useTenant();
  const { showInfo } = useToast();
  const location = useLocation();
  const navigationScope = `${location.key}:${effectiveRole}:${currentOrg?.id ?? ''}`;
  const [menuState, setMenuState] = useState({ scope: navigationScope, open: false });
  // Discard an open drawer before committing a different route, role or tenant.
  // Returning to a previous scope must not resurrect its open state.
  if (menuState.scope !== navigationScope) setMenuState({ scope: navigationScope, open: false });
  const mobileMenuOpen = menuState.scope === navigationScope && menuState.open;
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const trigger = useRef(null);
  const drawer = useRef(null);
  const shell = useRef(null);
  const header = useRef(null);
  const drawerId = useId();
  const drawerTitleId = useId();
  const navItems = navigation[effectiveRole] || navigation.CUSTOMER;

  useLayoutEffect(() => {
    const measure = () => shell.current?.style.setProperty('--qt-shell-header-height', `${header.current.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => { setIsMobile(media.matches); setMenuState(previous => ({ ...previous, open: false })); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    if (!isMobile || !mobileMenuOpen) return;
    const dialog = drawer.current;
    const returnTarget = trigger.current;
    const body = document.body;
    const root = document.documentElement;
    const previous = { bodyOverflow: body.style.overflow, rootOverflow: root.style.overflow, padding: body.style.paddingRight };
    const gutter = window.innerWidth - root.clientWidth;
    if (gutter > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gutter}px`;
    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    // Native modality contains focus and makes the rest of the document inert,
    // including portalled content. A closed dialog has no tabbable descendants.
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      body.style.overflow = previous.bodyOverflow;
      root.style.overflow = previous.rootOverflow;
      body.style.paddingRight = previous.padding;
      if (returnTarget?.isConnected && window.matchMedia('(max-width: 767px)').matches) returnTarget.focus({ preventScroll: true });
    };
  }, [isMobile, mobileMenuOpen]);

  const handleNewNotification = n => showInfo(`${n.title}: ${n.message}`);
  const closeMenu = () => setMenuState({ scope: navigationScope, open: false });
  const containDrawerTab = event => {
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll('button:not([disabled]), a[href]');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };
  const sidebarContent = <>
    <div className="qt-shell__nav-heading">Workspace</div>
    <nav className="qt-shell__navigation" aria-label={`${effectiveRole || 'Customer'} workspace`}>
      {navItems.map(navItem => <NavLink key={navItem.path} to={navItem.path} onClick={closeMenu} className={({ isActive }) => `qt-shell__nav-link${isActive ? ' is-active' : ''}`}>
        <ShellIcon name={navItem.icon} /><span>{navItem.label}</span>
      </NavLink>)}
    </nav>
    {effectiveRole === 'ADMIN' ? <div className="qt-shell__context">
      <span className="qt-shell__context-label">System Governance</span>
      <strong>All System Tenants</strong><span>Scope: Global Admin</span>
    </div> : effectiveRole !== 'CUSTOMER' && currentOrg && <div className="qt-shell__context">
      <span className="qt-shell__context-label">Active Organization</span>
      <strong>{currentOrg.name}</strong><span>Role: {currentOrg.role}</span>
    </div>}
  </>;

  return <div ref={shell} className="app-shell qt-shell">
    <header ref={header} className="qt-shell__topbar">
      <div className="qt-shell__identity">
        <button ref={trigger} type="button" className="qt-shell__menu-button" aria-label="Open navigation" aria-expanded={isMobile && mobileMenuOpen} aria-controls={isMobile ? drawerId : undefined} aria-haspopup="dialog" onClick={() => setMenuState({ scope: navigationScope, open: true })}>
          <ShellIcon name="menu" />
        </button>
        <Link to="/" className="qt-shell__brand"><span className="qt-shell__brand-mark"><ShellIcon name="brand" /></span><span>QueueTurn</span></Link>
      </div>
      <div className="qt-shell__controls">
        <div className="qt-shell__tenant"><OrgSelector /></div>
        <div className="qt-shell__account-controls">
          <ThemeToggle />
          <NotificationBell onNewNotification={handleNewNotification} />
          <span className="qt-shell__role">{effectiveRole}</span>
          <UserAccountMenu />
        </div>
      </div>
    </header>
    <div className="app-layout-body qt-shell__body">
      {!isMobile && <aside className="qt-shell__sidebar">{sidebarContent}</aside>}
      <main className="app-workspace qt-shell__workspace">{children}</main>
    </div>
    {isMobile && <dialog ref={drawer} id={drawerId} className="qt-shell__drawer" aria-labelledby={drawerTitleId} onKeyDown={containDrawerTab} onCancel={event => { event.preventDefault(); closeMenu(); }} onClose={event => { if (!event.currentTarget.open) closeMenu(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMenu();
    }}>
      <div className="qt-shell__drawer-heading"><h2 id={drawerTitleId}>Navigation</h2><button type="button" className="qt-shell__close-button" aria-label="Close navigation" onClick={closeMenu} autoFocus><ShellIcon name="close" /></button></div>
      <div className="qt-shell__drawer-content">{sidebarContent}</div>
    </dialog>}
  </div>;
};

export default AppShell;
