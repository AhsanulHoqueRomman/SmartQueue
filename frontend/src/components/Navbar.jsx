import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getApiDocsUrl } from '../api/client';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <nav className="navbar">
      <Link to="/" className="brand-logo">
        ⚡ SmartQueue <span className="brand-badge">v1.0</span>
      </Link>

      <div className="nav-links">
        <a
          href={getApiDocsUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="nav-link"
          style={{ textDecoration: 'none', color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontWeight: 600, marginRight: '0.5rem' }}
        >
          API Docs
        </a>
        {isAuthenticated ? (
          <>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {user?.email}
            </span>
            <button onClick={logout} className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">
              Sign In
            </Link>
            <Link to="/register" className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};
