import pytest
from datetime import date, timedelta
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.contrib.admin.sites import AdminSite
from django.db.models import ProtectedError
from django.test import RequestFactory
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.organizations.models import Organization, OrganizationMembership
from apps.services.models import Service
from apps.providers.models import ProviderProfile
from apps.providers.admin import ProviderProfileAdmin
from apps.appointments.models import Appointment, ProviderDateSerial
from apps.queue.models import QueueEntry
from apps.feedback.models import Review

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email, password="Password123!", **kwargs):
        return User.objects.create_user(email=email, password=password, **kwargs)
    return make_user


def _login(client, email, password="Password123!"):
    res = client.post(reverse('accounts:login'), {'email': email, 'password': password}, format='json')
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    return client


@pytest.fixture
def setup_org(create_user):
    manager = create_user(email='manager@safety.com')
    provider_user = create_user(email='provider@safety.com')
    staff_user = create_user(email='staff@safety.com')
    customer_user = create_user(email='customer@safety.com')
    org = Organization.objects.create(
        name='Safety Clinic', slug='safety-clinic',
        verification_status=Organization.VerificationStatus.APPROVED
    )
    mgr_mem = OrganizationMembership.objects.create(
        user=manager, organization=org, role=OrganizationMembership.Role.MANAGER
    )
    prov_mem = OrganizationMembership.objects.create(
        user=provider_user, organization=org, role=OrganizationMembership.Role.PROVIDER
    )
    staff_mem = OrganizationMembership.objects.create(
        user=staff_user, organization=org, role=OrganizationMembership.Role.STAFF
    )
    return org, manager, provider_user, staff_user, customer_user, prov_mem


@pytest.fixture
def manager_client(api_client, setup_org):
    org, manager, *_ = setup_org
    _login(api_client, 'manager@safety.com')
    api_client.org = org
    return api_client


@pytest.fixture
def provider_profile(setup_org):
    org, manager, provider_user, staff_user, customer_user, prov_mem = setup_org
    return ProviderProfile.objects.create(
        membership=prov_mem, bio='Safety Provider', title='Dr.',
        application_status=ProviderProfile.ApplicationStatus.APPROVED
    )


@pytest.fixture
def service(setup_org):
    org, *_ = setup_org
    return Service.objects.create(
        organization=org, name='Consultation', duration_minutes=30, price='50.00'
    )


def _provider_detail_url(org_id, prov_id):
    return reverse('providers:provider_detail', kwargs={'organization_id': org_id, 'provider_id': prov_id})


# ===========================================================================
# 1. API Protection Tests
# ===========================================================================

