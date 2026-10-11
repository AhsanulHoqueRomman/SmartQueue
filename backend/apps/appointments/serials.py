"""Permanent provider/date high-water marks. Caller must hold the provider lock."""
from django.db.models import Max

from .models import Appointment, ProviderDateSerial


def allocate_serial(provider, on_date):
    from apps.queue.models import QueueEntry
    counter, _ = ProviderDateSerial.objects.get_or_create(provider=provider, booking_date=on_date)
    counter = ProviderDateSerial.objects.select_for_update().get(pk=counter.pk)
    # Include legacy/imported rows without reducing the permanent high-water mark.
    maximum = max(
        counter.last_serial,
        Appointment.objects.filter(provider=provider, appointment_date=on_date).aggregate(n=Max('serial_number'))['n'] or 0,
        QueueEntry.objects.filter(provider=provider, queue_date=on_date).aggregate(n=Max('serial_number'))['n'] or 0,
    )
    counter.last_serial = maximum + 1
    counter.save(update_fields=['last_serial'])
    return counter.last_serial
