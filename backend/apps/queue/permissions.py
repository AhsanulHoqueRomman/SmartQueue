from rest_framework.permissions import BasePermission

from apps.organizations.models import OrganizationMembership
from apps.appointments.models import Appointment
from .models import QueueEntry


def _is_admin(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def _active_membership(user, organization_id):
    if not user or not user.is_authenticated or not organization_id:
        return None
    return OrganizationMembership.objects.filter(
        user=user,
        organization_id=organization_id,
        is_active=True,
    ).first()


def _is_org_manager(user, organization_id) -> bool:
    if _is_admin(user):
        return True
    mem = _active_membership(user, organization_id)
    return bool(mem and mem.role == OrganizationMembership.Role.MANAGER)


def _is_org_staff(user, organization_id) -> bool:
    if _is_admin(user):
        return True
    mem = _active_membership(user, organization_id)
    return bool(mem and mem.role == OrganizationMembership.Role.STAFF)


def _provider_profile_for(user, organization_id):
    mem = _active_membership(user, organization_id)
    if not mem or mem.role != OrganizationMembership.Role.PROVIDER:
        return None
    return getattr(mem, 'provider_profile', None)


class CanManageProviderQueue(BasePermission):
    """
    View/manage a provider's queue:
    - admin / manager / staff of the org
    - the provider who owns provider_id
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        organization_id = view.kwargs.get('organization_id')
        provider_id = view.kwargs.get('provider_id')

        if _is_admin(request.user) or _is_org_manager(request.user, organization_id) or _is_org_staff(request.user, organization_id):
            return True

        profile = _provider_profile_for(request.user, organization_id)
        return bool(profile and str(profile.id) == str(provider_id))


class CanActOnQueueEntry(BasePermission):
    """
    start / complete / skip on a queue entry:
    - admin / manager / staff of the org
    - assigned provider
    Customers may NOT perform these actions.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj: QueueEntry):
        user = request.user
        organization_id = view.kwargs.get('organization_id')

        if _is_admin(user) or _is_org_manager(user, organization_id) or _is_org_staff(user, organization_id):
            return True

        profile = _provider_profile_for(user, organization_id)
        return bool(profile and obj.provider_id == profile.id)


class CanViewOwnQueue(BasePermission):
    """Authenticated users may list their own queue entries within an org."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


def can_check_in_appointment(user, organization_id, appointment: Appointment) -> bool:
    """
    Customer (owner), assigned provider, staff, manager, or admin.
    """
    if not (user and user.is_authenticated):
        return False
    if _is_admin(user) or _is_org_manager(user, organization_id) or _is_org_staff(user, organization_id):
        return True
    if appointment.customer_id == user.id:
        return True
    profile = _provider_profile_for(user, organization_id)
    return bool(profile and appointment.provider_id == profile.id)
