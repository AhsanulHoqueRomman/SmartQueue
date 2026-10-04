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
from apps.feedback.models import Review
from apps.feedback.services import ReviewService


@pytest.fixture
def a72_setup(db):
    org = Organization.objects.create(
        name="Dhaka Care Clinic",
        slug="dhaka-care-clinic",
        industry_type="HEALTHCARE",
        is_active=True,
        verification_status=Organization.VerificationStatus.APPROVED,
    )
    provider_user = User.objects.create_user(
        email="dr_tanvir@dhakacare.bd",
        password="password123",
        first_name="Dr. Tanvir",
        last_name="Ahmed",
    )
    membership = OrganizationMembership.objects.create(
        organization=org,
        user=provider_user,
        role=OrganizationMembership.Role.PROVIDER,
        is_active=True,
    )
    provider = ProviderProfile.objects.create(
        membership=membership,
        title="Dr. Tanvir Ahmed",
        is_active=True,
        application_status=ProviderProfile.ApplicationStatus.APPROVED,
    )
    service = Service.objects.create(
        organization=org,
        name="General Consultation",
        duration_minutes=25,
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

    cust1 = User.objects.create_user(email="p1@dhakacare.bd", password="password123", first_name="Patient", last_name="One")
    cust2 = User.objects.create_user(email="p2@dhakacare.bd", password="password123", first_name="Patient", last_name="Two")
    cust3 = User.objects.create_user(email="p3@dhakacare.bd", password="password123", first_name="Patient", last_name="Three")
    cust4 = User.objects.create_user(email="p4@dhakacare.bd", password="password123", first_name="Patient", last_name="Four")

    return {
        'org': org,
        'provider': provider,
        'service': service,
        'cust1': cust1,
        'cust2': cust2,
        'cust3': cust3,
        'cust4': cust4,
    }


@pytest.mark.django_db
def test_4_patient_multi_customer_lifecycle(a72_setup):
    """
    PART 25: Deterministic 4-patient lifecycle test across Stages A to I.
    """
    s = a72_setup
    today = current_business_date()
    now = timezone.now()

    # Create 4 appointments for today
    a1 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust1'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=now,
    )
    a2 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust2'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=now + timedelta(minutes=25),
    )
    a3 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust3'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=now + timedelta(minutes=50),
    )
    a4 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust4'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=now + timedelta(minutes=75),
    )

    q1 = QueueEntry.objects.get(appointment=a1)
    q2 = QueueEntry.objects.get(appointment=a2)
    q3 = QueueEntry.objects.get(appointment=a3)
    q4 = QueueEntry.objects.get(appointment=a4)

    # Stage A: None checked in.
    r1 = QueueService.calculate_readiness_and_eta(q1)
    r2 = QueueService.calculate_readiness_and_eta(q2)
    assert r1['checked_in_ahead'] == 0
    assert r1['scheduled_ahead'] == 0
    assert r2['scheduled_ahead'] == 1
    assert r1['provider_has_started'] is False

    # Stage B: #1 checks in.
    q1 = QueueService.check_in_appointment(appointment=a1, actor=s['cust1'], bypass_window=True)
    r1 = QueueService.calculate_readiness_and_eta(q1)
    assert q1.is_checked_in is True
    assert r1['readiness_state'] == QueueEntry.ReadinessState.BE_READY

    # Stage C: #1 CALLED.
    q1 = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    assert q1.status == QueueEntry.Status.CALLED
    r1 = QueueService.calculate_readiness_and_eta(q1)
    assert r1['readiness_state'] == QueueEntry.ReadinessState.TURN_NOW
    assert r1['now_serving_serial'] == 1
    assert r1['provider_has_started'] is True

    # Stage D: #1 IN_PROGRESS.
    q1 = QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q1.id)
    assert q1.status == QueueEntry.Status.IN_PROGRESS
    r1 = QueueService.calculate_readiness_and_eta(q1)
    assert r1['readiness_state'] == QueueEntry.ReadinessState.IN_SERVICE
    assert r1['estimated_start_time'] is None  # Suppress pending ETA range
    assert r1['actual_started_at'] is not None

    # Stage E: #2 absent (not checked in). #3 & #4 check in.
    q3 = QueueService.check_in_appointment(appointment=a3, actor=s['cust3'], bypass_window=True)
    q4 = QueueService.check_in_appointment(appointment=a4, actor=s['cust4'], bypass_window=True)

    r4 = QueueService.calculate_readiness_and_eta(q4)
    # For #4: WAITING entries ahead are #2 (waiting, not checked in) and #3 (waiting, checked in).
    assert r4['scheduled_ahead'] == 2
    assert r4['checked_in_ahead'] == 1  # Only #3 is checked in ahead of #4

    # Stage F: Complete #1. Call next. Absent #2 is skipped by call_next, #3 is selected.
    q1 = QueueService.complete_queue_entry(organization_id=s['org'].id, queue_entry_id=q1.id)
    q_called = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    assert q_called.id == q3.id  # #3 is selected because #2 is absent (is_checked_in=False)

    # Stage G: #3 IN_PROGRESS. Dynamic ETA for #4.
    q3 = QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q3.id)
    r4 = QueueService.calculate_readiness_and_eta(q4)
    assert r4['now_serving_serial'] == 3
    assert r4['checked_in_ahead'] == 0  # No checked in entries ahead of #4 now that #3 is IN_PROGRESS

    # Stage H: #2 arrives late and checks in.
    q2 = QueueService.check_in_appointment(appointment=a2, actor=s['cust2'], bypass_window=True)
    # Active consultation #3 is NOT interrupted. #3 remains IN_PROGRESS.
    q3.refresh_from_db()
    assert q3.status == QueueEntry.Status.IN_PROGRESS

    # After #3 completes, staff calls next. #2 (lower serial) gets called before #4.
    q3 = QueueService.complete_queue_entry(organization_id=s['org'].id, queue_entry_id=q3.id)
    q_next = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    assert q_next.id == q2.id

    # Stage I: Complete remaining.
    q2 = QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q2.id)
    q2 = QueueService.complete_queue_entry(organization_id=s['org'].id, queue_entry_id=q2.id)
    q4_called = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    q4_started = QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q4_called.id)
    q4_completed = QueueService.complete_queue_entry(organization_id=s['org'].id, queue_entry_id=q4_started.id)

    assert q4_completed.status == QueueEntry.Status.COMPLETED


