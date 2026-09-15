from django.db import transaction
from config.exceptions import (
    LastManagerProtectionException,
    DuplicateMembershipException,
    InvalidRoleAssignmentException,
)
from .models import Organization, OrganizationMembership
from apps.audit.services import AuditService


class OrganizationService:
    """
    Centralized domain service layer for Organization & Membership business workflows.
    """

    @staticmethod
    def create_organization(*, user, name, slug, address='', phone_number='', email=''):
        """
        Creates a new Organization and automatically binds the creator user as MANAGER.
        Atomic transaction ensures all-or-nothing completion.
        """
        with transaction.atomic():
            organization = Organization.objects.create(
                name=name,
                slug=slug,
                address=address,
                phone_number=phone_number,
                email=email,
                is_active=True
            )
            membership = OrganizationMembership.objects.create(
                user=user,
                organization=organization,
                role=OrganizationMembership.Role.MANAGER,
                is_active=True
            )
            AuditService.record(
                action='ORGANIZATION_CREATED', entity_type='Organization', entity_id=organization.id,
                organization_id=organization.id, actor=user,
            )
            return organization, membership

    @staticmethod
    def add_member(*, organization, target_user, role, actor=None):
        """
        Adds an active user to an organization with a specified role (STAFF or PROVIDER).
        Manager creation via member-add endpoint is restricted to prevent role escalation.
        """
        if role == OrganizationMembership.Role.MANAGER:
            raise InvalidRoleAssignmentException("Cannot assign MANAGER role through standard member endpoint.")

        if OrganizationMembership.objects.filter(user=target_user, organization=organization).exists():
            raise DuplicateMembershipException("Target user is already a member of this organization.")

        membership = OrganizationMembership.objects.create(
            user=target_user,
            organization=organization,
            role=role,
            is_active=True
        )
        AuditService.record(
            action='MEMBER_ADDED', entity_type='OrganizationMembership', entity_id=membership.id,
            organization_id=organization.id, actor=actor,
            metadata={'target_user_id': target_user.id, 'role': role},
        )
        return membership

    @staticmethod
    def update_membership(*, membership, new_role=None, new_is_active=None, actor=None):
        """
        Updates membership role or active status.
        Protects against deactivating or demoting the last active MANAGER of an organization
        using PostgreSQL select_for_update row-locking.
        """
        with transaction.atomic():
            # Lock the parent organization row to serialize concurrent manager updates
            Organization.objects.select_for_update().get(id=membership.organization_id)

            # Evaluate last manager protection rule if altering a MANAGER membership
            if membership.role == OrganizationMembership.Role.MANAGER:
                is_deactivating = (new_is_active is False)
                is_demoting = (new_role is not None and new_role != OrganizationMembership.Role.MANAGER)

                if is_deactivating or is_demoting:
                    other_active_managers_count = OrganizationMembership.objects.filter(
                        organization_id=membership.organization_id,
                        role=OrganizationMembership.Role.MANAGER,
                        is_active=True
                    ).exclude(id=membership.id).count()

                    if other_active_managers_count == 0:
                        raise LastManagerProtectionException()

            if new_role is not None:
                membership.role = new_role
            if new_is_active is not None:
                membership.is_active = new_is_active

            membership.save()
            AuditService.record(
                action='MEMBERSHIP_UPDATED', entity_type='OrganizationMembership', entity_id=membership.id,
                organization_id=membership.organization_id, actor=actor,
                metadata={'role': membership.role, 'is_active': membership.is_active},
            )
            return membership
