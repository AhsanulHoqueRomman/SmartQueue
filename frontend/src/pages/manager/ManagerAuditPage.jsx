import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

export function ManagerAuditPage() {
  const { currentOrg } = useTenant();

  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentOrg?.id) return;
    setLoading(true);

    managerService
      .getAuditLogs(currentOrg.id)
      .then((data) => {
        const list = Array.isArray(data) ? data : data.results || [];
        setAuditLogs(list);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to load audit logs.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentOrg?.id]);

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the top selector."
      />
    );
  }

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Compliance & Audit Logs</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Append-only operational action history for {currentOrg.name}.</p>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ padding: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      <div className="card animate-section stagger-1">
        {loading ? (
          <LoadingState type="skeleton-table" rows={5} cols={5} />
        ) : auditLogs.length === 0 ? (
          <EmptyState
            title="No Audit Logs Recorded"
            message="No administrative actions or audit events recorded for this organization yet."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor Email</th>
                  <th>Action Event</th>
                  <th>Target Resource</th>
                  <th>Resource ID</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-muted text-sm">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="font-semibold">{log.actor_email || log.actor || 'System'}</td>
                    <td>
                      <span className="badge badge-info">{log.action}</span>
                    </td>
                    <td>{log.resource_type || 'N/A'}</td>
                    <td className="text-xs text-muted">#{log.resource_id ? String(log.resource_id).slice(0, 8) : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ManagerAuditPage;
