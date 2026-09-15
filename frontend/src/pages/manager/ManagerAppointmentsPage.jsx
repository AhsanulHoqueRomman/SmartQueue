import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import organizationService from '../../services/organizationService';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function ManagerAppointmentsPage() {
  const { currentOrg } = useTenant();

  const [appointments, setAppointments] = useState([]);
  const [providers, setProviders] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [providerFilter, setProviderFilter] = useState('ALL');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Detail Modal
  const [selectedAppt, setSelectedAppt] = useState(null);

  const fetchFiltersAndAppointments = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError('');

    try {
      const [apptsRes, provsRes, svcsRes] = await Promise.allSettled([
        appointmentService.getAppointments(currentOrg.id),
        organizationService.getProviders(currentOrg.id),
        organizationService.getServices(currentOrg.id),
      ]);

      if (apptsRes.status === 'fulfilled') {
        const list = Array.isArray(apptsRes.value) ? apptsRes.value : apptsRes.value.results || [];
        setAppointments(list);
      }
      if (provsRes.status === 'fulfilled') {
        const list = Array.isArray(provsRes.value) ? provsRes.value : provsRes.value.results || [];
        setProviders(list);
      }
      if (svcsRes.status === 'fulfilled') {
        const list = Array.isArray(svcsRes.value) ? svcsRes.value : svcsRes.value.results || [];
        setServices(list);
      }
    } catch (err) {
      setError('Failed to load appointments roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiltersAndAppointments();
  }, [currentOrg?.id]);

  const filteredAppointments = appointments.filter((appt) => {
    if (statusFilter !== 'ALL' && appt.status !== statusFilter) return false;
    if (providerFilter !== 'ALL' && String(appt.provider) !== String(providerFilter) && String(appt.provider_id) !== String(providerFilter)) return false;
    if (serviceFilter !== 'ALL' && String(appt.service) !== String(serviceFilter) && String(appt.service_id) !== String(serviceFilter)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const custName = (appt.customer_name || appt.customer_email || '').toLowerCase();
      const svcName = (appt.service_name || '').toLowerCase();
      const provName = (appt.provider_name || '').toLowerCase();
      const idStr = String(appt.id).toLowerCase();
      if (!custName.includes(q) && !svcName.includes(q) && !provName.includes(q) && !idStr.includes(q)) {
        return false;
      }
    }

    return true;
  });

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to manage appointments." />;
  }

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1150px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            📅 Operational Desk
          </div>
          <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
            Appointments Roster
          </h1>
          <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
            View and search all patient appointment bookings across <strong>{currentOrg.name}</strong>.
          </p>
        </div>

        <button
          onClick={fetchFiltersAndAppointments}
          style={{
            padding: '0.65rem 1.25rem',
            background: '#FFFFFF',
            border: '1px solid #E6E1D9',
            borderRadius: '8px',
            color: '#211C19',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🔄 Refresh Roster
        </button>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E6E1D9',
          borderRadius: '16px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 4px 16px rgba(47, 37, 32, 0.03)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          alignItems: 'end',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Search Patient / Service
          </label>
          <input
            type="text"
            placeholder="Name, email, service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.9rem' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.9rem', cursor: 'pointer' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="PENDING">PENDING</option>
            <option value="CHECKED_IN">CHECKED_IN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="NO_SHOW">NO_SHOW</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Provider Filter
          </label>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.9rem', cursor: 'pointer' }}
          >
            <option value="ALL">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.user_name || p.title || p.id}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#78716C', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Service Filter
          </label>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FAF8F3', fontSize: '0.9rem', cursor: 'pointer' }}
          >
            <option value="ALL">All Services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Fetching appointment records..." />
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          title="No Appointments Found"
          message="No appointment records match the selected filter criteria."
        />
      ) : (
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E6E1D9',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#FAF8F3', borderBottom: '1px solid #E6E1D9', color: '#78716C', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Date & Time</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Customer</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Service Offering</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Provider</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAppointments.map((appt) => {
                  const startDt = appt.start_datetime ? new Date(appt.start_datetime) : null;

                  return (
                    <tr key={appt.id} style={{ borderBottom: '1px solid #FAF8F3', transition: 'background 0.15s ease' }}>
                      <td style={{ padding: '0.85rem 1.25rem', fontWeight: 600, color: '#211C19' }}>
                        <div>{startDt ? startDt.toLocaleDateString() : 'N/A'}</div>
                        <div style={{ fontSize: '0.78rem', color: '#78716C', fontWeight: 500 }}>
                          {startDt ? startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <div style={{ fontWeight: 600, color: '#211C19' }}>
                          {appt.customer_name || appt.customer_email?.split('@')[0] || 'Customer'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#78716C' }}>{appt.customer_email}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', color: '#211C19', fontWeight: 500 }}>
                        {appt.service_name || 'Standard Service'}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', color: '#5F7A70', fontWeight: 600 }}>
                        🩺 {appt.provider_name || 'Assigned Specialist'}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <StatusBadge status={appt.status} />
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                        <button
                          onClick={() => setSelectedAppt(appt)}
                          style={{
                            padding: '0.4rem 0.85rem',
                            background: '#5F7A70',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          Details →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Appointment Detail Modal */}
      {selectedAppt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(33, 28, 25, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E6E1D9', padding: '1.75rem', width: '100%', maxWidth: '520px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#211C19' }}>Appointment Details</h3>
              <button onClick={() => setSelectedAppt(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.9rem', color: '#211C19' }}>
              <div><strong>Reference ID:</strong> <span style={{ fontFamily: 'monospace' }}>#{selectedAppt.id}</span></div>
              <div><strong>Status:</strong> <StatusBadge status={selectedAppt.status} /></div>
              <div><strong>Service:</strong> {selectedAppt.service_name}</div>
              <div><strong>Provider:</strong> {selectedAppt.provider_name}</div>
              <div><strong>Customer Email:</strong> {selectedAppt.customer_email}</div>
              <div><strong>Start Time:</strong> {new Date(selectedAppt.start_datetime).toLocaleString()}</div>
              {selectedAppt.cancellation_reason && (
                <div style={{ padding: '0.75rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px' }}>
                  <strong>Cancellation Reason:</strong> {selectedAppt.cancellation_reason}
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button onClick={() => setSelectedAppt(null)} style={{ padding: '0.65rem 1.25rem', background: '#2F2520', color: '#FAF8F3', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerAppointmentsPage;
