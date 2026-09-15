import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function StaffCustomersPage() {
  const { currentOrg } = useTenant();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const fetchCustomers = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError('');

    try {
      const data = await appointmentService.getAppointments(currentOrg.id);
      const apptList = Array.isArray(data) ? data : data.results || [];

      // Aggregate unique customers by email
      const custMap = {};
      apptList.forEach((appt) => {
        const email = appt.customer_email || 'unknown@patient.com';
        if (!custMap[email]) {
          custMap[email] = {
            email,
            name: appt.customer_name || email.split('@')[0],
            phone: appt.customer_phone || 'N/A',
            appointmentCount: 0,
            lastVisit: appt.start_datetime,
          };
        }
        custMap[email].appointmentCount += 1;
        if (new Date(appt.start_datetime) > new Date(custMap[email].lastVisit)) {
          custMap[email].lastVisit = appt.start_datetime;
        }
      });

      setCustomers(Object.values(custMap));
    } catch (err) {
      setError('Failed to load customer directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [currentOrg?.id]);

  const filteredCustomers = customers.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  if (!currentOrg) {
    return <EmptyState title="No Organization Selected" message="Select an organization to view customer records." />;
  }

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1050px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            👥 Receptionist Desk
          </div>
          <h1 style={{ fontSize: '1.75rem', color: '#211C19', margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif' }}>
            Patient & Customer Directory
          </h1>
          <p style={{ color: '#78716C', margin: 0, fontSize: '0.95rem' }}>
            Registered patient contacts and appointment history for <strong>{currentOrg.name}</strong>.
          </p>
        </div>

        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #E6E1D9', background: '#FFFFFF', width: '260px', fontSize: '0.9rem' }}
        />
      </div>

      {loading ? (
        <LoadingState message="Fetching patient directory..." />
      ) : error ? (
        <div style={{ padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px' }}>
          ⚠️ {error}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState title="No Customers Found" message="No customer bookings match your search query." />
      ) : (
        <div style={{ background: '#FFFFFF', border: '1px solid #E6E1D9', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#FAF8F3', borderBottom: '1px solid #E6E1D9', color: '#78716C', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Patient Name</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Contact Email</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Total Bookings</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Last Visit Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((cust, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #FAF8F3' }}>
                    <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: '#211C19' }}>
                      👤 {cust.name}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#5F7A70', fontWeight: 600 }}>
                      {cust.email}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#211C19', fontWeight: 700 }}>
                      {cust.appointmentCount} Booking(s)
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#78716C' }}>
                      {cust.lastVisit ? new Date(cust.lastVisit).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffCustomersPage;
