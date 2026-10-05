import pytest
from datetime import date, timedelta, time
from django.utils import timezone
from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule, ScheduleBreak, ProviderLeave
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.appointments.services import AppointmentService, AppointmentAvailabilityService, AppointmentValidationException
from apps.queue.services import QueueService, current_business_date
from rest_framework.test import APIClient


@pytest.fixture
def a8_setup(db):
    org = Organization.objects.create(
        name="Apex Health & Legal Consultants",
        slug="apex-consultants",
        industry_type="HEALTHCARE",
        is_active=True,
        verification_status=Organization.VerificationStatus.APPROVED,
    )
    other_org = Organization.objects.create(
        name="Other City Hospital",
        slug="other-hospital",
        industry_type="HEALTHCARE",
        is_active=True,
        verification_status=Organization.VerificationStatus.APPROVED,
    )

    prov_user1 = User.objects.create_user(email="dr.tanjila@smartqueue.bd", password="password123", first_name="Tanjila", last_name="Akter")
    mem1 = OrganizationMembership.objects.create(organization=org, user=prov_user1, role=OrganizationMembership.Role.PROVIDER, is_active=True)
    provider1 = ProviderProfile.objects.create(
        membership=mem1,
        title="Associate Professor, Department of Dermatology",
        bio="Specialist in clinical and aesthetic dermatology.",
        experience_years=9,
        education=[{"degree": "MBBS", "institution": "DMC"}, {"degree": "FCPS (Dermatology)", "institution": "BCPS"}],
        specialties=["Dermatology", "Laser Therapy"],
        is_active=True,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
    )

    prov_user2 = User.objects.create_user(email="dr.rahim@smartqueue.bd", password="password123", first_name="Rahim", last_name="Chowdhury")
    mem2 = OrganizationMembership.objects.create(organization=org, user=prov_user2, role=OrganizationMembership.Role.PROVIDER, is_active=True)
    provider2 = ProviderProfile.objects.create(
        membership=mem2,
        title="Senior General Physician",
        bio="General medicine expert.",
        experience_years=14,
        education=[{"degree": "MBBS", "institution": "SSMC"}],
        specialties=["General Medicine"],
        is_active=True,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
    )

    other_user = User.objects.create_user(email="other.doc@smartqueue.bd", password="password123", first_name="Other", last_name="Doc")
    other_mem = OrganizationMembership.objects.create(organization=other_org, user=other_user, role=OrganizationMembership.Role.PROVIDER, is_active=True)
    other_provider = ProviderProfile.objects.create(
        membership=other_mem,
        title="External Specialist",
        is_active=True,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
    )

    service_derm = Service.objects.create(organization=org, name="Full Skin Checkup", duration_minutes=60, is_active=True)
    service_gen = Service.objects.create(organization=org, name="General Medicine Consultation", duration_minutes=30, is_active=True)
    other_service = Service.objects.create(organization=other_org, name="External Service", duration_minutes=30, is_active=True)

    ProviderService.objects.create(provider=provider1, service=service_derm)
    ProviderService.objects.create(provider=provider2, service=service_gen)
    ProviderService.objects.create(provider=other_provider, service=other_service)

    # Provider 1 working schedule: 11:00 to 16:00 (5 hours = 300 mins) with 1h break (13:15 to 14:15) -> 240 mins effective
    for day in range(7):
        ws1 = WeeklySchedule.objects.create(provider=provider1, day_of_week=day, is_working_day=True, start_time="11:00:00", end_time="16:00:00")
        ScheduleBreak.objects.create(weekly_schedule=ws1, title="Lunch & Prayer Break", start_time="13:15:00", end_time="14:15:00")

    # Provider 2 working schedule: 15:00 to 20:00 (5 hours = 300 mins)
    for day in range(7):
        WeeklySchedule.objects.create(provider=provider2, day_of_week=day, is_working_day=True, start_time="15:00:00", end_time="20:00:00")

    cust1 = User.objects.create_user(email="patient1@smartqueue.bd", password="password123", first_name="Patient", last_name="One")
    cust2 = User.objects.create_user(email="patient2@smartqueue.bd", password="password123", first_name="Patient", last_name="Two")
    cust3 = User.objects.create_user(email="patient3@smartqueue.bd", password="password123", first_name="Patient", last_name="Three")

    return {
        'org': org,
        'other_org': other_org,
        'provider1': provider1,
        'provider2': provider2,
        'other_provider': other_provider,
        'service_derm': service_derm,
        'service_gen': service_gen,
        'other_service': other_service,
        'customers': [cust1, cust2, cust3],
    }


