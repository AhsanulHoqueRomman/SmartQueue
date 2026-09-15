import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

export function StaffAppointmentsPage() {
  const { currentOrg } = useTenant();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [checkingInId, setCheckingInId] = useState(null);

  const fetchAppointments = async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError(null);

    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const data = await appointmentService.getAppointments(currentOrg.id, params);
      setAppointments(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load organization appointments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [currentOrg?.id, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchAppointments();
  };

  const handleCheckIn = async (appointmentId) => {
    setCheckingInId(appointmentId);
    setFeedback(null);

    try {
      await appointmentService.checkInAppointment(currentOrg.id, appointmentId);
      setFeedback({
        type: 'success',
        message: 'Successfully checked in customer appointment!',
      });
      fetchAppointments();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Check-in failed.',
      });
    } finally {
      setCheckingInId(null);
    }
  };

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Please select an organization from the header dropdown above."
      />
    );
  }

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Customer Appointments Roster</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Search, verify, and check-in customer bookings at {currentOrg.name}.</p>
        </div>
      </div>

      {feedback && (
        <div
          className="banner"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            background: feedback.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ padding: '1rem', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="card animate-section stagger-1" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearchSubmit} className="grid-responsive grid-cols-3 items-center">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="staff-search-input">Search Customer / Service</label>
            <input
              id="staff-search-input"
              type="text"
              className="form-control"
              placeholder="Search email, service..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="staff-status-select">Status Filter</label>
            <select
              id="staff-status-select"
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="CHECKED_IN">CHECKED_IN</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div className="flex items-center" style={{ paddingTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              🔍 Search Records
            </button>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="card animate-section stagger-2">
        {loading ? (
          <LoadingState type="skeleton-table" rows={4} cols={5} />
        ) : appointments.length === 0 ? (
          <EmptyState
            title="No Appointments Found"
            message="No appointment records matched your query filter."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer Email</th>
                  <th>Service</th>
                  <th>Date & Time</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt) => (
                  <tr key={appt.id}>
                    <td className="font-semibold">{appt.customer_email || `Customer #${appt.customer}`}</td>
                    <td>{appt.service_name || 'Service'}</td>
                    <td>
                      <div>{new Date(appt.start_datetime).toLocaleDateString()}</div>
                      <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>
                        {new Date(appt.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={appt.status} type="appointment" />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {appt.status === 'CONFIRMED' && (
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleCheckIn(appt.id)}
                          disabled={checkingInId === appt.id}
                        >
                          {checkingInId === appt.id ? 'Checking in...' : 'Check In Customer'}
                        </button>
                      )}
                    </td>
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

export default StaffAppointmentsPage;
