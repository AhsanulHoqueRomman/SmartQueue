"""Manager-approved, date-effective schedules; base WeeklySchedule stays historical."""
from datetime import time, timedelta
from types import SimpleNamespace

from django.db import transaction
from django.utils import timezone

from apps.appointments.booking_policy import booking_window
from apps.audit.services import AuditService
from config.exceptions import ApplicationError
from .models import ProviderProfile, ScheduleChangeRequest, WeeklySchedule


class BreakList(list):
    def all(self):
        return self


def schedule_from_data(data):
    return SimpleNamespace(
        day_of_week=data['day_of_week'], is_working_day=data['is_working_day'],
        start_time=time.fromisoformat(data['start_time']), end_time=time.fromisoformat(data['end_time']),
        breaks=BreakList(SimpleNamespace(**{**b, 'start_time': time.fromisoformat(b['start_time']), 'end_time': time.fromisoformat(b['end_time'])}) for b in data.get('breaks', [])),
    )


def effective_schedule(provider, on_date):
    approved = provider.schedule_change_requests.filter(status='APPROVED', effective_date__lte=on_date)
    specific = approved.filter(kind='SPECIFIC_DATE', effective_date=on_date).first()
    regular = approved.filter(kind='PERMANENT').order_by('-effective_date', '-reviewed_at').first()
    request = specific or regular
    if request:
        data = next((d for d in request.proposed_schedule if d['day_of_week'] == on_date.weekday()), None)
        if data:
            return schedule_from_data(data)
    return WeeklySchedule.objects.filter(provider=provider, day_of_week=on_date.weekday()).prefetch_related('breaks').first()


def serialize_schedule(schedule, weekday):
    if not schedule:
        return {'day_of_week': weekday, 'is_working_day': False, 'start_time': '09:00:00', 'end_time': '17:00:00', 'breaks': []}
    return {'day_of_week': weekday, 'is_working_day': schedule.is_working_day,
            'start_time': schedule.start_time.isoformat(), 'end_time': schedule.end_time.isoformat(),
            'breaks': [{'title': getattr(b, 'title', ''), 'start_time': b.start_time.isoformat(), 'end_time': b.end_time.isoformat()} for b in schedule.breaks.all()]}


def weekly_snapshot(provider, effective_date):
    return [serialize_schedule(effective_schedule(provider, effective_date + timedelta(days=(d - effective_date.weekday()) % 7)), d) for d in range(7)]


def validate_schedule(data):
    try:
        weekday = data['day_of_week']
        start, end = time.fromisoformat(str(data['start_time'])), time.fromisoformat(str(data['end_time']))
        if isinstance(weekday, bool) or weekday not in range(7) or not isinstance(data['is_working_day'], bool) or end <= start or end > time(22):
            raise ValueError()
        intervals = []
        for b in data.get('breaks', []):
            bs, be = time.fromisoformat(str(b['start_time'])), time.fromisoformat(str(b['end_time']))
            if not data['is_working_day'] or not start <= bs < be <= end or any(bs < y and be > x for x, y in intervals):
                raise ValueError()
            intervals.append((bs, be))
        return {**data, 'start_time': start.isoformat(), 'end_time': end.isoformat(),
                'breaks': [{**b, 'start_time': time.fromisoformat(str(b['start_time'])).isoformat(), 'end_time': time.fromisoformat(str(b['end_time'])).isoformat()} for b in data.get('breaks', [])]}
    except (KeyError, TypeError, ValueError):
        raise ApplicationError(message='Use valid working hours ending by 10 PM, with nonoverlapping breaks inside the working window.', code='INVALID_SCHEDULE')


def booking_conflicts(request):
    from apps.appointments.models import Appointment
    # Protect all existing active commitments, including previously approved long-horizon bookings.
    appointments = Appointment.objects.filter(provider=request.provider, appointment_date__gte=request.effective_date, status__in=Appointment.BLOCKING_STATUSES)
    if request.kind == 'SPECIFIC_DATE':
        appointments = appointments.filter(appointment_date=request.effective_date)
    conflicts = []
    for appt in appointments:
        proposed = next((d for d in request.proposed_schedule if d['day_of_week'] == appt.appointment_date.weekday()), None)
        old = effective_schedule(request.provider, appt.appointment_date)
        if not proposed or not proposed['is_working_day'] or not old:
            conflict = True
        else:
            new = schedule_from_data(proposed)
            # Serial bookings are commitments to the working window, not rigid time slots.
            conflict = new.start_time > old.start_time or new.end_time < old.end_time
            old_breaks = {(b.start_time, b.end_time) for b in old.breaks.all()}
            conflict = conflict or any((b.start_time, b.end_time) not in old_breaks for b in new.breaks.all())
        if conflict:
            conflicts.append({'appointment_id': str(appt.pk), 'date': str(appt.appointment_date), 'serial_number': appt.serial_number})
    return conflicts