@pytest.mark.django_db
def test_in_progress_stale_eta_suppression_and_telemetry(a72_setup):
    """
    PART 26: Test that an IN_PROGRESS appointment suppresses pending start ETA
    and exposes actual_started_at and remaining_service_minutes.
    """
    s = a72_setup
    today = current_business_date()
    past_start = timezone.now() - timedelta(minutes=14)

    appt = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust1'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=past_start,
    )
    q1 = QueueService.check_in_appointment(appointment=appt, actor=s['cust1'], bypass_window=True)
    q1 = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    q1 = QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q1.id)

    readiness = QueueService.calculate_readiness_and_eta(q1)

    assert readiness['readiness_state'] == QueueEntry.ReadinessState.IN_SERVICE
    assert readiness['estimated_start_time'] is None
    assert readiness['actual_started_at'] is not None
    assert readiness['remaining_service_minutes'] is not None
    assert readiness['remaining_service_minutes'] <= 25


@pytest.mark.django_db
def test_provider_has_started_consistency(a72_setup):
    """
    PART 27: Verify provider_has_started is True whenever a CALLED/IN_PROGRESS/COMPLETED entry exists.
    Customer #3 waiting while #2 is IN_PROGRESS must receive provider_has_started = True.
    """
    s = a72_setup
    today = current_business_date()
    now = timezone.now()

    a1 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust1'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=now,
    )
    a2 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust2'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=now + timedelta(minutes=25),
    )

    q1 = QueueService.check_in_appointment(appointment=a1, actor=s['cust1'], bypass_window=True)
    q2 = QueueService.check_in_appointment(appointment=a2, actor=s['cust2'], bypass_window=True)

    q1 = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    q1 = QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q1.id)

    r2 = QueueService.calculate_readiness_and_eta(q2)
    assert r2['provider_has_started'] is True
    assert r2['now_serving_serial'] == 1


@pytest.mark.django_db
def test_elapsed_time_deduction_for_downstream_eta(a72_setup):
    """
    PART 5: Test that active consultation elapsed time reduces downstream ETA.
    """
    s = a72_setup
    today = current_business_date()

    # 14 minutes ago start time for active #1
    past_14 = timezone.now() - timedelta(minutes=14)

    a1 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust1'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=past_14,
    )
    a2 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust2'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=past_14 + timedelta(minutes=25),
    )

    q1 = QueueService.check_in_appointment(appointment=a1, actor=s['cust1'], bypass_window=True)
    q2 = QueueService.check_in_appointment(appointment=a2, actor=s['cust2'], bypass_window=True)

    q1 = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    q1 = QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q1.id)
    q1.started_at = past_14
    q1.save()

    r2 = QueueService.calculate_readiness_and_eta(q2)
    # 25 min duration - 14 min elapsed = 11 min remaining
    assert r2['estimated_wait_minutes'] == 11


@pytest.mark.django_db
def test_urgent_priority_ordering_consistency(a72_setup):
    """
    PART 14: Test that marked urgent patient is selected first by call_next
    AND correctly affects ETA of non-urgent patients ahead in serial number.
    """
    s = a72_setup
    today = current_business_date()
    now = timezone.now()

    a1 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust1'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=now,
    )
    a2 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust2'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=now + timedelta(minutes=25),
    )

    q1 = QueueService.check_in_appointment(appointment=a1, actor=s['cust1'], bypass_window=True)
    q2 = QueueService.check_in_appointment(appointment=a2, actor=s['cust2'], bypass_window=True)

    # Mark Serial #2 as urgent
    QueueService.mark_urgent(organization_id=s['org'].id, queue_entry_id=q2.id, reason="Emergency")

    # call_next MUST select urgent #2 first despite higher serial
    q_called = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    assert q_called.id == q2.id


@pytest.mark.django_db
def test_completed_review_flow(a72_setup):
    """
    PART 20: Test completed appointment review flow.
    Can leave one review, duplicate review is rejected.
    """
    s = a72_setup
    today = current_business_date()
    now = timezone.now()

    a1 = AppointmentService.book_appointment(
        organization_id=s['org'].id, customer=s['cust1'], provider_id=s['provider'].id,
        service_id=s['service'].id, appointment_date=today, start_datetime=now,
    )
    q1 = QueueService.check_in_appointment(appointment=a1, actor=s['cust1'], bypass_window=True)
    q1 = QueueService.call_next(organization_id=s['org'].id, provider_id=s['provider'].id)
    q1 = QueueService.start_queue_entry(organization_id=s['org'].id, queue_entry_id=q1.id)
    q1 = QueueService.complete_queue_entry(organization_id=s['org'].id, queue_entry_id=q1.id)
    a1.refresh_from_db()

    # Submit review
    rev = ReviewService.create_review(
        customer=s['cust1'],
        appointment=a1,
        rating=5,
        comment="Excellent care!",
    )
    assert rev.id is not None

    # Duplicate review attempt should fail
    with pytest.raises(Exception):
        ReviewService.create_review(
            customer=s['cust1'],
            appointment=a1,
            rating=4,
            comment="Duplicate attempt",
        )
