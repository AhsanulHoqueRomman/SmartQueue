import React from 'react';
import { Link } from 'react-router-dom';

export function AuthFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="auth-minimal-footer" aria-label="QueueTurn authentication footer">
      <div className="auth-minimal-footer__inner">
        <span className="auth-minimal-footer__copy">
          © {currentYear} QueueTurn. All rights reserved.
        </span>
        <span className="auth-minimal-footer__sep" aria-hidden="true">·</span>
        <Link to="/" className="auth-minimal-footer__link">
          Home
        </Link>
        <span className="auth-minimal-footer__sep" aria-hidden="true">·</span>
        <Link to="/contact" className="auth-minimal-footer__link">
          Help &amp; Support
        </Link>
      </div>
    </footer>
  );
}

export default AuthFooter;
