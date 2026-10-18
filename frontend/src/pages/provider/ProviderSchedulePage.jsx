import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import organizationService from '../../services/organizationService';
import providerManagementService from '../../services/providerManagementService';
import apiClient from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { bookingWindow } from '../../utils/bookingWindow';
import { initialSchedule, weekdayForDate } from '../../utils/scheduleDraft';
import '../../styles/OperationalPrimitives.css';
import '../../styles/ProviderSchedule.css';

const DAYS_OF_WEEK = [
  { day: 0, name: 'Monday', short: 'Mon' },
  { day: 1, name: 'Tuesday', short: 'Tue' },
  { day: 2, name: 'Wednesday', short: 'Wed' },
  { day: 3, name: 'Thursday', short: 'Thu' },
  { day: 4, name: 'Friday', short: 'Fri' },
  { day: 5, name: 'Saturday', short: 'Sat' },
  { day: 6, name: 'Sunday', short: 'Sun' },
];

/**
 * Format timestamp in Asia/Dhaka standard time.
 */
function formatDhakaDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d) + ' (BST)';
  } catch {
    return isoString;
  }
}

/**
 * Format date-only string in Asia/Dhaka standard time.
 */
function formatDhakaDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(`${dateStr}T12:00:00+06:00`);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Compute earliest valid date string (YYYY-MM-DD) for schedule requests in Asia/Dhaka.
 */
