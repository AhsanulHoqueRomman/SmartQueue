from django.db import IntegrityError, transaction

from config.exceptions import ApplicationError
from apps.appointments.models import Appointment
from apps.audit.services import AuditService

from .models import Review


class ReviewAlreadyExistsException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_409_CONFLICT
    default_code = 'REVIEW_ALREADY_EXISTS'
    default_detail = 'This appointment already has a review.'


class ReviewNotAllowedException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_400_BAD_REQUEST
    default_code = 'REVIEW_NOT_ALLOWED'
    default_detail = 'Only completed appointments can be reviewed.'


class ReviewService:
    @staticmethod
    def create_review(*, appointment, customer, rating, comment=''):
        if appointment.customer_id != customer.id:
            raise ApplicationError(message='Only the appointment customer can review it.', code='REVIEW_FORBIDDEN', status_code=403)
        if appointment.status != Appointment.Status.COMPLETED:
            raise ReviewNotAllowedException()
        with transaction.atomic():
            try:
                review = Review.objects.create(
                    organization_id=appointment.organization_id,
                    appointment=appointment,
                    customer=customer,
                    provider_id=appointment.provider_id,
                    rating=rating,
                    comment=comment or '',
                )
            except IntegrityError as exc:
                raise ReviewAlreadyExistsException() from exc
            AuditService.record(
                action='REVIEW_CREATED', entity_type='Review', entity_id=review.id,
                organization_id=review.organization_id, actor=customer,
                metadata={'appointment_id': str(appointment.id), 'rating': rating},
            )
            return review
