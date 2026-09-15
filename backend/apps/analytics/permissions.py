from rest_framework.permissions import BasePermission

from apps.organizations.models import OrganizationMembership
from apps.providers.models import ProviderProfile


class CanViewAnalytics(BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_staff or request.user.is_superuser:
            return True
        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=view.kwargs.get('organization_id'),
            role=OrganizationMembership.Role.MANAGER,
            is_active=True,
        ).exists()


class CanViewProviderMetrics(BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_staff or request.user.is_superuser:
            return True
        provider = ProviderProfile.objects.filter(
            id=view.kwargs.get('provider_id'),
            membership__is_active=True,
            membership__role=OrganizationMembership.Role.PROVIDER,
        ).select_related('membership').first()
        if not provider:
            return False
        if provider.membership.user_id == request.user.id:
            return True
        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=provider.membership.organization_id,
            role=OrganizationMembership.Role.MANAGER,
            is_active=True,
        ).exists()


class CanExportAnalytics(BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_staff or request.user.is_superuser:
            return True
        return OrganizationMembership.objects.filter(
            user=request.user,
            organization_id=request.query_params.get('organization_id'),
            role=OrganizationMembership.Role.MANAGER,
            is_active=True,
        ).exists()
