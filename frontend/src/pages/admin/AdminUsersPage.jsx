import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import LoadingState from '../../components/LoadingState';

export function AdminUsersPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          ⚡ Platform Administration
        </div>
        <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
          Platform User Roster & Security
        </h1>
        <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
          System-wide user identity and role assignment overview.
        </p>
      </div>

      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '16px',
          padding: '1.75rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #FAF8F3' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#2F2520', color: '#FAF8F3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>
            👑
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#211C19' }}>System Superuser: {user?.email}</h3>
            <div style={{ fontSize: '0.85rem', color: '#5F7A70', fontWeight: 600 }}>Active Platform Administrator</div>
          </div>
        </div>

        <p style={{ color: '#78716C', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
          The backend enforces tenant isolation across organization memberships (`UserMembership`). Organization Managers manage organization-scoped user roles from their respective <strong>Members & Roles</strong> management portal.
        </p>
      </div>
    </div>
  );
}

export default AdminUsersPage;