@pytest.mark.django_db
class TestProviderDeletionAPIProtection:

    def test_manager_delete_provider_returns_405(self, manager_client, provider_profile):
        """Authorized manager DELETE is rejected with 405 Method Not Allowed and correct Allow header."""
        url = _provider_detail_url(manager_client.org.id, provider_profile.id)
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert res.data['error']['code'] == 'PROVIDER_DELETION_DISABLED'
        assert 'deactivation' in res.data['error']['message'].lower()
        assert 'Allow' in res.headers
        allowed_methods = {
            method.strip()
            for method in res.headers['Allow'].split(',')
        }
        assert 'DELETE' not in allowed_methods
        assert 'GET' in allowed_methods
        assert 'PATCH' in allowed_methods
        assert 'OPTIONS' in allowed_methods

    def test_delete_rejection_preserves_provider_record(self, manager_client, provider_profile):
        """ProviderProfile remains untouched after rejected DELETE attempt."""
        url = _provider_detail_url(manager_client.org.id, provider_profile.id)
        manager_client.delete(url)
        provider_profile.refresh_from_db()
        assert provider_profile.is_active is True
        assert provider_profile.title == 'Dr.'
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()

    def test_anonymous_delete_returns_401(self, api_client, setup_org, provider_profile):
        """Anonymous caller receives 401 Unauthorized."""
        org, *_ = setup_org
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_customer_delete_returns_403(self, api_client, setup_org, provider_profile):
        """Customer caller receives 403 Forbidden."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        _login(api_client, 'customer@safety.com')
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_staff_delete_returns_403(self, api_client, setup_org, provider_profile):
        """Staff caller receives 403 Forbidden."""
        org, manager, provider_user, staff_user, *_ = setup_org
        _login(api_client, 'staff@safety.com')
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_provider_cannot_delete_own_profile(self, api_client, setup_org, provider_profile):
        """Provider cannot delete their own profile (403 Forbidden)."""
        org, manager, provider_user, *_ = setup_org
        _login(api_client, 'provider@safety.com')
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_cross_org_manager_delete_returns_403(self, api_client, create_user, setup_org, provider_profile):
        """Manager of Org B cannot delete Org A's provider."""
        org_a, *_ = setup_org
        manager_b = create_user(email='manager_b@other.com')
        org_b = Organization.objects.create(name='Other Clinic', slug='other-clinic')
        OrganizationMembership.objects.create(
            user=manager_b, organization=org_b, role=OrganizationMembership.Role.MANAGER
        )
        _login(api_client, 'manager_b@other.com')
        # Attempt via Org B URL targeting Org A's provider (manager_b is manager of Org B, so reaches delete handler which returns 405)
        url_b = _provider_detail_url(org_b.id, provider_profile.id)
        res_b = api_client.delete(url_b)
        assert res_b.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert res_b.json()['error']['code'] == 'PROVIDER_DELETION_DISABLED'
        assert 'DELETE' not in {m.strip() for m in res_b.headers['Allow'].split(',')}

        # Attempt via Org A URL with Org B manager credentials (manager_b is not a manager of Org A, so blocked by permission with 403)
        url_a = _provider_detail_url(org_a.id, provider_profile.id)
        res_a = api_client.delete(url_a)
        assert res_a.status_code == status.HTTP_403_FORBIDDEN

    def test_inactive_manager_delete_returns_403(self, api_client, setup_org, provider_profile):
        """Manager with inactive membership receives 403 Forbidden."""
        org, manager, *_ = setup_org
        mem = OrganizationMembership.objects.get(user=manager, organization=org)
        mem.is_active = False
        mem.save()
        _login(api_client, 'manager@safety.com')
        url = _provider_detail_url(org.id, provider_profile.id)
        res = api_client.delete(url)
        assert res.status_code == status.HTTP_403_FORBIDDEN


# ===========================================================================
# 2. ORM Protection Tests (models.PROTECT)
# ===========================================================================

@pytest.mark.django_db
class TestProviderDeletionORMProtection:

    def test_orm_delete_blocked_by_appointment_protect(self, setup_org, provider_profile, service):
        """Direct ORM delete on ProviderProfile raises ProtectedError if an Appointment exists."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        appt = Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )
        with pytest.raises(ProtectedError):
            provider_profile.delete()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()
        assert Appointment.objects.filter(id=appt.id).exists()

    def test_orm_delete_blocked_by_queue_entry_protect(self, setup_org, provider_profile, service):
        """Direct ORM delete on ProviderProfile raises ProtectedError if a QueueEntry exists."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        appt = Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )
        entry = QueueEntry.objects.create(
            organization=org, appointment=appt, provider=provider_profile,
            queue_date=date.today(), status=QueueEntry.Status.WAITING,
        )
        with pytest.raises(ProtectedError):
            provider_profile.delete()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()
        assert QueueEntry.objects.filter(id=entry.id).exists()

    def test_orm_delete_blocked_by_review_protect(self, setup_org, provider_profile, service):
        """Direct ORM delete on ProviderProfile raises ProtectedError if a Review exists."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        appt = Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.COMPLETED,
        )
        review = Review.objects.create(
            organization=org, appointment=appt, customer=customer_user,
            provider=provider_profile, rating=5, comment='Excellent service',
        )
        with pytest.raises(ProtectedError):
            provider_profile.delete()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()
        assert Review.objects.filter(id=review.id).exists()

    def test_orm_delete_blocked_by_serial_counter_protect(self, provider_profile):
        """Direct ORM delete on ProviderProfile raises ProtectedError if ProviderDateSerial exists."""
        counter = ProviderDateSerial.objects.create(
            provider=provider_profile, booking_date=date.today(), last_serial=5
        )
        with pytest.raises(ProtectedError):
            provider_profile.delete()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()
        assert ProviderDateSerial.objects.filter(id=counter.id).exists()

    def test_orm_delete_membership_blocked_by_provider_profile_protect(self, provider_profile):
        """Deleting OrganizationMembership linked to a ProviderProfile raises ProtectedError."""
        mem = provider_profile.membership
        with pytest.raises(ProtectedError):
            mem.delete()
        assert OrganizationMembership.objects.filter(id=mem.id).exists()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()

    def test_orm_delete_organization_blocked_by_protected_relationships(self, setup_org, provider_profile, service):
        """Deleting Organization raises ProtectedError and cannot silently delete ProviderProfile."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.CONFIRMED,
        )
        with pytest.raises(ProtectedError):
            org.delete()
        assert Organization.objects.filter(id=org.id).exists()
        assert ProviderProfile.objects.filter(id=provider_profile.id).exists()

    def test_historical_records_remain_present_after_rejected_deletion_attempts(
        self, manager_client, setup_org, provider_profile, service
    ):
        """Historical appointments, queue entries, and reviews survive rejected DELETE requests."""
        org, manager, provider_user, staff_user, customer_user, _ = setup_org
        now = timezone.now()
        appt = Appointment.objects.create(
            organization=org, customer=customer_user, provider=provider_profile,
            service=service, start_datetime=now, end_datetime=now + timedelta(minutes=30),
            status=Appointment.Status.COMPLETED,
        )
        entry = QueueEntry.objects.create(
            organization=org, appointment=appt, provider=provider_profile,
            queue_date=date.today(), status=QueueEntry.Status.COMPLETED,
        )
        review = Review.objects.create(
            organization=org, appointment=appt, customer=customer_user,
            provider=provider_profile, rating=4, comment='Good experience',
        )

        url = _provider_detail_url(org.id, provider_profile.id)
        res = manager_client.delete(url)
        assert res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        assert Appointment.objects.filter(id=appt.id).exists()
        assert QueueEntry.objects.filter(id=entry.id).exists()
        assert Review.objects.filter(id=review.id).exists()


