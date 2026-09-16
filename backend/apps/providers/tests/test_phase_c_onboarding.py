from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone

from apps.organizations.models import Organization, OrganizationMembership, OrganizationInvitation
from apps.organizations.services import OrganizationService
from apps.providers.models import ProviderProfile, ProviderDocument
from apps.providers.services import ProviderService_ as ProviderBizService

User = get_user_model()


class ProviderPhaseCOnboardingTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create Manager and Org
        self.manager_user = User.objects.create_user(
            email='manager@clinic.com',
            first_name='Org',
            last_name='Manager',
            password='password123',
            is_active=True
        )
        self.org, self.manager_membership = OrganizationService.create_organization(
            user=self.manager_user,
            name='Alpha Medical Center',
            slug='alpha-medical',
            address='123 Health Ave',
            phone_number='+15550100',
            email='contact@alphamedical.com'
        )
        # Set Org as APPROVED for operational testing
        self.org.verification_status = Organization.VerificationStatus.APPROVED
        self.org.save()

    def test_manager_provider_invitation_lifecycle(self):
        """Test Flow A: Manager invites provider via email, token acceptance creates active user & approved provider profile."""
        # 1. Manager creates provider invitation
        invitation = OrganizationService.create_provider_invitation(
            organization=self.org,
            email='invited.provider@clinic.com',
            actor=self.manager_user
        )
        self.assertIsNotNone(invitation.token)
        self.assertTrue(invitation.is_valid)

        # 2. Retrieve public invitation details by token
        url_details = f'/api/v1/invitations/provider/{invitation.token}/'
        response = self.client.get(url_details)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['organization_name'], 'Alpha Medical Center')
        self.assertEqual(response.data['email'], 'invited.provider@clinic.com')

        # 3. Accept invitation
        url_accept = f'/api/v1/invitations/provider/{invitation.token}/accept/'
        payload = {
          'first_name': 'Invited',
          'last_name': 'Doctor',
          'password': 'StrongPassword123!',
        }
        resp_accept = self.client.post(url_accept, payload)
        self.assertEqual(resp_accept.status_code, status.HTTP_200_OK)

        # 4. Verify DB state
        invited_user = User.objects.get(email='invited.provider@clinic.com')
        membership = OrganizationMembership.objects.get(user=invited_user, organization=self.org)
        self.assertEqual(membership.role, OrganizationMembership.Role.PROVIDER)
        self.assertTrue(membership.is_active)

        profile = ProviderProfile.objects.get(membership=membership)
        self.assertEqual(profile.application_status, ProviderProfile.ApplicationStatus.APPROVED)
        self.assertTrue(profile.is_operationally_active)

    def test_self_registered_provider_approval_and_rejection_flow(self):
        """Test Flow B: Self-registered provider starts PENDING_REVIEW/inactive, manager approves or rejects."""
        # Create user
        prov_user = User.objects.create_user(
            email='applicant@clinic.com',
            first_name='John',
            last_name='Doe',
            password='password123',
            is_active=True
        )

        # Member registers for organization
        membership = OrganizationMembership.objects.create(
            user=prov_user,
            organization=self.org,
            role=OrganizationMembership.Role.PROVIDER,
            is_active=False
        )

        profile = ProviderProfile.objects.create(
            membership=membership,
            title='Cardiologist',
            application_status=ProviderProfile.ApplicationStatus.PENDING_REVIEW,
            is_active=True
        )

        # Confirm operational activation is False while pending
        self.assertFalse(profile.is_operationally_active)

        # Manager rejects application without reason -> fails
        self.client.force_authenticate(user=self.manager_user)
        review_url = f'/api/v1/organizations/{self.org.id}/providers/{profile.id}/review-application/'
        
        resp_reject_no_reason = self.client.post(review_url, {'action': 'REJECT', 'reason': ''})
        self.assertEqual(resp_reject_no_reason.status_code, status.HTTP_400_BAD_REQUEST)

        # Manager rejects application with mandatory reason
        resp_reject = self.client.post(review_url, {'action': 'REJECT', 'reason': 'Incomplete certifications.'})
        self.assertEqual(resp_reject.status_code, status.HTTP_200_OK)

        profile.refresh_from_db()
        membership.refresh_from_db()
        self.assertEqual(profile.application_status, ProviderProfile.ApplicationStatus.REJECTED)
        self.assertEqual(profile.application_rejection_reason, 'Incomplete certifications.')
        self.assertFalse(membership.is_active)
        self.assertFalse(profile.is_operationally_active)

        # Provider resubmits application -> clears rejection reason
        ProviderBizService.submit_application(provider_profile=profile, actor=prov_user)
        profile.refresh_from_db()
        self.assertEqual(profile.application_status, ProviderProfile.ApplicationStatus.PENDING_REVIEW)
        self.assertEqual(profile.application_rejection_reason, '')

        # Manager approves application
        resp_approve = self.client.post(review_url, {'action': 'APPROVE'})
        self.assertEqual(resp_approve.status_code, status.HTTP_200_OK)

        profile.refresh_from_db()
        membership.refresh_from_db()
        self.assertEqual(profile.application_status, ProviderProfile.ApplicationStatus.APPROVED)
        self.assertTrue(membership.is_active)
        self.assertTrue(profile.is_operationally_active)
