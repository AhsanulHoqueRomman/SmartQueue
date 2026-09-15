from rest_framework.permissions import BasePermission

from apps.organizations.models import OrganizationMembership
from .models import Appointment


def _is_admin(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def _active_membership(user, organization_id):
    if not user or not user.is_authenticated or not organization_id:
        return None
    return (
        OrganizationMembership.objects.filter(
            user=user,
            organization_id=organization_id,
            is_active=True,
        ).first()
    )


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


class CanQueryAvailability(BasePermission):
    """Any user (authenticated or guest discovery) may query availability (tenant-scoped in the view)."""

    def has_permission(self, request, view):
        return True


class CanCreateAppointment(BasePermission):
    """Any authenticated user may book an appointment as themselves."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class CanAccessOrganizationAppointments(BasePermission):
    """
    List/retrieve/manage appointments within an organization.

    - Managers / staff / admins: organization-wide
    - Providers: only appointments assigned to them (object-level)
    - Customers / others: only their own appointments as customer (object-level)

    List views apply queryset filtering in the view; this gate ensures the
    requester is authenticated. Object-level checks enforce ownership.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj: Appointment):
        user = request.user
        organization_id = view.kwargs.get('organization_id')

        if _is_admin(user) or _is_org_manager(user, organization_id) or _is_org_staff(user, organization_id):
            return True

        if obj.customer_id == user.id:
            return True

        # Provider may access appointments assigned to their profile.
        mem = _active_membership(user, organization_id)
        if mem and mem.role == OrganizationMembership.Role.PROVIDER:
            profile = getattr(mem, 'provider_profile', None)
            if profile and obj.provider_id == profile.id:
                return True

        return False


class CanCancelOrRescheduleAppointment(BasePermission):
    """
    Customer: own appointments.
    Manager / staff / admin: any in organization.
    Provider: may cancel appointments assigned to them.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj: Appointment):
        user = request.user
        organization_id = view.kwargs.get('organization_id')

        if _is_admin(user) or _is_org_manager(user, organization_id) or _is_org_staff(user, organization_id):
            return True

        if obj.customer_id == user.id:
            return True

        # Providers may cancel appointments assigned to them.
        mem = _active_membership(user, organization_id)
        if mem and mem.role == OrganizationMembership.Role.PROVIDER:
            profile = getattr(mem, 'provider_profile', None)
            if profile and obj.provider_id == profile.id and 'cancel' in request.path:
                return True

        return False


class CanCheckInAppointment(BasePermission):
    """The customer, manager, staff, admin, or assigned provider may check in."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj: Appointment):
        user = request.user
        organization_id = view.kwargs.get('organization_id')

        if _is_admin(user) or _is_org_manager(user, organization_id) or _is_org_staff(user, organization_id):
            return True

        if obj.customer_id == user.id:
            return True

        mem = _active_membership(user, organization_id)
        if mem and mem.role == OrganizationMembership.Role.PROVIDER:
            profile = getattr(mem, 'provider_profile', None)
            if profile and obj.provider_id == profile.id:
                return True
        return False


def filter_appointments_for_user(queryset, user, organization_id):
    """Apply list-level scoping for appointment querysets."""
    if _is_admin(user) or _is_org_manager(user, organization_id) or _is_org_staff(user, organization_id):
        return queryset

    mem = _active_membership(user, organization_id)
    if mem and mem.role == OrganizationMembership.Role.PROVIDER:
        profile = getattr(mem, 'provider_profile', None)
        if profile:
            # Provider sees assigned appointments OR ones they booked as customer.
            from django.db.models import Q
            return queryset.filter(Q(provider=profile) | Q(customer=user))
        return queryset.filter(customer=user)

    # Customers / non-members: only own bookings.
    return queryset.filter(customer=user)
