from rest_framework.permissions import BasePermission

from apps.organizations.models import OrganizationMembership


def _admin(user):
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def _membership(user, organization_id):
    return OrganizationMembership.objects.filter(user=user, organization_id=organization_id, is_active=True).first()


class CanReviewAppointment(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if _admin(request.user):
            return True
        if obj.customer_id == request.user.id:
            return True
        membership = _membership(request.user, view.kwargs.get('organization_id'))
        profile = getattr(membership, 'provider_profile', None) if membership else None
        return bool(
            membership
            and membership.role in ('MANAGER', 'STAFF', 'PROVIDER')
            and (membership.role != 'PROVIDER' or (profile and obj.provider_id == profile.id))
        )


class CanViewOrganizationReviews(BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if _admin(request.user):
            return True
        membership = _membership(request.user, view.kwargs.get('organization_id'))
        return bool(membership and membership.role in ('MANAGER', 'STAFF', 'PROVIDER'))
