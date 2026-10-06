import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { UserAccountMenu } from './UserAccountMenu';
import '../styles/LandingPage.css';
import '../styles/LandingPhaseOne.css';

export const PublicNavbar = ({ activePage = '' }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const header = useRef(null);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const close = event => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); }
      if (event.type === 'pointerdown' && !header.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close); };
  }, [menuOpen]);
  const anchorClick = (event, anchor) => {
    setMenuOpen(false);
    if (location.pathname !== '/') return;
    event.preventDefault();
    document.querySelector(anchor)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  };
  return <header ref={header} className={`lp-nav lp-phase-one-nav ${scrolled ? 'lp-nav--scrolled' : ''}`}>
    <div className="lp-nav-inner">
      <Link to="/" className="lp-brand" onClick={event => {
        setMenuOpen(false);
        if (location.pathname === '/') { event.preventDefault(); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }
      }}><span className="lp-brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg></span><span className="lp-brand-name">SmartQueue</span></Link>
      <nav id="public-discovery-navigation" aria-label="Public navigation" className={`lp-nav-links ${menuOpen ? 'is-menu-open' : ''}`}>
        <Link to="/organizations" className="lp-nav-link" onClick={() => setMenuOpen(false)}>Organizations</Link>
        <button type="button" className="lp-nav-link lp-nav-coming-soon" aria-disabled="true" title="Professional discovery is coming soon">Professionals <span>Coming soon</span></button>
        <Link to="/search" className="lp-nav-link" onClick={() => setMenuOpen(false)}>Search</Link>
        <Link to="/#how-it-works" className="lp-nav-link" onClick={event => anchorClick(event, '#how-it-works')}>How It Works</Link>
        <Link to="/#why-smartqueue" className="lp-nav-link" onClick={event => anchorClick(event, '#why-smartqueue')}>Why SmartQueue</Link>
        <Link to="/register/manager" className="lp-nav-link" onClick={() => setMenuOpen(false)}>For Organizations</Link>
        <Link to="/contact" className="lp-nav-link" aria-current={activePage === 'contact' ? 'page' : undefined} onClick={() => setMenuOpen(false)}>Contact Us</Link>
      </nav>
      <div className="lp-nav-cta"><ThemeToggle />{user ? <UserAccountMenu /> : <><Link to="/login" className="lp-btn-ghost lp-nav-sign-in">Sign in</Link><Link to="/register" className="lp-btn-primary lp-nav-get-started">Get Started</Link></>}
        <button ref={menuButton} type="button" className="lp-public-menu-button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-controls="public-discovery-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(old => !old)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{menuOpen ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg></button>
      </div>
    </div>
  </header>;
};
export default PublicNavbar;
