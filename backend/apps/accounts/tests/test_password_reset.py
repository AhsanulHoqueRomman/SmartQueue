import logging
from unittest.mock import patch
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from django.core.cache import cache
from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.contact.email_service import EmailSendResult


class PasswordResetTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.request_url = reverse('accounts:password_reset_request')
        self.confirm_url = reverse('accounts:password_reset_confirm')
        
        # User accounts for various roles
        self.customer = User.objects.create_user(
            email='customer@example.com',
            password='OldPassword123!',
            first_name='Customer',
            last_name='User'
        )
        
        self.org = Organization.objects.create(name='Test Org', slug='test-org')
        
        self.manager = User.objects.create_user(
            email='manager@example.com',
            password='OldPassword123!',
            first_name='Manager',
            last_name='User'
        )
        OrganizationMembership.objects.create(
            organization=self.org, user=self.manager, role=OrganizationMembership.Role.MANAGER
        )
        
        self.staff = User.objects.create_user(
            email='staff@example.com',
            password='OldPassword123!',
            first_name='Staff',
            last_name='User'
        )
        OrganizationMembership.objects.create(
            organization=self.org, user=self.staff, role=OrganizationMembership.Role.STAFF
        )
        
        self.admin = User.objects.create_superuser(
            email='admin@example.com',
            password='OldPassword123!',
            first_name='Admin',
            last_name='User'
        )

    @patch('apps.contact.email_service.send_password_reset_email')
    def test_existing_user_request_password_reset_success(self, mock_send_email):
        mock_send_email.return_value = EmailSendResult(success=True, email_id='msg_123')
        response = self.client.post(self.request_url, {'email': 'customer@example.com'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data['detail'],
            'If an account exists for this email, a password reset link has been sent.'
        )
        self.assertTrue(mock_send_email.called)
        call_kwargs = mock_send_email.call_args[1]
        self.assertEqual(call_kwargs['user'], self.customer)
        self.assertIn('/reset-password/', call_kwargs['reset_url'])

    @patch('apps.contact.email_service.send_password_reset_email')
    def test_non_existing_email_receives_same_generic_response(self, mock_send_email):
        response = self.client.post(self.request_url, {'email': 'nonexistent@example.com'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data['detail'],
            'If an account exists for this email, a password reset link has been sent.'
        )
        self.assertFalse(mock_send_email.called)

    def test_invalid_email_format(self):
        response = self.client.post(self.request_url, {'email': 'not-an-email'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_email(self):
        response = self.client.post(self.request_url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('apps.contact.email_service.send_password_reset_email')
    def test_resend_failure_does_not_expose_account_existence(self, mock_send_email):
        mock_send_email.return_value = EmailSendResult(success=False, error='SDK Timeout')
        response = self.client.post(self.request_url, {'email': 'customer@example.com'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data['detail'],
            'If an account exists for this email, a password reset link has been sent.'
        )

    def test_successful_password_reset_and_login_validation(self):
        uid = urlsafe_base64_encode(force_bytes(self.customer.pk))
        token = default_token_generator.make_token(self.customer)
        
        confirm_data = {
            'uid': uid,
            'token': token,
            'new_password': 'NewSecurePassword123!',
            'confirm_password': 'NewSecurePassword123!'
        }
        
        response = self.client.post(self.confirm_url, confirm_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['detail'], 'Your password has been reset successfully.')
        
        # Verify old password fails and new password succeeds
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.check_password('OldPassword123!'))
        self.assertTrue(self.customer.check_password('NewSecurePassword123!'))
        
        login_response = self.client.post(reverse('accounts:login'), {
            'email': 'customer@example.com',
            'password': 'NewSecurePassword123!'
        })
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

    def test_token_cannot_be_reused(self):
        uid = urlsafe_base64_encode(force_bytes(self.customer.pk))
        token = default_token_generator.make_token(self.customer)
        
        confirm_data = {
            'uid': uid,
            'token': token,
            'new_password': 'NewSecurePassword123!',
            'confirm_password': 'NewSecurePassword123!'
        }
        
        # First reset succeeds
        res1 = self.client.post(self.confirm_url, confirm_data)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        
        # Second reset with same token fails
        confirm_data_2 = {
            'uid': uid,
            'token': token,
            'new_password': 'AnotherPassword123!',
            'confirm_password': 'AnotherPassword123!'
        }
        res2 = self.client.post(self.confirm_url, confirm_data_2)
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('token', res2.data)

    def test_invalid_token_rejected(self):
        uid = urlsafe_base64_encode(force_bytes(self.customer.pk))
        confirm_data = {
            'uid': uid,
            'token': 'invalid-token-string',
            'new_password': 'NewSecurePassword123!',
            'confirm_password': 'NewSecurePassword123!'
        }
        response = self.client.post(self.confirm_url, confirm_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('token', response.data)

    def test_malformed_uid_rejected(self):
        confirm_data = {
            'uid': 'not-base64-uid',
            'token': 'some-token',
            'new_password': 'NewSecurePassword123!',
            'confirm_password': 'NewSecurePassword123!'
        }
        response = self.client.post(self.confirm_url, confirm_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_mismatch_rejected(self):
        uid = urlsafe_base64_encode(force_bytes(self.customer.pk))
        token = default_token_generator.make_token(self.customer)
        confirm_data = {
            'uid': uid,
            'token': token,
            'new_password': 'NewSecurePassword123!',
            'confirm_password': 'DifferentPassword123!'
        }
        response = self.client.post(self.confirm_url, confirm_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('confirm_password', response.data)

    def test_weak_password_rejected_by_django_validators(self):
        uid = urlsafe_base64_encode(force_bytes(self.customer.pk))
        token = default_token_generator.make_token(self.customer)
        confirm_data = {
            'uid': uid,
            'token': token,
            'new_password': '123', # too short and common
            'confirm_password': '123'
        }
        response = self.client.post(self.confirm_url, confirm_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('new_password', response.data)

    @patch('apps.contact.email_service.send_password_reset_email')
    def test_all_user_roles_can_reset_password(self, mock_send_email):
        mock_send_email.return_value = EmailSendResult(success=True)
        roles = [
            ('manager@example.com', self.manager),
            ('staff@example.com', self.staff),
            ('admin@example.com', self.admin)
        ]
        for email, user in roles:
            response = self.client.post(self.request_url, {'email': email})
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            res = self.client.post(self.confirm_url, {
                'uid': uid,
                'token': token,
                'new_password': 'NewPasswordForRole123!',
                'confirm_password': 'NewPasswordForRole123!'
            })
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            user.refresh_from_db()
            self.assertTrue(user.check_password('NewPasswordForRole123!'))

    @patch('apps.contact.email_service.send_password_reset_email')
    def test_throttling_password_reset_requests(self, mock_send_email):
        mock_send_email.return_value = EmailSendResult(success=True)
        # Rate limit is set to 5/hour
        for i in range(5):
            res = self.client.post(self.request_url, {'email': 'customer@example.com'})
            self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # 6th request within an hour triggers 429 Too Many Requests
        res_throttled = self.client.post(self.request_url, {'email': 'customer@example.com'})
        self.assertEqual(res_throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
