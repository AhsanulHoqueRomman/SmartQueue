import os
import sys
sys.path.insert(0, os.path.abspath('.'))
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.feedback.models import Review

User = get_user_model()
TZ = ZoneInfo('UTC')

def seed():
    # Manager User
    manager, _ = User.objects.get_or_create(
        email='h_manager@example.com',
        defaults={'first_name': 'Helen', 'last_name': 'Manager', 'is_active': True}
    )
    manager.set_password('Password123!')
    manager.save()

    # Customer User
    customer, _ = User.objects.get_or_create(
        email='h_customer@example.com',
        defaults={'first_name': 'Charlie', 'last_name': 'Customer', 'is_active': True}
    )
    customer.set_password('Password123!')
    customer.save()

    # Organization
    org, _ = Organization.objects.get_or_create(
        slug='phase-h-center',
        defaults={
            'name': 'Phase H Health Center',
            'is_active': True,
            'verification_status': Organization.VerificationStatus.APPROVED
        }
    )

    # Manager Membership
    OrganizationMembership.objects.get_or_create(
        user=manager,
        organization=org,
        defaults={'role': OrganizationMembership.Role.MANAGER, 'is_active': True}
    )

    # Provider
    prov_user, _ = User.objects.get_or_create(
        email='h_doctor@example.com',
        defaults={'first_name': 'Dr. Henry', 'last_name': 'House', 'is_active': True}
    )
    prov_user.set_password('Password123!')
    prov_user.save()

    prov_membership, _ = OrganizationMembership.objects.get_or_create(
        user=prov_user,
        organization=org,
        defaults={'role': OrganizationMembership.Role.PROVIDER, 'is_active': True}
    )

    provider, _ = ProviderProfile.objects.get_or_create(
        membership=prov_membership,
        defaults={'title': 'Primary Physician', 'application_status': ProviderProfile.ApplicationStatus.APPROVED}
    )

    # Service
    service, _ = Service.objects.get_or_create(
        organization=org,
        name='General Health Consultation',
        defaults={'duration_minutes': 30, 'price': '50.00', 'is_active': True}
    )

    # Create appointments across past 7 days
    today = timezone.localdate()
    for days_ago in range(7, -1, -1):
        target_date = today - timedelta(days=days_ago)
        start_time = timezone.make_aware(datetime.combine(target_date, datetime.min.time().replace(hour=10)), timezone=TZ)
        
        # Completed appt
        appt1, _ = Appointment.objects.get_or_create(
            organization=org,
            customer=customer,
            provider=provider,
            service=service,
            start_datetime=start_time,
            defaults={
                'end_datetime': start_time + timedelta(minutes=30),
                'status': Appointment.Status.COMPLETED
            }
        )

        QueueEntry.objects.get_or_create(
            organization=org,
            appointment=appt1,
            defaults={
                'provider': provider,
                'queue_date': target_date,
                'token_number': 100 + days_ago,
                'status': QueueEntry.Status.COMPLETED,
                'called_at': start_time + timedelta(minutes=5),
                'started_at': start_time + timedelta(minutes=7),
                'completed_at': start_time + timedelta(minutes=32),
            }
        )

        # Review
        Review.objects.get_or_create(
            organization=org,
            appointment=appt1,
            defaults={
                'customer': customer,
                'provider': provider,
                'rating': 5 if days_ago % 2 == 0 else 4,
                'comment': f'Excellent appointment on day {days_ago}!'
            }
        )

    print("Phase H seed data populated successfully!")

if __name__ == '__main__':
    seed()
