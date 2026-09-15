import React from 'react';
import { useTenant } from '../contexts/TenantContext';

export const OrgSelector = () => {
  const { memberships, selectedOrgId, setSelectedOrgId, effectiveRole, currentOrg } = useTenant();

  if (effectiveRole === 'ADMIN') {
    return (
      <div className="org-selector-pill">
        <span>🌐</span>
        <span>Global Admin</span>
      </div>
    );
  }

  if (effectiveRole === 'CUSTOMER' || memberships.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-xs">
      <label htmlFor="org-select" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
        Tenant:
      </label>
      <select
        id="org-select"
        className="form-control"
        value={selectedOrgId || ''}
        onChange={(e) => setSelectedOrgId(e.target.value)}
        style={{ padding: '0.35rem 0.65rem', fontSize: '0.8125rem', minWidth: '160px', fontWeight: 600 }}
      >
        {memberships.map((m) => (
          <option key={m.id} value={m.organization_id}>
            {m.organization_name} ({m.role})
          </option>
        ))}
      </select>
    </div>
  );
};

export default OrgSelector;
