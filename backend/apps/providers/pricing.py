"""Customer charges only; no income, commission, or settlement semantics."""
from django.db.models import DecimalField, F, Min, OuterRef, Subquery
from django.db.models.functions import Coalesce

from apps.organizations.models import Organization, OrganizationMembership
from .models import ProviderProfile, ProviderService


def effective_customer_charge(assignment):
    """Return the Decimal override, including zero, or the service default."""
    return (
        assignment.custom_price
        if assignment.custom_price is not None
        else assignment.service.price
    )


def effective_customer_charge_expression():
    """SQL counterpart of the authoritative override/default rule above."""
    return Coalesce('custom_price', 'service__price', output_field=DecimalField(max_digits=10, decimal_places=2))


def eligible_pricing_assignments():
    # Eligibility is independent of schedules, leaves, capacity, and queue state.
    return ProviderService.objects.filter(
        provider__is_active=True,
        provider__application_status=ProviderProfile.ApplicationStatus.APPROVED,
        provider__membership__is_active=True,
        provider__membership__role=OrganizationMembership.Role.PROVIDER,
        provider__membership__organization__is_active=True,
        provider__membership__organization__verification_status=Organization.VerificationStatus.APPROVED,
        service__is_active=True,
        service__organization_id=F('provider__membership__organization_id'),
    )


def with_starting_from_price(services):
    minimum = (
        eligible_pricing_assignments().filter(service_id=OuterRef('pk'))
        .order_by().values('service_id')
        .annotate(minimum=Min(effective_customer_charge_expression()))
        .values('minimum')[:1]
    )
    return services.annotate(starting_from_price=Subquery(minimum))


def starting_from_price(service):
    if hasattr(service, 'starting_from_price'):
        return service.starting_from_price
    return eligible_pricing_assignments().filter(service=service).aggregate(
        minimum=Min(effective_customer_charge_expression())
    )['minimum']
