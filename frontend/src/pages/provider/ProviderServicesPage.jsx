import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function ProviderServicesPage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  const [providerProfile, setProviderProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) return;
    let isMounted = true;
    setLoading(true);

    Promise.all([
      organizationService.getProviders(currentOrg.id),
      organizationService.getServices(currentOrg.id),
    ])
      .then(([provsData, svcsData]) => {
        if (!isMounted) return;
        const provList = Array.isArray(provsData) ? provsData : provsData.results || [];
        const myProfile = provList.find((p) => p.user_id === user.id);
        setProviderProfile(myProfile || null);

        const svcList = Array.isArray(svcsData) ? svcsData : svcsData.results || [];
        setServices(svcList);
      })
      .catch((err) => {
        if (isMounted) setError('Failed to load services list.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id, user?.id]);

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to view your offered services." />;
  }

  if (loading) {
    return <LoadingState message="Fetching assigned service offerings..." />;
  }

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '950px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          ⚙️ Service Offerings Catalog
        </div>
        <h1 style={{ fontSize: '1.75rem', color: 'var(--lp-text)', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
          My Services & Offerings
        </h1>
        <p style={{ color: 'var(--lp-text-subtle)', margin: 0, fontSize: '0.95rem' }}>
          Active clinical and consultation service capabilities configured at <strong style={{ color: 'var(--lp-text)' }}>{currentOrg.name}</strong>.
        </p>
      </div>

      {error ? (
        <div style={{ padding: '1rem', background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : services.length === 0 ? (
        <EmptyState title="No Services Configured" message="No active services have been assigned to your provider profile yet." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {services.map((svc) => (
            <div
              key={svc.id}
              style={{
                background: 'var(--lp-surface)',
                border: '1px solid var(--lp-border)',
                borderRadius: '16px',
                padding: '1.5rem',
                boxShadow: 'var(--lp-shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ background: 'var(--lp-bg-subtle)', color: 'var(--lp-accent)', border: '1px solid var(--lp-border)', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                    {svc.is_active ? '● Active Offering' : '○ Inactive'}
                  </span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                    ${parseFloat(svc.price || 0).toFixed(2)}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  {svc.name}
                </h3>

                <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.85rem', lineHeight: 1.4, margin: '0 0 1rem 0' }}>
                  {svc.description || 'Professional patient consultation and treatment session.'}
                </p>
              </div>

              <div style={{ padding: '0.65rem 0.85rem', background: 'var(--lp-bg-subtle)', borderRadius: '8px', border: '1px solid var(--lp-border)', fontSize: '0.85rem', color: 'var(--lp-text)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                <span>⏱ Duration:</span>
                <span>{svc.duration_minutes || 30} minutes</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProviderServicesPage;
