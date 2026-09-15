import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function ManagerSettingsPage() {
  const { currentOrg, refreshOrganizations } = useTenant();

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    contact_email: '',
    phone_number: '',
    address: '',
    is_active: true,
  });
  const [orgDetails, setOrgDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  const loadDetails = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError('');
    try {
      const data = await organizationService.getOrganizationDetail(currentOrg.id);
      setOrgDetails(data);
      setFormData({
        name: data.name || '',
        slug: data.slug || '',
        contact_email: data.contact_email || '',
        phone_number: data.phone_number || '',
        address: data.address || '',
        is_active: data.is_active ?? true,
      });
    } catch (err) {
      setError('Failed to load organization settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [currentOrg?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentOrg?.id) return;

    setSaving(true);
    setSuccessMsg('');
    setError('');

    try {
      const updated = await organizationService.updateOrganization(currentOrg.id, formData);
      setOrgDetails(updated);
      setSuccessMsg('Organization profile updated successfully!');
      if (refreshOrganizations) refreshOrganizations();
    } catch (err) {
      const respErr = err.response?.data;
      if (respErr && typeof respErr === 'object') {
        const msg = Object.entries(respErr)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join(' | ');
        setError(msg || 'Failed to update organization profile.');
      } else {
        setError('Failed to update organization profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to manage settings." />;
  }

  if (loading) {
    return <LoadingState message="Loading organization settings..." />;
  }

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          🏢 Organization Administration
        </div>
        <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
          Organization Settings & Profile
        </h1>
        <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
          Manage clinic parameters, contact information, and operating status for <strong>{orgDetails?.name}</strong>.
        </p>
      </div>

      {/* Organization Overview Statistics Banner */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '1.75rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#211C19', fontWeight: 700 }}>
          Facility Summary Overview
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Status</div>
            <div style={{ fontWeight: 700, color: orgDetails?.is_active ? '#5F7A70' : '#B91C1C', marginTop: '0.2rem' }}>
              {orgDetails?.is_active ? '● Active Partner' : '○ Inactive / Suspended'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Services Offered</div>
            <div style={{ fontWeight: 700, color: '#211C19', marginTop: '0.2rem', fontSize: '1.1rem' }}>
              {orgDetails?.services_count ?? 0} Services
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Active Providers</div>
            <div style={{ fontWeight: 700, color: '#211C19', marginTop: '0.2rem', fontSize: '1.1rem' }}>
              {orgDetails?.providers_count ?? 0} Providers
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#78716C', textTransform: 'uppercase', fontWeight: 600 }}>Patient Rating</div>
            <div style={{ fontWeight: 700, color: '#B06D2E', marginTop: '0.2rem', fontSize: '1.1rem' }}>
              ★ {orgDetails?.rating ? parseFloat(orgDetails.rating).toFixed(1) : '4.9'} ({orgDetails?.reviews_count ?? 0} reviews)
            </div>
          </div>
        </div>
      </div>

      {/* Edit Organization Form */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '16px',
          padding: '1.75rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
        }}
      >
        <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.2rem', color: '#211C19', fontWeight: 700, paddingBottom: '0.75rem', borderBottom: '1px solid #FAF8F3' }}>
          Edit Organization Information
        </h3>

        {successMsg && (
          <div style={{ padding: '0.85rem 1rem', background: 'rgba(95, 122, 112, 0.1)', border: '1px solid #5F7A70', color: '#5F7A70', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.9rem', fontWeight: 600 }}>
            ✓ {successMsg}
          </div>
        )}

        {error && (
          <div style={{ padding: '0.85rem 1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                Organization Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                URL Slug (Unique Key) *
              </label>
              <input
                type="text"
                required
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                Contact Email
              </label>
              <input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="contact@clinic.com"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
                Phone Number
              </label>
              <input
                type="text"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="+1 (555) 123-4567"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#211C19', marginBottom: '0.35rem' }}>
              Physical Address / Location
            </label>
            <textarea
              rows={3}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Full street address, suite, city, state, zip..."
              style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.95rem', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.75rem' }}>
            <input
              type="checkbox"
              id="is_active_check"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              style={{ width: '18px', height: '18px', accentColor: '#5F7A70', cursor: 'pointer' }}
            />
            <label htmlFor="is_active_check" style={{ fontSize: '0.9rem', color: '#211C19', cursor: 'pointer', fontWeight: 500 }}>
              Facility Active (Visible for customer bookings and search)
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.75rem 2rem',
              background: '#2F2520',
              color: '#FAF8F3',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving Profile...' : 'Save Organization Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ManagerSettingsPage;