@pytest.mark.django_db
def test_service_selection_returns_only_eligible_providers(a8_setup):
    """Part 6: GET providers with service_id filter returns only eligible providers."""
    org = a8_setup['org']
    service_derm = a8_setup['service_derm']
    provider1 = a8_setup['provider1']

    client = APIClient()
    response = client.get(f"/api/v1/organizations/{org.id}/providers/?service_id={service_derm.id}")
    assert response.status_code == 200
    results = response.data if isinstance(response.data, list) else response.data.get('results', [])
    provider_ids = [p['id'] for p in results]

    assert str(provider1.id) in provider_ids
    assert str(a8_setup['provider2'].id) not in provider_ids


@pytest.mark.django_db
def test_unrelated_provider_rejected_by_booking_api(a8_setup):
    """Part 6: Booking API rejects a provider who does not offer the requested service."""
    org = a8_setup['org']
    provider2 = a8_setup['provider2'] # Offers General Medicine, NOT Skin Checkup
    service_derm = a8_setup['service_derm']
    cust = a8_setup['customers'][0]

    with pytest.raises(AppointmentValidationException) as exc_info:
        AppointmentService.book_appointment(
            organization_id=org.id,
            customer=cust,
            provider_id=provider2.id,
            service_id=service_derm.id,
            appointment_date=current_business_date(),
        )
    assert exc_info.value.default_code == 'PROVIDER_SERVICE_NOT_ASSIGNED'


@pytest.mark.django_db
def test_provider_schedule_respected(a8_setup):
    """Part 4: Booking fails if provider is not working on requested day."""
    org = a8_setup['org']
    provider1 = a8_setup['provider1']
    service_derm = a8_setup['service_derm']
    cust = a8_setup['customers'][0]

    # Set Sunday as non-working for Provider 1
    WeeklySchedule.objects.filter(provider=provider1, day_of_week=6).update(is_working_day=False)

    today = current_business_date()
    sunday = today + timedelta(days=(6 - today.weekday()) % 7)

    with pytest.raises(AppointmentValidationException) as exc_info:
        AppointmentService.book_appointment(
            organization_id=org.id,
            customer=cust,
            provider_id=provider1.id,
            service_id=service_derm.id,
            appointment_date=sunday,
        )
    assert exc_info.value.default_code == 'PROVIDER_NOT_WORKING'


@pytest.mark.django_db
def test_break_and_capacity_calculation(a8_setup):
    """Part 4 & 9: Break reduces effective work capacity."""
    org = a8_setup['org']
    provider1 = a8_setup['provider1'] # 11:00-16:00 (300 mins) minus 60 min break = 240 mins capacity
    service_derm = a8_setup['service_derm'] # 60 mins duration per patient -> Max 4 bookings allowed
    customers = a8_setup['customers']
    today = current_business_date()

    # Book 4 patients (240 mins total workload)
    for i in range(4):
        c = User.objects.create_user(email=f"cap_cust{i}@smartqueue.bd", password="password123")
        AppointmentService.book_appointment(
            organization_id=org.id,
            customer=c,
            provider_id=provider1.id,
            service_id=service_derm.id,
            appointment_date=today,
        )

    # 5th booking must fail with CAPACITY_EXCEEDED
    with pytest.raises(AppointmentValidationException) as exc_info:
        AppointmentService.book_appointment(
            organization_id=org.id,
            customer=customers[0],
            provider_id=provider1.id,
            service_id=service_derm.id,
            appointment_date=today,
        )
    assert exc_info.value.default_code == 'CAPACITY_EXCEEDED'


@pytest.mark.django_db
def test_leave_blocks_booking_appropriately(a8_setup):
    """Part 4: Provider leave blocks booking on that date."""
    org = a8_setup['org']
    provider1 = a8_setup['provider1']
    service_derm = a8_setup['service_derm']
    cust = a8_setup['customers'][0]
    target_date = current_business_date() + timedelta(days=2)

    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(timezone.datetime.combine(target_date, time(0, 0)), tz)
    end_dt = timezone.make_aware(timezone.datetime.combine(target_date, time(23, 59)), tz)

    ProviderLeave.objects.create(
        provider=provider1,
        start_datetime=start_dt,
        end_datetime=end_dt,
        reason="Medical conference",
    )

    with pytest.raises(AppointmentValidationException) as exc_info:
        AppointmentService.book_appointment(
            organization_id=org.id,
            customer=cust,
            provider_id=provider1.id,
            service_id=service_derm.id,
            appointment_date=target_date,
        )
    assert exc_info.value.default_code == 'LEAVE_CONFLICT'


