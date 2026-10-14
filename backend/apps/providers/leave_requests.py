"""Planned leave submission and manager review; no emergency bypass policy."""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from apps.appointments.booking_policy import booking_window
from apps.appointments.capacity import allocations, date_capacity, effective_minutes
from apps.appointments.models import Appointment
from apps.audit.services import AuditService
from apps.organizations.models import OrganizationMembership
from config.exceptions import ApplicationError
from .models import ProviderLeave, ProviderProfile

TZ = ZoneInfo('Asia/Dhaka')


def affected_dates(start, end):
    current = timezone.localtime(start, TZ).date()
    last = timezone.localtime(end - timedelta(microseconds=1), TZ).date()
    while current <= last:
        yield current
        current += timedelta(days=1)


def manager_for(actor, provider):
    return actor and OrganizationMembership.objects.filter(
        user=actor, organization_id=provider.membership.organization_id,
        role='MANAGER', is_active=True,
    ).exists()


class LeaveRequestService:
    @staticmethod
    @transaction.atomic
    def submit(*, provider, actor, start_datetime, end_datetime, reason=''):
        provider = ProviderProfile.objects.select_for_update(of=('self',)).select_related('membership__organization').get(pk=provider.pk)
        if not actor or not (manager_for(actor, provider) or
                             (actor.pk == provider.membership.user_id and provider.is_operationally_active)):
            raise ApplicationError(message='Only the active provider or their organization manager may request planned leave.', status_code=403)
        if end_datetime <= start_datetime:
            raise ApplicationError(message='Leave end must be after its start.')
        if timezone.localtime(start_datetime, TZ).date() < booking_window()[0] + timedelta(days=4):
            raise ApplicationError(message='Planned leave requires at least four calendar days notice.', code='LEAVE_NOTICE_REQUIRED')
        # Conflicts are intentionally allowed at submission, not at approval.
        leave = ProviderLeave.objects.create(provider=provider, start_datetime=start_datetime,
            end_datetime=end_datetime, reason=reason, status='PENDING')
        AuditService.record(action='PROVIDER_LEAVE_REQUESTED', entity_type='ProviderLeave', entity_id=leave.pk,
            organization_id=provider.organization.pk, actor=actor)
        return leave

    @staticmethod
    @transaction.atomic
    def review(*, leave, actor, decision, reason=''):
        provider = ProviderProfile.objects.select_for_update(of=('self',)).select_related('membership__organization').get(pk=leave.provider_id)
        if not manager_for(actor, provider):
            raise ApplicationError(message='Only an active manager of this organization may review planned leave.', status_code=403)
        leave = ProviderLeave.objects.select_for_update().get(pk=leave.pk, provider=provider)
        if leave.status != 'PENDING':
            raise ApplicationError(message='This leave request has already been decided.', code='LEAVE_ALREADY_REVIEWED', status_code=409)
        if decision == 'APPROVED':
            if timezone.localtime(leave.start_datetime, TZ).date() < booking_window()[0]:
                raise ApplicationError(message='The requested leave date has passed. Submit a new request.')
            interval = [(leave.start_datetime, leave.end_datetime)]
            conflicts = []
            for on_date in affected_dates(leave.start_datetime, leave.end_datetime):
                result = date_capacity(provider, on_date, extra_leaves=interval)
                commitments = allocations(provider, on_date).filter(status__in=Appointment.BLOCKING_STATUSES)
                # Preserve M2's conservative working-window commitment protection.
                adversely_changed = effective_minutes(provider, on_date, extra_leaves=interval) < effective_minutes(provider, on_date)
                if result['allocated_count'] > result['daily_capacity'] or (adversely_changed and commitments.exists()):
                    conflicts.append({'date': str(on_date), 'daily_capacity': result['daily_capacity'],
                                      'protected_allocations': result['allocated_count']})
            if conflicts:
                raise ApplicationError(message='Resolve affected bookings with customers before approving this leave.',
                    code='LEAVE_BOOKING_CONFLICT', status_code=409, details={'conflicts': conflicts})
        elif decision != 'REJECTED' or not reason.strip():
            raise ApplicationError(message='Rejection requires an explanation.')
        leave.status, leave.decision_reason = decision, reason.strip()
        leave.reviewed_by, leave.reviewed_at = actor, timezone.now()
        leave.save(update_fields=['status', 'decision_reason', 'reviewed_by', 'reviewed_at'])
        AuditService.record(action='PROVIDER_LEAVE_' + decision, entity_type='ProviderLeave', entity_id=leave.pk,
            organization_id=provider.organization.pk, actor=actor)
        return leave

    @staticmethod
    @transaction.atomic
    def remove(*, leave, actor):
        provider = ProviderProfile.objects.select_for_update(of=('self',)).select_related('membership__organization').get(pk=leave.provider_id)
        leave = ProviderLeave.objects.select_for_update().get(pk=leave.pk, provider=provider)
        if not manager_for(actor, provider) and not (actor and actor.pk == provider.membership.user_id and
                provider.is_operationally_active and leave.status == 'PENDING'):
            raise ApplicationError(message='Only the manager may remove effective leave; providers may withdraw pending requests.', status_code=403)
        leave.delete()
