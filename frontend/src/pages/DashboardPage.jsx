import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export const DashboardPage = () => {
  const { user, logout } = useAuth();

  return (
    <div className="app-container">
      <div className="dashboard-card">
        <h1 className="auth-title">Dashboard Placeholder</h1>
        <p className="auth-subtitle">
          M9 React Foundation Authentication Verification Page
        </p>

        <div className="user-details-grid">
          <div className="detail-item">
            <div className="detail-label">User ID</div>
            <div className="detail-value">{user?.id ?? 'N/A'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Email</div>
            <div className="detail-value">{user?.email ?? 'N/A'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">First Name</div>
            <div className="detail-value">{user?.first_name || '(None)'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Last Name</div>
            <div className="detail-value">{user?.last_name || '(None)'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Phone Number</div>
            <div className="detail-value">{user?.phone_number || '(None)'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Date Joined</div>
            <div className="detail-value">
              {user?.date_joined ? new Date(user.date_joined).toLocaleDateString() : 'N/A'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button onClick={logout} className="btn btn-outline">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