@pytest.mark.django_db
def test_different_providers_in_same_org_have_independent_schedules(a8_setup):
    """Part 4 & 12: Independent provider working schedules."""
    org = a8_setup['org']
    provider1 = a8_setup['provider1'] # 11:00 - 16:00
    provider2 = a8_setup['provider2'] # 15:00 - 20:00
    today = current_business_date()

    avail1 = AppointmentAvailabilityService.get_available_slots(
        organization_id=org.id, provider_id=provider1.id, service_id=a8_setup['service_derm'].id, on_date=today
    )
    avail2 = AppointmentAvailabilityService.get_available_slots(
        organization_id=org.id, provider_id=provider2.id, service_id=a8_setup['service_gen'].id, on_date=today
    )

    assert avail1['working_hours_display'] == '11:00 AM – 4:00 PM'
    assert avail2['working_hours_display'] == '3:00 PM – 8:00 PM'


@pytest.mark.django_db
def test_no_fixed_patient_slot_required_and_serial_allocated(a8_setup):
    """Part 2 & 10: Booking allocates serial number transactionally without fixed slot selection."""
    org = a8_setup['org']
    provider1 = a8_setup['provider1']
    service_derm = a8_setup['service_derm']
    cust1 = a8_setup['customers'][0]
    cust2 = a8_setup['customers'][1]
    today = current_business_date()

    appt1 = AppointmentService.book_appointment(
        organization_id=org.id,
        customer=cust1,
        provider_id=provider1.id,
        service_id=service_derm.id,
        appointment_date=today,
    )
    assert appt1.serial_number == 1
    assert QueueEntry.objects.filter(appointment=appt1, serial_number=1, status=QueueEntry.Status.WAITING).exists()

    appt2 = AppointmentService.book_appointment(
        organization_id=org.id,
        customer=cust2,
        provider_id=provider1.id,
        service_id=service_derm.id,
        appointment_date=today,
    )
    assert appt2.serial_number == 2
    assert QueueEntry.objects.filter(appointment=appt2, serial_number=2, status=QueueEntry.Status.WAITING).exists()


@pytest.mark.django_db
def test_terminal_cancelled_booking_frees_capacity(a8_setup):
    """Part 9: Cancelled appointments free capacity."""
    org = a8_setup['org']
    provider1 = a8_setup['provider1']
    service_derm = a8_setup['service_derm']
    cust1 = a8_setup['customers'][0]
    today = current_business_date()

    appt1 = AppointmentService.book_appointment(
        organization_id=org.id,
        customer=cust1,
        provider_id=provider1.id,
        service_id=service_derm.id,
        appointment_date=today,
    )
    AppointmentService.cancel_appointment(appointment=appt1, reason="Customer cancelled")

    avail = AppointmentAvailabilityService.get_available_slots(
        organization_id=org.id, provider_id=provider1.id, service_id=service_derm.id, on_date=today
    )
    assert avail['is_available'] is True
    assert avail['remaining_capacity_minutes'] == 240


@pytest.mark.django_db
def test_cross_org_manipulation_rejected(a8_setup):
    """Part 19: Reject provider or service manipulation from another organization."""
    org = a8_setup['org']
    other_provider = a8_setup['other_provider']
    service_derm = a8_setup['service_derm']
    cust = a8_setup['customers'][0]

    with pytest.raises(Exception):
        AppointmentService.book_appointment(
            organization_id=org.id,
            customer=cust,
            provider_id=other_provider.id,
            service_id=service_derm.id,
            appointment_date=current_business_date(),
        )


@pytest.mark.django_db
def test_public_provider_data_exposes_professional_fields(a8_setup):
    """Part 7: Provider public profile API exposes professional metadata."""
    org = a8_setup['org']
    provider1 = a8_setup['provider1']

    client = APIClient()
    response = client.get(f"/api/v1/organizations/{org.id}/providers/{provider1.id}/profile/")
    assert response.status_code == 200
    data = response.data

    assert data['title'] == "Associate Professor, Department of Dermatology"
    assert data['experience_years'] == 9
    assert len(data['education']) == 2
    assert "Dermatology" in data['specialties']


