from django.db import IntegrityError, transaction
from config.exceptions import ApplicationError
from .models import Service


class DuplicateServiceNameException(ApplicationError):
    from rest_framework import status as _status
    status_code = _status.HTTP_409_CONFLICT
    default_code = 'DUPLICATE_SERVICE_NAME'
    default_detail = 'A service with this name already exists in the organization.'


class ServiceService:
    """
    Business logic layer for the Service catalog domain.
    """

    @staticmethod
    def create_service(*, organization, name, description='', duration_minutes, price='0.00', is_active=True, category=None):
        """
        Create a new Service within the given organization.
        Duration / price / unique-name constraints are enforced at serializer and DB level.
        """
        if Service.objects.filter(organization=organization, name=name).exists():
            raise DuplicateServiceNameException()
        try:
            return Service.objects.create(
                organization=organization,
                category=category,
                name=name,
                description=description,
                duration_minutes=duration_minutes,
                price=price,
                is_active=is_active,
            )
        except IntegrityError as exc:
            raise DuplicateServiceNameException() from exc

    @staticmethod
    @transaction.atomic
    def update_service(*, service, **kwargs):
        """
        Update an existing Service's fields.
        Only whitelisted fields accepted (enforced by caller serializer).
        """
        if 'duration_minutes' in kwargs and kwargs['duration_minutes'] != service.duration_minutes:
            from apps.providers.models import ProviderProfile
            from django.db.models import Q
            # Legacy uniform catalog settings are a read-only compatibility
            # source, not permission to mutate live queue planning implicitly.
            providers = list(ProviderProfile.objects.select_for_update(of=('self',)).filter(
                membership__organization=service.organization).order_by('pk'))
            legacy_ids = [p.pk for p in providers if p.average_service_minutes is None]
            if ProviderProfile.objects.filter(pk__in=legacy_ids).filter(
                    Q(provider_services__service=service) | Q(appointments__service=service)).exists():
                raise ApplicationError(message='Configure provider-level average service times before changing legacy service duration.',
                                       code='PROVIDER_AVERAGE_SERVICE_TIME_REQUIRED')
        allowed_fields = {'name', 'category', 'description', 'duration_minutes', 'price', 'is_active'}
        for field, value in kwargs.items():
            if field in allowed_fields:
                setattr(service, field, value)

        if 'name' in kwargs:
            conflict = Service.objects.filter(
                organization=service.organization,
                name=service.name,
            ).exclude(pk=service.pk).exists()
            if conflict:
                raise DuplicateServiceNameException()

        try:
            service.save()
        except IntegrityError as exc:
            raise DuplicateServiceNameException() from exc
        return service
