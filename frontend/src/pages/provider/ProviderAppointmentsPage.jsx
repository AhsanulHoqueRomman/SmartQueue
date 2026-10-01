import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import appointmentService from '../../services/appointmentService';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function ProviderAppointmentsPage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  const [providerProfile, setProviderProfile] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) return;
    let isMounted = true;
    setLoading(true);

    organizationService
      .getProviders(currentOrg.id)
      .then(async (data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.results || [];
        const myProfile = list.find((p) => p.user_id === user.id);
        setProviderProfile(myProfile || null);

        if (myProfile) {
          const apptData = await appointmentService.getAppointments(currentOrg.id, { provider_id: myProfile.id });
          const apptList = Array.isArray(apptData) ? apptData : apptData.results || [];
          if (isMounted) setAppointments(apptList);
        }
      })
      .catch((err) => {
        if (isMounted) setError('Failed to load assigned appointments.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id, user?.id]);

  const filteredAppointments = appointments.filter((appt) => {
    if (statusFilter !== 'ALL' && appt.status !== statusFilter) return false;
    return true;
  });

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to view your appointments." />;
  }

  if (loading) {
    return <LoadingState message="Loading your appointments roster..." />;
  }

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1050px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            📅 Provider Schedule Roster
          </div>
          <h1 style={{ fontSize: '1.75rem', color: 'var(--lp-text)', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
            My Patient Appointments
          </h1>
          <p style={{ color: 'var(--lp-text-subtle)', margin: 0, fontSize: '0.95rem' }}>
            Bookings assigned to <strong style={{ color: 'var(--lp-text)' }}>{providerProfile?.user_name || user?.first_name || user?.email}</strong> at {currentOrg.name}.
          </p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)', fontWeight: 600, fontSize: '0.9rem' }}
        >
          <option value="ALL">All Statuses</option>
          <option value="CONFIRMED">CONFIRMED</option>
          <option value="CHECKED_IN">CHECKED_IN</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
      </div>

      {error ? (
        <div style={{ padding: '1rem', background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : filteredAppointments.length === 0 ? (
        <EmptyState title="No Appointments Assigned" message="You currently have no patient appointments matching this status filter." />
      ) : (
        <div style={{ background: 'var(--lp-surface)', border: '1px solid var(--lp-border)', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--lp-shadow-sm)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--lp-bg-subtle)', borderBottom: '1px solid var(--lp-border)', color: 'var(--lp-text-subtle)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Start Time</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Patient</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Service Requested</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredAppointments.map((appt) => {
                  const startDt = appt.start_datetime ? new Date(appt.start_datetime) : null;

                  return (
                    <tr key={appt.id} style={{ borderBottom: '1px solid var(--lp-border)' }}>
                      <td style={{ padding: '0.85rem 1.25rem', fontWeight: 600, color: 'var(--lp-text)' }}>
                        <div>{startDt ? startDt.toLocaleDateString() : 'N/A'}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--lp-accent)', fontWeight: 600 }}>
                          {startDt ? startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--lp-text)' }}>
                          {appt.customer_name || appt.customer_email?.split('@')[0] || 'Patient'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--lp-text-subtle)' }}>{appt.customer_email}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', color: 'var(--lp-text)', fontWeight: 600 }}>
                        {appt.service_name || 'Medical Consultation'}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <StatusBadge status={appt.status} />
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', color: 'var(--lp-text-subtle)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                        {appt.notes || 'No special instructions.'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProviderAppointmentsPage;
