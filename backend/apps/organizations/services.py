from django.db import transaction
from django.utils import timezone
from config.exceptions import (
    ApplicationError,
    LastManagerProtectionException,
    DuplicateMembershipException,
    InvalidRoleAssignmentException,
)
from django.contrib.auth import get_user_model
from .models import Organization, OrganizationMembership, OrganizationDocument, OrganizationInvitation
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

    # ------------------------------------------------------------------
    # OrganizationInvitation Lifecycle
    # ------------------------------------------------------------------

    @staticmethod
    def create_provider_invitation(*, organization, email, actor):
        """
        Manager creates a tokenized provider invitation for an email.
        """
        email_clean = (email or '').strip().lower()
        if not email_clean:
            raise ApplicationError(message="Email address is required.", code="EMAIL_REQUIRED")

        User = get_user_model()
        existing_member = OrganizationMembership.objects.filter(
            organization=organization,
            user__email__iexact=email_clean,
            role=OrganizationMembership.Role.PROVIDER
        ).exists()
        if existing_member:
            raise ApplicationError(
                message="A provider with this email already belongs to the organization.",
                code="ALREADY_MEMBER"
            )

        existing_invitation = OrganizationInvitation.objects.filter(
            organization=organization,
            email__iexact=email_clean,
            used_at__isnull=True,
            cancelled_at__isnull=True,
            expires_at__gt=timezone.now()
        ).first()

        if existing_invitation:
            return existing_invitation

        invitation = OrganizationInvitation.objects.create(
            organization=organization,
            email=email_clean,
            role=OrganizationMembership.Role.PROVIDER,
            created_by=actor
        )

        AuditService.record(
            action='PROVIDER_INVITATION_CREATED',
            entity_type='OrganizationInvitation',
            entity_id=invitation.id,
            organization_id=organization.id,
            actor=actor,
            metadata={'email': email_clean, 'invitation_token': invitation.token}
        )
        return invitation

    @staticmethod
    def get_invitation_details(*, token):
        """
        Retrieves valid invitation details by token for public accept page.
        """
        try:
            invitation = OrganizationInvitation.objects.select_related('organization', 'created_by').get(token=token)
        except OrganizationInvitation.DoesNotExist:
            raise ApplicationError(message="Invitation token is invalid or expired.", code="INVALID_INVITATION", status_code=404)

        if not invitation.is_valid:
            raise ApplicationError(message="Invitation token is invalid or expired.", code="INVALID_INVITATION", status_code=400)

        return invitation

    @staticmethod
    def accept_provider_invitation(*, token, first_name, last_name, password):
        """
        Accepts a provider invitation. Creates user (if new), creates active membership (is_active=True),
        creates APPROVED provider profile, and marks invitation as used.
        """
        from apps.providers.models import ProviderProfile

        with transaction.atomic():
            invitation = OrganizationService.get_invitation_details(token=token)
            organization = invitation.organization
            email_clean = invitation.email.strip().lower()

            User = get_user_model()
            user = User.objects.filter(email__iexact=email_clean).first()

            if user is None:
                user = User.objects.create_user(
                    email=email_clean,
                    first_name=first_name.strip(),
                    last_name=last_name.strip(),
                    password=password,
                    is_active=True
                )
            else:
                if first_name.strip():
                    user.first_name = first_name.strip()
                if last_name.strip():
                    user.last_name = last_name.strip()
                user.save()

            membership, _ = OrganizationMembership.objects.get_or_create(
                user=user,
                organization=organization,
                defaults={
                    'role': OrganizationMembership.Role.PROVIDER,
                    'is_active': True
                }
            )
            if not membership.is_active or membership.role != OrganizationMembership.Role.PROVIDER:
                membership.role = OrganizationMembership.Role.PROVIDER
                membership.is_active = True
                membership.save()

            profile, _ = ProviderProfile.objects.get_or_create(
                membership=membership,
                defaults={
                    'application_status': ProviderProfile.ApplicationStatus.APPROVED,
                    'application_reviewed_at': timezone.now(),
                    'application_reviewed_by': invitation.created_by,
                    'is_active': True
                }
            )

            if profile.application_status != ProviderProfile.ApplicationStatus.APPROVED:
                profile.application_status = ProviderProfile.ApplicationStatus.APPROVED
                profile.application_reviewed_at = timezone.now()
                profile.application_reviewed_by = invitation.created_by
                profile.application_rejection_reason = ''
                profile.save()

            invitation.used_at = timezone.now()
            invitation.accepted_by = user
            invitation.save()

            AuditService.record(
                action='PROVIDER_INVITATION_ACCEPTED',
                entity_type='OrganizationInvitation',
                entity_id=invitation.id,
                organization_id=organization.id,
                actor=user,
                metadata={'user_id': user.id}
            )

            return user, membership, profile

    @staticmethod
    def cancel_invitation(*, invitation, actor):
        """
        Manager cancels a pending provider invitation.
        """
        if invitation.used_at or invitation.cancelled_at:
            raise ApplicationError(message="Invitation is no longer active.", code="INVITATION_INACTIVE")

        invitation.cancelled_at = timezone.now()
        invitation.save()

        AuditService.record(
            action='PROVIDER_INVITATION_CANCELLED',
            entity_type='OrganizationInvitation',
            entity_id=invitation.id,
            organization_id=invitation.organization_id,
            actor=actor,
        )
        return invitation


