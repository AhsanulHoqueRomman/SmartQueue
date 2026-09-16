import pytest
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(**kwargs):
        defaults = {
            'email': 'user@example.com',
            'password': 'StrongPassword123!',
            'first_name': 'Test',
            'last_name': 'User',
            'phone_number': '01711112222'
        }
        defaults.update(kwargs)
        return User.objects.create_user(**defaults)
    return make_user


@pytest.mark.django_db
class TestRegistration:
    def test_successful_registration(self, api_client):
        url = reverse('accounts:register')
        payload = {
            'email': 'newuser@example.com',
            'first_name': 'Alice',
            'last_name': 'Smith',
            'phone_number': '01900000000',
            'password': 'ComplexPassword123!',
            'password_confirm': 'ComplexPassword123!'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert 'access' in response.data
        assert 'refresh' in response.data
        assert 'user' in response.data
        assert response.data['user']['email'] == 'newuser@example.com'
        assert 'password' not in response.data['user']

    def test_duplicate_email_rejection(self, api_client, create_user):
        create_user(email='existing@example.com')
        url = reverse('accounts:register')
        payload = {
            'email': 'existing@example.com',
            'password': 'ComplexPassword123!',
            'password_confirm': 'ComplexPassword123!'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in response.data

    def test_password_mismatch_rejection(self, api_client):
        url = reverse('accounts:register')
        payload = {
            'email': 'mismatch@example.com',
            'password': 'ComplexPassword123!',
            'password_confirm': 'DifferentPassword123!'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'password_confirm' in response.data

    def test_weak_password_rejection(self, api_client):
        url = reverse('accounts:register')
        payload = {
            'email': 'weak@example.com',
            'password': '123',
            'password_confirm': '123'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'password' in response.data

    def test_manager_registration_atomic_organization(self, api_client):
        url = reverse('accounts:register_manager')
        payload = {
            'email': 'newmanager@example.com',
            'first_name': 'Manager',
            'last_name': 'Boss',
            'phone_number': '01811111111',
            'password': 'ManagerPassword123!',
            'password_confirm': 'ManagerPassword123!',
            'organization_name': 'Apex Dental Care',
            'address': '123 Main St',
            'organization_phone': '01822222222'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert 'access' in response.data
        assert 'organization' in response.data
        assert response.data['organization']['name'] == 'Apex Dental Care'
        assert response.data['user']['memberships'][0]['role'] == 'MANAGER'

    def test_provider_registration_pending_approval(self, api_client):
        # First create a manager and organization
        mgr_url = reverse('accounts:register_manager')
        mgr_payload = {
            'email': 'prov_mgr@example.com',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'organization_name': 'Care Clinic'
        }
        mgr_res = api_client.post(mgr_url, mgr_payload, format='json')
        org_id = mgr_res.data['organization']['id']

        # Now register provider choosing this organization
        prov_url = reverse('accounts:register_provider')
        prov_payload = {
            'email': 'newprovider@example.com',
            'first_name': 'Dr. John',
            'last_name': 'Doe',
            'password': 'ProviderPassword123!',
            'password_confirm': 'ProviderPassword123!',
            'title': 'Senior Specialist',
            'bio': 'Experienced practitioner',
            'organization_id': org_id
        }
        response = api_client.post(prov_url, prov_payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['is_pending_approval'] is True
        assert response.data['user']['memberships'][0]['is_active'] is False
        assert response.data['user']['memberships'][0]['role'] == 'PROVIDER'


@pytest.mark.django_db
class TestLogin:
    def test_successful_login(self, api_client, create_user):
        user = create_user(email='login@example.com', password='CorrectPassword123!')
        url = reverse('accounts:login')
        payload = {
            'email': 'login@example.com',
            'password': 'CorrectPassword123!'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
        assert 'refresh' in response.data
        assert response.data['user']['email'] == 'login@example.com'

    def test_login_wrong_password(self, api_client, create_user):
        create_user(email='login@example.com', password='CorrectPassword123!')
        url = reverse('accounts:login')
        payload = {
            'email': 'login@example.com',
            'password': 'WrongPassword123!'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_nonexistent_email(self, api_client):
        url = reverse('accounts:login')
        payload = {
            'email': 'nobody@example.com',
            'password': 'Password123!'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_inactive_user(self, api_client, create_user):
        user = create_user(email='inactive@example.com', password='Password123!', is_active=False)
        url = reverse('accounts:login')
        payload = {
            'email': 'inactive@example.com',
            'password': 'Password123!'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestJWTAndLogout:
    def test_token_refresh(self, api_client, create_user):
        user = create_user(email='token@example.com', password='Password123!')
        login_res = api_client.post(reverse('accounts:login'), {'email': 'token@example.com', 'password': 'Password123!'}, format='json')
        refresh_token = login_res.data['refresh']

        url = reverse('accounts:token_refresh')
        response = api_client.post(url, {'refresh': refresh_token}, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data

    def test_logout_blacklists_refresh_token(self, api_client, create_user):
        user = create_user(email='logout@example.com', password='Password123!')
        login_res = api_client.post(reverse('accounts:login'), {'email': 'logout@example.com', 'password': 'Password123!'}, format='json')
        access_token = login_res.data['access']
        refresh_token = login_res.data['refresh']

        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        logout_url = reverse('accounts:logout')
        logout_res = api_client.post(logout_url, {'refresh': refresh_token}, format='json')
        assert logout_res.status_code == status.HTTP_200_OK

        # Attempt to refresh using blacklisted token must fail
        refresh_url = reverse('accounts:token_refresh')
        failed_refresh = api_client.post(refresh_url, {'refresh': refresh_token}, format='json')
        assert failed_refresh.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestProfileAndChangePassword:
    def test_unauthenticated_me_rejected(self, api_client):
        url = reverse('accounts:current_user')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticated_me_get_and_patch(self, api_client, create_user):
        user = create_user(email='profile@example.com', first_name='Original', last_name='Name')
        login_res = api_client.post(reverse('accounts:login'), {'email': 'profile@example.com', 'password': 'StrongPassword123!'}, format='json')
        access_token = login_res.data['access']

        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        url = reverse('accounts:current_user')
        
        # GET profile
        get_res = api_client.get(url)
        assert get_res.status_code == status.HTTP_200_OK
        assert get_res.data['email'] == 'profile@example.com'

        # PATCH profile
        patch_res = api_client.patch(url, {'first_name': 'Updated', 'phone_number': '01888888888'}, format='json')
        assert patch_res.status_code == status.HTTP_200_OK
        assert patch_res.data['first_name'] == 'Updated'
        assert patch_res.data['phone_number'] == '01888888888'

    def test_change_password_successful(self, api_client, create_user):
        user = create_user(email='changepass@example.com', password='OldPassword123!')
        login_res = api_client.post(reverse('accounts:login'), {'email': 'changepass@example.com', 'password': 'OldPassword123!'}, format='json')
        access_token = login_res.data['access']

        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        url = reverse('accounts:change_password')
        payload = {
            'old_password': 'OldPassword123!',
            'new_password': 'NewPassword123!',
            'new_password_confirm': 'NewPassword123!'
        }
        res = api_client.post(url, payload, format='json')
        assert res.status_code == status.HTTP_200_OK

        # Verify old password fails and new password works
        api_client.credentials() # clear auth header
        fail_login = api_client.post(reverse('accounts:login'), {'email': 'changepass@example.com', 'password': 'OldPassword123!'}, format='json')
        assert fail_login.status_code == status.HTTP_400_BAD_REQUEST

        succ_login = api_client.post(reverse('accounts:login'), {'email': 'changepass@example.com', 'password': 'NewPassword123!'}, format='json')
        assert succ_login.status_code == status.HTTP_200_OK
