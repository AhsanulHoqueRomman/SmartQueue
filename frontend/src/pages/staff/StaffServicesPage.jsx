import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function StaffServicesPage() {
  const { currentOrg } = useTenant();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentOrg?.id) return;
    let isMounted = true;
    setLoading(true);

    organizationService
      .getServices(currentOrg.id)
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        setServices(list);
      })
      .catch((err) => {
        if (isMounted) setError('Failed to load services.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id]);

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to view services." />;
  }

  if (loading) {
    return <LoadingState message="Fetching active services list..." />;
  }

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          ⚙️ Services Catalog
        </div>
        <h1 style={{ fontSize: '1.75rem', color: 'var(--lp-text)', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
          Facility Services & Pricing
        </h1>
        <p style={{ color: 'var(--lp-text-subtle)', margin: 0, fontSize: '0.95rem' }}>
          Service offerings, session durations, and fee rates at <strong style={{ color: 'var(--lp-text)' }}>{currentOrg.name}</strong>.
        </p>
      </div>

      {error ? (
        <div style={{ padding: '1rem', background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : services.length === 0 ? (
        <EmptyState title="No Services Found" message="No active service offerings configured for this facility." />
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
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-warning)' }}>
                    ${parseFloat(svc.price || 0).toFixed(2)}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--lp-text)', marginBottom: '0.35rem' }}>
                  {svc.name}
                </h3>

                <p style={{ color: 'var(--lp-text-subtle)', fontSize: '0.85rem', lineHeight: 1.4, margin: '0 0 1rem 0' }}>
                  {svc.description || 'Standard outpatient service consultation and care.'}
                </p>
              </div>

              <div style={{ padding: '0.65rem 0.85rem', background: 'var(--lp-bg-subtle)', borderRadius: '8px', border: '1px solid var(--lp-border)', fontSize: '0.85rem', color: 'var(--lp-text)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                <span>Duration:</span>
                <span>{svc.duration_minutes || 30} minutes</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default StaffServicesPage;
