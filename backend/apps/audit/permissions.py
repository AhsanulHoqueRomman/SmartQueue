from rest_framework.permissions import BasePermission

# pyrefly: ignore [missing-import]
from apps.organizations.models import OrganizationMembership


class CanViewAuditLogs(BasePermission):
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
