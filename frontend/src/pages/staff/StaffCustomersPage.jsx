import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import '../../styles/StaffCustomers.css';

/* ─── Search SVG Icon ────────────────────────────────────────────────────── */
const SearchIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/* ─── Helper: Initials Generator ─────────────────────────────────────────── */
function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─── Helper: Date Formatter ─────────────────────────────────────────────── */
function formatVisitDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (e) {
    return 'N/A';
  }
}

export function StaffCustomersPage() {
  const { currentOrg } = useTenant();

  const [customers, setCustomers] = useState([]);
  const [rawAppointments, setRawAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent_booking'); // 'recent_booking' | 'completed_visit' | 'bookings' | 'name'

  const fetchCustomers = useCallback(async () => {
    if (!currentOrg?.id) return;
    setLoading(true);
    setError('');

    try {
      const data = await appointmentService.getAppointments(currentOrg.id);
      const apptList = Array.isArray(data) ? data : data.results || [];
      setRawAppointments(apptList);

      // Aggregate unique customers strictly by email or customer ID
      const custMap = {};
      apptList.forEach((appt) => {
        const rawEmail = (appt.customer_email || (appt.customer && appt.customer.email) || '').trim();
        const customerId = appt.customer_id || (appt.customer && appt.customer.id) || null;

        // Stable key for aggregation
        const key = (rawEmail || (customerId ? `id_${customerId}` : `appt_${appt.id}`)).toLowerCase();

        const candidateName =
          appt.customer_name ||
          appt.contact_name ||
          (appt.customer ? `${appt.customer.first_name || ''} ${appt.customer.last_name || ''}`.trim() : '') ||
          (rawEmail && rawEmail.includes('@') ? rawEmail.split('@')[0] : 'Patient');

        const candidatePhone = appt.contact_phone || appt.customer_phone || (appt.customer && appt.customer.phone_number) || null;
        const apptDate = appt.start_datetime || appt.appointment_date || null;
        const serviceName = appt.service_name || (appt.service && appt.service.name) || null;
        const isCompleted = appt.status === 'COMPLETED';

        if (!custMap[key]) {
          custMap[key] = {
            id: key,
            email: rawEmail || null,
            name: candidateName || 'Patient',
            phone: candidatePhone || null,
            appointmentCount: 0,
            completedVisitCount: 0,
            lastCompletedVisitDate: null,
            lastCompletedService: null,
            latestBookingDate: apptDate,
            latestBookingService: serviceName,
          };
        }

        custMap[key].appointmentCount += 1;

        if (isCompleted) {
          custMap[key].completedVisitCount += 1;
          if (apptDate) {
            if (!custMap[key].lastCompletedVisitDate || new Date(apptDate) > new Date(custMap[key].lastCompletedVisitDate)) {
              custMap[key].lastCompletedVisitDate = apptDate;
              if (serviceName) custMap[key].lastCompletedService = serviceName;
            }
          }
        }

        // Track overall latest booking date
        if (apptDate) {
          if (!custMap[key].latestBookingDate || new Date(apptDate) > new Date(custMap[key].latestBookingDate)) {
            custMap[key].latestBookingDate = apptDate;
            if (serviceName) custMap[key].latestBookingService = serviceName;
          }
        }

        // Keep best available name and phone
        if (candidateName && candidateName !== 'Patient' && custMap[key].name === 'Patient') {
          custMap[key].name = candidateName;
        }
        if (candidatePhone && !custMap[key].phone) {
          custMap[key].phone = candidatePhone;
        }
      });

      setCustomers(Object.values(custMap));
    } catch (err) {
      setError('Unable to load customer directory for this organization.');
    } finally {
      setLoading(false);
    }
  }, [currentOrg?.id]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Search and Sort
  const filteredAndSortedCustomers = useMemo(() => {
    let result = customers;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((c) => {
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const emailMatch = (c.email || '').toLowerCase().includes(q);
        const phoneMatch = (c.phone || '').toLowerCase().includes(q);
        const serviceMatch =
          (c.latestBookingService || '').toLowerCase().includes(q) ||
          (c.lastCompletedService || '').toLowerCase().includes(q);
        return nameMatch || emailMatch || phoneMatch || serviceMatch;
      });
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'completed_visit') {
        const timeA = a.lastCompletedVisitDate ? new Date(a.lastCompletedVisitDate).getTime() : 0;
        const timeB = b.lastCompletedVisitDate ? new Date(b.lastCompletedVisitDate).getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === 'bookings') {
        return b.appointmentCount - a.appointmentCount;
      }
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      // default: 'recent_booking'
      const timeA = a.latestBookingDate ? new Date(a.latestBookingDate).getTime() : 0;
      const timeB = b.latestBookingDate ? new Date(b.latestBookingDate).getTime() : 0;
      return timeB - timeA;
    });
  }, [customers, searchQuery, sortBy]);

  // Derived real metrics
  const repeatCount = useMemo(
    () => customers.filter((c) => c.appointmentCount > 1).length,
    [customers]
  );

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Select an organization from the header selector to view its customer records."
      />
    );
  }

  return (
    <div className="staff-customers" role="main">
      {/* Editorial Header */}
      <header className="staff-customers__header">
        <div className="staff-customers__header-info">
          <span className="staff-customers__eyebrow">
            👥 Front Desk & Reception
          </span>
          <h1 className="staff-customers__title">Patient & Customer Directory</h1>
          <p className="staff-customers__subtitle">
            Patient appointment and booking records for{' '}
            <strong>{currentOrg.name}</strong>.
          </p>
        </div>

        <div className="staff-customers__header-actions">
          <button
            type="button"
            className="staff-customers__btn-refresh"
            onClick={fetchCustomers}
            disabled={loading}
            aria-label="Refresh directory list"
          >
            ↻ Refresh Directory
          </button>
        </div>
      </header>

      {/* Real Summary Metrics */}
      <section className="staff-customers__metrics" aria-label="Customer directory summary">
        <div className="staff-customers__metric-card">
          <span className="staff-customers__metric-label">Total Unique Patients</span>
          <span className="staff-customers__metric-value">{customers.length}</span>
          <span className="staff-customers__metric-subtext">On record at this facility</span>
        </div>

        <div className="staff-customers__metric-card">
          <span className="staff-customers__metric-label">Repeat Patients</span>
          <span className="staff-customers__metric-value">{repeatCount}</span>
          <span className="staff-customers__metric-subtext">Multiple bookings on record</span>
        </div>

        <div className="staff-customers__metric-card">
          <span className="staff-customers__metric-label">Total Appointments</span>
          <span className="staff-customers__metric-value">{rawAppointments.length}</span>
          <span className="staff-customers__metric-subtext">Across all service lines</span>
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div className="staff-customers__error-box" role="alert">
          <div>
            <strong>Error:</strong> {error}
          </div>
          <button
            type="button"
            className="staff-customers__btn-retry"
            onClick={fetchCustomers}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Search & Sort Toolbar */}
      <div className="staff-customers__toolbar">
        <div className="staff-customers__search-box">
          <span className="staff-customers__search-icon">
            <SearchIcon size={16} />
          </span>
          <input
            type="text"
            className="staff-customers__search-input"
            placeholder="Search by name, email, phone, or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search patient directory"
          />
          {searchQuery && (
            <button
              type="button"
              className="staff-customers__search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search query"
            >
              ✕
            </button>
          )}
        </div>

        <div className="staff-customers__controls">
          <label htmlFor="staff-customers-sort" style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)' }}>
            Sort by:
          </label>
          <select
            id="staff-customers-sort"
            className="staff-customers__sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort directory by"
          >
            <option value="recent_booking">Most Recent Booking</option>
            <option value="completed_visit">Last Completed Visit</option>
            <option value="bookings">Most Bookings</option>
            <option value="name">Patient Name (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Directory Table / States */}
      {loading ? (
        <LoadingState message={`Fetching patient directory for ${currentOrg.name}...`} />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No Customer Records Found"
          message={`No patient appointments have been logged for ${currentOrg.name} yet.`}
        />
      ) : filteredAndSortedCustomers.length === 0 ? (
        <EmptyState
          title="No Matching Patients"
          message={`No patient records match "${searchQuery}".`}
          actionText="Clear Search"
          onAction={() => setSearchQuery('')}
        />
      ) : (
        <div className="staff-customers__table-card">
          <div className="staff-customers__table-wrap">
            <table
              className="staff-customers__table"
              aria-label={`Patient directory for ${currentOrg.name}`}
            >
              <thead>
                <tr>
                  <th scope="col">Patient Identity</th>
                  <th scope="col">Contact Information</th>
                  <th scope="col">Last Completed Visit</th>
                  <th scope="col">Booking History</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedCustomers.map((cust) => {
                  const initials = getInitials(cust.name);
                  const isRepeat = cust.appointmentCount > 1;

                  return (
                    <tr key={cust.id}>
                      {/* Identity */}
                      <td>
                        <div className="staff-customers__patient-cell">
                          <div className="staff-customers__avatar" aria-hidden="true">
                            {initials}
                          </div>
                          <div className="staff-customers__patient-info">
                            <span className="staff-customers__patient-name">
                              {cust.name}
                            </span>
                            {isRepeat && (
                              <span className="staff-customers__patient-badge">
                                Repeat Patient
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td>
                        <div className="staff-customers__contact-info">
                          {cust.email ? (
                            <span className="staff-customers__email">{cust.email}</span>
                          ) : (
                            <span className="staff-customers__no-contact">No email provided</span>
                          )}
                          {cust.phone ? (
                            <span className="staff-customers__phone">📞 {cust.phone}</span>
                          ) : (
                            <span className="staff-customers__no-contact">No phone provided</span>
                          )}
                        </div>
                      </td>

                      {/* Last Completed Visit — strictly supported by actual completed data */}
                      <td>
                        {cust.lastCompletedVisitDate ? (
                          <div className="staff-customers__visit-info">
                            <span className="staff-customers__visit-date">
                              {formatVisitDate(cust.lastCompletedVisitDate)}
                            </span>
                            {cust.lastCompletedService && (
                              <span className="staff-customers__visit-service">
                                {cust.lastCompletedService}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="staff-customers__visit-info">
                            <span className="staff-customers__visit-none">No completed visits</span>
                            {cust.latestBookingDate && (
                              <span className="staff-customers__booking-subtext">
                                Latest booked: {formatVisitDate(cust.latestBookingDate)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Bookings & Completed Breakdown */}
                      <td>
                        <div className="staff-customers__count-cell">
                          <span
                            className={`staff-customers__bookings-badge ${
                              isRepeat ? 'staff-customers__bookings-badge--repeat' : ''
                            }`}
                          >
                            {cust.appointmentCount}{' '}
                            {cust.appointmentCount === 1 ? 'Booking' : 'Bookings'}
                          </span>
                          {cust.completedVisitCount > 0 ? (
                            <span className="staff-customers__completed-badge">
                              ✓ {cust.completedVisitCount} completed
                            </span>
                          ) : (
                            <span className="staff-customers__completed-badge staff-customers__completed-badge--zero">
                              0 completed
                            </span>
                          )}
                        </div>
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

export default StaffCustomersPage;
