import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export function AdminUsersPage() {
  const { user } = useAuth();

  return (
    <div className="app-container animate-page-entrance">
      <div style={{ marginBottom: '1.75rem' }}>
        <span className="badge badge-danger" style={{ marginBottom: '0.4rem' }}>
          ⚡ Platform Administration
        </span>
        <h1 style={{ marginTop: '0.25rem' }}>
          Platform User Roster & Security
        </h1>
        <p className="subtitle" style={{ marginTop: '0.25rem' }}>
          System-wide user identity and role assignment overview.
        </p>
      </div>

      <div
        className="card"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          padding: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--lp-accent)', color: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>
            👑
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>System Superuser: {user?.email}</h3>
            <div className="text-xs font-semibold" style={{ color: 'var(--lp-accent)' }}>Active Platform Administrator</div>
          </div>
        </div>

        <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
          The backend enforces tenant isolation across organization memberships (`UserMembership`). Organization Managers manage organization-scoped user roles from their respective <strong>Members & Roles</strong> management portal.
        </p>
      </div>
    </div>
  );
}

export default AdminUsersPage;
