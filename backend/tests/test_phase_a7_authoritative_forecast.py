import pytest
from datetime import date, timedelta
from django.utils import timezone
from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.appointments.services import AppointmentService
from apps.queue.services import QueueService, current_business_date, business_date_for_appointment
from apps.contact.models import AppointmentIssueReport, ContactMessage


@pytest.fixture
def org_and_provider(db):
    org = Organization.objects.create(
        name="Dhaka Health Clinic",
        slug="dhaka-health",
        industry_type="HEALTHCARE",
        is_active=True,
        verification_status=Organization.VerificationStatus.APPROVED,
    )
    provider_user = User.objects.create_user(
        email="doctor@smartqueue.bd",
        password="password123",
        first_name="Dr. Rahat",
        last_name="Khan",
    )
    membership = OrganizationMembership.objects.create(
        organization=org,
        user=provider_user,
        role=OrganizationMembership.Role.PROVIDER,
        is_active=True,
    )
    provider = ProviderProfile.objects.create(
        membership=membership,
        title="Dr. Rahat Khan",
        is_active=True,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
    )
    service = Service.objects.create(
        organization=org,
        name="General Consultation",
        duration_minutes=15,
        is_active=True,
    )
    ProviderService.objects.create(provider=provider, service=service)

    # Set weekly working schedule for all days
    for day_idx in range(7):
        WeeklySchedule.objects.create(
            provider=provider,
            day_of_week=day_idx,
            is_working_day=True,
            start_time="08:00:00",
            end_time="20:00:00",
        )

    customer1 = User.objects.create_user(email="cust1@smartqueue.bd", password="password123", first_name="Customer", last_name="One")
    customer2 = User.objects.create_user(email="cust2@smartqueue.bd", password="password123", first_name="Customer", last_name="Two")
    customer3 = User.objects.create_user(email="cust3@smartqueue.bd", password="password123", first_name="Customer", last_name="Three")
    customer4 = User.objects.create_user(email="cust4@smartqueue.bd", password="password123", first_name="Customer", last_name="Four")
    customer5 = User.objects.create_user(email="cust5@smartqueue.bd", password="password123", first_name="Target", last_name="Customer")

    return {
        'org': org,
        'provider': provider,
        'service': service,
        'customers': [customer1, customer2, customer3, customer4, customer5],
    }


@pytest.mark.django_db
def test_scenario_a_tomorrow_appointment(org_and_provider):
    """Scenario A: Tomorrow appointment -> Upcoming -> no live telemetry."""
    org = org_and_provider['org']
    provider = org_and_provider['provider']
    service = org_and_provider['service']
    customer = org_and_provider['customers'][0]

    tomorrow = current_business_date() + timedelta(days=1)
    appt = AppointmentService.book_appointment(
        organization_id=org.id,
        customer=customer,
        provider_id=provider.id,
        service_id=service.id,
        appointment_date=tomorrow,
    )

    qentry = QueueEntry.objects.get(appointment=appt)
    readiness = QueueService.calculate_readiness_and_eta(qentry)

    assert readiness['readiness_state'] == QueueEntry.ReadinessState.NOT_YET
    assert readiness['scheduled_ahead'] == 0
    assert readiness['can_check_in'] is False


@pytest.mark.django_db
def test_scenario_b_today_pre_arrival(org_and_provider):
    """Scenario B: Today 3 PM appointment at 3 AM -> Active Today -> pre-arrival forecast telemetry available."""
    org = org_and_provider['org']
    provider = org_and_provider['provider']
    service = org_and_provider['service']
    customer = org_and_provider['customers'][0]

    today = current_business_date()
    appt = AppointmentService.book_appointment(
        organization_id=org.id,
        customer=customer,
        provider_id=provider.id,
        service_id=service.id,
        appointment_date=today,
    )

    qentry = QueueEntry.objects.get(appointment=appt)
    assert qentry.is_checked_in is False
    assert appt.status == Appointment.Status.CONFIRMED

    readiness = QueueService.calculate_readiness_and_eta(qentry)
    assert readiness['scheduled_ahead'] == 0
    assert readiness['checked_in_ahead'] == 0
    assert 'estimated_start_time' in readiness
    assert 'recommended_arrival_time' in readiness


@pytest.mark.django_db
def test_scenario_e_check_in(org_and_provider):
    """Scenario E: Customer checks in -> presence true -> Appointment/QueueEntry synchronized."""
    org = org_and_provider['org']
    provider = org_and_provider['provider']
    service = org_and_provider['service']
    customer = org_and_provider['customers'][0]

    today = current_business_date()
    appt = AppointmentService.book_appointment(
        organization_id=org.id,
        customer=customer,
        provider_id=provider.id,
        service_id=service.id,
        appointment_date=today,
    )

    qentry = QueueService.check_in_appointment(appointment=appt, actor=customer, bypass_window=True)
    appt.refresh_from_db()

    assert qentry.is_checked_in is True
    assert appt.status == Appointment.Status.CHECKED_IN


