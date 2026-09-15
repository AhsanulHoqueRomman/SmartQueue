import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import managerService from '../../services/managerService';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { StatCard } from '../../components/StatCard';

export const ManagerDashboard = () => {
  const { user } = useAuth();
  const { currentOrg, effectiveRole } = useTenant();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    servicesCount: 0,
    providersCount: 0,
    membersCount: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentOrg?.id) return;
    let isMounted = true;
    setLoading(true);

    Promise.all([
      managerService.getServices(currentOrg.id),
      managerService.getProviders(currentOrg.id),
      managerService.getMembers(currentOrg.id),
    ])
      .then(([svcData, provData, memData]) => {
        if (!isMounted) return;
        const svcList = Array.isArray(svcData) ? svcData : svcData.results || [];
        const provList = Array.isArray(provData) ? provData : provData.results || [];
        const memList = Array.isArray(memData) ? memData : memData.results || [];

        setStats({
          servicesCount: svcList.length,
          providersCount: provList.length,
          membersCount: memList.length,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id]);

  return (
    <div className="app-container animate-page-entrance">
      <div className="card" style={{ marginBottom: '1.75rem', backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex justify-between items-center flex-wrap gap-md">
          <div>
            <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Manager Command Portal</span>
            <h1 style={{ marginTop: '0.25rem' }}>Welcome, {user?.first_name || user?.email}!</h1>
            <p className="subtitle" style={{ marginTop: '0.25rem' }}>
              Full administrative control for <strong>{currentOrg?.name || 'SmartQueue'}</strong>.
            </p>
          </div>
          <div className="flex gap-sm flex-wrap">
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/manager/services')}>
              ⚙️ Services
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/manager/providers')}>
              🩺 Providers
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/manager/analytics')}>
              📈 Analytics
            </button>
          </div>
        </div>
      </div>

      {!currentOrg ? (
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the top selector to access manager tools."
        />
      ) : loading ? (
        <LoadingState type="skeleton-card" rows={3} />
      ) : (
        <>
          <div className="grid-responsive grid-cols-3 animate-section stagger-1" style={{ marginBottom: '1.75rem' }}>
            <StatCard
              title="Active Services"
              value={stats.servicesCount}
              icon="💼"
              subtitle="Configured service offerings"
              color="primary"
            />
            <StatCard
              title="Provider Roster"
              value={stats.providersCount}
              icon="🩺"
              subtitle="Active provider profiles"
              color="secondary"
            />
            <StatCard
              title="Organization Members"
              value={stats.membersCount}
              icon="👥"
              subtitle="Staff & manager users"
              color="info"
            />
          </div>

          <div className="grid-responsive grid-cols-2 animate-section stagger-2">
            <div className="card card-hover flex flex-col justify-between">
              <div>
                <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}>Service Catalog</span>
                <h3>Manage Service Portfolio</h3>
                <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                  Create, edit, or archive organization services, durations, and pricing rules.
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => navigate('/manager/services')} style={{ marginTop: '1.5rem' }}>
                Open Services Catalog &rarr;
              </button>
            </div>

            <div className="card card-hover flex flex-col justify-between">
              <div>
                <span className="badge badge-neutral" style={{ marginBottom: '0.5rem' }}>Roster & Roles</span>
                <h3>Provider Roster & Members</h3>
                <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                  Assign providers, configure provider service offerings, and grant role permissions.
                </p>
              </div>
              <div className="flex gap-sm" style={{ marginTop: '1.5rem' }}>
                <button className="btn btn-secondary" onClick={() => navigate('/manager/providers')} style={{ flex: 1 }}>
                  Providers Roster
                </button>
                <button className="btn btn-outline" onClick={() => navigate('/manager/members')} style={{ flex: 1 }}>
                  Members Roles
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ManagerDashboard;
