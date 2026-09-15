import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import appointmentService from '../../services/appointmentService';
import queueService from '../../services/queueService';
import CancelAppointmentModal from '../../components/CancelAppointmentModal';
import LeaveReviewModal from '../../components/LeaveReviewModal';
import StatusBadge from '../../components/StatusBadge';
import LoadingState from '../../components/LoadingState';
import EmptyState from '../../components/EmptyState';

export function CustomerAppointmentsPage() {
  const navigate = useNavigate();
  const { currentOrg } = useTenant();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  
  // Modals state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [checkingInId, setCheckingInId] = useState(null);

  const fetchAppointments = async () => {
    if (!currentOrg?.id) {
      setAppointments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await appointmentService.getAppointments(currentOrg.id);
      const list = Array.isArray(data) ? data : data.results || [];
      setAppointments(list);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load your appointments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [currentOrg?.id]);

  const handleCheckIn = async (appointmentId) => {
    setCheckingInId(appointmentId);
    setActionFeedback(null);
    setError(null);

    try {
      const updated = await appointmentService.checkInAppointment(
        currentOrg.id,
        appointmentId
      );

      // Check if queue entry can be retrieved to jump directly to live queue
      try {
        const queueRes = await queueService.getMyQueue(currentOrg.id);
        const myQueueList = Array.isArray(queueRes) ? queueRes : queueRes.results || [];
        const match = myQueueList.find(q => String(q.appointment_id) === String(appointmentId));
        if (match) {
          setActionFeedback({
            type: 'success',
            message: `Checked in successfully! Your token is #${match.token_number || match.id}.`,
            queueEntryId: match.id,
          });
          fetchAppointments();
          return;
        }
      } catch (qErr) {
        // Fallback if myQueue lookup is delayed
      }

      setActionFeedback({
        type: 'success',
        message: `Successfully checked in for ${updated.service_name || 'appointment'}! You have been added to the queue.`,
      });
      fetchAppointments();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        'Failed to check in. Please make sure check-in is currently allowed.';
      setActionFeedback({ type: 'error', message: msg });
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
    if (!selectedAppointment || !currentOrg?.id) return;
    try {
      await appointmentService.cancelAppointment(
        currentOrg.id,
        selectedAppointment.id,
        reason
      );
      setActionFeedback({
        type: 'success',
        message: 'Appointment successfully cancelled.',
      });
      setCancelModalOpen(false);
      setSelectedAppointment(null);
      fetchAppointments();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to cancel appointment.';
      setActionFeedback({ type: 'error', message: msg });
      setCancelModalOpen(false);
    }
  };

  // Filter appointments by tab
  const getFilteredAppointments = () => {
    const todayStr = new Date().toDateString();

    return appointments.filter((appt) => {
      const apptDateStr = new Date(appt.start_datetime).toDateString();
      const isToday = apptDateStr === todayStr;

      switch (activeTab) {
        case 'upcoming':
          return (
            (['CONFIRMED', 'PENDING'].includes(appt.status) && !isToday) ||
            (appt.status === 'CONFIRMED' && new Date(appt.start_datetime) > new Date())
          );
        case 'today':
          return isToday && ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'WAITING', 'CALLED'].includes(appt.status);
        case 'completed':
          return appt.status === 'COMPLETED';
        case 'cancelled':
          return appt.status === 'CANCELLED';
        case 'no_show':
          return appt.status === 'NO_SHOW';
        default:
          return true;
      }
    });
  };

  const filteredAppointments = getFilteredAppointments();

  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'upcoming':
        return 'You have no upcoming appointments scheduled.';
      case 'today':
        return 'You have no appointments scheduled for today.';
      case 'completed':
        return 'You have no completed appointments yet.';
      case 'cancelled':
        return 'You have no cancelled appointments.';
      case 'no_show':
        return 'You have no missed (no show) appointments.';
      default:
        return 'No appointments found.';
    }
  };

  return (
    <div className="animate-page-entrance">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-md margin-bottom">
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem', fontFamily: 'Cinzel, serif', color: '#211C19' }}>
            My Appointments
          </h1>
          <p className="subtitle" style={{ color: '#78716C' }}>
            Track your appointment schedule, check in online, and view service history.
          </p>
        </div>
        <div>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/customer/book')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#5F7A70', border: 'none' }}
          >
            <span>✨</span> Book Appointment
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div
          className={`banner ${actionFeedback.type === 'success' ? 'banner-success' : 'banner-danger'}`}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}
        >
          <span>{actionFeedback.message}</span>
          {actionFeedback.queueEntryId && (
            <button
              onClick={() => navigate(`/customer/queue/${actionFeedback.queueEntryId}`)}
              style={{
                background: '#2F2520',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              View Live Queue →
            </button>
          )}
        </div>
      )}

      {error && <div className="banner banner-danger">{error}</div>}

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
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'today', label: "Today's Schedule" },
          { id: 'completed', label: 'Completed' },
          { id: 'cancelled', label: 'Cancelled' },
          { id: 'no_show', label: 'No Show' },
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

      {/* Main Content */}
      {!currentOrg ? (
        <EmptyState
          title="No Organization Selected"
          message="Please select an organization from the header dropdown above to view your appointments."
        />
      ) : loading ? (
        <LoadingState message="Loading your appointment bookings..." />
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          title={getEmptyMessage()}
          message="Select another tab or schedule a new appointment."
          actionText="Book New Appointment"
          onAction={() => navigate('/customer/book')}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {filteredAppointments.map((appt) => {
            const canCheckIn = appt.status === 'CONFIRMED';
            const canCancel = ['CONFIRMED', 'PENDING'].includes(appt.status);
            const inQueue = ['CHECKED_IN', 'WAITING', 'CALLED', 'IN_PROGRESS'].includes(appt.status);
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <StatusBadge status={appt.status} />
                    <span style={{ fontSize: '0.75rem', color: '#78716C', fontFamily: 'monospace' }}>
                      #{appt.id.slice(0, 8)}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#211C19', marginBottom: '0.35rem', fontFamily: 'Outfit, sans-serif' }}>
                    {appt.service_name || 'Appointment Service'}
                  </h3>

                  <div style={{ fontSize: '0.85rem', color: '#5F7A70', fontWeight: 600, marginBottom: '0.75rem' }}>
                    👨‍⚕️ {appt.provider_name || 'Assigned Provider'}
                  </div>

                  <div
                    style={{
                      background: '#FAF8F3',
                      border: '1px solid #E6E1D9',
                      borderRadius: '10px',
                      padding: '0.75rem',
                      marginBottom: '1rem',
                      fontSize: '0.85rem',
                      color: '#211C19',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                      <span>📅</span> <strong>{formattedDate}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>⏰</span> <span>{formattedTime}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.75rem', borderTop: '1px solid #FAF8F3' }}>
                  {canCheckIn && (
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => handleCheckIn(appt.id)}
                      disabled={checkingInId === appt.id}
                      style={{ background: '#5F7A70', color: '#FFFFFF', border: 'none', fontWeight: 600 }}
                    >
                      {checkingInId === appt.id ? 'Checking in...' : '⚡ Check-In'}
                    </button>
                  )}

                  {inQueue && (
                    <button
                      className="btn btn-sm"
                      onClick={() => navigate(`/customer/appointments/${appt.id}`)}
                      style={{ background: '#2F2520', color: '#FFFFFF', border: 'none', fontWeight: 600 }}
                    >
                      ⏳ View Queue
                    </button>
                  )}

                  {appt.status === 'COMPLETED' && (
                    <button
                      className="btn btn-sm"
                      onClick={() => handleOpenReviewModal(appt)}
                      style={{ background: '#F5EFE6', color: '#B06D2E', border: '1px solid #E6E1D9', fontWeight: 600 }}
                    >
                      ★ Leave Review
                    </button>
                  )}

                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => navigate(`/customer/appointments/${appt.id}`)}
                  >
                    Details
                  </button>

                  {canCancel && (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleOpenCancelModal(appt)}
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
          orgId={currentOrg?.id}
          onSuccess={() => {
            setActionFeedback({ type: 'success', message: 'Thank you! Your review has been submitted.' });
            fetchAppointments();
          }}
          onClose={() => setReviewModalOpen(false)}
        />
      )}
    </div>
  );
}

export default CustomerAppointmentsPage;
