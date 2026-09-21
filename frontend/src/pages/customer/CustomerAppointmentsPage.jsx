import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import appointmentService from '../../services/appointmentService';
import queueService from '../../services/queueService';
import CancelAppointmentModal from '../../components/CancelAppointmentModal';
import LeaveReviewModal from '../../components/LeaveReviewModal';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function CustomerAppointmentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('active');

  // Modals state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
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

  // Filter appointments by tab
  const getFilteredAppointments = () => {
    const todayStr = new Date().toDateString();

    return appointments.filter((item) => {
      const qStatus = item.queue_entry?.status || item.status;
      const isToday = new Date(item.start_datetime).toDateString() === todayStr;

      switch (activeTab) {
        case 'active':
          return ['WAITING', 'CALLED', 'IN_PROGRESS', 'CHECKED_IN'].includes(qStatus) ||
            (item.status === 'CONFIRMED' && isToday);
        case 'upcoming':
          return !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'].includes(qStatus) &&
            !isToday && new Date(item.start_datetime) > new Date();
        case 'completed':
          return qStatus === 'COMPLETED';
        case 'cancelled':
          return qStatus === 'CANCELLED';
        case 'no_show':
          return qStatus === 'NO_SHOW' || qStatus === 'SKIPPED';
        default:
          return true;
      }
    });
  };

  const filteredAppointments = getFilteredAppointments();

  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'active':
        return 'No active appointments or live queue participation today.';
      case 'upcoming':
        return 'You have no future appointments scheduled.';
      case 'completed':
        return 'You have no completed appointments yet.';
      case 'cancelled':
        return 'You have no cancelled appointments.';
      case 'no_show':
        return 'You have no missed appointments.';
      default:
        return 'No appointments found.';
    }
  };

  return (
    <div className="animate-page-entrance" style={{ maxWidth: '1150px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #2F2520 0%, #211C19 100%)',
          color: '#FAF8F3',
          borderRadius: '20px',
          padding: '2rem',
          boxShadow: '0 8px 30px rgba(47, 37, 32, 0.12)',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(230, 225, 217, 0.15)', color: '#E6E1D9', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              📋 Appointment Lifecycle Center
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, margin: '0 0 0.4rem 0', fontFamily: 'Cinzel, serif', color: '#FAF8F3' }}>
              My Appointments & Consultations
            </h1>
            <p style={{ color: '#E6E1D9', margin: 0, fontSize: '0.95rem', opacity: 0.9 }}>
              Track your appointments, check in online, view live telemetry, and review past care.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => fetchAppointments(true)}
              disabled={refreshing}
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#FAF8F3',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              🔄 {refreshing ? 'Refreshing...' : 'Refresh All'}
            </button>
            <button
              onClick={() => navigate('/customer/book')}
              style={{
                padding: '0.75rem 1.25rem',
                background: '#5F7A70',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(95, 122, 112, 0.3)',
              }}
            >
              ✨ Book Appointment
            </button>
          </div>
        </div>
      </div>

      {error && <div className="banner banner-danger" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '2px solid #E6E1D9',
          marginBottom: '1.75rem',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
        {[
          { id: 'active', label: '🟢 Active Today / Queue' },
          { id: 'upcoming', label: '📅 Upcoming' },
          { id: 'completed', label: '✅ Completed' },
          { id: 'cancelled', label: '❌ Cancelled' },
          { id: 'no_show', label: '⚠️ Missed / Skipped' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid #5F7A70' : '3px solid transparent',
                color: isActive ? '#211C19' : '#78716C',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.95rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                marginBottom: '-2px',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Grid */}
      {loading ? (
        <LoadingState message="Loading your appointments..." />
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          title={getEmptyMessage()}
          message="Select another tab or schedule a new appointment consultation."
          actionText="Book New Appointment"
          onAction={() => navigate('/customer/book')}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {filteredAppointments.map((appt) => {
            const qEntry = appt.queue_entry;
            const qStatus = qEntry?.status || appt.status;
            const orgId = appt.organization_id || appt.organization;

            const canCheckIn = appt.status === 'CONFIRMED' || (qEntry && !qEntry.is_checked_in);
            const canCancel = ['CONFIRMED', 'PENDING'].includes(appt.status) && !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED', 'IN_PROGRESS'].includes(qStatus);
            const isLive = ['CHECKED_IN', 'WAITING', 'CALLED', 'IN_PROGRESS'].includes(qStatus);
            const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'SKIPPED'].includes(qStatus);

            const formattedDate = new Date(appt.start_datetime).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const formattedTime = new Date(appt.start_datetime).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={appt.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E6E1D9',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justify: 'space-between',
                  boxShadow: '0 4px 16px rgba(47, 37, 32, 0.04)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                <div>
                  {/* Header: Organization & Category Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5F7A70', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {appt.organization_category || 'CLINIC'} &bull; {appt.organization_name || 'Organization'}
                      </span>
                      <h3 style={{ margin: '0.15rem 0 0 0', fontSize: '1.2rem', color: '#211C19', fontWeight: 700, fontFamily: 'Cinzel, serif' }}>
                        {appt.service_name || 'Service Consultation'}
                      </h3>
                    </div>
                    <StatusBadge status={qStatus} />
                  </div>

                  {/* Subheader: Provider */}
                  <div style={{ fontSize: '0.85rem', color: '#78716C', marginBottom: '1rem' }}>
                    Provider: <strong style={{ color: '#211C19' }}>{appt.provider_name || appt.provider_title || 'Assigned Specialist'}</strong>
                  </div>

                  {/* Schedule Card Info */}
                  <div
                    style={{
                      background: '#FAF8F3',
                      border: '1px solid #E6E1D9',
                      borderRadius: '10px',
                      padding: '0.85rem',
                      marginBottom: '1rem',
                      fontSize: '0.85rem',
                      color: '#211C19',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span>📅 <strong>{formattedDate}</strong></span>
                      <span>⏰ <strong>{formattedTime}</strong></span>
                    </div>

                    {appt.serial_number && (
                      <div style={{ fontSize: '0.8rem', color: '#2F2520', fontWeight: 700, marginTop: '0.25rem', paddingTop: '0.35rem', borderTop: '1px solid #E6E1D9' }}>
                        Serial Number: <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem' }}>#{appt.serial_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action Controls */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3' }}>
                  {canCheckIn && !isTerminal && (
                    <button
                      onClick={() => handleCheckIn(orgId, appt.id)}
                      disabled={checkingInId === appt.id}
                      style={{
                        padding: '0.55rem 0.9rem',
                        background: '#B06D2E',
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

                  {isLive && qEntry?.id && (
                    <button
                      onClick={() => navigate(`/customer/queue/${qEntry.id}`)}
                      style={{
                        padding: '0.55rem 0.9rem',
                        background: '#2F2520',
                        color: '#FAF8F3',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      Open Telemetry →
                    </button>
                  )}

                  <button
                    onClick={() => navigate(`/customer/appointments/${appt.id}`)}
                    style={{
                      padding: '0.55rem 0.9rem',
                      background: '#FAF8F3',
                      color: '#5F7A70',
                      border: '1px solid #E6E1D9',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    Details
                  </button>

                  {qStatus === 'COMPLETED' && (
                    <button
                      onClick={() => handleOpenReviewModal(appt)}
                      style={{
                        padding: '0.55rem 0.9rem',
                        background: '#F5EFE6',
                        color: '#B06D2E',
                        border: '1px solid #E6E1D9',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      ★ Leave Review
                    </button>
                  )}

                  {canCancel && (
                    <button
                      onClick={() => handleOpenCancelModal(appt)}
                      style={{
                        padding: '0.55rem 0.9rem',
                        background: '#FFF1F0',
                        color: '#B4534B',
                        border: '1px solid #FCA5A5',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  )}
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
    </div>
  );
}

export default CustomerAppointmentsPage;
