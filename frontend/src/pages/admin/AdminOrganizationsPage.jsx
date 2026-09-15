import React, { useState, useEffect } from 'react';
import organizationService from '../../services/organizationService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../contexts/ToastContext';

export function AdminOrganizationsPage() {
  const { showSuccess } = useToast();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState({
    name: '',
    slug: '',
    contact_email: '',
    phone_number: '',
    address: '',
  });
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showCreateModal) {
        setShowCreateModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal]);

  const fetchOrgs = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await organizationService.getOrganizations();
      const list = Array.isArray(data) ? data : data.results || [];
      setOrganizations(list);
    } catch (err) {
      setError('Failed to fetch system organizations roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setCreating(true);
    setModalError('');

    try {
      await organizationService.createOrganization(newOrgForm);
      showSuccess(`Organization "${newOrgForm.name}" created successfully!`);
      setShowCreateModal(false);
      setNewOrgForm({ name: '', slug: '', contact_email: '', phone_number: '', address: '' });
      fetchOrgs();
    } catch (err) {
      const respErr = err.response?.data;
      if (respErr && typeof respErr === 'object') {
        const msg = Object.entries(respErr)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join(' | ');
        setModalError(msg || 'Failed to create organization.');
      } else {
        setModalError('Failed to create organization.');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1150px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            ⚡ System Admin Console
          </div>
          <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
            All Organizations Roster
          </h1>
          <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
            System-wide platform organization tenants and partner facilities.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '0.75rem 1.25rem',
            background: '#2F2520',
            color: '#FAF8F3',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          ➕ Register New Organization
        </button>
      </div>

      {loading ? (
        <LoadingState message="Fetching system-wide organization tenants..." />
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : organizations.length === 0 ? (
        <EmptyState title="No Organizations Found" message="No organization tenants exist in the SmartQueue platform database." />
      ) : (
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#FAF8F3', borderBottom: '1px solid #E6E1D9', color: '#78716C', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Facility Name</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>URL Slug</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Category</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Contact Info</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} style={{ borderBottom: '1px solid #FAF8F3' }}>
                    <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: '#211C19' }}>
                      🏢 {org.name}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', fontFamily: 'monospace', color: '#5F7A70' }}>
                      {org.slug}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#211C19', fontWeight: 500 }}>
                      {org.category || 'HEALTHCARE'}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#78716C', fontSize: '0.85rem' }}>
                      <div>{org.contact_email || 'No Email'}</div>
                      <div>{org.phone_number || ''}</div>
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem' }}>
                      <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: org.is_active ? 'rgba(95, 122, 112, 0.15)' : '#FEF2F2', color: org.is_active ? '#5F7A70' : '#DC2626' }}>
                        {org.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div onClick={() => setShowCreateModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(33, 28, 25, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000, backdropFilter: 'blur(3px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E6E1D9', padding: '1.75rem', width: '100%', maxWidth: '500px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#211C19' }}>Register New Organization Tenant</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            {modalError && (
              <div style={{ padding: '0.75rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleCreateOrg}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Facility Name *</label>
                <input
                  type="text"
                  required
                  value={newOrgForm.name}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-') })}
                  placeholder="Metro Care Hospital"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>URL Slug *</label>
                <input
                  type="text"
                  required
                  value={newOrgForm.slug}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, slug: e.target.value })}
                  placeholder="metro-care"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Contact Email</label>
                <input
                  type="email"
                  value={newOrgForm.contact_email}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, contact_email: e.target.value })}
                  placeholder="admin@metrocare.com"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Phone Number</label>
                <input
                  type="text"
                  value={newOrgForm.phone_number}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, phone_number: e.target.value })}
                  placeholder="+1 555-0192"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '0.65rem 1.25rem', background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{ padding: '0.65rem 1.25rem', background: '#2F2520', color: '#FAF8F3', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {creating ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminOrganizationsPage;
