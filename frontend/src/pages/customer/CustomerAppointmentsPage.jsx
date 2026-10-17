import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRequestScope } from '../../hooks/useRequestScope';
import appointmentService from '../../services/appointmentService';
import CancelAppointmentModal from '../../components/CancelAppointmentModal';
import LeaveReviewModal from '../../components/LeaveReviewModal';
import ReportIssueModal from '../../components/ReportIssueModal';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { EmergencyNotice } from '../../components/EmergencyNotice';
import { formatBookingDate } from '../../utils/homeBookingDisplay.js';
import { getNormalizedCustomerQueueState } from '../../utils/queueDisplay';
import { confirmCustomerArrival } from '../../utils/customerArrival.js';

const TABS = [
  { id: 'active', label: 'Active Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'needs_followup', label: 'Needs Follow-up' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'missed', label: 'Missed' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'emergency_recovery', label: 'Emergency Recovery' },
];

function formatTime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  return isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' });
}

export function CustomerAppointmentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const requestScope = useRequestScope(String(user?.id));
  const { showSuccess, showError } = useToast();

  const getSanitizedTab = (tabStr) => {
    if (!tabStr) return 'active';
    const normalized = tabStr.toLowerCase().replace(/-/g, '_');
    if (['active', 'upcoming', 'completed', 'cancelled', 'missed', 'skipped', 'needs_followup', 'emergency_recovery'].includes(normalized)) {
      return normalized;
    }
    return 'active';
  };

  const [appointmentRows, setAppointments] = useState([]);
  const [loadedUser, setLoadedUser] = useState(null);
  const appointments = loadedUser === user?.id ? appointmentRows : [];
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(() => getSanitizedTab(searchParams.get('tab')));

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl) {
      const sanitized = getSanitizedTab(tabFromUrl);
      if (sanitized !== activeTab) {
        setActiveTab(sanitized);
      }
    }
  }, [searchParams]);

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId === 'needs_followup' ? 'needs-follow-up' : tabId });
  };

  // Modals state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [checkingInId, setCheckingInId] = useState(null);

  const fetchAppointments = async (isManual = false) => {
    if (!user?.id) return;
    const ticket = requestScope.begin(String(user?.id));
    if (!ticket) return;
    if (isManual) setRefreshing(true);
    setLoading(true);
    setError(null);

    try {
      const data = await appointmentService.getCustomerDashboard();
      if (!requestScope.isCurrent(ticket)) return;
      const list = Array.isArray(data) ? data : data.results || [];
      setAppointments(list);
      setLoadedUser(user.id);
    } catch (err) {
      if (!requestScope.isCurrent(ticket)) return;
      setError(err.response?.data?.detail || 'Failed to load your appointments schedule.');
    } finally {
      if (requestScope.isCurrent(ticket)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    setCancelModalOpen(false);
    setReviewModalOpen(false);
    setReportModalOpen(false);
    setSelectedAppointment(null);
    setCheckingInId(null);
    setLoading(true);
    fetchAppointments();
  }, [user?.id]);

  const handleCheckIn = async (orgId, appointmentId) => {
    if (!confirmCustomerArrival()) return;
    if (!orgId || !appointmentId) return;
    const ticket = requestScope.begin(String(user?.id));
    if (!ticket) return;
    setCheckingInId(appointmentId);
    setError(null);

    try {
      await appointmentService.checkInAppointment(orgId, appointmentId);
      if (!requestScope.isCurrentScope(ticket)) return;
      showSuccess('Checked in successfully! You are now in the live queue.');
      await fetchAppointments(true);
    } catch (err) {
      if (!requestScope.isCurrentScope(ticket)) return;
      const msg = err.response?.data?.detail || 'Check-in failed. Please verify your appointment status.';
      showError(msg);
    } finally {
      if (requestScope.isCurrentScope(ticket)) setCheckingInId(null);
    }
  };

  const handleOpenCancelModal = (appointment) => {
    setSelectedAppointment(appointment);
    setCancelModalOpen(true);
  };

  const handleOpenReviewModal = (appointment) => {
    setSelectedAppointment(appointment);
    setReviewModalOpen(true);
  };

  const handleOpenReportModal = (appointment) => {
    setSelectedAppointment(appointment);
    setReportModalOpen(true);
  };

  const handleConfirmCancel = async (reason) => {
    if (!selectedAppointment) return;
    const ticket = requestScope.begin(String(user?.id));
    if (!ticket) return;
    const orgId = selectedAppointment.organization_id || selectedAppointment.organization;
    try {
      await appointmentService.cancelAppointment(orgId, selectedAppointment.id, reason);
      if (!requestScope.isCurrentScope(ticket)) return;
      showSuccess('Appointment successfully cancelled.');
      setCancelModalOpen(false);
      setSelectedAppointment(null);
      await fetchAppointments(true);
    } catch (err) {
      if (!requestScope.isCurrentScope(ticket)) return;
      const msg = err.response?.data?.detail || 'Failed to cancel appointment.';
      showError(msg);
      setCancelModalOpen(false);
    }
  };

  const categorizeAppointment = (item) => {
    const norm = getNormalizedCustomerQueueState(item);
    if (item.emergency?.resolution === 'RESCHEDULED' || item.emergency?.resolution === 'CANCELLED') return 'emergency_recovery';
    const qStatus = item.queue_entry?.status || item.status;
    const isPast = norm.isPast;
    const isFuture = item.temporal_classification === 'future';
    const isToday = item.temporal_classification === 'today';
    const isCheckedIn = norm.isCheckedIn;

    if (qStatus === 'COMPLETED' || item.status === 'COMPLETED') return 'completed';
    if (qStatus === 'CANCELLED' || item.status === 'CANCELLED') return 'cancelled';
    if (qStatus === 'SKIPPED' || item.status === 'SKIPPED') return 'skipped';
    if (qStatus === 'NO_SHOW' || item.status === 'NO_SHOW') return 'missed';

    if (isPast) {
      if (isCheckedIn) return 'needs_followup';
      return 'missed';
    }

    if (isFuture) return 'upcoming';

    if (isToday) return 'active';

    return 'active';
  };

  const tabCounts = {
    emergency_recovery: appointments.filter((a) => categorizeAppointment(a) === 'emergency_recovery').length,
    active: appointments.filter((a) => categorizeAppointment(a) === 'active').length,
    upcoming: appointments.filter((a) => categorizeAppointment(a) === 'upcoming').length,
    completed: appointments.filter((a) => categorizeAppointment(a) === 'completed').length,
    cancelled: appointments.filter((a) => categorizeAppointment(a) === 'cancelled').length,
    missed: appointments.filter((a) => categorizeAppointment(a) === 'missed').length,
    skipped: appointments.filter((a) => categorizeAppointment(a) === 'skipped').length,
    needs_followup: appointments.filter((a) => categorizeAppointment(a) === 'needs_followup').length,
  };

  const filteredAppointments = appointments.filter((item) => categorizeAppointment(item) === activeTab);

  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'active':
        return 'No active appointments or live queue participation today.';
      case 'upcoming':
        return 'You have no future appointments scheduled.';
      case 'needs_followup':
        return 'All past appointments have verified outcomes. No follow-up required.';
      case 'completed':
        return 'You have no completed appointments yet.';
      case 'cancelled':
        return 'You have no cancelled appointments.';
      case 'missed':
        return 'You have no missed appointments.';
      case 'skipped':
        return 'You have no skipped queue entries.';
      case 'emergency_recovery':
        return 'No appointments requiring emergency recovery.';
      default:
        return 'No appointments found in this category.';
    }
  };

  return (
    <div
      className="animate-page-entrance"
      style={{
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '1.75rem 1rem 3.5rem 1rem',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Header Banner */}
      <header
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg, 14px)',
          padding: '1.75rem 2rem',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '1.75rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.25rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--color-secondary-accent)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.35rem',
              }}
            >
              Customer Care &bull; Appointment Roster
            </div>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                margin: '0 0 0.35rem 0',
                color: 'var(--color-text-main)',
                letterSpacing: '-0.02em',
              }}
            >
              My Appointments &amp; Consultations
            </h1>
            <p
              style={{
                color: 'var(--color-text-secondary)',
                margin: 0,
                fontSize: '0.925rem',
                lineHeight: 1.5,
              }}
            >
              Track active appointments, monitor live queue status, confirm arrival, and manage consultation history.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => fetchAppointments(true)}
              disabled={refreshing}
              title="Refresh schedule"
              style={{ fontSize: '0.85rem' }}
            >
              {refreshing ? 'Syncing...' : 'Sync'}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/customer/book')}
              style={{ fontSize: '0.875rem' }}
            >
              Book Appointment
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div
          className="banner banner-danger"
          style={{
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => fetchAppointments(true)}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Accessible Filter Tabs Bar */}
      <nav
        role="tablist"
        aria-label="Appointment Lifecycle Categories"
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '1.75rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id] || 0;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => handleSelectTab(tab.id)}
              style={{
                padding: '0.65rem 0.95rem',
                background: isActive ? 'var(--color-surface)' : 'transparent',
                border: `1px solid ${isActive ? 'var(--color-border)' : 'transparent'}`,
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                borderRadius: 'var(--radius-md, 10px) var(--radius-md, 10px) 0 0',
                color: isActive ? 'var(--color-text-main)' : 'var(--color-text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all var(--duration-fast, 0.15s) ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  minWidth: '20px',
                  height: '20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 6px',
                  borderRadius: 'var(--radius-full, 9999px)',
                  background: isActive ? 'var(--color-primary)' : 'var(--color-bg-subtle)',
                  color: isActive ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
                  border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Main Appointment Tickets Roster */}
      {loading ? (
        <LoadingState message="Loading your appointments schedule..." />
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          title={getEmptyMessage()}
          message="Select another category tab or schedule a new consultation with a specialist."
          actionText="Book New Appointment"
          onAction={() => navigate('/customer/book')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredAppointments.map((appt) => {
            const qEntry = appt.queue_entry;
            const normState = getNormalizedCustomerQueueState(appt, qEntry);
            const category = categorizeAppointment(appt);
            const isFuture = appt.temporal_classification === 'future';
            const qStatus = isFuture ? appt.status : (qEntry?.status || appt.status);
            const orgId = appt.organization_id || appt.organization;

            const canCheckIn = appt.can_check_in !== undefined
              ? appt.can_check_in
              : normState.canCheckIn;
            const canCancel = appt.can_cancel !== undefined
              ? appt.can_cancel
              : (['CONFIRMED', 'PENDING'].includes(appt.status) && !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED', 'IN_PROGRESS'].includes(qStatus));

            const canReschedule = Boolean(appt.self_reschedule?.allowed === true);

            const formattedDate = formatBookingDate(
              appt.appointment_date ||
              (appt.start_datetime ? new Date(appt.start_datetime).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) : null)
            );

            let timingLabel = 'Consultation Timing:';
            let timingValue = normState.timingPlaceholder;
            if (normState.actualStartedAt) {
              timingLabel = 'Consultation Started:';
              timingValue = formatTime(normState.actualStartedAt);
            } else if (normState.estimatedStartTime) {
              timingLabel = 'Estimated Start:';
              timingValue = formatTime(normState.estimatedStartTime);
            } else if (appt.appointment_time) {
              timingLabel = 'Scheduled Slot:';
              timingValue = appt.appointment_time.slice(0, 5);
            } else if (normState.isTerminal) {
              timingLabel = 'Service Outcome:';
              timingValue = 'Concluded';
            }

            const recArrival = formatTime(normState.recommendedArrivalTime);

            return (
              <article
                key={appt.id}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg, 14px)',
                  padding: '1.5rem',
                  boxShadow: 'var(--shadow-sm)',
                  boxSizing: 'border-box',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  transition: 'border-color var(--duration-fast, 0.15s) ease, box-shadow var(--duration-fast, 0.15s) ease',
                }}
              >
                {/* Top Row: Identity & Status Badges */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--color-secondary-accent)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.25rem',
                      }}
                    >
                      {appt.organization_category || 'CLINIC'} &bull; {appt.organization_name || 'Organization'}
                    </div>
                    <h2
                      style={{
                        margin: '0 0 0.35rem 0',
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: 'var(--color-text-main)',
                        lineHeight: 1.35,
                      }}
                    >
                      {appt.service_name || 'Service Consultation'}
                    </h2>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                      Specialist:{' '}
                      <strong style={{ color: 'var(--color-text-main)' }}>
                        {appt.provider_name || appt.provider_title || 'Assigned Specialist'}
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '0.5rem',
                      flexShrink: 0,
                    }}
                  >
                    <StatusBadge
                      status={normState.rawStatus}
                      customLabel={category === 'needs_followup' ? 'Service outcome not recorded' : normState.displayStatus}
                    />

                    {normState.serialNumber && normState.serialNumber !== '—' && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.65rem',
                          background: 'var(--color-bg-subtle)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm, 6px)',
                          fontSize: '0.825rem',
                          fontWeight: 700,
                          color: 'var(--color-text-main)',
                        }}
                      >
                        <span style={{ color: 'var(--color-text-muted)' }}>Serial</span>
                        <span style={{ color: 'var(--color-primary)' }}>#{normState.serialNumber}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Emergency Interruption Notice */}
                <EmergencyNotice appointment={appt} />

                {/* Ticket Details Summary Bar */}
                <div
                  style={{
                    background: 'var(--color-bg-subtle)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md, 10px)',
                    padding: '0.85rem 1.15rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '1rem 1.75rem',
                    fontSize: '0.85rem',
                    color: 'var(--color-text-main)',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--color-text-muted)', marginRight: '0.35rem' }}>Date:</span>
                    <strong>{formattedDate}</strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--color-text-muted)', marginRight: '0.35rem' }}>{timingLabel}</span>
                    <strong>{timingValue}</strong>
                  </div>

                  {appt.booked_service_charge != null && (
                    <div>
                      <span style={{ color: 'var(--color-text-muted)', marginRight: '0.35rem' }}>Booked Fee:</span>
                      <strong>
                        ৳{Number(appt.booked_service_charge).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </strong>
                    </div>
                  )}

                  {(appt.contact_name || appt.contact_phone) && (
                    <div>
                      <span style={{ color: 'var(--color-text-muted)', marginRight: '0.35rem' }}>Contact:</span>
                      <span>
                        {appt.contact_name || 'Customer'}
                        {appt.contact_phone ? ` (${appt.contact_phone})` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Queue & Readiness Guidance Box */}
                {normState.can_open_telemetry && (
                  <div
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md, 10px)',
                      padding: '0.85rem 1.15rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        fontSize: '0.825rem',
                      }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background:
                              normState.rawStatus === 'CALLED'
                                ? 'var(--color-warning)'
                                : normState.rawStatus === 'IN_PROGRESS'
                                ? 'var(--color-primary)'
                                : 'var(--color-success)',
                          }}
                        />
                        <strong style={{ color: 'var(--color-text-main)' }}>
                          {normState.rawStatus === 'CALLED'
                            ? 'Your turn is called — Proceed to service room'
                            : normState.rawStatus === 'IN_PROGRESS'
                            ? 'Consultation in progress'
                            : normState.isCheckedIn
                            ? 'Checked in — In queue'
                            : 'Awaiting check-in / arrival'}
                        </strong>
                      </div>

                      <div style={{ color: 'var(--color-text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {normState.nowServing && (
                          <span>
                            Now Serving: <strong style={{ color: 'var(--color-text-main)' }}>#{normState.nowServing}</strong>
                          </span>
                        )}
                        {(normState.checkedInAhead > 0 || normState.scheduledAhead > 0) && (
                          <span>
                            Queue Ahead:{' '}
                            <strong style={{ color: 'var(--color-text-main)' }}>
                              {normState.checkedInAhead} checked in
                            </strong>{' '}
                            ({normState.scheduledAhead} booked)
                          </span>
                        )}
                        {normState.estimatedWaitMinutes != null && normState.estimatedWaitMinutes > 0 && (
                          <span>
                            Est. Wait: <strong style={{ color: 'var(--color-text-main)' }}>~{normState.estimatedWaitMinutes} min</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {recArrival && !normState.isCheckedIn && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-secondary-accent)', fontWeight: 600 }}>
                        Recommended arrival window: by {recArrival}
                      </div>
                    )}
                  </div>
                )}

                {/* Contextual Guidance Text */}
                {normState.guidance && (
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: normState.statusTone === 'warning' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                      lineHeight: 1.45,
                    }}
                  >
                    {normState.guidance}
                  </div>
                )}

                {/* Reschedule Ineligibility Notice (when active/upcoming but self-reschedule is disallowed) */}
                {appt.self_reschedule && !appt.self_reschedule.allowed && (category === 'active' || category === 'upcoming') && appt.self_reschedule.message && (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--color-text-muted)',
                      lineHeight: 1.4,
                    }}
                  >
                    Self-rescheduling: {appt.self_reschedule.message}
                  </div>
                )}

                {/* Action Buttons Bar */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '0.65rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid var(--color-border)',
                  }}
                >
                  {canCheckIn && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => handleCheckIn(orgId, appt.id)}
                      disabled={checkingInId === appt.id}
                      style={{ fontWeight: 700 }}
                    >
                      {checkingInId === appt.id ? 'Checking In...' : 'Confirm Arrival / Check In'}
                    </button>
                  )}

                  {normState.can_open_telemetry && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => navigate(`/customer/queue/${qEntry?.id || appt.id}`)}
                    >
                      Live Queue Tracker &rarr;
                    </button>
                  )}

                  {canReschedule && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => navigate(`/customer/appointments/${appt.id}`)}
                    >
                      Reschedule
                    </button>
                  )}

                  {canCancel && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline btn-danger"
                      onClick={() => handleOpenCancelModal(appt)}
                    >
                      Cancel Appointment
                    </button>
                  )}

                  {category === 'needs_followup' && (
                    appt.has_issue_report ? (
                      <span
                        style={{
                          padding: '0.35rem 0.75rem',
                          background: 'var(--color-bg-subtle)',
                          color: 'var(--color-info)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm, 6px)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        Issue Reported
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => handleOpenReportModal(appt)}
                        style={{ color: 'var(--color-warning)' }}
                      >
                        Report an Issue
                      </button>
                    )
                  )}

                  {(category === 'completed' || qStatus === 'COMPLETED' || appt.status === 'COMPLETED') && (
                    appt.can_review ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => handleOpenReviewModal(appt)}
                      >
                        Leave Review
                      </button>
                    ) : (
                      <span
                        style={{
                          padding: '0.35rem 0.75rem',
                          background: 'var(--color-bg-subtle)',
                          color: 'var(--color-success)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm, 6px)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        Reviewed
                      </span>
                    )
                  )}

                  {(category === 'missed' || category === 'cancelled') && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => navigate('/customer/book')}
                    >
                      Book Again
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => navigate(`/customer/appointments/${appt.id}`)}
                  >
                    Details &rarr;
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Cancel Modal */}
      {loadedUser === user?.id && cancelModalOpen && selectedAppointment && (
        <CancelAppointmentModal
          isOpen={cancelModalOpen}
          appointment={selectedAppointment}
          onConfirm={handleConfirmCancel}
          onClose={() => setCancelModalOpen(false)}
        />
      )}

      {/* Review Modal */}
      {loadedUser === user?.id && reviewModalOpen && selectedAppointment && (
        <LeaveReviewModal
          isOpen={reviewModalOpen}
          appointment={selectedAppointment}
          orgId={selectedAppointment.organization_id || selectedAppointment.organization}
          onSuccess={() => {
            showSuccess('Thank you! Your review has been recorded.');
            fetchAppointments(true);
          }}
          onClose={() => setReviewModalOpen(false)}
        />
      )}

      {/* Report Issue Modal */}
      {loadedUser === user?.id && reportModalOpen && selectedAppointment && (
        <ReportIssueModal
          isOpen={reportModalOpen}
          appointment={selectedAppointment}
          onSuccess={() => {
            fetchAppointments(true);
          }}
          onClose={() => setReportModalOpen(false)}
        />
      )}
    </div>
  );
}
export default CustomerAppointmentsPage;
