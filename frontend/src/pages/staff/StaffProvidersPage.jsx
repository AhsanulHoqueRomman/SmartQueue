import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function StaffProvidersPage() {
  const { currentOrg } = useTenant();

  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentOrg?.id) return;
    let isMounted = true;
    setLoading(true);

    organizationService
      .getProviders(currentOrg.id)
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        setProviders(list);
      })
      .catch((err) => {
        if (isMounted) setError('Failed to load provider directory.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id]);

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to view active providers." />;
  }

  if (loading) {
    return <LoadingState message="Fetching provider roster..." />;
  }

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          🩺 Specialist Directory
        </div>
        <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
          Provider Roster
        </h1>
        <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
          Active care providers and clinical specialists at <strong>{currentOrg.name}</strong>.
        </p>
      </div>

      {error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : providers.length === 0 ? (
        <EmptyState title="No Providers Found" message="No active provider profiles configured for this facility." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {providers.map((p) => (
            <div
              key={p.id}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E6E1D9',
                borderRadius: '16px',
                padding: '1.5rem',
                boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ background: '#FAF8F3', color: '#5F7A70', border: '1px solid #E6E1D9', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  {p.is_active ? '● Active Specialist' : '○ Inactive'}
                </span>
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#211C19', marginBottom: '0.25rem' }}>
                🩺 {p.user_name || 'Provider Profile'}
              </h3>
              <div style={{ fontSize: '0.85rem', color: '#5F7A70', fontWeight: 600, marginBottom: '0.75rem' }}>
                {p.title || 'General Practitioner'}
              </div>

              <p style={{ color: '#78716C', fontSize: '0.85rem', margin: 0 }}>
                {p.bio || 'Dedicated healthcare specialist providing consultations and outpatient care.'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default StaffProvidersPage;
