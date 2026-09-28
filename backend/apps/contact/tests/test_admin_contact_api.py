import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contact.email_service import EmailSendResult, send_contact_admin_reply
from apps.contact.models import ContactMessage
from apps.organizations.models import Organization, OrganizationMembership

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture(autouse=True)
def _no_real_emails(monkeypatch):
    """Safety net: the entire contact test suite must never send a real email.

    The existing admin tests (TestAdminContactAPI) exercise the reply view, which
    now dispatches ``send_contact_admin_reply``. Without this fixture those tests
    would reach the real Resend network using the loaded ``.env`` values.
    """
    monkeypatch.setattr(
        'apps.contact.views.send_contact_admin_notification',
        lambda message: EmailSendResult(success=True, email_id='mock-admin'),
    )
    monkeypatch.setattr(
        'apps.contact.views.send_contact_customer_confirmation',
        lambda message: EmailSendResult(success=True, email_id='mock-confirm'),
    )
    monkeypatch.setattr(
        'apps.contact.views.send_contact_admin_reply',
        lambda message, reply_text='', admin_name=None: EmailSendResult(
            success=True, email_id='mock-reply'
        ),
    )

@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        email='admin@smartqueue.com',
        password='AdminPassword123!',
        first_name='System',
        last_name='Admin',
    )


@pytest.fixture
def system_staff_admin_user(db):
    return User.objects.create_user(
        email='staffadmin@smartqueue.com',
        password='Password123!',
        first_name='SystemStaff',
        last_name='Admin',
        is_staff=True,
    )


@pytest.fixture
def customer_user(db):
    return User.objects.create_user(
        email='customer@example.com',
        password='Password123!',
        first_name='Customer',
        last_name='User',
    )


@pytest.fixture
def manager_user(db):
    user = User.objects.create_user(
        email='manager@example.com',
        password='Password123!',
        first_name='Manager',
        last_name='User',
    )
    org = Organization.objects.create(name='Test Org', slug='test-org', is_active=True)
    OrganizationMembership.objects.create(
        user=user,
        organization=org,
        role=OrganizationMembership.Role.MANAGER,
        is_active=True,
    )
    return user


@pytest.fixture
def provider_user(db):
    user = User.objects.create_user(
        email='provider@example.com',
        password='Password123!',
        first_name='Provider',
        last_name='User',
    )
    org = Organization.objects.create(name='Provider Org', slug='provider-org', is_active=True)
    OrganizationMembership.objects.create(
        user=user,
        organization=org,
        role=OrganizationMembership.Role.PROVIDER,
        is_active=True,
    )
    return user


@pytest.fixture
def staff_user(db):
    user = User.objects.create_user(
        email='staff@example.com',
        password='Password123!',
        first_name='OrgStaff',
        last_name='User',
    )
    org = Organization.objects.create(name='Staff Org', slug='staff-org', is_active=True)
    OrganizationMembership.objects.create(
        user=user,
        organization=org,
        role=OrganizationMembership.Role.STAFF,
        is_active=True,
    )
    return user


@pytest.fixture
def sample_messages(db):
    msg1 = ContactMessage.objects.create(
        name='Alice Smith',
        email='alice@example.com',
        phone='+1111111111',
        subject='First Inquiry',
        message='Message body 1',
        status=ContactMessage.Status.NEW,
    )
    msg2 = ContactMessage.objects.create(
        name='Bob Jones',
        email='bob@example.com',
        phone='+2222222222',
        subject='Second Inquiry',
        message='Message body 2',
        status=ContactMessage.Status.IN_REVIEW,
    )
    msg3 = ContactMessage.objects.create(
        name='Charlie Brown',
        email='charlie@example.com',
        subject='Third Inquiry',
        message='Message body 3',
        status=ContactMessage.Status.REPLIED,
    )
    return [msg1, msg2, msg3]


