from rest_framework.permissions import BasePermission


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
