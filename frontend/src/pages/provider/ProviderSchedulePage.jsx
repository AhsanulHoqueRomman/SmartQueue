import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import providerManagementService from '../../services/providerManagementService';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

const DAYS = [
  { day: 0, name: 'Monday' },
  { day: 1, name: 'Tuesday' },
  { day: 2, name: 'Wednesday' },
  { day: 3, name: 'Thursday' },
  { day: 4, name: 'Friday' },
  { day: 5, name: 'Saturday' },
  { day: 6, name: 'Sunday' },
];

export function ProviderSchedulePage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  const [providerProfile, setProviderProfile] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [activeTab, setActiveTab] = useState('schedules');

  const [editingDay, setEditingDay] = useState(null);
  const [dayForm, setDayForm] = useState({
    day_of_week: 0,
    start_time: '09:00:00',
    end_time: '17:00:00',
    is_working_day: true,
  });

  const [breakScheduleId, setBreakScheduleId] = useState(null);
  const [breakForm, setBreakForm] = useState({
    title: 'Lunch Break',
    start_time: '12:00:00',
    end_time: '13:00:00',
  });

  const [leaveForm, setLeaveForm] = useState({
    start_datetime: '',
    end_datetime: '',
    reason: '',
  });

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) return;
    setLoading(true);

    organizationService
      .getProviders(currentOrg.id)
      .then((data) => {
        const list = Array.isArray(data) ? data : data.results || [];
        const myProfile = list.find((p) => p.user_id === user.id);
        setProviderProfile(myProfile || null);
      })
      .catch(() => setError('Failed to resolve provider profile.'))
      .finally(() => setLoading(false));
  }, [currentOrg?.id, user?.id]);

  const fetchSchedulesAndLeaves = async () => {
    if (!currentOrg?.id || !providerProfile?.id) return;
    try {
      const [schedData, leaveData] = await Promise.all([
        providerManagementService.getSchedules(currentOrg.id, providerProfile.id),
        providerManagementService.getLeaves(currentOrg.id, providerProfile.id),
      ]);
      setSchedules(Array.isArray(schedData) ? schedData : schedData.results || []);
      setLeaves(Array.isArray(leaveData) ? leaveData : leaveData.results || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load schedule data.');
    }
  };

  useEffect(() => {
    fetchSchedulesAndLeaves();
  }, [currentOrg?.id, providerProfile?.id]);

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setError(null);
    try {
      await providerManagementService.updateSchedule(
        currentOrg.id,
        providerProfile.id,
        dayForm
      );
      setFeedback({ type: 'success', message: 'Schedule updated successfully!' });
      setEditingDay(null);
      fetchSchedulesAndLeaves();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to update schedule.';
      setFeedback({ type: 'error', message: msg });
    }
  };

  const handleAddBreak = async (e) => {
    e.preventDefault();
    if (!breakScheduleId) return;
    setFeedback(null);
    setError(null);

    try {
      await providerManagementService.addBreak(
        currentOrg.id,
        providerProfile.id,
        breakScheduleId,
        breakForm
      );
      setFeedback({ type: 'success', message: 'Break added successfully!' });
      setBreakScheduleId(null);
      fetchSchedulesAndLeaves();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to add break.';
      setFeedback({ type: 'error', message: msg });
    }
  };

  const handleDeleteBreak = async (scheduleId, breakId) => {
    try {
      await providerManagementService.deleteBreak(
        currentOrg.id,
        providerProfile.id,
        scheduleId,
        breakId
      );
      setFeedback({ type: 'success', message: 'Break removed.' });
      fetchSchedulesAndLeaves();
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to remove break.' });
    }
  };

  const handleCreateLeave = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setError(null);

    try {
      await providerManagementService.createLeave(
        currentOrg.id,
        providerProfile.id,
        leaveForm
      );
      setFeedback({ type: 'success', message: 'Leave recorded successfully!' });
      setLeaveForm({ start_datetime: '', end_datetime: '', reason: '' });
      fetchSchedulesAndLeaves();
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Failed to create leave.';
      setFeedback({ type: 'error', message: msg });
    }
  };

  const handleDeleteLeave = async (leaveId) => {
    try {
      await providerManagementService.deleteLeave(
        currentOrg.id,
        providerProfile.id,
        leaveId
      );
      setFeedback({ type: 'success', message: 'Leave period removed.' });
      fetchSchedulesAndLeaves();
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to delete leave.' });
    }
  };

  if (loading) {
    return <LoadingState type="spinner" text="Loading schedule & leave data..." />;
  }

  if (!providerProfile) {
    return (
      <EmptyState
        title="Provider Profile Required"
        message="No active provider profile found for your account in this organization."
      />
    );
  }

  return (
    <div className="app-container animate-page-entrance">
      <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: '1.75rem' }}>
        <div>
          <h1>Schedule & Leave Management</h1>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>Configure weekly working shifts, breaks, and vacations.</p>
        </div>
        <div className="flex gap-xs">
          <button
            className={`btn ${activeTab === 'schedules' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('schedules')}
          >
            📆 Weekly Hours & Breaks
          </button>
          <button
            className={`btn ${activeTab === 'leaves' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('leaves')}
          >
            ✈️ Leave Periods ({leaves.length})
          </button>
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

      {/* Schedules Tab */}
      {activeTab === 'schedules' && (
        <div className="grid-responsive grid-cols-3 animate-section stagger-1">
          {DAYS.map((dayMeta) => {
            const sched = schedules.find((s) => s.day_of_week === dayMeta.day);
            const isWorking = sched ? sched.is_working_day : false;

            return (
              <div key={dayMeta.day} className="card flex flex-col justify-between" style={{ backgroundColor: isWorking ? 'var(--color-surface)' : 'var(--color-bg-subtle)' }}>
                <div>
                  <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>
                    <h4>{dayMeta.name}</h4>
                    <span className={`badge ${isWorking ? 'badge-success' : 'badge-neutral'}`}>
                      {isWorking ? 'Working Day' : 'Day Off'}
                    </span>
                  </div>

                  {isWorking && sched ? (
                    <div>
                      <p className="text-sm text-main font-medium" style={{ marginBottom: '0.75rem' }}>
                        ⏰ <strong>Hours:</strong> {sched.start_time} – {sched.end_time}
                      </p>

                      <div style={{ marginTop: '0.75rem' }}>
                        <span className="text-xs text-muted font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Breaks</span>
                        {sched.breaks && sched.breaks.length > 0 ? (
                          <div className="flex flex-col gap-xs" style={{ marginTop: '0.35rem' }}>
                            {sched.breaks.map((b) => (
                              <div key={b.id} className="flex justify-between items-center" style={{ backgroundColor: 'var(--color-bg-subtle)', padding: '0.35rem 0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem' }}>
                                <span className="font-medium">{b.title} ({b.start_time} - {b.end_time})</span>
                                <button
                                  style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', fontWeight: 'bold' }}
                                  onClick={() => handleDeleteBreak(sched.id, b.id)}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>No breaks set</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Not scheduled to work on {dayMeta.name}.</p>
                  )}
                </div>

                <div className="flex gap-xs" style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setEditingDay(dayMeta.day);
                      setDayForm({
                        day_of_week: dayMeta.day,
                        start_time: sched?.start_time || '09:00:00',
                        end_time: sched?.end_time || '17:00:00',
                        is_working_day: sched ? sched.is_working_day : true,
                      });
                    }}
                  >
                    Edit Shift
                  </button>
                  {isWorking && sched && (
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => setBreakScheduleId(sched.id)}
                    >
                      + Break
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Shift Modal */}
      {editingDay !== null && (
        <div className="modal-backdrop" onClick={() => setEditingDay(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit {DAYS.find((d) => d.day === editingDay)?.name} Schedule</h3>
              <button className="modal-close-btn" onClick={() => setEditingDay(null)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveSchedule}>
              <div className="modal-body flex flex-col gap-md">
                <div className="form-group">
                  <label className="flex items-center gap-xs text-sm" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={dayForm.is_working_day}
                      onChange={(e) =>
                        setDayForm({ ...dayForm, is_working_day: e.target.checked })
                      }
                    />
                    Is Working Day
                  </label>
                </div>

                {dayForm.is_working_day && (
                  <div className="grid-responsive grid-cols-2">
                    <div className="form-group">
                      <label className="form-label">Shift Start Time</label>
                      <input
                        type="time"
                        className="form-control"
                        value={dayForm.start_time}
                        onChange={(e) =>
                          setDayForm({ ...dayForm, start_time: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Shift End Time</label>
                      <input
                        type="time"
                        className="form-control"
                        value={dayForm.end_time}
                        onChange={(e) =>
                          setDayForm({ ...dayForm, end_time: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingDay(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Break Modal */}
      {breakScheduleId !== null && (
        <div className="modal-backdrop" onClick={() => setBreakScheduleId(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Schedule Break</h3>
              <button
                className="modal-close-btn"
                onClick={() => setBreakScheduleId(null)}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddBreak}>
              <div className="modal-body flex flex-col gap-md">
                <div className="form-group">
                  <label className="form-label">Break Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Lunch Break, Meeting..."
                    value={breakForm.title}
                    onChange={(e) =>
                      setBreakForm({ ...breakForm, title: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="grid-responsive grid-cols-2">
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <input
                      type="time"
                      className="form-control"
                      value={breakForm.start_time}
                      onChange={(e) =>
                        setBreakForm({ ...breakForm, start_time: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time</label>
                    <input
                      type="time"
                      className="form-control"
                      value={breakForm.end_time}
                      onChange={(e) =>
                        setBreakForm({ ...breakForm, end_time: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setBreakScheduleId(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Break
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leaves Tab */}
      {activeTab === 'leaves' && (
        <div className="flex flex-col gap-lg animate-section stagger-1">
          <div className="card">
            <h3>Record New Leave Period</h3>
            <form onSubmit={handleCreateLeave} className="grid-responsive grid-cols-3 items-center" style={{ marginTop: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Start Datetime</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={leaveForm.start_datetime}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, start_datetime: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">End Datetime</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={leaveForm.end_datetime}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, end_datetime: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Reason</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Vacation, Conference..."
                  value={leaveForm.reason}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, reason: e.target.value })
                  }
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ gridColumn: 'span 1', marginTop: '1rem' }}>
                + Record Leave
              </button>
            </form>
          </div>

          <div className="card">
            <h3>Scheduled Leaves ({leaves.length})</h3>
            {leaves.length === 0 ? (
              <EmptyState
                title="No Leave Periods"
                message="You have no upcoming leave blocks registered."
              />
            ) : (
              <div className="table-container" style={{ marginTop: '1rem' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Start Datetime</th>
                      <th>End Datetime</th>
                      <th>Reason</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((lv) => (
                      <tr key={lv.id}>
                        <td>{new Date(lv.start_datetime).toLocaleString()}</td>
                        <td>{new Date(lv.end_datetime).toLocaleString()}</td>
                        <td>{lv.reason || 'Unspecified'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeleteLeave(lv.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProviderSchedulePage;