# ===========================================================================
# 3. Django Admin Protection Tests
# ===========================================================================

@pytest.mark.django_db
class TestProviderDeletionAdminProtection:

    def test_admin_has_delete_permission_is_false(self, setup_org, provider_profile):
        """ProviderProfileAdmin.has_delete_permission() returns False."""
        _, manager, *_ = setup_org
        site = AdminSite()
        model_admin = ProviderProfileAdmin(ProviderProfile, site)
        rf = RequestFactory()
        req = rf.get('/')
        req.user = manager

        assert model_admin.has_delete_permission(req) is False
        assert model_admin.has_delete_permission(req, obj=provider_profile) is False

    def test_admin_delete_selected_action_removed(self, setup_org):
        """ProviderProfileAdmin get_actions excludes 'delete_selected' action."""
        _, manager, *_ = setup_org
        site = AdminSite()
        model_admin = ProviderProfileAdmin(ProviderProfile, site)
        rf = RequestFactory()
        req = rf.get('/')
        req.user = manager

        actions = model_admin.get_actions(req)
        assert 'delete_selected' not in actions


# ===========================================================================
# 4. Compatibility Tests (Reads and PATCH remain fully functional)
# ===========================================================================

@pytest.mark.django_db
class TestProviderOperationsCompatibility:

    def test_provider_get_list_and_detail_still_work(self, manager_client, provider_profile):
        """GET on provider list and detail endpoints returns HTTP 200."""
        list_url = reverse('providers:provider_list_create', kwargs={'organization_id': manager_client.org.id})
        res_list = manager_client.get(list_url)
        assert res_list.status_code == status.HTTP_200_OK

        detail_url = _provider_detail_url(manager_client.org.id, provider_profile.id)
        res_detail = manager_client.get(detail_url)
        assert res_detail.status_code == status.HTTP_200_OK
        assert res_detail.json()['title'] == 'Dr.'

    def test_existing_provider_patch_functionality_unchanged(self, manager_client, provider_profile):
        """Manager can still PATCH provider profile attributes (title, bio)."""
        url = _provider_detail_url(manager_client.org.id, provider_profile.id)
        res = manager_client.patch(url, {'title': 'Prof.', 'bio': 'Updated bio'}, format='json')
        assert res.status_code == status.HTTP_200_OK
        provider_profile.refresh_from_db()
        assert provider_profile.title == 'Prof.'
        assert provider_profile.bio == 'Updated bio'