@pytest.mark.django_db
class TestAdminContactAPI:
    list_url = '/api/v1/admin/contact/'

    def test_anonymous_access_denied(self, api_client, sample_messages):
        msg = sample_messages[0]
        detail_url = f'{self.list_url}{msg.id}/'
        reply_url = f'{self.list_url}{msg.id}/reply/'

        assert api_client.get(self.list_url).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        assert api_client.get(detail_url).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        assert api_client.patch(detail_url, {'status': 'CLOSED'}).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        assert api_client.post(reply_url, {'message': 'Reply'}).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_customer_role_forbidden(self, api_client, customer_user, sample_messages):
        api_client.force_authenticate(user=customer_user)
        msg = sample_messages[0]
        detail_url = f'{self.list_url}{msg.id}/'
        reply_url = f'{self.list_url}{msg.id}/reply/'

        assert api_client.get(self.list_url).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get(detail_url).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.patch(detail_url, {'status': 'CLOSED'}).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(reply_url, {'message': 'Reply'}).status_code == status.HTTP_403_FORBIDDEN

    def test_manager_role_forbidden(self, api_client, manager_user, sample_messages):
        api_client.force_authenticate(user=manager_user)
        msg = sample_messages[0]
        detail_url = f'{self.list_url}{msg.id}/'
        reply_url = f'{self.list_url}{msg.id}/reply/'

        assert api_client.get(self.list_url).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get(detail_url).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.patch(detail_url, {'status': 'CLOSED'}).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(reply_url, {'message': 'Reply'}).status_code == status.HTTP_403_FORBIDDEN

    def test_provider_role_forbidden(self, api_client, provider_user, sample_messages):
        api_client.force_authenticate(user=provider_user)
        msg = sample_messages[0]
        detail_url = f'{self.list_url}{msg.id}/'
        reply_url = f'{self.list_url}{msg.id}/reply/'

        assert api_client.get(self.list_url).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get(detail_url).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.patch(detail_url, {'status': 'CLOSED'}).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(reply_url, {'message': 'Reply'}).status_code == status.HTTP_403_FORBIDDEN

    def test_staff_role_forbidden(self, api_client, staff_user, sample_messages):
        api_client.force_authenticate(user=staff_user)
        msg = sample_messages[0]
        detail_url = f'{self.list_url}{msg.id}/'
        reply_url = f'{self.list_url}{msg.id}/reply/'

        assert api_client.get(self.list_url).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.get(detail_url).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.patch(detail_url, {'status': 'CLOSED'}).status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(reply_url, {'message': 'Reply'}).status_code == status.HTTP_403_FORBIDDEN

    def test_system_superuser_admin_can_list_messages(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        response = api_client.get(self.list_url)
        assert response.status_code == status.HTTP_200_OK
        data = response.data if isinstance(response.data, list) else response.data.get('results', [])
        assert len(data) == 3

    def test_system_staff_admin_can_list_messages(self, api_client, system_staff_admin_user, sample_messages):
        api_client.force_authenticate(user=system_staff_admin_user)
        response = api_client.get(self.list_url)
        assert response.status_code == status.HTTP_200_OK

    def test_idor_protection_for_non_admin_users(self, api_client, customer_user, manager_user, provider_user, staff_user, sample_messages):
        msg = sample_messages[0]
        detail_url = f'{self.list_url}{msg.id}/'
        reply_url = f'{self.list_url}{msg.id}/reply/'

        for user in [customer_user, manager_user, provider_user, staff_user]:
            api_client.force_authenticate(user=user)
            # Knowing UUID must NOT grant access
            assert api_client.get(detail_url).status_code == status.HTTP_403_FORBIDDEN
            assert api_client.patch(detail_url, {'status': 'CLOSED'}).status_code == status.HTTP_403_FORBIDDEN
            assert api_client.post(reply_url, {'message': 'IDOR Attempt'}).status_code == status.HTTP_403_FORBIDDEN

    def test_status_filtering(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        res_new = api_client.get(self.list_url, {'status': 'NEW'})
        assert res_new.status_code == status.HTTP_200_OK
        items_new = res_new.data if isinstance(res_new.data, list) else res_new.data.get('results', [])
        assert len(items_new) == 1
        assert items_new[0]['status'] == 'NEW'

    def test_search_filtering(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        res_search = api_client.get(self.list_url, {'search': 'Alice'})
        assert res_search.status_code == status.HTTP_200_OK
        items_search = res_search.data if isinstance(res_search.data, list) else res_search.data.get('results', [])
        assert len(items_search) == 1
        assert items_search[0]['name'] == 'Alice Smith'

    def test_pagination(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        res = api_client.get(self.list_url, {'page': 1, 'page_size': 2})
        assert res.status_code == status.HTTP_200_OK
        assert 'count' in res.data
        assert res.data['count'] == 3
        assert len(res.data['results']) == 2

    def test_admin_retrieve_detail(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        msg = sample_messages[0]
        response = api_client.get(f'{self.list_url}{msg.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(msg.id)
        assert response.data['name'] == msg.name
        assert response.data['message'] == msg.message
        assert 'replied_by_detail' in response.data

    def test_admin_status_update(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        msg = sample_messages[0]
        response = api_client.patch(f'{self.list_url}{msg.id}/', {'status': 'IN_REVIEW'}, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'IN_REVIEW'

        msg.refresh_from_db()
        assert msg.status == ContactMessage.Status.IN_REVIEW

    def test_admin_status_update_invalid_choice(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        msg = sample_messages[0]
        response = api_client.patch(f'{self.list_url}{msg.id}/', {'status': 'INVALID_STATUS'}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_admin_reply_success(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        msg = sample_messages[0]
        payload = {'message': 'Thank you for reaching out. We have investigated your issue.'}
        response = api_client.post(f'{self.list_url}{msg.id}/reply/', payload, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'REPLIED'
        assert response.data['replied_at'] is not None
        assert response.data['replied_by'] == admin_user.id
        assert response.data['replied_by_detail']['email'] == admin_user.email

        # Verify DB persistence
        msg.refresh_from_db()
        assert msg.status == ContactMessage.Status.REPLIED
        assert msg.replied_at is not None
        assert msg.replied_by == admin_user

    def test_admin_reply_empty_or_whitespace(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        msg = sample_messages[0]

        # Empty
        res1 = api_client.post(f'{self.list_url}{msg.id}/reply/', {'message': ''}, format='json')
        assert res1.status_code == status.HTTP_400_BAD_REQUEST

        # Whitespace only
        res2 = api_client.post(f'{self.list_url}{msg.id}/reply/', {'message': '   '}, format='json')
        assert res2.status_code == status.HTTP_400_BAD_REQUEST

    def test_admin_reply_oversized_message(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        msg = sample_messages[0]
        payload = {'message': 'a' * 5001}
        response = api_client.post(f'{self.list_url}{msg.id}/reply/', payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'message' in response.data

    def test_client_cannot_spoof_replied_metadata(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        msg = sample_messages[0]
        fake_time = '2020-01-01T00:00:00Z'
        payload = {
            'message': 'Valid reply content.',
            'replied_at': fake_time,
            'replied_by': 999999,
        }
        response = api_client.post(f'{self.list_url}{msg.id}/reply/', payload, format='json')
        assert response.status_code == status.HTTP_200_OK

        msg.refresh_from_db()
        assert msg.replied_by == admin_user
        assert msg.replied_at != fake_time

    def test_public_contact_endpoint_regression(self, api_client):
        public_url = '/api/v1/contact/'
        api_client.credentials()  # Anonymous
        payload = {
            'name': 'Public User',
            'email': 'public@example.com',
            'subject': 'Public Question',
            'message': 'Regression check for public endpoint.',
        }
        response = api_client.post(public_url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert 'replied_by' not in response.data
        assert 'replied_at' not in response.data


@pytest.mark.django_db
class TestAdminContactEmailWiring:
    list_url = '/api/v1/admin/contact/'

    @pytest.fixture(autouse=True)
    def mail_mock(self, monkeypatch):
        """Replace the reply dispatcher with a fake that records what it received.
        No real email is ever sent and no network call is ever made."""
        self.reply_called_with = None

        def fake_reply(message, reply_text, admin_name=None):
            assert message.status == ContactMessage.Status.REPLIED
            assert message.replied_by_id is not None
            assert reply_text
            self.reply_called_with = {
                'message_id': str(message.id),
                'reply_text': reply_text,
                'admin_name': admin_name,
                'message_status': message.status,
                'replied_by_id': str(message.replied_by_id),
            }
            return EmailSendResult(success=True, email_id='mock-reply')

        monkeypatch.setattr('apps.contact.views.send_contact_admin_reply', fake_reply)

    def test_admin_reply_dispatches_email(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        msg = sample_messages[0]
        payload = {'message': 'We have updated your appointment.'}

        response = api_client.post(
            f'{self.list_url}{msg.id}/reply/', payload, format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == ContactMessage.Status.REPLIED
        assert response.data['replied_by'] == admin_user.id

        assert self.reply_called_with is not None
        assert self.reply_called_with['message_id'] == str(msg.id)
        assert self.reply_called_with['reply_text'] == payload['message']
        assert self.reply_called_with['admin_name'] == 'System Admin'

        msg.refresh_from_db()
        assert msg.status == ContactMessage.Status.REPLIED
        assert msg.replied_by_id == admin_user.id

    def test_admin_reply_succeeds_when_email_fails(self, api_client, admin_user, sample_messages, monkeypatch):
        """A reply must still be persisted and return 200 even when the email fails."""
        api_client.force_authenticate(user=admin_user)

        def failing_reply(*args, **kwargs):
            return EmailSendResult(success=False, error='Resend rejected the message')

        monkeypatch.setattr(
            'apps.contact.views.send_contact_admin_reply', failing_reply
        )

        msg = sample_messages[0]
        payload = {'message': 'Critical reply that must still land.'}
        response = api_client.post(
            f'{self.list_url}{msg.id}/reply/', payload, format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == ContactMessage.Status.REPLIED
        assert response.data['replied_by'] == admin_user.id

        msg.refresh_from_db()
        assert msg.status == ContactMessage.Status.REPLIED
        assert msg.replied_at is not None
        assert msg.replied_by_id == admin_user.id

    def test_admin_reply_email_receives_unsaved_reply_text(self, api_client, admin_user, sample_messages):
        api_client.force_authenticate(user=admin_user)
        msg = sample_messages[0]
        payload = {'message': 'Your booking has been rescheduled to Monday at 09:00.'}

        api_client.post(
            f'{self.list_url}{msg.id}/reply/', payload, format='json'
        )

        assert self.reply_called_with['reply_text'] == payload['message']

    def test_admin_reply_preserves_lifecycle_fields_after_email_failure(
        self, api_client, admin_user, sample_messages, monkeypatch
    ):
        """Lifecycle fields must survive even when the email layer returns failure."""
        api_client.force_authenticate(user=admin_user)

        def failing_reply(*args, **kwargs):
            return EmailSendResult(success=False, error='email failure')

        monkeypatch.setattr(
            'apps.contact.views.send_contact_admin_reply', failing_reply
        )

        msg = sample_messages[1]
        response = api_client.post(
            f'{self.list_url}{msg.id}/reply/', {'message': 'reply'}, format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        msg.refresh_from_db()

        assert msg.status == ContactMessage.Status.REPLIED
        assert msg.replied_at is not None
        assert msg.replied_by_id == admin_user.id