@pytest.mark.django_db
def test_scenario_f_call_next_presence(org_and_provider):
    """Scenario F: Serial #1 active, #2 unarrived, #3 checked in -> Call Next behavior respects presence."""
    org = org_and_provider['org']
    provider = org_and_provider['provider']
    service = org_and_provider['service']
    custs = org_and_provider['customers']

    today = current_business_date()
    appt1 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[0], provider_id=provider.id, service_id=service.id, appointment_date=today)
    appt2 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[1], provider_id=provider.id, service_id=service.id, appointment_date=today)
    appt3 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[2], provider_id=provider.id, service_id=service.id, appointment_date=today)

    q1 = QueueService.check_in_appointment(appointment=appt1, bypass_window=True)
    # appt2 is NOT checked in
    q3 = QueueService.check_in_appointment(appointment=appt3, bypass_window=True)

    # Call next -> calls #1
    called1 = QueueService.call_next(organization_id=org.id, provider_id=provider.id)
    assert called1.serial_number == 1

    # Start and complete #1
    QueueService.start_queue_entry(organization_id=org.id, queue_entry_id=called1.id)
    QueueService.complete_queue_entry(organization_id=org.id, queue_entry_id=called1.id)

    # Call next again -> should call #3 because #2 is unarrived (presence-gated!)
    called3 = QueueService.call_next(organization_id=org.id, provider_id=provider.id)
    assert called3.serial_number == 3

    # Verify #2 is NOT destroyed or deleted
    q2 = QueueEntry.objects.get(appointment=appt2)
    assert q2.status == QueueEntry.Status.WAITING
    assert q2.serial_number == 2


@pytest.mark.django_db
def test_scenario_g_h_i_j_forecast_updates(org_and_provider):
    """
    Scenario G, H, I, J:
    - Forecast for target serial #5 includes unarrived earlier serials.
    - Earlier serial cancelled -> removed from forecast.
    - Earlier serial completed -> removed from ahead count.
    - Earlier serial confirmed NO_SHOW -> removed from forecast.
    """
    org = org_and_provider['org']
    provider = org_and_provider['provider']
    service = org_and_provider['service']
    custs = org_and_provider['customers']

    today = current_business_date()
    appt1 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[0], provider_id=provider.id, service_id=service.id, appointment_date=today)
    appt2 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[1], provider_id=provider.id, service_id=service.id, appointment_date=today)
    appt3 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[2], provider_id=provider.id, service_id=service.id, appointment_date=today)
    appt4 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[3], provider_id=provider.id, service_id=service.id, appointment_date=today)
    appt5 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[4], provider_id=provider.id, service_id=service.id, appointment_date=today)

    q1 = QueueService.check_in_appointment(appointment=appt1, bypass_window=True)
    # q2 unarrived
    q3 = QueueService.check_in_appointment(appointment=appt3, bypass_window=True)
    # q4 unarrived
    q5 = QueueEntry.objects.get(appointment=appt5)

    # Scenario G: Target #5 sees scheduled_ahead = 4 (#1, #2, #3, #4), checked_in_ahead = 2 (#1, #3)
    readiness = QueueService.calculate_readiness_and_eta(q5)
    assert readiness['scheduled_ahead'] == 4
    assert readiness['checked_in_ahead'] == 2

    # Scenario H: Earlier serial #2 cancelled -> immediately removed from forecast
    AppointmentService.cancel_appointment(appointment=appt2, reason="Patient cancelled")
    readiness = QueueService.calculate_readiness_and_eta(q5)
    assert readiness['scheduled_ahead'] == 3

    # Scenario I: Earlier serial #1 completed -> removed from ahead count
    QueueService.call_next(organization_id=org.id, provider_id=provider.id)
    QueueService.start_queue_entry(organization_id=org.id, queue_entry_id=q1.id)
    QueueService.complete_queue_entry(organization_id=org.id, queue_entry_id=q1.id)
    readiness = QueueService.calculate_readiness_and_eta(q5)
    assert readiness['scheduled_ahead'] == 2

    # Scenario J: Earlier serial #4 marked NO_SHOW / skipped -> removed from forecast
    q4 = QueueEntry.objects.get(appointment=appt4)
    q4.status = QueueEntry.Status.SKIPPED
    q4.save()
    readiness = QueueService.calculate_readiness_and_eta(q5)
    assert readiness['scheduled_ahead'] == 1


@pytest.mark.django_db
def test_scenario_k_urgent_override(org_and_provider):
    """Scenario K: Urgent checked-in customer affects operational order and forecast correctly."""
    org = org_and_provider['org']
    provider = org_and_provider['provider']
    service = org_and_provider['service']
    custs = org_and_provider['customers']

    today = current_business_date()
    appt1 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[0], provider_id=provider.id, service_id=service.id, appointment_date=today)
    appt2 = AppointmentService.book_appointment(organization_id=org.id, customer=custs[1], provider_id=provider.id, service_id=service.id, appointment_date=today)

    q1 = QueueService.check_in_appointment(appointment=appt1, bypass_window=True)
    q2 = QueueService.check_in_appointment(appointment=appt2, bypass_window=True)

    # Mark #2 urgent
    QueueService.mark_urgent(organization_id=org.id, queue_entry_id=q2.id, reason="Emergency case")

    # Call Next should select #2 first because of urgent flag
    called = QueueService.call_next(organization_id=org.id, provider_id=provider.id)
    assert called.id == q2.id


