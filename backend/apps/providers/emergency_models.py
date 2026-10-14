"""Operational interruption and recovery history; not planned leave."""
import uuid
from django.conf import settings
from django.db import models


class ProviderEmergency(models.Model):
    class State(models.TextChoices):
        TEMPORARY = 'TEMPORARY', 'Temporary Emergency'
        UNAVAILABLE = 'UNAVAILABLE', 'Confirmed Unavailable for Today'
        RESUMED = 'RESUMED', 'Service Resumed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.ForeignKey('providers.ProviderProfile', on_delete=models.PROTECT, related_name='emergencies')
    service_date = models.DateField()
    state = models.CharField(max_length=20, choices=State.choices, default=State.TEMPORARY)
    private_reason = models.TextField(blank=True)
    declared_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    declared_at = models.DateTimeField()
    resume_requested_at = models.DateTimeField(null=True)
    finalized_at = models.DateTimeField(null=True)
    resumed_at = models.DateTimeField(null=True)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=['provider', 'service_date'],
            condition=models.Q(state__in=['TEMPORARY', 'UNAVAILABLE']),
            name='emergency_provider_date_hold_unique',
        )]


class EmergencyRecovery(models.Model):
    class Resolution(models.TextChoices):
        UNRESOLVED = 'UNRESOLVED', 'Unresolved Emergency Recovery'
        RESCHEDULED = 'RESCHEDULED', 'Emergency replacement booked'
        CANCELLED = 'CANCELLED', 'Emergency customer-requested cancellation'
        COMPLETED = 'COMPLETED', 'Service actually completed'
        CUSTOMER_RESCHEDULED = 'CUSTOMER_RESCHEDULED', 'Normal customer rescheduling'
        STANDARD_CANCELLED = 'STANDARD_CANCELLED', 'Normal cancellation'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.ForeignKey(ProviderEmergency, on_delete=models.PROTECT, related_name='recoveries')
    appointment = models.ForeignKey('appointments.Appointment', on_delete=models.PROTECT, related_name='emergency_recoveries')
    original_date = models.DateField()
    original_snapshot = models.JSONField()
    resolution = models.CharField(max_length=24, choices=Resolution.choices, default=Resolution.UNRESOLVED)
    replacement = models.ForeignKey('appointments.Appointment', null=True, on_delete=models.PROTECT, related_name='emergency_replacements')
    contact_attempts = models.JSONField(default=list)
    interrupted_at = models.DateTimeField(null=True)
    consent_note = models.TextField(blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name='+')
    resolved_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['incident', 'appointment'], name='emergency_appointment_unique')]


class EmergencyCommunication(models.Model):
    """Small dispatch ledger: in-app creation and email acceptance are separate."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.ForeignKey(ProviderEmergency, on_delete=models.PROTECT, related_name='communications')
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    appointment = models.ForeignKey('appointments.Appointment', on_delete=models.PROTECT, related_name='+')
    version = models.PositiveIntegerField()
    event = models.CharField(max_length=20)
    notification = models.OneToOneField('notifications.Notification', on_delete=models.PROTECT, related_name='+')
    email_state = models.CharField(max_length=12, choices=[(x, x) for x in ['PENDING', 'SENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN']], default='PENDING')
    email_id = models.CharField(max_length=255, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    attempted_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['incident', 'customer', 'version'], name='emergency_notice_unique')]
