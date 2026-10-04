import pytest
from datetime import timedelta
from django.utils import timezone
from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.appointments.services import AppointmentService
from apps.queue.services import QueueService, current_business_date
from apps.appointments.serializers import CustomerDashboardItemSerializer


@pytest.fixture
def a71_setup(db):
    org = Organization.objects.create(
        name="Consistency Health Center",
        slug="consistency-health",
        industry_type="HEALTHCARE",
        is_active=True,
        verification_status=Organization.VerificationStatus.APPROVED,
    )
    provider_user = User.objects.create_user(
        email="doctor_a71@smartqueue.bd",
        password="password123",
        first_name="Dr. Sameer",
        last_name="Hassan",
    )
    membership = OrganizationMembership.objects.create(
        organization=org,
        user=provider_user,
        role=OrganizationMembership.Role.PROVIDER,
        is_active=True,
    )
    provider = ProviderProfile.objects.create(
        membership=membership,
        title="Dr. Sameer Hassan",
        is_active=True,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
    )
    service = Service.objects.create(
        organization=org,
        name="General Health Check",
        duration_minutes=15,
        is_active=True,
    )
    ProviderService.objects.create(provider=provider, service=service)

    for day_idx in range(7):
        WeeklySchedule.objects.create(
            provider=provider,
            day_of_week=day_idx,
            is_working_day=True,
            start_time="00:00:00",
            end_time="23:59:59",
        )

    customer1 = User.objects.create_user(email="cust1_a71@smartqueue.bd", password="password123", first_name="Customer", last_name="One")
    customer2 = User.objects.create_user(email="cust2_a71@smartqueue.bd", password="password123", first_name="Customer", last_name="Two")

    return {
        'org': org,
        'provider': provider,
        'service': service,
        'cust1': customer1,
        'cust2': customer2,
    }


@pytest.mark.django_db
def test_raw_queue_waiting_with_is_checked_in_false_does_not_imply_physical_presence(a71_setup):
    """
    Regression Test:
    Booking an appointment creates QueueEntry with status='WAITING' and is_checked_in=False.
    The serializer/service MUST NOT report is_checked_in=True or physical check-in presence.
    """
    s = a71_setup
    today = current_business_date()
    future_start = timezone.now() + timedelta(hours=5)

    appt = AppointmentService.book_appointment(
        organization_id=s['org'].id,
        customer=s['cust1'],
        provider_id=s['provider'].id,
        service_id=s['service'].id,
        appointment_date=today,
        start_datetime=future_start,
    )

    qentry = QueueEntry.objects.get(appointment=appt)
    assert qentry.status == QueueEntry.Status.WAITING
    assert qentry.is_checked_in is False

    dash_data = CustomerDashboardItemSerializer(appt).data
    assert dash_data['status'] == Appointment.Status.CONFIRMED
    assert dash_data['queue_entry']['is_checked_in'] is False
    assert dash_data['queue_entry']['status'] == QueueEntry.Status.WAITING

    # Readiness calculation must show is_checked_in == False and NOT_YET readiness
    readiness = QueueService.calculate_readiness_and_eta(qentry)
    assert qentry.is_checked_in is False
    assert readiness['checked_in_ahead'] == 0


@pytest.mark.django_db
def test_check_in_capability_window(a71_setup):
    """
    Test check-in availability window gating:
    can_check_in is False when start_datetime is far away (e.g. 8 hours ahead).
    can_check_in is True when within check-in window or when bypass_window is passed for staff.
    """
    s = a71_setup
    today = current_business_date()
    far_start = timezone.now() + timedelta(hours=8)

    appt = AppointmentService.book_appointment(
        organization_id=s['org'].id,
        customer=s['cust1'],
        provider_id=s['provider'].id,
        service_id=s['service'].id,
        appointment_date=today,
        start_datetime=far_start,
    )

    dash_data = CustomerDashboardItemSerializer(appt).data
    assert dash_data['can_check_in'] is False

    # Near appointment time (e.g. 1 hour ahead) -> check-in becomes available
    near_start = timezone.now() + timedelta(minutes=30)
    appt.start_datetime = near_start
    appt.save()

    dash_data_near = CustomerDashboardItemSerializer(appt).data
    assert dash_data_near['can_check_in'] is True


@pytest.mark.django_db
def test_lifecycle_states_and_telemetry(a71_setup):
    """
    Test lifecycle progression:
    CONFIRMED (unchecked) -> CHECKED_IN (waiting) -> CALLED -> IN_PROGRESS -> COMPLETED
    Verify authoritative statuses at each step.
    """
    s = a71_setup
    today = current_business_date()
    near_start = timezone.now() + timedelta(minutes=20)

    appt = AppointmentService.book_appointment(
        organization_id=s['org'].id,
        customer=s['cust1'],
        provider_id=s['provider'].id,
        service_id=s['service'].id,
        appointment_date=today,
        start_datetime=near_start,
    )

    # 1. Unchecked Pre-arrival
    dash_1 = CustomerDashboardItemSerializer(appt).data
    assert dash_1['status'] == Appointment.Status.CONFIRMED
    assert dash_1['queue_entry']['is_checked_in'] is False
    assert dash_1['is_live_queue'] is True

    # 2. Checked-in
    qentry = QueueService.check_in_appointment(appointment=appt, bypass_window=True)
    appt.refresh_from_db()
    dash_2 = CustomerDashboardItemSerializer(appt).data
    assert dash_2['status'] == Appointment.Status.CHECKED_IN
    assert dash_2['queue_entry']['is_checked_in'] is True

    # 3. Called
    called_entry = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    appt.refresh_from_db()
    assert called_entry.status == QueueEntry.Status.CALLED
    dash_3 = CustomerDashboardItemSerializer(appt).data
    assert dash_3['queue_entry']['status'] == QueueEntry.Status.CALLED
    assert dash_3['queue_entry']['readiness_info']['readiness_state'] == 'TURN_NOW'

    # 4. In Progress
    QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=called_entry.id)
    appt.refresh_from_db()
    dash_4 = CustomerDashboardItemSerializer(appt).data
    assert dash_4['status'] == Appointment.Status.IN_PROGRESS

    # 5. Completed -> Exits live queue
    QueueService.complete_queue_entry(organization_id=s['org'].id, queue_entry_id=called_entry.id)
    appt.refresh_from_db()
    dash_5 = CustomerDashboardItemSerializer(appt).data
    assert dash_5['status'] == Appointment.Status.COMPLETED
    assert dash_5['is_live_queue'] is False