class ScheduleChangeService:
    @staticmethod
    @transaction.atomic
    def submit(*, provider, actor, kind, effective_date, proposed_schedule, reason, attachment=None):
        provider = ProviderProfile.objects.select_for_update(of=('self',)).select_related('membership__organization').get(pk=provider.pk)
        if actor.pk != provider.membership.user_id or not provider.is_operationally_active:
            raise ApplicationError(message='Only the active provider may request their own schedule change.', status_code=403)
        today, _ = booking_window()
        notice = 4 if kind == 'SPECIFIC_DATE' else 10
        if effective_date < today + timedelta(days=notice):
            raise ApplicationError(message=f'This change requires at least {notice} calendar days notice.', code='SCHEDULE_NOTICE_REQUIRED')
        current = weekly_snapshot(provider, effective_date)
        expected = {effective_date.weekday()} if kind == 'SPECIFIC_DATE' else set(range(7))
        if {d['day_of_week'] for d in proposed_schedule} != expected or len(proposed_schedule) != len(expected):
            raise ApplicationError(message='Supply the affected weekday for a specific-date change, or all seven weekdays for a permanent change.')
        proposed = []
        for d in proposed_schedule:
            # Omission retains breaks; explicit [] is a proposed removal, subject to review.
            old = next(x for x in current if x['day_of_week'] == d['day_of_week'])
            proposed.append(validate_schedule({**d, 'breaks': d.get('breaks', old['breaks'])}))
        reason = reason.strip() if isinstance(reason, str) else ''
        if not reason:
            raise ApplicationError(message='A reason is required.')
        extra = {}
        if attachment:
            from apps.organizations.validators import validate_document_file
            from django.core.exceptions import ValidationError
            try:
                validate_document_file(attachment)
            except ValidationError as exc:
                raise ApplicationError(message=' '.join(exc.messages))
            if attachment.size > 3 * 1024 * 1024:
                raise ApplicationError(message='Supporting document must be at most 3 MB.')
            from pathlib import Path
            extra = {'attachment': attachment.read(), 'attachment_name': Path(attachment.name).name, 'attachment_type': 'application/octet-stream'}
        result = ScheduleChangeRequest.objects.create(provider=provider, kind=kind, effective_date=effective_date, proposed_schedule=proposed, current_schedule=current, reason=reason, **extra)
        AuditService.record(action='SCHEDULE_CHANGE_REQUESTED', entity_type='ScheduleChangeRequest', entity_id=result.pk, organization_id=provider.organization.pk, actor=actor)
        return result

    @staticmethod
    @transaction.atomic
    def review(*, request, actor, decision, reason=''):
        from apps.organizations.models import OrganizationMembership
        reason = reason.strip() if isinstance(reason, str) else ''
        provider = ProviderProfile.objects.select_for_update(of=('self',)).select_related('membership__organization').get(pk=request.provider_id)
        if not OrganizationMembership.objects.filter(user=actor, organization=provider.organization, role='MANAGER', is_active=True).exists():
            raise ApplicationError(message='Only an active manager of this organization may decide schedule requests.', status_code=403)
        request = ScheduleChangeRequest.objects.select_for_update().get(pk=request.pk, provider=provider)
        if request.status != 'PENDING':
            raise ApplicationError(message='This request has already been decided.', code='SCHEDULE_ALREADY_REVIEWED', status_code=409)
        if decision == 'APPROVED':
            if request.effective_date < booking_window()[0]:
                raise ApplicationError(message='The requested effective date has passed. Submit a new request.')
            if weekly_snapshot(provider, request.effective_date) != request.current_schedule:
                raise ApplicationError(message='The approved schedule changed after submission. Submit a new proposal.', code='SCHEDULE_STALE', status_code=409)
            for d in request.proposed_schedule:
                validate_schedule(d)
            conflicts = booking_conflicts(request)
            if conflicts:
                raise ApplicationError(message='This proposal would adversely affect existing confirmed bookings.', code='SCHEDULE_BOOKING_CONFLICT', status_code=409, details={'affected_bookings': conflicts})
        elif decision != 'REJECTED' or not reason.strip():
            raise ApplicationError(message='Rejection requires an explanation.')
        request.status = decision
        request.decision_reason = reason.strip()
        request.reviewed_by = actor
        request.reviewed_at = timezone.now()
        request.save(update_fields=['status', 'decision_reason', 'reviewed_by', 'reviewed_at'])
        AuditService.record(action='SCHEDULE_CHANGE_' + decision, entity_type='ScheduleChangeRequest', entity_id=request.pk, organization_id=provider.organization.pk, actor=actor, metadata={'effective_date': str(request.effective_date)})
        return request