@pytest.mark.django_db
def test_private_internal_break_details_not_exposed_in_public_availability(a8_setup):
    """Part 4 & 17: Availability API returns working_hours_display without exposing internal break details."""
    org = a8_setup['org']
    provider1 = a8_setup['provider1']
    service_derm = a8_setup['service_derm']

    avail = AppointmentAvailabilityService.get_available_slots(
        organization_id=org.id, provider_id=provider1.id, service_id=service_derm.id, on_date=current_business_date()
    )
    assert avail['is_available'] is True
    assert 'working_hours_display' in avail
    assert 'breaks' not in avail


@pytest.mark.django_db
def test_phase_a72_in_progress_and_downstream_eta(a8_setup):
    """Part 16 & 17: Customer #2 IN_PROGRESS ETA suppression and Customer #3 dynamic remaining duration deduction."""
    org = a8_setup['org']
    provider = a8_setup['provider1']
    service = a8_setup['service_derm'] # 60 mins duration
    custs = a8_setup['customers']
    today = current_business_date()

    appt1 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[0], provider_id=provider.id, service_id=service.id, appointment_date=today)
    appt2 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[1], provider_id=provider.id, service_id=service.id, appointment_date=today)
    appt3 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[2], provider_id=provider.id, service_id=service.id, appointment_date=today)

    q1 = QueueEntry.objects.get(appointment=appt1)
    q2 = QueueEntry.objects.get(appointment=appt2)
    q3 = QueueEntry.objects.get(appointment=appt3)

    # #1 completed
    QueueService.check_in_appointment(appointment=appt1, actor=custs[0], bypass_window=True)
    QueueService.call_next(organization_id=org.id, provider_id=provider.id, actor=custs[0])
    QueueService.start_queue_entry(organization_id=org.id, queue_entry_id=q1.id, actor=custs[0])
    QueueService.complete_queue_entry(organization_id=org.id, queue_entry_id=q1.id, actor=custs[0])

    # #2 IN_PROGRESS
    QueueService.check_in_appointment(appointment=appt2, actor=custs[1], bypass_window=True)
    QueueService.call_next(organization_id=org.id, provider_id=provider.id, actor=custs[1])
    QueueService.start_queue_entry(organization_id=org.id, queue_entry_id=q2.id, actor=custs[1])

    # Check #2 readiness & ETA
    q2.refresh_from_db()
    readiness2 = QueueService.calculate_readiness_and_eta(q2)
    assert readiness2['readiness_state'] == QueueEntry.ReadinessState.IN_SERVICE
    assert readiness2['estimated_start_time'] is None

    # #3 checked-in waiting
    QueueService.check_in_appointment(appointment=appt3, actor=custs[2], bypass_window=True)
    readiness3 = QueueService.calculate_readiness_and_eta(q3)
    assert readiness3['now_serving_serial'] == 2
    assert readiness3['scheduled_ahead'] == 0
    assert readiness3['checked_in_ahead'] == 0


@pytest.mark.django_db
def test_provider_started_vs_active_consultation_semantics(a8_setup):
    """Part 17: Distinction between provider_has_started_today and active consultation."""
    org = a8_setup['org']
    provider = a8_setup['provider1']
    service = a8_setup['service_derm']
    cust = a8_setup['customers'][0]
    today = current_business_date()

    appt1 = AppointmentService.book_appointment(organization_id=org.id, customer=cust, provider_id=provider.id, service_id=service.id, appointment_date=today)
    q1 = QueueEntry.objects.get(appointment=appt1)

    # Complete #1 consultation
    QueueService.check_in_appointment(appointment=appt1, actor=cust, bypass_window=True)
    QueueService.call_next(organization_id=org.id, provider_id=provider.id, actor=cust)
    QueueService.start_queue_entry(organization_id=org.id, queue_entry_id=q1.id, actor=cust)
    QueueService.complete_queue_entry(organization_id=org.id, queue_entry_id=q1.id, actor=cust)

    active_entry = QueueEntry.objects.filter(provider=provider, queue_date=today, status=QueueEntry.Status.IN_PROGRESS).first()
    has_started_today = QueueEntry.objects.filter(provider=provider, queue_date=today, status__in=['CALLED', 'IN_PROGRESS', 'COMPLETED']).exists()

    assert active_entry is None
    assert has_started_today is True
