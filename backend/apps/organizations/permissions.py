from rest_framework.permissions import BasePermission
from .models import OrganizationMembership


class IsSystemAdmin(BasePermission):
    """
    Allows access only to system-wide staff or superuser admins.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.is_staff or request.user.is_superuser)
        )


class IsOrganizationManager(BasePermission):
    """
    Allows access to users who are active MANAGERs of the target Organization in the URL path.
    Also allows access to system admins.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_staff or request.user.is_superuser:
            return True

        organization_id = view.kwargs.get('organization_id') or view.kwargs.get('pk')
        if not organization_id:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True
        ).exists()


class IsOrganizationMember(BasePermission):
    """
    Allows access to users who hold any active membership (MANAGER, STAFF, PROVIDER)
    in the target Organization in the URL path. System admins are also permitted.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_staff or request.user.is_superuser:
            return True

        organization_id = view.kwargs.get('organization_id') or view.kwargs.get('pk')
        if not organization_id:
            return False

        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id,
            is_active=True
        ).exists()
