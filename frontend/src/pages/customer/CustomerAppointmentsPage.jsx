import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import appointmentService from '../../services/appointmentService';
import CancelAppointmentModal from '../../components/CancelAppointmentModal';
import LeaveReviewModal from '../../components/LeaveReviewModal';
import ReportIssueModal from '../../components/ReportIssueModal';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';
import { getNormalizedCustomerQueueState } from '../../utils/queueDisplay';

export function CustomerAppointmentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const getSanitizedTab = (tabStr) => {
    if (!tabStr) return 'active';
    const normalized = tabStr.toLowerCase().replace(/-/g, '_');
    if (['active', 'upcoming', 'completed', 'cancelled', 'missed', 'skipped', 'needs_followup'].includes(normalized)) {
      return normalized;
    }
    return 'active';
  };

  const [appointments, setAppointments] = useState([]);
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
    if (isManual) setRefreshing(true);
    setLoading(true);
    setError(null);

    try {
      const data = await appointmentService.getCustomerDashboard();
      const list = Array.isArray(data) ? data : data.results || [];
      setAppointments(list);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load your appointments schedule.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  const handleCheckIn = async (orgId, appointmentId) => {
    if (!orgId || !appointmentId) return;
    setCheckingInId(appointmentId);
    setError(null);

    try {
      await appointmentService.checkInAppointment(orgId, appointmentId);
      showSuccess('Checked in successfully! You are now in the live queue.');
      await fetchAppointments(true);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Check-in failed. Please verify your appointment status.';
      showError(msg);
    } finally {
      setCheckingInId(null);
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
    const orgId = selectedAppointment.organization_id || selectedAppointment.organization;
    try {
      await appointmentService.cancelAppointment(orgId, selectedAppointment.id, reason);
      showSuccess('Appointment successfully cancelled.');
      setCancelModalOpen(false);
      setSelectedAppointment(null);
      await fetchAppointments(true);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to cancel appointment.';
      showError(msg);
      setCancelModalOpen(false);
    }
  };

  const categorizeAppointment = (item) => {
    const norm = getNormalizedCustomerQueueState(item);
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
    active: appointments.filter((a) => categorizeAppointment(a) === 'active').length,
    upcoming: appointments.filter((a) => categorizeAppointment(a) === 'upcoming').length,
    completed: appointments.filter((a) => categorizeAppointment(a) === 'completed').length,
    cancelled: appointments.filter((a) => categorizeAppointment(a) === 'cancelled').length,
    missed: appointments.filter((a) => categorizeAppointment(a) === 'missed').length,
    skipped: appointments.filter((a) => categorizeAppointment(a) === 'skipped').length,
    needs_followup: appointments.filter((a) => categorizeAppointment(a) === 'needs_followup').length,
  };

  const filteredAppointments = appointments.filter((item) => categorizeAppointment(item) === activeTab);

  const TABS = [
    { id: 'active', label: 'Active Today', icon: '🟢' },
    { id: 'upcoming', label: 'Upcoming', icon: '📅' },
    { id: 'completed', label: 'Completed', icon: '✅' },
    { id: 'cancelled', label: 'Cancelled', icon: '❌' },
    { id: 'missed', label: 'Missed', icon: '🚫' },
    { id: 'skipped', label: 'Skipped', icon: '⏭️' },
    { id: 'needs_followup', label: 'Needs Follow-up', icon: '⚠️' },
  ];

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
      default:
        return 'No appointments found.';
    }
  };

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1150px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border)',
          borderRadius: '18px',
          padding: '1.75rem 2rem',
          boxShadow: 'var(--lp-shadow-sm)',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--lp-accent)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
              📋 Appointment Lifecycle &amp; History
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, margin: '0 0 0.35rem 0', fontFamily: 'Cinzel, serif', color: 'var(--lp-text)' }}>
              My Appointments &amp; Consultations
            </h1>
            <p style={{ color: 'var(--lp-text-subtle)', margin: 0, fontSize: '0.925rem' }}>
              Track active appointments, view lifecycle history, check in online, and report service discrepancies.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => fetchAppointments(true)}
              disabled={refreshing}
              title="Refresh schedule"
              style={{
                padding: '0.65rem 0.9rem',
                background: 'var(--lp-bg-subtle)',
                color: 'var(--lp-text-subtle)',
                border: '1px solid var(--lp-border)',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: refreshing ? 'not-allowed' : 'pointer',
              }}
            >
              🔄 {refreshing ? 'Updating...' : 'Sync'}
            </button>

            <button
              onClick={() => navigate('/customer/book')}
              style={{
                padding: '0.7rem 1.25rem',
                background: 'var(--lp-accent)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(95, 122, 112, 0.25)',
              }}
            >
              ✨ Book Appointment
            </button>
          </div>
        </div>
      </div>

      {error && <div className="banner banner-danger" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      {/* Accessible Tabs Bar */}
      <div
        role="tablist"
        aria-label="Appointment Lifecycle Categories"
        style={{
          display: 'flex',
          gap: '0.35rem',
          borderBottom: '2px solid var(--lp-border)',
          marginBottom: '1.75rem',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id] || 0;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => handleSelectTab(tab.id)}
              style={{
                padding: '0.75rem 1.1rem',
                background: isActive ? 'var(--lp-surface)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--lp-accent)' : '3px solid transparent',
                color: isActive ? 'var(--lp-accent)' : 'var(--lp-text-subtle)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.925rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                marginBottom: '-2px',
                borderRadius: '8px 8px 0 0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{tab.icon} {tab.label}</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.1rem 0.45rem',
                  borderRadius: '999px',
                  background: isActive ? 'var(--lp-accent)' : 'var(--lp-border)',
                  color: isActive ? '#FFFFFF' : 'var(--lp-text-subtle)',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Flat Appointments History List */}
      {loading ? (
        <LoadingState message="Loading your appointments schedule..." />
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          title={getEmptyMessage()}
          message="Select another tab or schedule a new consultation with a specialist."
          actionText="Book New Appointment"
          onAction={() => navigate('/customer/book')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredAppointments.map((appt) => {
            const qEntry = appt.queue_entry;
            const normState = getNormalizedCustomerQueueState(appt, qEntry);
            const category = categorizeAppointment(appt);
            const isFuture = appt.temporal_classification === 'future';
            const qStatus = isFuture ? appt.status : (qEntry?.status || appt.status);
            const orgId = appt.organization_id || appt.organization;

            const canCheckIn = appt.can_check_in !== undefined
              ? appt.can_check_in
              : (appt.temporal_classification === 'today' && appt.status === 'CONFIRMED');
            const canCancel = appt.can_cancel !== undefined
              ? appt.can_cancel
              : (['CONFIRMED', 'PENDING'].includes(appt.status) && !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED', 'IN_PROGRESS'].includes(qStatus));

            const formattedDate = appt.start_datetime
              ? new Date(appt.start_datetime).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : (appt.appointment_date || 'Date TBD');

            const formattedTime = appt.start_datetime
              ? new Date(appt.start_datetime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Time TBD';

            return (
              <div
                key={appt.id}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '1.5rem 0',
                  borderBottom: '1px solid var(--lp-border)',
                  gap: '1.5rem',
                  flexWrap: 'wrap',
                }}
              >
                {/* Left: Date & Time */}
                <div style={{ minWidth: '160px', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--lp-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {formattedDate}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--lp-text)', fontFamily: 'Outfit, sans-serif', marginTop: '0.2rem' }}>
                    {formattedTime}
                  </div>
                  {normState.serialNumber && normState.serialNumber !== '—' && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-subtle)', marginTop: '0.35rem', fontWeight: 600 }}>
                      Serial <span style={{ color: 'var(--lp-accent)', fontWeight: 700 }}>#{normState.serialNumber}</span>
                    </div>
                  )}
                </div>

                {/* Center: Service, Organization, Provider & Contextual Notes */}
                <div style={{ flex: 1, minWidth: '260px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--lp-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {appt.organization_category || 'CLINIC'} &bull; {appt.organization_name || 'Organization'}
                  </div>
                  <h3 style={{ margin: '0.2rem 0 0.35rem 0', fontSize: '1.2rem', color: 'var(--lp-text)', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
                    {appt.service_name || 'Service Consultation'}
                  </h3>
                  <div style={{ fontSize: '0.875rem', color: 'var(--lp-text-subtle)', marginBottom: '0.5rem' }}>
                    Specialist: <strong style={{ color: 'var(--lp-text)' }}>{appt.provider_name || appt.provider_title || 'Assigned Specialist'}</strong>
                  </div>

                  {/* Contextual Guidance / Status explanation */}
                  <div style={{ fontSize: '0.85rem', color: normState.statusTone === 'warning' ? 'var(--color-warning)' : 'var(--lp-text-subtle)', lineHeight: 1.45, marginTop: '0.25rem' }}>
                    {normState.guidance}
                  </div>
                </div>

                {/* Right: Status Badge & Actions */}
                <div style={{ minWidth: '200px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.75rem', flexShrink: 0 }}>
                  <StatusBadge status={category === 'needs_followup' ? 'Service outcome not recorded' : normState.displayStatus} />

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                    {canCheckIn && (
                      <button
                        onClick={() => handleCheckIn(orgId, appt.id)}
                        disabled={checkingInId === appt.id}
                        style={{
                          padding: '0.5rem 0.85rem',
                          background: 'var(--color-warning)',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: checkingInId === appt.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {checkingInId === appt.id ? 'Checking in...' : '✓ Check-In'}
                      </button>
                    )}

                    {normState.can_open_telemetry && (
                      <button
                        onClick={() => navigate(`/customer/queue/${qEntry?.id || appt.id}`)}
                        style={{
                          padding: '0.5rem 0.85rem',
                          background: 'var(--lp-btn-bg)',
                          color: 'var(--lp-btn-text)',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                        }}
                      >
                        Open Live Queue →
                      </button>
                    )}

                    {category === 'needs_followup' && (
                      appt.has_issue_report ? (
                        <span
                          style={{
                            padding: '0.45rem 0.8rem',
                            background: 'var(--lp-bg-subtle)',
                            color: 'var(--lp-accent)',
                            border: '1px solid var(--lp-border)',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                          }}
                        >
                          ✓ Issue Reported
                        </span>
                      ) : (
                        <button
                          onClick={() => handleOpenReportModal(appt)}
                          style={{
                            padding: '0.5rem 0.85rem',
                            background: 'var(--lp-bg-subtle)',
                            color: 'var(--color-warning)',
                            border: '1px solid var(--lp-border)',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                          }}
                        >
                          ⚠️ Report an Issue
                        </button>
                      )
                    )}

                    {(category === 'completed' || qStatus === 'COMPLETED' || appt.status === 'COMPLETED') && (
                      appt.can_review ? (
                        <button
                          onClick={() => handleOpenReviewModal(appt)}
                          style={{
                            padding: '0.5rem 0.85rem',
                            background: 'var(--lp-bg-subtle)',
                            color: 'var(--color-warning)',
                            border: '1px solid var(--lp-border)',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                          }}
                        >
                          ★ Leave Review
                        </button>
                      ) : (
                        <span
                          style={{
                            padding: '0.4rem 0.75rem',
                            background: 'var(--lp-sage-bg)',
                            color: 'var(--lp-sage)',
                            border: '1px solid var(--lp-sage-border)',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                          }}
                        >
                          ✓ Reviewed
                        </span>
                      )
                    )}

                    {canCancel && (
                      <button
                        onClick={() => handleOpenCancelModal(appt)}
                        style={{
                          padding: '0.5rem 0.85rem',
                          background: 'var(--color-danger-light)',
                          color: 'var(--color-danger)',
                          border: '1px solid var(--color-danger)',
                          borderRadius: '8px',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    )}

                    {(category === 'missed' || category === 'cancelled') && (
                      <button
                        onClick={() => navigate('/customer/book')}
                        style={{
                          padding: '0.5rem 0.85rem',
                          background: 'var(--lp-accent)',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                        }}
                      >
                        Book Again
                      </button>
                    )}

                    <button
                      onClick={() => navigate(`/customer/appointments/${appt.id}`)}
                      style={{
                        padding: '0.5rem 0.85rem',
                        background: 'var(--lp-bg-subtle)',
                        color: 'var(--lp-accent)',
                        border: '1px solid var(--lp-border)',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      Details →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModalOpen && selectedAppointment && (
        <CancelAppointmentModal
          isOpen={cancelModalOpen}
          appointment={selectedAppointment}
          onConfirm={handleConfirmCancel}
          onClose={() => setCancelModalOpen(false)}
        />
      )}

      {/* Review Modal */}
      {reviewModalOpen && selectedAppointment && (
        <LeaveReviewModal
          isOpen={reviewModalOpen}
          appointment={selectedAppointment}
          orgId={selectedAppointment.organization_id || selectedAppointment.organization}
          onSuccess={() => {
            showSuccess('Thank you! Your review has been recorded.');
            fetchAppointments();
          }}
          onClose={() => setReviewModalOpen(false)}
        />
      )}

      {/* Report Issue Modal */}
      {reportModalOpen && selectedAppointment && (
        <ReportIssueModal
          isOpen={reportModalOpen}
          appointment={selectedAppointment}
          onSuccess={() => {
            fetchAppointments();
          }}
          onClose={() => setReportModalOpen(false)}
        />
      )}
    </div>
  );
}

export default CustomerAppointmentsPage;