@pytest.mark.django_db
def test_scenario_m_walk_in(org_and_provider):
    """Scenario M: Walk-in receives next serial and immediate physical check-in."""
    org = org_and_provider['org']
    provider = org_and_provider['provider']
    service = org_and_provider['service']

    appt = QueueService.register_walk_in(
        organization_id=org.id,
        provider_id=provider.id,
        service_id=service.id,
        first_name="WalkIn",
        last_name="Patient",
        phone_number="+8801700000000",
    )

    assert appt.arrival_type == Appointment.ArrivalType.WALK_IN
    assert appt.booking_channel == Appointment.BookingChannel.FRONT_DESK
    assert appt.status == Appointment.Status.CHECKED_IN
    qentry = QueueEntry.objects.get(appointment=appt)
    assert qentry.is_checked_in is True
    assert qentry.status == QueueEntry.Status.WAITING


@pytest.mark.django_db
def test_scenario_n_o_p_follow_up_and_resolution(org_and_provider):
    """
    Scenario N: Past checked-in appointment with no final outcome -> Needs Follow-up.
    Scenario O: Issue report creation does not falsely complete appointment.
    Scenario P: Resolved follow-up leaves no stale dashboard warning according to final resolution semantics.
    """
    org = org_and_provider['org']
    provider = org_and_provider['provider']
    service = org_and_provider['service']
    customer = org_and_provider['customers'][0]

    yesterday = current_business_date() - timedelta(days=1)
    now = timezone.now()
    past_start = now - timedelta(days=1)
    past_end = past_start + timedelta(minutes=15)
    appt = Appointment.objects.create(
        organization=org,
        customer=customer,
        provider=provider,
        service=service,
        appointment_date=yesterday,
        start_datetime=past_start,
        end_datetime=past_end,
        serial_number=1,
        status=Appointment.Status.CHECKED_IN,
    )
    qentry = QueueEntry.objects.create(
        organization=org,
        appointment=appt,
        provider=provider,
        queue_date=yesterday,
        serial_number=1,
        token_number=1,
        status=QueueEntry.Status.WAITING,
        is_checked_in=True,
        checked_in_at=past_start,
    )

    # Scenario N: Classified as unresolved past checked-in
    from apps.appointments.serializers import CustomerDashboardItemSerializer
    data = CustomerDashboardItemSerializer(appt).data
    assert data['temporal_classification'] == 'past'
    assert data['has_issue_report'] is False

    # Scenario O: Submit issue report
    report = AppointmentIssueReport.objects.create(
        appointment=appt,
        customer=customer,
        reason=AppointmentIssueReport.Reason.CHECKED_IN_NOT_SERVED,
        details="I checked in yesterday but doctor was away.",
        status=AppointmentIssueReport.Status.PENDING,
    )
    appt.refresh_from_db()
    assert appt.status != Appointment.Status.COMPLETED  # Appointment status NOT falsely completed!

    # Scenario P: Staff resolves issue report -> COMPLETED
    from apps.appointments.views import OrganizationAppointmentIssueResolveView
    from rest_framework.test import APIRequestFactory, force_authenticate
    factory = APIRequestFactory()
    request = factory.post(
        f"/api/v1/organizations/{org.id}/appointments/{appt.id}/resolve-issue/",
        {"resolution_outcome": "COMPLETED", "notes": "Confirmed consultation"},
        format='json'
    )
    force_authenticate(request, user=provider.membership.user)

    view = OrganizationAppointmentIssueResolveView.as_view()
    resp = view(request, organization_id=org.id, appointment_id=appt.id)
    assert resp.status_code == 200

    appt.refresh_from_db()
    report.refresh_from_db()
    assert appt.status == Appointment.Status.COMPLETED
    assert report.status == AppointmentIssueReport.Status.RESOLVED


@pytest.mark.django_db
def test_scenario_r_read_only_safety(org_and_provider):
    """Scenario R: GET dashboard/detail/telemetry does not mutate database."""
    org = org_and_provider['org']
    provider = org_and_provider['provider']
    service = org_and_provider['service']
    customer = org_and_provider['customers'][0]

    today = current_business_date()
    appt = AppointmentService.book_appointment(
        organization_id=org.id,
        customer=customer,
        provider_id=provider.id,
        service_id=service.id,
        appointment_date=today,
    )

    initial_updated_at = appt.updated_at
    initial_status = appt.status

    from apps.appointments.serializers import CustomerDashboardItemSerializer
    _ = CustomerDashboardItemSerializer(appt).data

    appt.refresh_from_db()
    assert appt.updated_at == initial_updated_at
    assert appt.status == initial_status
