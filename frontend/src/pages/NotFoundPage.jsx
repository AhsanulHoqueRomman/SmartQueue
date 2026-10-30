import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicNavbar } from '../components/PublicNavbar';
import PublicFooter from '../components/PublicFooter';
import '../styles/NotFoundPage.css';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="notfound-page">
      <PublicNavbar />
      <main className="notfound-page__main animate-page-entrance">
        <div className="notfound-card">
          <div className="notfound-card__code" aria-hidden="true">
            404
          </div>
          <div className="notfound-card__badge">
            <span aria-hidden="true">🔍</span> Destination Not Found
          </div>
          <h1 className="notfound-card__title">
            Page Not Found
          </h1>
          <p className="notfound-card__message">
            The page or service address you are looking for does not exist, has been relocated, or is temporarily unavailable.
          </p>

          <div className="notfound-card__actions">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="notfound-card__btn-primary"
            >
              Return to Home
            </button>
            <Link
              to="/login"
              className="notfound-card__btn-secondary"
            >
              Sign In to Account
            </Link>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
};

export default NotFoundPage;
