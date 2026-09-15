import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _


class Review(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'organizations.Organization', on_delete=models.CASCADE, related_name='reviews'
    )
    appointment = models.OneToOneField(
        'appointments.Appointment', on_delete=models.CASCADE, related_name='review'
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews'
    )
    provider = models.ForeignKey(
        'providers.ProviderProfile', on_delete=models.CASCADE, related_name='reviews'
    )
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['appointment'], name='unique_review_appointment'),
            models.CheckConstraint(condition=models.Q(rating__gte=1, rating__lte=5), name='review_rating_1_to_5'),
        ]
        indexes = [
            models.Index(fields=['organization', 'created_at'], name='review_org_created_idx'),
            models.Index(fields=['provider', 'created_at'], name='review_provider_created_idx'),
        ]

    def clean(self):
        if self.appointment_id:
            if self.appointment.status != self.appointment.Status.COMPLETED:
                raise ValidationError('Only completed appointments can be reviewed.')
            if self.customer_id and self.customer_id != self.appointment.customer_id:
                raise ValidationError('Only the appointment customer can create this review.')
            if self.provider_id and self.provider_id != self.appointment.provider_id:
                raise ValidationError('Review provider must match the appointment provider.')
            if self.organization_id and self.organization_id != self.appointment.organization_id:
                raise ValidationError('Review organization must match the appointment organization.')

    def __str__(self):
        return f'{self.rating}/5 for appointment {self.appointment_id}'
