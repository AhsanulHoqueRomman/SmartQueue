"""Server-authoritative booking-date and self-service deadline policy."""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

BUSINESS_TZ = ZoneInfo('Asia/Dhaka')
ETA_UNAVAILABLE_MESSAGE = (
    'Estimated service time is currently unavailable. Self-rescheduling is temporarily '
    'unavailable. Please contact your organization for assistance.'
)


def booking_window(now=None):
    today = timezone.localtime(now or timezone.now(), BUSINESS_TZ).date()
    return today, today + timedelta(days=3)


def validate_booking_date(on_date):
    from .services import AppointmentValidationException
    first, last = booking_window()
    if not first <= on_date <= last:
        raise AppointmentValidationException(
            message='Choose today or one of the next three dates (Asia/Dhaka).',
            code='OUTSIDE_BOOKING_WINDOW',
        )
