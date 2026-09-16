from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from config.exceptions import ApplicationError
from apps.organizations.models import Organization, OrganizationMembership, OrganizationInvitation
from apps.organizations.services import OrganizationService
from apps.audit.models import AuditLog

User = get_user_model()


class StaffOnboardingWorkflowTest(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Manager user and org
        self.manager = User.objects.create_user(
            email='manager@salon.com',
            password='Password123!',
            first_name='Salon',
            last_name='Manager'
        )
        self.org = Organization.objects.create(
            name='Elite Hair Salon',
            slug='elite-hair-salon',
            email='info@elitesalon.com',
            phone_number='+8801700000001',
            address='Gulshan 2, Dhaka',
            verification_status=Organization.VerificationStatus.APPROVED
        )
        self.manager_membership = OrganizationMembership.objects.create(
            user=self.manager,
            organization=self.org,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True
        )

        # Other manager & org for tenant isolation testing
        self.other_manager = User.objects.create_user(
            email='other@spa.com',
            password='Password123!',
            first_name='Other',
            last_name='Manager'
        )
        self.other_org = Organization.objects.create(
            name='Tranquil Spa',
            slug='tranquil-spa',
            email='info@tranquilspa.com',
            phone_number='+8801700000002',
            address='Banani, Dhaka',
            verification_status=Organization.VerificationStatus.APPROVED
        )
        self.other_membership = OrganizationMembership.objects.create(
            user=self.other_manager,
            organization=self.other_org,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True
        )

        # Non-manager customer user
        self.customer = User.objects.create_user(
            email='customer@gmail.com',
            password='Password123!',
            first_name='John',
            last_name='Customer'
        )

    # ----------------------------------------------------
    # 1. Public Registration Restriction
    # ----------------------------------------------------

    def test_public_registration_rejects_staff_role(self):
        """Public registration specifying role=STAFF must be rejected."""
        response = self.client.post('/api/v1/auth/register/', {
            'email': 'uninvited_staff@example.com',
            'first_name': 'Sneaky',
            'last_name': 'Staff',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'role': 'STAFF'
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', response.data)
        self.assertIn('Staff members cannot self-register', str(response.data['role']))

    # ----------------------------------------------------
    # 2. Staff Invitation Creation & Service Logic
    # ----------------------------------------------------

    def test_manager_can_create_staff_invitation(self):
        """Manager can send a staff invitation via service and API endpoint."""
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            f'/api/v1/organizations/{self.org.id}/staff/invitations/',
            {'email': 'receptionist@salon.com'}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['email'], 'receptionist@salon.com')
        self.assertEqual(response.data['role'], 'STAFF')
        self.assertTrue(response.data['is_valid'])

        # Verify audit log recorded
        log = AuditLog.objects.filter(action='STAFF_INVITATION_CREATED').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.manager)

    def test_non_manager_cannot_create_staff_invitation(self):
        """Customer or unauthorized user cannot send staff invitations."""
        self.client.force_authenticate(user=self.customer)
        response = self.client.post(
            f'/api/v1/organizations/{self.org.id}/staff/invitations/',
            {'email': 'receptionist@salon.com'}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_invite_existing_active_staff_member(self):
        """Inviting an email that is already an active staff member must fail."""
        staff_user = User.objects.create_user(
            email='existing_staff@salon.com',
            password='Password123!',
            first_name='Active',
            last_name='Staff'
        )
        OrganizationMembership.objects.create(
            user=staff_user,
            organization=self.org,
            role=OrganizationMembership.Role.STAFF,
            is_active=True
        )

        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            f'/api/v1/organizations/{self.org.id}/staff/invitations/',
            {'email': 'existing_staff@salon.com'}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ----------------------------------------------------
    # 3. Staff Invitation Cancellation
    # ----------------------------------------------------

    def test_manager_can_cancel_staff_invitation(self):
        """Manager can cancel a pending staff invitation."""
        invitation = OrganizationService.create_staff_invitation(
            organization=self.org,
            email='pending_staff@salon.com',
            actor=self.manager
        )
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            f'/api/v1/organizations/{self.org.id}/staff/invitations/{invitation.id}/cancel/'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.cancelled_at)
        self.assertFalse(invitation.is_valid)

        # Audit log verification
        log = AuditLog.objects.filter(action='STAFF_INVITATION_CANCELLED').first()
        self.assertIsNotNone(log)

    # ----------------------------------------------------
    # 4. Public Invitation Acceptance
    # ----------------------------------------------------

    def test_public_get_staff_invitation_details(self):
        """Anyone with token can view staff invitation details."""
        invitation = OrganizationService.create_staff_invitation(
            organization=self.org,
            email='new_staff@salon.com',
            actor=self.manager
        )
        response = self.client.get(f'/api/v1/invitations/staff/{invitation.token}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'new_staff@salon.com')
        self.assertEqual(response.data['organization_name'], self.org.name)

    def test_public_accept_staff_invitation_creates_user_and_active_membership(self):
        """Accepting staff invitation creates user and active STAFF membership."""
        invitation = OrganizationService.create_staff_invitation(
            organization=self.org,
            email='new_receptionist@salon.com',
            actor=self.manager
        )
        response = self.client.post(
            f'/api/v1/invitations/staff/{invitation.token}/accept/',
            {
                'first_name': 'Alice',
                'last_name': 'Smith',
                'password': 'StaffPassword123!'
            }
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'STAFF')
        self.assertTrue(response.data['is_active'])

        # Verify database objects
        new_user = User.objects.get(email='new_receptionist@salon.com')
        self.assertEqual(new_user.first_name, 'Alice')

        membership = OrganizationMembership.objects.get(user=new_user, organization=self.org)
        self.assertEqual(membership.role, OrganizationMembership.Role.STAFF)
        self.assertTrue(membership.is_active)

        # Verify audit log recorded
        log = AuditLog.objects.filter(action='STAFF_INVITATION_ACCEPTED').first()
        self.assertIsNotNone(log)

    # ----------------------------------------------------
    # 5. Team Management: List, Activate & Deactivate
    # ----------------------------------------------------

    def test_manager_can_list_staff_members_with_filtering(self):
        """Manager can list staff members and filter by is_active."""
        staff1_user = User.objects.create_user(email='staff1@salon.com', password='Password123!')
        staff2_user = User.objects.create_user(email='staff2@salon.com', password='Password123!')

        mem1 = OrganizationMembership.objects.create(
            user=staff1_user, organization=self.org, role=OrganizationMembership.Role.STAFF, is_active=True
        )
        mem2 = OrganizationMembership.objects.create(
            user=staff2_user, organization=self.org, role=OrganizationMembership.Role.STAFF, is_active=False
        )

        self.client.force_authenticate(user=self.manager)
        # List all staff
        res = self.client.get(f'/api/v1/organizations/{self.org.id}/staff/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)

        # Filter active
        res_active = self.client.get(f'/api/v1/organizations/{self.org.id}/staff/?is_active=true')
        self.assertEqual(len(res_active.data), 1)
        self.assertEqual(res_active.data[0]['id'], mem1.id)

        # Filter inactive
        res_inactive = self.client.get(f'/api/v1/organizations/{self.org.id}/staff/?is_active=false')
        self.assertEqual(len(res_inactive.data), 1)
        self.assertEqual(res_inactive.data[0]['id'], mem2.id)

    def test_manager_can_deactivate_and_activate_staff(self):
        """Manager can toggle staff membership active status."""
        staff_user = User.objects.create_user(email='desk@salon.com', password='Password123!')
        membership = OrganizationMembership.objects.create(
            user=staff_user, organization=self.org, role=OrganizationMembership.Role.STAFF, is_active=True
        )

        self.client.force_authenticate(user=self.manager)

        # Deactivate
        res_deact = self.client.post(
            f'/api/v1/organizations/{self.org.id}/staff/{membership.id}/deactivate/'
        )
        self.assertEqual(res_deact.status_code, status.HTTP_200_OK)
        self.assertFalse(res_deact.data['is_active'])

        log_deact = AuditLog.objects.filter(action='STAFF_DEACTIVATED').first()
        self.assertIsNotNone(log_deact)

        # Re-activate
        res_act = self.client.post(
            f'/api/v1/organizations/{self.org.id}/staff/{membership.id}/activate/'
        )
        self.assertEqual(res_act.status_code, status.HTTP_200_OK)
        self.assertTrue(res_act.data['is_active'])

        log_act = AuditLog.objects.filter(action='STAFF_ACTIVATED').first()
        self.assertIsNotNone(log_act)

    def test_cannot_deactivate_non_staff_via_staff_endpoint(self):
        """Staff activation/deactivation endpoints reject non-staff roles."""
        self.client.force_authenticate(user=self.manager)
        res = self.client.post(
            f'/api/v1/organizations/{self.org.id}/staff/{self.manager_membership.id}/deactivate/'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # ----------------------------------------------------
    # 6. Tenant Isolation & Cross-Organization Security
    # ----------------------------------------------------

    def test_manager_cannot_manage_other_org_staff(self):
        """Manager from Org A cannot manage or activate/deactivate staff from Org B."""
        other_staff_user = User.objects.create_user(email='other_staff@spa.com', password='Password123!')
        other_staff_mem = OrganizationMembership.objects.create(
            user=other_staff_user, organization=self.other_org, role=OrganizationMembership.Role.STAFF, is_active=True
        )

        # Manager from Org A attempts to deactivate staff in Org B using Org B URL
        self.client.force_authenticate(user=self.manager)
        res = self.client.post(
            f'/api/v1/organizations/{self.other_org.id}/staff/{other_staff_mem.id}/deactivate/'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
