from rest_framework.permissions import BasePermission
from apps.organizations.models import OrganizationMembership
from .models import ProviderProfile


class IsOrganizationManagerOrOwnProvider(BasePermission):
    """
    Allows:
      - system admins (is_staff / is_superuser)
      - active MANAGERs of the organization in the URL
      - the PROVIDER who owns the provider_id in the URL (own profile only)
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_staff or request.user.is_superuser:
            return True

        organization_id = view.kwargs.get('organization_id')
        if not organization_id:
            return False

        if OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=organization_id,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True,
        ).exists():
            return True

        provider_id = view.kwargs.get('provider_id')
        if not provider_id:
            return False

        return ProviderProfile.objects.filter(
            id=provider_id,
            membership__organization_id=organization_id,
            membership__user=request.user,
            membership__role=OrganizationMembership.Role.PROVIDER,
            membership__is_active=True,
        ).exists()
