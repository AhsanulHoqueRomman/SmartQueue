import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _


class QueueEntry(models.Model):
    """
    Provider- and date-specific queue entry created at appointment check-in.
    Token numbers are sequential per (provider, queue_date) and never reused.
    """

    class Status(models.TextChoices):
        WAITING = 'WAITING', _('Waiting')
        CALLED = 'CALLED', _('Called')
        IN_PROGRESS = 'IN_PROGRESS', _('In progress')
        COMPLETED = 'COMPLETED', _('Completed')
        SKIPPED = 'SKIPPED', _('Skipped')
        CANCELLED = 'CANCELLED', _('Cancelled')
        NO_SHOW = 'NO_SHOW', _('No show')

    class ReadinessState(models.TextChoices):
        NOT_YET = 'NOT_YET', _('Not yet')
        GET_READY = 'GET_READY', _('Get ready')
        BE_READY = 'BE_READY', _('Be ready')
        TURN_NOW = 'TURN_NOW', _('Turn now')

    ACTIVE_STATUSES = (Status.CALLED, Status.IN_PROGRESS)

    ALLOWED_TRANSITIONS = {
        Status.WAITING: {Status.CALLED, Status.CANCELLED, Status.NO_SHOW},
        Status.CALLED: {Status.IN_PROGRESS, Status.SKIPPED, Status.CANCELLED, Status.NO_SHOW},
        Status.IN_PROGRESS: {Status.COMPLETED, Status.CANCELLED},
        Status.COMPLETED: set(),
        Status.SKIPPED: {Status.WAITING, Status.CANCELLED, Status.NO_SHOW},
        Status.CANCELLED: set(),
        Status.NO_SHOW: set(),
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'organizations.Organization',
        on_delete=models.CASCADE,
        related_name='queue_entries',
    )
    appointment = models.OneToOneField(
        'appointments.Appointment',
        on_delete=models.CASCADE,
        related_name='queue_entry',
    )
    provider = models.ForeignKey(
        'providers.ProviderProfile',
        on_delete=models.CASCADE,
        related_name='queue_entries',
    )
    queue_date = models.DateField(_('queue date'), db_index=True)
    serial_number = models.PositiveIntegerField(_('serial number'), null=True, blank=True, db_index=True)
    token_number = models.PositiveIntegerField(_('token number'), null=True, blank=True)
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=Status.choices,
        default=Status.WAITING,
        db_index=True,
    )
    readiness_state = models.CharField(
        _('readiness state'),
        max_length=20,
        choices=ReadinessState.choices,
        default=ReadinessState.NOT_YET,
    )
    is_checked_in = models.BooleanField(_('is checked in'), default=False, db_index=True)
    checked_in_at = models.DateTimeField(_('checked in at'), null=True, blank=True)
    is_urgent = models.BooleanField(_('is urgent'), default=False)
    urgent_reason = models.TextField(_('urgent reason'), blank=True)

    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    called_at = models.DateTimeField(_('called at'), null=True, blank=True)
    started_at = models.DateTimeField(_('started at'), null=True, blank=True)
    completed_at = models.DateTimeField(_('completed at'), null=True, blank=True)
    skipped_at = models.DateTimeField(_('skipped at'), null=True, blank=True)

    class Meta:
        verbose_name = _('queue entry')
        verbose_name_plural = _('queue entries')
        ordering = ['serial_number', 'token_number']
        indexes = [
            models.Index(
                fields=['provider', 'queue_date', 'serial_number'],
                name='queue_prov_date_serial_idx',
            ),
            models.Index(
                fields=['provider', 'queue_date'],
                name='queue_provider_date_idx',
            ),
            models.Index(
                fields=['provider', 'queue_date', 'status'],
                name='queue_provider_date_status_idx',
            ),
            models.Index(
                fields=['organization', 'queue_date'],
                name='queue_org_date_idx',
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'queue_date', 'token_number'],
                name='unique_provider_date_token',
            ),
            models.CheckConstraint(
                condition=models.Q(token_number__gt=0),
                name='queue_token_positive',
            ),
        ]

    def __str__(self):
        return (
            f"Token {self.token_number} — {self.provider_id} "
            f"[{self.queue_date}] ({self.status})"
        )

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.ALLOWED_TRANSITIONS.get(self.status, set())