function getEarliestScheduleDate(kind) {
  const { first } = bookingWindow();
  const d = new Date(`${first}T00:00:00+06:00`);
  const daysToAdd = kind === 'SPECIFIC_DATE' ? 4 : 10;
  d.setDate(d.getDate() + daysToAdd);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Compute earliest valid datetime string (YYYY-MM-DDTHH:mm) for leave requests in Asia/Dhaka.
 */
function getEarliestLeaveDatetime() {
  const { first } = bookingWindow();
  const d = new Date(`${first}T00:00:00+06:00`);
  d.setDate(d.getDate() + 4);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}T09:00`;
}

export function ProviderSchedulePage() {
  const { user } = useAuth();
  const { currentOrg } = useTenant();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState('schedules'); // 'schedules' | 'requests' | 'leaves'

  // Component datasets
  const [providerProfile, setProviderProfile] = useState(null);
  const [hasResolvedProfile, setHasResolvedProfile] = useState(false);
  const [schedulesData, setSchedulesData] = useState({ orgId: null, items: [] });
  const [requestsData, setRequestsData] = useState({ orgId: null, items: [] });
  const [leavesData, setLeavesData] = useState({ orgId: null, items: [] });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Modals & Action States
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestKind, setRequestKind] = useState('SPECIFIC_DATE');
  const [requestDate, setRequestDate] = useState('');
  const [requestDays, setRequestDays] = useState([]);
  const [requestReason, setRequestReason] = useState('');
  const [requestAttachment, setRequestAttachment] = useState(null);
  const [requestPreparing, setRequestPreparing] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    start_datetime: '',
    end_datetime: '',
    reason: '',
  });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  const [withdrawConfirmLeave, setWithdrawConfirmLeave] = useState(null);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  // Accessibility, Focus Trap & Dialog Refs
  const lastFocusedElementRef = useRef(null);
  const requestKindSelectRef = useRef(null);
  const leaveStartInputRef = useRef(null);
  const withdrawCancelBtnRef = useRef(null);

  // Multi-Tenant Isolation & Mutation Safety Refs
  const activeOrgIdRef = useRef(currentOrg?.id);
  activeOrgIdRef.current = currentOrg?.id;
  const orgContextGenRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const prevOrgIdRef = useRef(currentOrg?.id);
  const mutationBusyRef = useRef(false);
  const prepareRevisionRef = useRef(0);

  // Render-time tenant guards
  const schedules = useMemo(
    () => (schedulesData.orgId === currentOrg?.id ? schedulesData.items : []),
    [schedulesData, currentOrg?.id]
  );
  const requests = useMemo(
    () => (requestsData.orgId === currentOrg?.id ? requestsData.items : []),
    [requestsData, currentOrg?.id]
  );
  const leaves = useMemo(
    () => (leavesData.orgId === currentOrg?.id ? leavesData.items : []),
    [leavesData, currentOrg?.id]
  );

  /**
   * Primary asynchronous fetch with request ticket & generation tracking.
   */
  const fetchAllScheduleData = useCallback(
    async (targetOrgId) => {
      const orgIdToFetch = targetOrgId || currentOrg?.id;
      if (!orgIdToFetch || !user?.id) return;

      const requestId = ++activeRequestIdRef.current;
      const requestGen = orgContextGenRef.current;
      setLoading(true);
      setError(null);

      try {
        // 1. Resolve Provider Profile for Authenticated User (Zero Fallback)
        const provsData = await organizationService.getProviders(orgIdToFetch);

        if (
          requestId !== activeRequestIdRef.current ||
          requestGen !== orgContextGenRef.current ||
          orgIdToFetch !== activeOrgIdRef.current
        ) {
          return;
        }

        const provList = Array.isArray(provsData) ? provsData : provsData?.results || [];
        const myProfile = provList.find((p) => p.user_id === user.id) || null;

        setProviderProfile(myProfile);
        setHasResolvedProfile(true);

        if (!myProfile) {
          setSchedulesData({ orgId: orgIdToFetch, items: [] });
          setRequestsData({ orgId: orgIdToFetch, items: [] });
          setLeavesData({ orgId: orgIdToFetch, items: [] });
          setLoading(false);
          return;
        }

        // 2. Fetch Weekly Schedules, Schedule Requests & Leaves in Parallel
        const [schedResult, requestsResult, leavesResult] = await Promise.allSettled([
          providerManagementService.getSchedules(orgIdToFetch, myProfile.id),
          apiClient.get(`/organizations/${orgIdToFetch}/providers/${myProfile.id}/schedule-requests/`),
          providerManagementService.getLeaves(orgIdToFetch, myProfile.id),
        ]);

        if (
          requestId !== activeRequestIdRef.current ||
          requestGen !== orgContextGenRef.current ||
          orgIdToFetch !== activeOrgIdRef.current
        ) {
          return;
        }

        // Handle Schedules
        if (schedResult.status === 'fulfilled') {
          const rawSched = schedResult.value;
          const items = Array.isArray(rawSched) ? rawSched : rawSched?.results || [];
          setSchedulesData({ orgId: orgIdToFetch, items });
        } else {
          setSchedulesData({ orgId: orgIdToFetch, items: [] });
        }

        // Handle Schedule Requests
        if (requestsResult.status === 'fulfilled') {
          const rawReqs = requestsResult.value.data;
          const items = Array.isArray(rawReqs) ? rawReqs : rawReqs?.results || [];
          setRequestsData({ orgId: orgIdToFetch, items });
        } else {
          setRequestsData({ orgId: orgIdToFetch, items: [] });
        }

        // Handle Planned Leaves
        if (leavesResult.status === 'fulfilled') {
          const rawLeaves = leavesResult.value;
          const items = Array.isArray(rawLeaves) ? rawLeaves : rawLeaves?.results || [];
          setLeavesData({ orgId: orgIdToFetch, items });
        } else {
          setLeavesData({ orgId: orgIdToFetch, items: [] });
        }
      } catch (err) {
        if (
          requestId !== activeRequestIdRef.current ||
          requestGen !== orgContextGenRef.current ||
          orgIdToFetch !== activeOrgIdRef.current
        ) {
          return;
        }
        setError(
          err.response?.data?.error?.message ||
          err.response?.data?.detail ||
          'Failed to load schedule and leave records.'
        );
      } finally {
        if (
          requestId === activeRequestIdRef.current &&
          requestGen === orgContextGenRef.current &&
          orgIdToFetch === activeOrgIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [currentOrg?.id, user?.id]
  );

  // Organization switch watcher: resets state, clears stale data, increments generation
  useEffect(() => {
    if (prevOrgIdRef.current !== currentOrg?.id) {
      prevOrgIdRef.current = currentOrg?.id;
      orgContextGenRef.current += 1;

      setProviderProfile(null);
      setHasResolvedProfile(false);
      setFeedback(null);
      setError(null);
      setRequestModalOpen(false);
      setLeaveModalOpen(false);
      setWithdrawConfirmLeave(null);

      setSchedulesData({ orgId: currentOrg?.id || null, items: [] });
      setRequestsData({ orgId: currentOrg?.id || null, items: [] });
      setLeavesData({ orgId: currentOrg?.id || null, items: [] });
    }

    if (currentOrg?.id && user?.id) {
      fetchAllScheduleData(currentOrg.id);
    }
  }, [currentOrg?.id, user?.id, fetchAllScheduleData]);

  // Derived Statistics
  const stats = useMemo(() => {
    const totalWeeklyHours = schedules
      .filter((s) => s.is_working_day)
      .reduce((sum, s) => {
        try {
          const [sh, sm] = (s.start_time || '09:00:00').split(':').map(Number);
          const [eh, em] = (s.end_time || '17:00:00').split(':').map(Number);
          const duration = eh + em / 60 - (sh + sm / 60);
          return sum + (duration > 0 ? duration : 0);
        } catch {
          return sum;
        }
      }, 0);

    const workingDaysCount = schedules.filter((s) => s.is_working_day).length;
    const totalBreaks = schedules.reduce((sum, s) => sum + (s.breaks?.length || 0), 0);
    const pendingRequestsCount = requests.filter((r) => r.status === 'PENDING').length;
    const upcomingLeavesCount = leaves.filter((l) => l.status === 'APPROVED' || l.status === 'PENDING' || l.status === null).length;

    return {
      totalWeeklyHours: Math.round(totalWeeklyHours * 10) / 10,
      workingDaysCount,
      totalBreaks,
      pendingRequestsCount,
      upcomingLeavesCount,
    };
  }, [schedules, requests, leaves]);

  // --------------------------------------------------------------------------
  // Schedule Change Request Logic
  // --------------------------------------------------------------------------

  const closeRequestModal = useCallback(() => {
    if (requestSubmitting || mutationBusyRef.current) return;
    setRequestModalOpen(false);
    if (lastFocusedElementRef.current?.focus) {
      lastFocusedElementRef.current.focus();
    }
  }, [requestSubmitting]);

  const handleOpenRequestModal = () => {
    lastFocusedElementRef.current = document.activeElement;
    const defaultKind = 'SPECIFIC_DATE';
    const minDate = getEarliestScheduleDate(defaultKind);
    setRequestKind(defaultKind);
    setRequestDate(minDate);
    setRequestReason('');
    setRequestAttachment(null);
    setRequestModalOpen(true);
    prepareScheduleForDate(minDate, defaultKind);
  };

  const prepareScheduleForDate = async (targetDate, currentKind) => {
    if (!currentOrg?.id || !providerProfile?.id || !targetDate) return;
    const revision = ++prepareRevisionRef.current;
    setRequestPreparing(true);

    try {
      const response = await apiClient.get(
        `/organizations/${currentOrg.id}/providers/${providerProfile.id}/schedules/`,
        { params: { date: targetDate } }
      );
      if (revision === prepareRevisionRef.current) {
        const rawDays = Array.isArray(response.data) ? response.data : [];
        const mapped = rawDays.map((d) => ({
          day_of_week: d.day_of_week,
          start_time: d.start_time?.slice(0, 8) || '09:00:00',
          end_time: d.end_time?.slice(0, 8) || '17:00:00',
          is_working_day: Boolean(d.is_working_day),
          breaks: Array.isArray(d.breaks) ? d.breaks : [],
        }));
        setRequestDays(mapped);
      }
    } catch {
      if (revision === prepareRevisionRef.current) {
        setRequestDays(initialSchedule());
      }
    } finally {
      if (revision === prepareRevisionRef.current) {
        setRequestPreparing(false);
      }
    }
  };

  const handleKindChange = (newKind) => {
    setRequestKind(newKind);
    const minDate = getEarliestScheduleDate(newKind);
    if (!requestDate || requestDate < minDate) {
      setRequestDate(minDate);
      prepareScheduleForDate(minDate, newKind);
    }
  };

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setRequestDate(newDate);
    prepareScheduleForDate(newDate, requestKind);
  };

  const handleDayChange = (dayIndex, field, value) => {
    setRequestDays((prevDays) =>
      prevDays.map((day, idx) => (idx === dayIndex ? { ...day, [field]: value } : day))
    );
  };

  const handleAddBreakToDay = (dayIndex) => {
    setRequestDays((prevDays) =>
      prevDays.map((day, idx) => {
        if (idx !== dayIndex) return day;
        const currentBreaks = Array.isArray(day.breaks) ? day.breaks : [];
        return {
          ...day,
          breaks: [
            ...currentBreaks,
            { title: 'Rest Break', start_time: '13:00:00', end_time: '14:00:00' },
          ],
        };
      })
    );
  };

  const handleRemoveBreakFromDay = (dayIndex, breakIndex) => {
    setRequestDays((prevDays) =>
      prevDays.map((day, idx) => {
        if (idx !== dayIndex) return day;
        const currentBreaks = Array.isArray(day.breaks) ? day.breaks : [];
        return {
          ...day,
          breaks: currentBreaks.filter((_, bIdx) => bIdx !== breakIndex),
        };
      })
    );
  };

  const handleBreakChange = (dayIndex, breakIndex, field, value) => {
    setRequestDays((prevDays) =>
      prevDays.map((day, idx) => {
        if (idx !== dayIndex) return day;
        const currentBreaks = Array.isArray(day.breaks) ? day.breaks : [];
        return {
          ...day,
          breaks: currentBreaks.map((b, bIdx) => (bIdx === breakIndex ? { ...b, [field]: value } : b)),
        };
      })
    );
  };

  const handleSubmitScheduleRequest = async (e) => {
    e.preventDefault();
    if (mutationBusyRef.current || requestSubmitting || requestPreparing) return;

    const orgIdAtStart = currentOrg?.id;
    const providerIdAtStart = providerProfile?.id;
    if (!orgIdAtStart || !providerIdAtStart) return;

    // Validate Notice
    const minAllowedDate = getEarliestScheduleDate(requestKind);
    if (requestDate < minAllowedDate) {
      const noticeDays = requestKind === 'SPECIFIC_DATE' ? 4 : 10;
      setFeedback({
        type: 'error',
        message: `Schedule change requires at least ${noticeDays} calendar days advance notice in Asia/Dhaka.`,
      });
      return;
    }

    if (!requestReason.trim()) {
      setFeedback({ type: 'error', message: 'A valid reason for the schedule change is required.' });
      return;
    }

    // Determine payload days matching backend expectation:
    // SPECIFIC_DATE: exactly 1 day matching weekday of effective_date
    // PERMANENT: all 7 days
    let payloadDays = requestDays;
    if (requestKind === 'SPECIFIC_DATE') {
      const targetWeekday = weekdayForDate(requestDate);
      payloadDays = requestDays.filter((d) => d.day_of_week === targetWeekday);
      if (payloadDays.length === 0) {
        setFeedback({ type: 'error', message: 'Proposed schedule does not contain the affected weekday.' });
        return;
      }
    } else if (requestDays.length !== 7) {
      setFeedback({ type: 'error', message: 'Permanent schedule change requires configuring all seven weekdays.' });
      return;
    }

    // Validate end time <= 22:00:00 (G6)
    for (const d of payloadDays) {
      if (d.is_working_day && d.end_time > '22:00:00') {
        setFeedback({
          type: 'error',
          message: 'Shift end times cannot exceed 10:00 PM (22:00) Asia/Dhaka.',
        });
        return;
      }
    }

    // Validate attachment size <= 3MB
    if (requestAttachment && requestAttachment.size > 3 * 1024 * 1024) {
      setFeedback({
        type: 'error',
        message: 'Supporting document must be at most 3 MB in size.',
      });
      return;
    }

    mutationBusyRef.current = true;
    setRequestSubmitting(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append('kind', requestKind);
      formData.append('effective_date', requestDate);
      formData.append('reason', requestReason.trim());
      formData.append('proposed_schedule', JSON.stringify(payloadDays));
      if (requestAttachment) {
        formData.append('attachment', requestAttachment);
      }

      await apiClient.post(
        `/organizations/${orgIdAtStart}/providers/${providerIdAtStart}/schedule-requests/`,
        formData
      );

      // Verify tenant has not changed before updating UI state
      if (orgIdAtStart === activeOrgIdRef.current) {
        setFeedback({
          type: 'success',
          message: 'Schedule change request submitted for manager review. Live working hours remain unchanged until approved.',
        });
        setRequestModalOpen(false);
        if (lastFocusedElementRef.current?.focus) {
          lastFocusedElementRef.current.focus();
        }
        fetchAllScheduleData(orgIdAtStart);
      }
    } catch (err) {
      if (orgIdAtStart === activeOrgIdRef.current) {
        setFeedback({
          type: 'error',
          message:
            err.response?.data?.error?.message ||
            err.response?.data?.detail ||
            'Failed to submit schedule change request.',
        });
      }
    } finally {
      mutationBusyRef.current = false;
      setRequestSubmitting(false);
    }
  };

  const handleDownloadAttachment = async (requestId, filename = 'supporting-document') => {
    if (!currentOrg?.id || !providerProfile?.id) return;
    try {
      const response = await apiClient.get(
        `/organizations/${currentOrg.id}/providers/${providerProfile.id}/schedule-requests/${requestId}/attachment/`,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setFeedback({ type: 'error', message: 'Failed to download supporting attachment.' });
    }
  };

  // --------------------------------------------------------------------------
  // Planned Leave Logic
  // --------------------------------------------------------------------------

  const closeLeaveModal = useCallback(() => {
    if (leaveSubmitting || mutationBusyRef.current) return;
    setLeaveModalOpen(false);
    if (lastFocusedElementRef.current?.focus) {
      lastFocusedElementRef.current.focus();
    }
  }, [leaveSubmitting]);

  const handleOpenLeaveModal = () => {
    lastFocusedElementRef.current = document.activeElement;
    const minStart = getEarliestLeaveDatetime();
    setLeaveForm({
      start_datetime: minStart,
      end_datetime: minStart.slice(0, 10) + 'T17:00',
      reason: '',
    });
    setLeaveModalOpen(true);
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    if (mutationBusyRef.current || leaveSubmitting) return;

    const orgIdAtStart = currentOrg?.id;
    const providerIdAtStart = providerProfile?.id;
    if (!orgIdAtStart || !providerIdAtStart) return;

    if (new Date(leaveForm.end_datetime) <= new Date(leaveForm.start_datetime)) {
      setFeedback({ type: 'error', message: 'Leave end datetime must be after start datetime.' });
      return;
    }

    const earliestStart = getEarliestLeaveDatetime();
    if (leaveForm.start_datetime < earliestStart) {
      setFeedback({
        type: 'error',
        message: 'Planned leave requests require at least 4 calendar days advance notice in Asia/Dhaka.',
      });
      return;
    }

    mutationBusyRef.current = true;
    setLeaveSubmitting(true);
    setFeedback(null);

    try {
      await providerManagementService.createLeave(
        orgIdAtStart,
        providerIdAtStart,
        leaveForm
      );

      if (orgIdAtStart === activeOrgIdRef.current) {
        setFeedback({
          type: 'success',
          message: 'Planned leave request submitted for manager review. It will become effective upon manager approval.',
        });
        setLeaveModalOpen(false);
        if (lastFocusedElementRef.current?.focus) {
          lastFocusedElementRef.current.focus();
        }
        fetchAllScheduleData(orgIdAtStart);
      }
    } catch (err) {
      if (orgIdAtStart === activeOrgIdRef.current) {
        setFeedback({
          type: 'error',
          message:
            err.response?.data?.error?.message ||
            err.response?.data?.detail ||
            'Failed to submit planned leave request.',
        });
      }
    } finally {
      mutationBusyRef.current = false;
      setLeaveSubmitting(false);
    }
  };

  const handleTriggerWithdraw = (lv) => {
    lastFocusedElementRef.current = document.activeElement;
    setWithdrawConfirmLeave(lv);
  };

  const closeWithdrawModal = useCallback(() => {
    if (withdrawSubmitting || mutationBusyRef.current) return;
    setWithdrawConfirmLeave(null);
    if (lastFocusedElementRef.current?.focus) {
      lastFocusedElementRef.current.focus();
    }
  }, [withdrawSubmitting]);

  const handleConfirmWithdrawLeave = async () => {
    if (!withdrawConfirmLeave || mutationBusyRef.current || withdrawSubmitting) return;

    const orgIdAtStart = currentOrg?.id;
    const providerIdAtStart = providerProfile?.id;
    const leaveId = withdrawConfirmLeave.id;
    if (!orgIdAtStart || !providerIdAtStart || !leaveId) return;

    mutationBusyRef.current = true;
    setWithdrawSubmitting(true);
    setFeedback(null);

    try {
      await providerManagementService.deleteLeave(
        orgIdAtStart,
        providerIdAtStart,
        leaveId
      );

      if (orgIdAtStart === activeOrgIdRef.current) {
        setFeedback({
          type: 'success',
          message: 'Planned leave request withdrawn successfully.',
        });
        setWithdrawConfirmLeave(null);
        if (lastFocusedElementRef.current?.focus) {
          lastFocusedElementRef.current.focus();
        }
        fetchAllScheduleData(orgIdAtStart);
      }
    } catch (err) {
      if (orgIdAtStart === activeOrgIdRef.current) {
        setFeedback({
          type: 'error',
          message:
            err.response?.data?.error?.message ||
            err.response?.data?.detail ||
            'Failed to withdraw planned leave request.',
        });
      }
    } finally {
      mutationBusyRef.current = false;
      setWithdrawSubmitting(false);
    }
  };

  // Initial focus management when dialogs open
  useEffect(() => {
    if (requestModalOpen) {
      requestKindSelectRef.current?.focus();
    }
  }, [requestModalOpen]);

  useEffect(() => {
    if (leaveModalOpen) {
      leaveStartInputRef.current?.focus();
    }
  }, [leaveModalOpen]);

  useEffect(() => {
    if (withdrawConfirmLeave) {
      withdrawCancelBtnRef.current?.focus();
    }
  }, [withdrawConfirmLeave]);

  // Global Escape dismissal and Tab focus trapping for active dialogs
  useEffect(() => {
    const isAnyDialogOpen = Boolean(requestModalOpen || leaveModalOpen || withdrawConfirmLeave);
    if (!isAnyDialogOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (mutationBusyRef.current || requestSubmitting || leaveSubmitting || withdrawSubmitting) {
          return;
        }
        if (withdrawConfirmLeave) {
          closeWithdrawModal();
          return;
        }
        if (leaveModalOpen) {
          closeLeaveModal();
          return;
        }
        if (requestModalOpen) {
          closeRequestModal();
          return;
        }
      }

      if (e.key === 'Tab') {
        const activeDialog = document.querySelector(
          '.provider-schedule__modal-backdrop .provider-schedule__modal-container'
        );
        if (!activeDialog) return;

        const focusable = activeDialog.querySelectorAll(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    requestModalOpen,
    leaveModalOpen,
    withdrawConfirmLeave,
    requestSubmitting,
    leaveSubmitting,
    withdrawSubmitting,
    closeRequestModal,
    closeLeaveModal,
    closeWithdrawModal,
  ]);

  // --------------------------------------------------------------------------
  // Render Guards
  // --------------------------------------------------------------------------

  if (!currentOrg) {
    return (
      <EmptyState
        title="No Organization Selected"
        message="Select an active organization to view your schedule and leave management."
      />
    );
  }

  if (loading && !hasResolvedProfile && !error) {
    return <LoadingState message="Fetching provider operational schedule and records..." />;
  }

  if (!providerProfile && hasResolvedProfile) {
    return (
      <EmptyState
        icon="🩺"
        title="Provider Profile Not Registered"
        message={`Your account is not registered as an active clinical provider for ${currentOrg.name}. If you believe this is an error, please request an invitation from your organization manager.`}
      />
    );
  }

  return (
    <div className="provider-schedule app-container animate-page-entrance">
      {/* Header */}
      <header className="provider-schedule__header">
        <div className="provider-schedule__header-info">
          <div className="provider-schedule__eyebrow">
            <span aria-hidden="true">⏱️</span> Practice Operations · Asia/Dhaka (BST)
          </div>
          <div className="provider-schedule__title-row">
            <h1 className="provider-schedule__title">My Schedule & Leaves</h1>
            <span className="provider-schedule__role-badge">PROVIDER PORTAL</span>
          </div>
          <p className="provider-schedule__subtitle">
            Weekly operational shifts, manager-governed schedule requests, and planned leaves for{' '}
            <strong className="provider-schedule__subtitle-org">{currentOrg.name}</strong>.
          </p>
        </div>

        <div className="provider-schedule__controls">
          <button
            type="button"
            className="provider-schedule__btn-refresh"
            onClick={() => fetchAllScheduleData()}
            disabled={loading}
            aria-label="Refresh schedule and leave data"
          >
            <span aria-hidden="true">{loading ? '⏳' : '🔄'}</span>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Stats Summary Strip */}
      <div className="provider-schedule__stats-strip">
        <div className="provider-schedule__stat-chip provider-schedule__stat-chip--primary">
          <span>Weekly Hours:</span>
          <strong>{stats.totalWeeklyHours}h</strong>
        </div>
        <div className="provider-schedule__stat-chip">
          <span>Working Days:</span>
          <strong>{stats.workingDaysCount}/7</strong>
        </div>
        <div className="provider-schedule__stat-chip">
          <span>Configured Breaks:</span>
          <strong>{stats.totalBreaks}</strong>
        </div>
        <div className="provider-schedule__stat-chip">
          <span>Pending Requests:</span>
          <strong>{stats.pendingRequestsCount}</strong>
        </div>
        <div className="provider-schedule__stat-chip">
          <span>Planned Leaves:</span>
          <strong>{stats.upcomingLeavesCount}</strong>
        </div>
      </div>

      {/* Governance Advisory Policy Banner */}
      <div className="provider-schedule__info-banner" role="note">
        <span className="provider-schedule__info-banner-icon" aria-hidden="true">ℹ️</span>
        <div className="provider-schedule__info-banner-content">
          <strong>Manager-Governed Working Schedule:</strong> Approved operational schedules cannot be edited directly in order to protect existing patient bookings. Submit a temporary change (≥4 days notice) or permanent shift change (≥10 days notice) for manager approval. Working shifts must conclude by 10:00 PM Asia/Dhaka.
        </div>
      </div>

      {/* Action / Error Feedback Banner */}
      {feedback && (
        <div
          className={`provider-schedule__feedback-banner provider-schedule__feedback-banner--${feedback.type}`}
          role="status"
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            className="provider-schedule__error-retry"
            onClick={() => setFeedback(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="provider-schedule__feedback-banner provider-schedule__feedback-banner--error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="provider-schedule__error-retry"
            onClick={() => fetchAllScheduleData()}
          >
            Retry Fetch
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="provider-schedule__tabs-nav" role="tablist" aria-label="Schedule management tabs">
        <button
          type="button"
          role="tab"
          id="tab-schedules"
          aria-selected={activeTab === 'schedules'}
          aria-controls="panel-schedules"
          className={`provider-schedule__tab-btn ${activeTab === 'schedules' ? 'provider-schedule__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('schedules')}
        >
          <span>📆 Weekly Shift Hours</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-requests"
          aria-selected={activeTab === 'requests'}
          aria-controls="panel-requests"
          className={`provider-schedule__tab-btn ${activeTab === 'requests' ? 'provider-schedule__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          <span>📋 Change Requests</span>
          <span className="provider-schedule__tab-count">{requests.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-leaves"
          aria-selected={activeTab === 'leaves'}
          aria-controls="panel-leaves"
          className={`provider-schedule__tab-btn ${activeTab === 'leaves' ? 'provider-schedule__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('leaves')}
        >
          <span>✈️ Planned Leave</span>
          <span className="provider-schedule__tab-count">{leaves.length}</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: Weekly Schedule (Read-Only Live Working Hours)
          ========================================================================= */}
      {activeTab === 'schedules' && (
        <div id="panel-schedules" role="tabpanel" aria-labelledby="tab-schedules">
          <div className="provider-schedule__section-header">
            <div>
              <h2 className="provider-schedule__section-title">Weekly Working Schedule</h2>
              <p className="provider-schedule__section-desc">
                Authoritative recurring shifts and breaks configured in Asia/Dhaka timezone.
              </p>
            </div>

            <button
              type="button"
              className="provider-schedule__btn-primary"
              onClick={handleOpenRequestModal}
            >
              <span>+ Request Schedule Change</span>
            </button>
          </div>

          <div className="provider-schedule__weekly-grid">
            {DAYS_OF_WEEK.map((dayMeta) => {
              const sched = schedules.find((s) => s.day_of_week === dayMeta.day);
              const isWorking = Boolean(sched?.is_working_day);

              return (
                <article
                  key={dayMeta.day}
                  className={`provider-schedule__day-card ${!isWorking ? 'provider-schedule__day-card--off' : ''}`}
                >
                  <div>
                    <div className="provider-schedule__day-card-header">
                      <h3 className="provider-schedule__day-name">{dayMeta.name}</h3>
                      <StatusBadge
                        status={isWorking ? 'ACTIVE' : 'INACTIVE'}
                        customLabel={isWorking ? 'Working Day' : 'Day Off'}
                      />
                    </div>

                    {isWorking && sched ? (
                      <div>
                        <div className="provider-schedule__day-hours">
                          <span aria-hidden="true">⏰</span>
                          <span>
                            {sched.start_time?.slice(0, 5)} – {sched.end_time?.slice(0, 5)} (BST)
                          </span>
                        </div>

                        <div className="provider-schedule__breaks-block">
                          <div className="provider-schedule__breaks-label">Breaks</div>
                          {sched.breaks && sched.breaks.length > 0 ? (
                            <div className="provider-schedule__breaks-list">
                              {sched.breaks.map((b, idx) => (
                                <div key={b.id || idx} className="provider-schedule__break-item">
                                  <strong>{b.title || 'Break'}</strong>
                                  <span>
                                    {b.start_time?.slice(0, 5)} – {b.end_time?.slice(0, 5)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted">No breaks configured</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Not scheduled for clinical appointments on {dayMeta.name}s.</p>
                    )}
                  </div>

                  <div className="provider-schedule__day-card-footer">
                    <span>🔒 Manager Governed</span>
                    <button
                      type="button"
                      className="provider-schedule__link-btn"
                      onClick={() => {
                        setActiveTab('requests');
                        handleOpenRequestModal();
                      }}
                    >
                      Request Change
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: Schedule Change Requests
          ========================================================================= */}
      {activeTab === 'requests' && (
        <div id="panel-requests" role="tabpanel" aria-labelledby="tab-requests">
          <div className="provider-schedule__section-header">
            <div>
              <h2 className="provider-schedule__section-title">Schedule Change Requests</h2>
              <p className="provider-schedule__section-desc">
                Review your pending, approved, and rejected schedule alteration proposals.
              </p>
            </div>

            <button
              type="button"
              className="provider-schedule__btn-primary"
              onClick={handleOpenRequestModal}
            >
              <span>+ New Schedule Request</span>
            </button>
          </div>

          {requests.length === 0 ? (
            <EmptyState
              icon="📋"
              title="No Schedule Requests"
              message="You have no active or historical schedule change proposals. Submit a request if you need to adjust your working hours."
            />
          ) : (
            <div className="provider-schedule__requests-list">
              {requests.map((req) => (
                <article key={req.id} className="provider-schedule__request-card">
                  <div className="provider-schedule__request-header">
                    <div>
                      <div className="flex items-center gap-xs" style={{ marginBottom: '0.25rem' }}>
                        <span className="provider-schedule__request-kind-tag">
                          {req.kind === 'PERMANENT' ? 'Permanent Regular Shift' : 'Specific Date Exception'}
                        </span>
                        <span className="text-xs text-muted">
                          Submitted {formatDhakaDateTime(req.created_at)}
                        </span>
                      </div>
                      <h3 className="provider-schedule__request-date">
                        Effective {formatDhakaDate(req.effective_date)}
                      </h3>
                    </div>

                    <StatusBadge
                      status={
                        req.status === 'APPROVED'
                          ? 'CONFIRMED'
                          : req.status === 'REJECTED'
                          ? 'CANCELLED'
                          : 'PENDING'
                      }
                      customLabel={
                        req.status === 'APPROVED'
                          ? 'Approved'
                          : req.status === 'REJECTED'
                          ? 'Rejected'
                          : 'Pending Review'
                      }
                    />
                  </div>

                  <p className="provider-schedule__request-reason">
                    <strong>Reason:</strong> {req.reason || 'Unspecified clinical need.'}
                  </p>

                  {/* Booking Conflict Warning */}
                  {Boolean(req.affected_bookings?.length) && (
                    <div className="provider-schedule__conflict-banner" role="alert">
                      <span aria-hidden="true">⚠️</span>
                      <span>
                        Protected Booking Conflicts: {req.affected_bookings.map((b) => `${b.date} (Serial #${b.serial_number})`).join(', ')}. Manager approval is blocked until these appointments are resolved.
                      </span>
                    </div>
                  )}

                  {/* Comparison Grid */}
                  <div className="provider-schedule__comparison-grid">
                    <div className="provider-schedule__comparison-col">
                      <h5>Current Approved Schedule</h5>
                      <ul className="provider-schedule__comparison-days">
                        {(req.current_schedule || []).map((day) => (
                          <li key={day.day_of_week} className="provider-schedule__comparison-day-item">
                            <strong>{DAYS_OF_WEEK.find((d) => d.day === day.day_of_week)?.short}:</strong>
                            <span>
                              {day.is_working_day
                                ? `${day.start_time?.slice(0, 5)}–${day.end_time?.slice(0, 5)}`
                                : 'Off'}
                              {day.breaks?.length > 0 && ` (${day.breaks.length} break)`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="provider-schedule__comparison-col">
                      <h5>Proposed Schedule Change</h5>
                      <ul className="provider-schedule__comparison-days">
                        {(req.proposed_schedule || []).map((day) => (
                          <li key={day.day_of_week} className="provider-schedule__comparison-day-item">
                            <strong>{DAYS_OF_WEEK.find((d) => d.day === day.day_of_week)?.short}:</strong>
                            <span>
                              {day.is_working_day
                                ? `${day.start_time?.slice(0, 5)}–${day.end_time?.slice(0, 5)}`
                                : 'Off'}
                              {day.breaks?.length > 0 && ` (${day.breaks.length} break)`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Footer & Decisions */}
                  <div className="provider-schedule__request-footer">
                    <div>
                      {req.decision_reason && (
                        <span>
                          <strong>Manager Note:</strong> {req.decision_reason}
                        </span>
                      )}
                    </div>

                    {req.has_attachment && (
                      <button
                        type="button"
                        className="provider-schedule__btn-download"
                        onClick={() => handleDownloadAttachment(req.id, `supporting-${req.id}.pdf`)}
                      >
                        <span aria-hidden="true">📎</span> Download Document
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: Planned Leave
          ========================================================================= */}
      {activeTab === 'leaves' && (
        <div id="panel-leaves" role="tabpanel" aria-labelledby="tab-leaves">
          <div className="provider-schedule__section-header">
            <div>
              <h2 className="provider-schedule__section-title">Planned Leave Management</h2>
              <p className="provider-schedule__section-desc">
                Submit time-off requests with at least 4 calendar days advance notice in Asia/Dhaka.
              </p>
            </div>

            <button
              type="button"
              className="provider-schedule__btn-primary"
              onClick={handleOpenLeaveModal}
            >
              <span>+ Request Planned Leave</span>
            </button>
          </div>

          {leaves.length === 0 ? (
            <EmptyState
              icon="✈️"
              title="No Planned Leaves"
              message="You have no registered upcoming or historical leave blocks. Submit a leave request for vacations, sick days, or conference attendances."
            />
          ) : (
            <div className="provider-schedule__leaves-table-wrapper">
              <table className="provider-schedule__leaves-table">
                <thead>
                  <tr>
                    <th>Start Datetime (BST)</th>
                    <th>End Datetime (BST)</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Manager Notes</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((lv) => {
                    const isPending = lv.status === 'PENDING';
                    const isApproved = lv.status === 'APPROVED' || lv.status === null;
                    const isRejected = lv.status === 'REJECTED';

                    return (
                      <tr key={lv.id}>
                        <td>{formatDhakaDateTime(lv.start_datetime)}</td>
                        <td>{formatDhakaDateTime(lv.end_datetime)}</td>
                        <td>{lv.reason || 'Unspecified leave'}</td>
                        <td>
                          {isPending && <StatusBadge status="PENDING" customLabel="Pending Review" />}
                          {isApproved && (
                            <StatusBadge
                              status="CONFIRMED"
                              customLabel={lv.status === null ? 'Effective (Approved)' : 'Approved'}
                            />
                          )}
                          {isRejected && <StatusBadge status="CANCELLED" customLabel="Rejected" />}
                        </td>
                        <td>{lv.decision_reason || '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="provider-schedule__btn-withdraw"
                            disabled={!isPending}
                            title={
                              isPending
                                ? 'Withdraw this pending leave request'
                                : 'Only pending requests may be withdrawn by clinicians'
                            }
                            onClick={() => handleTriggerWithdraw(lv)}
                          >
                            Withdraw
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL: Schedule Change Request
          ========================================================================= */}
      {requestModalOpen && (
        <div
          className="provider-schedule__modal-backdrop"
          onClick={closeRequestModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-schedule-request-title"
        >
          <div
            className="provider-schedule__modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="provider-schedule__modal-header">
              <h3 id="modal-schedule-request-title">Request Schedule Change</h3>
              <button
                type="button"
                className="provider-schedule__modal-close"
                onClick={closeRequestModal}
                disabled={requestSubmitting}
                aria-label="Close schedule request modal"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitScheduleRequest}>
              <div className="provider-schedule__modal-body">
                <div className="provider-schedule__form-group">
                  <label className="provider-schedule__form-label" htmlFor="request-kind-select">
                    Change Classification
                  </label>
                  <select
                    id="request-kind-select"
                    ref={requestKindSelectRef}
                    className="provider-schedule__form-control"
                    value={requestKind}
                    onChange={(e) => handleKindChange(e.target.value)}
                  >
                    <option value="SPECIFIC_DATE">Specific Date Exception (≥ 4 Days Notice)</option>
                    <option value="PERMANENT">Permanent Shift Change (≥ 10 Days Notice)</option>
                  </select>
                  <span className="provider-schedule__form-hint">
                    {requestKind === 'SPECIFIC_DATE'
                      ? 'Adjusts your working hours for a single date without modifying your regular recurring shift.'
                      : 'Changes your baseline recurring working schedule across all seven weekdays.'}
                  </span>
                </div>

                <div className="provider-schedule__form-group">
                  <label className="provider-schedule__form-label" htmlFor="request-date-input">
                    Affected / Effective Date (Asia/Dhaka)
                  </label>
                  <input
                    id="request-date-input"
                    type="date"
                    required
                    className="provider-schedule__form-control"
                    min={getEarliestScheduleDate(requestKind)}
                    value={requestDate}
                    onChange={handleDateChange}
                  />
                  <span className="provider-schedule__form-hint">
                    Earliest permitted submission: {getEarliestScheduleDate(requestKind)} (Dhaka standard).
                  </span>
                </div>

                {requestPreparing ? (
                  <LoadingState message="Loading current working hours for selected date..." />
                ) : (
                  <div className="flex flex-col gap-sm">
                    <label className="provider-schedule__form-label">
                      Proposed Working Hours & Breaks (Max End Time: 10:00 PM)
                    </label>

                    {requestDays
                      .filter((d) =>
                        requestKind === 'SPECIFIC_DATE' && requestDate
                          ? d.day_of_week === weekdayForDate(requestDate)
                          : true
                      )
                      .map((day) => {
                        const dayIndex = requestDays.findIndex((d) => d.day_of_week === day.day_of_week);
                        const dayMeta = DAYS_OF_WEEK.find((d) => d.day === day.day_of_week);

                        return (
                          <div key={day.day_of_week} className="provider-schedule__day-edit-box">
                            <div className="provider-schedule__day-edit-header">
                              <strong>{dayMeta?.name}</strong>
                              <label className="flex items-center gap-xs text-xs">
                                <input
                                  type="checkbox"
                                  checked={day.is_working_day}
                                  onChange={(e) =>
                                    handleDayChange(dayIndex, 'is_working_day', e.target.checked)
                                  }
                                />
                                Working Day
                              </label>
                            </div>

                            {day.is_working_day && (
                              <>
                                <div className="provider-schedule__times-row">
                                  <div className="provider-schedule__form-group">
                                    <label className="text-xs text-muted">Shift Start</label>
                                    <input
                                      type="time"
                                      required
                                      className="provider-schedule__form-control"
                                      value={day.start_time.slice(0, 5)}
                                      onChange={(e) =>
                                        handleDayChange(dayIndex, 'start_time', `${e.target.value}:00`)
                                      }
                                    />
                                  </div>
                                  <div className="provider-schedule__form-group">
                                    <label className="text-xs text-muted">Shift End (By 22:00)</label>
                                    <input
                                      type="time"
                                      required
                                      max="22:00"
                                      className="provider-schedule__form-control"
                                      value={day.end_time.slice(0, 5)}
                                      onChange={(e) =>
                                        handleDayChange(dayIndex, 'end_time', `${e.target.value}:00`)
                                      }
                                    />
                                  </div>
                                </div>

                                {/* Breaks */}
                                <div className="flex flex-col gap-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs text-muted font-bold uppercase">Breaks</span>
                                    <button
                                      type="button"
                                      className="provider-schedule__link-btn"
                                      onClick={() => handleAddBreakToDay(dayIndex)}
                                    >
                                      + Add Break
                                    </button>
                                  </div>

                                  {(day.breaks || []).map((b, bIdx) => (
                                    <div key={bIdx} className="flex gap-xs items-center">
                                      <input
                                        type="text"
                                        placeholder="Break title"
                                        className="provider-schedule__form-control"
                                        style={{ flex: '1 1 140px' }}
                                        value={b.title || ''}
                                        onChange={(e) =>
                                          handleBreakChange(dayIndex, bIdx, 'title', e.target.value)
                                        }
                                      />
                                      <input
                                        type="time"
                                        required
                                        className="provider-schedule__form-control"
                                        style={{ width: '105px' }}
                                        value={(b.start_time || '12:00').slice(0, 5)}
                                        onChange={(e) =>
                                          handleBreakChange(dayIndex, bIdx, 'start_time', `${e.target.value}:00`)
                                        }
                                      />
                                      <span className="text-xs text-muted">–</span>
                                      <input
                                        type="time"
                                        required
                                        className="provider-schedule__form-control"
                                        style={{ width: '105px' }}
                                        value={(b.end_time || '13:00').slice(0, 5)}
                                        onChange={(e) =>
                                          handleBreakChange(dayIndex, bIdx, 'end_time', `${e.target.value}:00`)
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-sm"
                                        style={{ color: 'var(--color-error)' }}
                                        onClick={() => handleRemoveBreakFromDay(dayIndex, bIdx)}
                                        aria-label="Remove break"
                                      >
                                        &times;
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                <div className="provider-schedule__form-group">
                  <label className="provider-schedule__form-label" htmlFor="request-reason-input">
                    Clinical Reason for Change
                  </label>
                  <textarea
                    id="request-reason-input"
                    required
                    rows="3"
                    className="provider-schedule__textarea"
                    placeholder="Provide justification for manager review..."
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                  />
                </div>

                <div className="provider-schedule__form-group">
                  <label className="provider-schedule__form-label" htmlFor="request-attachment-input">
                    Supporting Document (Optional, PDF or Image up to 3MB)
                  </label>
                  <input
                    id="request-attachment-input"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="provider-schedule__form-control"
                    onChange={(e) => setRequestAttachment(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div className="provider-schedule__modal-footer">
                <button
                  type="button"
                  className="provider-schedule__btn-cancel"
                  disabled={requestSubmitting}
                  onClick={closeRequestModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="provider-schedule__btn-primary"
                  disabled={requestSubmitting || requestPreparing || !requestDate}
                >
                  {requestSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: Request Planned Leave
          ========================================================================= */}
      {leaveModalOpen && (
        <div
          className="provider-schedule__modal-backdrop"
          onClick={closeLeaveModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-leave-title"
        >
          <div
            className="provider-schedule__modal-container"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px' }}
          >
            <div className="provider-schedule__modal-header">
              <h3 id="modal-leave-title">Request Planned Leave</h3>
              <button
                type="button"
                className="provider-schedule__modal-close"
                onClick={closeLeaveModal}
                disabled={leaveSubmitting}
                aria-label="Close leave modal"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitLeave}>
              <div className="provider-schedule__modal-body">
                <div className="provider-schedule__form-group">
                  <label className="provider-schedule__form-label" htmlFor="leave-start-input">
                    Leave Start Datetime (Asia/Dhaka)
                  </label>
                  <input
                    id="leave-start-input"
                    ref={leaveStartInputRef}
                    type="datetime-local"
                    required
                    className="provider-schedule__form-control"
                    min={getEarliestLeaveDatetime()}
                    value={leaveForm.start_datetime}
                    onChange={(e) =>
                      setLeaveForm({ ...leaveForm, start_datetime: e.target.value })
                    }
                  />
                  <span className="provider-schedule__form-hint">
                    Requires at least 4 calendar days advance notice. Earliest start: {getEarliestLeaveDatetime().slice(0, 10)}.
                  </span>
                </div>

                <div className="provider-schedule__form-group">
                  <label className="provider-schedule__form-label" htmlFor="leave-end-input">
                    Leave End Datetime (Asia/Dhaka)
                  </label>
                  <input
                    id="leave-end-input"
                    type="datetime-local"
                    required
                    className="provider-schedule__form-control"
                    min={leaveForm.start_datetime || getEarliestLeaveDatetime()}
                    value={leaveForm.end_datetime}
                    onChange={(e) =>
                      setLeaveForm({ ...leaveForm, end_datetime: e.target.value })
                    }
                  />
                </div>

                <div className="provider-schedule__form-group">
                  <label className="provider-schedule__form-label" htmlFor="leave-reason-input">
                    Reason for Leave (Optional)
                  </label>
                  <input
                    id="leave-reason-input"
                    type="text"
                    className="provider-schedule__form-control"
                    placeholder="Vacation, Medical conference, Personal leave..."
                    value={leaveForm.reason}
                    onChange={(e) =>
                      setLeaveForm({ ...leaveForm, reason: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="provider-schedule__modal-footer">
                <button
                  type="button"
                  className="provider-schedule__btn-cancel"
                  disabled={leaveSubmitting}
                  onClick={closeLeaveModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="provider-schedule__btn-primary"
                  disabled={leaveSubmitting}
                >
                  {leaveSubmitting ? 'Submitting...' : 'Submit Leave Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          DIALOG: Confirm Leave Withdrawal
          ========================================================================= */}
      {withdrawConfirmLeave && (
        <div
          className="provider-schedule__modal-backdrop"
          onClick={closeWithdrawModal}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="dialog-withdraw-title"
          aria-describedby="dialog-withdraw-desc"
        >
          <div
            className="provider-schedule__modal-container"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px' }}
          >
            <div className="provider-schedule__modal-header">
              <h3 id="dialog-withdraw-title">Withdraw Leave Request</h3>
              <button
                type="button"
                className="provider-schedule__modal-close"
                onClick={closeWithdrawModal}
                disabled={withdrawSubmitting}
                aria-label="Close withdrawal dialog"
              >
                &times;
              </button>
            </div>

            <div className="provider-schedule__modal-body">
              <p id="dialog-withdraw-desc" className="text-sm text-main" style={{ margin: 0 }}>
                Are you sure you want to withdraw this pending leave request from{' '}
                <strong>{formatDhakaDateTime(withdrawConfirmLeave.start_datetime)}</strong> to{' '}
                <strong>{formatDhakaDateTime(withdrawConfirmLeave.end_datetime)}</strong>? This action cannot be undone.
              </p>
            </div>

            <div className="provider-schedule__modal-footer">
              <button
                type="button"
                ref={withdrawCancelBtnRef}
                className="provider-schedule__btn-cancel"
                disabled={withdrawSubmitting}
                onClick={closeWithdrawModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={withdrawSubmitting}
                onClick={handleConfirmWithdrawLeave}
              >
                {withdrawSubmitting ? 'Withdrawing...' : 'Confirm Withdrawal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProviderSchedulePage;
