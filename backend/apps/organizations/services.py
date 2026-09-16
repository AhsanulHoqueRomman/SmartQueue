from django.db import transaction
from django.utils import timezone
from config.exceptions import (
    ApplicationError,
    LastManagerProtectionException,
    DuplicateMembershipException,
    InvalidRoleAssignmentException,
)
from .models import Organization, OrganizationMembership, OrganizationDocument
from apps.audit.services import AuditService


class InvalidStateTransitionException(ApplicationError):
    status_code = 400
    default_code = 'INVALID_STATE_TRANSITION'
    default_detail = 'This verification state transition is not allowed.'


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
                is_active=True,
                verification_status=Organization.VerificationStatus.SETUP_INCOMPLETE
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

    @staticmethod
    def submit_verification(*, organization, actor):
        """
        Manager submits organization for Admin verification review.
        Allowed when verification_status is SETUP_INCOMPLETE or REJECTED.
        Validates profile completeness and presence of at least one document.
        """
        with transaction.atomic():
            if organization.verification_status not in [
                Organization.VerificationStatus.SETUP_INCOMPLETE,
                Organization.VerificationStatus.REJECTED
            ]:
                raise InvalidStateTransitionException(
                    f"Cannot submit verification from current status: '{organization.verification_status}'."
                )

            # Profile completeness checks
            missing = []
            if not organization.name.strip(): missing.append('name')
            if not organization.address.strip(): missing.append('address')
            if not organization.phone_number.strip(): missing.append('phone_number')
            if not organization.email.strip(): missing.append('email')

            if missing:
                raise ApplicationError(
                    message=f"Organization profile is incomplete. Required fields missing: {', '.join(missing)}.",
                    code='PROFILE_INCOMPLETE'
                )

            # Document check
            if not organization.documents.exists():
                raise ApplicationError(
                    message="At least one verification document must be uploaded before submitting.",
                    code='DOCUMENT_REQUIRED'
                )

            organization.verification_status = Organization.VerificationStatus.SUBMITTED
            organization.verification_submitted_at = timezone.now()
            organization.verification_rejection_reason = ''
            organization.save()

            AuditService.record(
                action='ORGANIZATION_VERIFICATION_SUBMITTED',
                entity_type='Organization',
                entity_id=organization.id,
                organization_id=organization.id,
                actor=actor,
            )
            return organization

    @staticmethod
    def start_review(*, organization, admin_user):
        """
        Admin marks a SUBMITTED or REJECTED organization as UNDER_REVIEW.
        """
        with transaction.atomic():
            if organization.verification_status not in [
                Organization.VerificationStatus.SUBMITTED,
                Organization.VerificationStatus.REJECTED
            ]:
                raise InvalidStateTransitionException(
                    f"Cannot start review for organization in status '{organization.verification_status}'."
                )

            organization.verification_status = Organization.VerificationStatus.UNDER_REVIEW
            organization.verification_reviewed_by = admin_user
            organization.verification_reviewed_at = timezone.now()
            organization.save()

            AuditService.record(
                action='ORGANIZATION_VERIFICATION_REVIEW_STARTED',
                entity_type='Organization',
                entity_id=organization.id,
                organization_id=organization.id,
                actor=admin_user,
            )
            return organization

    @staticmethod
    def approve_organization(*, organization, admin_user):
        """
        Admin approves an organization UNDER_REVIEW.
        """
        with transaction.atomic():
            if organization.verification_status != Organization.VerificationStatus.UNDER_REVIEW:
                raise InvalidStateTransitionException(
                    f"Cannot approve organization in status '{organization.verification_status}'. Must be UNDER_REVIEW."
                )

            organization.verification_status = Organization.VerificationStatus.APPROVED
            organization.verification_reviewed_by = admin_user
            organization.verification_reviewed_at = timezone.now()
            organization.verification_rejection_reason = ''
            organization.save()

            AuditService.record(
                action='ORGANIZATION_VERIFICATION_APPROVED',
                entity_type='Organization',
                entity_id=organization.id,
                organization_id=organization.id,
                actor=admin_user,
            )
            return organization

    @staticmethod
    def reject_organization(*, organization, admin_user, reason):
        """
        Admin rejects an organization UNDER_REVIEW. Rejection reason is mandatory.
        """
        reason_text = (reason or '').strip()
        if not reason_text:
            raise ApplicationError(
                message="Rejection reason is mandatory.",
                code='REASON_REQUIRED'
            )

        with transaction.atomic():
            if organization.verification_status != Organization.VerificationStatus.UNDER_REVIEW:
                raise InvalidStateTransitionException(
                    f"Cannot reject organization in status '{organization.verification_status}'. Must be UNDER_REVIEW."
                )

            organization.verification_status = Organization.VerificationStatus.REJECTED
            organization.verification_rejection_reason = reason_text
            organization.verification_reviewed_by = admin_user
            organization.verification_reviewed_at = timezone.now()
            organization.save()

            AuditService.record(
                action='ORGANIZATION_VERIFICATION_REJECTED',
                entity_type='Organization',
                entity_id=organization.id,
                organization_id=organization.id,
                actor=admin_user,
                metadata={'reason': reason_text}
            )
            return organization

    @staticmethod
    def suspend_organization(*, organization, admin_user, reason):
        """
        Admin suspends an APPROVED organization. Suspension reason is mandatory.
        """
        reason_text = (reason or '').strip()
        if not reason_text:
            raise ApplicationError(
                message="Suspension reason is mandatory.",
                code='REASON_REQUIRED'
            )

        with transaction.atomic():
            if organization.verification_status != Organization.VerificationStatus.APPROVED:
                raise InvalidStateTransitionException(
                    f"Cannot suspend organization in status '{organization.verification_status}'. Must be APPROVED."
                )

            organization.verification_status = Organization.VerificationStatus.SUSPENDED
            organization.verification_suspension_reason = reason_text
            organization.save()

            AuditService.record(
                action='ORGANIZATION_SUSPENDED',
                entity_type='Organization',
                entity_id=organization.id,
                organization_id=organization.id,
                actor=admin_user,
                metadata={'reason': reason_text}
            )
            return organization

    @staticmethod
    def unsuspend_organization(*, organization, admin_user):
        """
        Admin unsuspends a SUSPENDED organization back to APPROVED.
        """
        with transaction.atomic():
            if organization.verification_status != Organization.VerificationStatus.SUSPENDED:
                raise InvalidStateTransitionException(
                    f"Cannot unsuspend organization in status '{organization.verification_status}'. Must be SUSPENDED."
                )

            organization.verification_status = Organization.VerificationStatus.APPROVED
            organization.verification_suspension_reason = ''
            organization.save()

            AuditService.record(
                action='ORGANIZATION_UNSUSPENDED',
                entity_type='Organization',
                entity_id=organization.id,
                organization_id=organization.id,
                actor=admin_user,
            )
            return organization

    @staticmethod
    def upload_document(*, organization, document_type, file, original_filename, actor):
        """
        Manager uploads a verification document for their organization.
        Allowed when status is SETUP_INCOMPLETE or REJECTED.
        """
        if organization.verification_status not in [
            Organization.VerificationStatus.SETUP_INCOMPLETE,
            Organization.VerificationStatus.REJECTED
        ]:
            raise ApplicationError(
                message=f"Cannot upload documents when organization is in status '{organization.verification_status}'.",
                code='DOCUMENT_LOCKED'
            )

        doc = OrganizationDocument.objects.create(
            organization=organization,
            document_type=document_type,
            file=file,
            original_filename=original_filename or file.name,
            status=OrganizationDocument.Status.PENDING
        )

        AuditService.record(
            action='ORGANIZATION_DOCUMENT_UPLOADED',
            entity_type='OrganizationDocument',
            entity_id=doc.id,
            organization_id=organization.id,
            actor=actor,
            metadata={'document_type': document_type, 'filename': doc.original_filename}
        )
        return doc

    @staticmethod
    def delete_document(*, document, actor):
        """
        Manager deletes a verification document.
        Allowed when organization status is SETUP_INCOMPLETE or REJECTED.
        """
        org = document.organization
        if org.verification_status not in [
            Organization.VerificationStatus.SETUP_INCOMPLETE,
            Organization.VerificationStatus.REJECTED
        ]:
            raise ApplicationError(
                message=f"Cannot delete documents when organization is in status '{org.verification_status}'.",
                code='DOCUMENT_LOCKED'
            )

        doc_id = document.id
        doc_type = document.document_type
        document.file.delete(save=False)
        document.delete()

        AuditService.record(
            action='ORGANIZATION_DOCUMENT_DELETED',
            entity_type='OrganizationDocument',
            entity_id=doc_id,
            organization_id=org.id,
            actor=actor,
            metadata={'document_type': doc_type}
        )

