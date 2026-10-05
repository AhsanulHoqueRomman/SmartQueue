from decimal import Decimal
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import ProviderProfile, ProviderService
from apps.providers.pricing import effective_customer_charge, with_starting_from_price
from apps.providers.serializers import ProviderProfileSerializer, ProviderPublicProfileSerializer, ProviderServiceSerializer
from apps.providers.services import ProviderService_ as ProviderBusiness
from apps.services.models import Service
from apps.services.serializers import ServiceSerializer

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup():
    org = Organization.objects.create(name='Pricing', slug='pricing', verification_status='APPROVED')
    other = Organization.objects.create(name='Other', slug='other', verification_status='APPROVED')
    manager = User.objects.create_user(email='manager@pricing.test')
    membership = OrganizationMembership.objects.create(user=manager, organization=org, role='MANAGER')
    customer = User.objects.create_user(email='customer@pricing.test')
    providers = []
    for index in range(2):
        user = User.objects.create_user(email=f'provider{index}@pricing.test')
        member = OrganizationMembership.objects.create(user=user, organization=org, role='PROVIDER')
        providers.append(ProviderProfile.objects.create(membership=member, application_status='APPROVED'))
    service = Service.objects.create(organization=org, name='Consultation', duration_minutes=30, price=Decimal('100.00'))
    assignments = [ProviderService.objects.create(provider=p, service=service, custom_price=price)
                   for p, price in zip(providers, [Decimal('80.00'), None])]
    return org, other, manager, membership, customer, providers, service, assignments


def url(setup, index=0):
    org, _, _, _, _, providers, _, assignments = setup
    return f'/api/v1/organizations/{org.id}/providers/{providers[index].id}/services/{assignments[index].id}/'


def test_resolution_and_serializer_contract(setup):
    org, _, _, _, _, providers, service, assignments = setup
    assert effective_customer_charge(assignments[0]) == Decimal('80.00')
    assert effective_customer_charge(assignments[1]) == Decimal('100.00')
    assert ProviderServiceSerializer(assignments[0]).data['effective_customer_charge'] == '80.00'
    assert ProviderProfileSerializer(providers[0]).data['service_charges'][0]['effective_customer_charge'] == '80.00'
    public = ProviderPublicProfileSerializer(providers[0]).data['services'][0]
    assert public['price'] == public['effective_customer_charge'] == '80.00'
    assert ServiceSerializer(service).data['price'] == '100.00'
    assert ServiceSerializer(service).data['starting_from_price'] == '80.00'
    client = APIClient()
    response = client.get(f'/api/v1/organizations/{org.id}/providers/?service_id={service.id}')
    rows = response.data if isinstance(response.data, list) else response.data['results']
    assert {r['service_charges'][0]['effective_customer_charge'] for r in rows} == {'80.00', '100.00'}


def test_dynamic_minimum_zero_and_no_assignments(setup):
    *_, service, assignments = setup
    assignments[0].custom_price = Decimal('120.00')
    assignments[0].save()
    assert ServiceSerializer(service).data['starting_from_price'] == '100.00'
    assignments[1].custom_price = Decimal('0.00')
    assignments[1].save()
    assert ServiceSerializer(service).data['starting_from_price'] == '0.00'
    assert effective_customer_charge(assignments[1]) == Decimal('0.00')
    ProviderService.objects.all().delete()
    assert ServiceSerializer(service).data['starting_from_price'] is None


@pytest.mark.parametrize('invalid', ['profile', 'approval', 'membership', 'role', 'org_active', 'org_approval', 'service', 'cross_org'])
def test_ineligible_assignment_excluded(setup, invalid):
    org, other, _, _, _, providers, service, _ = setup
    provider = providers[0]
    if invalid == 'profile':
        ProviderProfile.objects.filter(pk=provider.pk).update(is_active=False)
    elif invalid == 'approval':
        ProviderProfile.objects.filter(pk=provider.pk).update(application_status='PENDING_REVIEW')
    elif invalid in ('membership', 'role', 'cross_org'):
        changes = {'membership': {'is_active': False}, 'role': {'role': 'STAFF'}, 'cross_org': {'organization': other}}
        OrganizationMembership.objects.filter(pk=provider.membership_id).update(**changes[invalid])
    elif invalid == 'org_active':
        Organization.objects.filter(pk=org.pk).update(is_active=False)
    elif invalid == 'org_approval':
        Organization.objects.filter(pk=org.pk).update(verification_status='SUSPENDED')
    else:
        Service.objects.filter(pk=service.pk).update(is_active=False)
    expected = None if invalid in ('org_active', 'org_approval', 'service') else '100.00'
    assert ServiceSerializer(service).data['starting_from_price'] == expected


@pytest.mark.parametrize('price,expected', [('45.50', '45.50'), (None, '100.00'), ('0', '0.00')])
def test_manager_update(setup, price, expected):
    client = APIClient()
    client.force_authenticate(setup[2])
    response = client.patch(url(setup), {'custom_price': price}, format='json')
    assert response.status_code == 200
    assert response.data['effective_customer_charge'] == expected
    assert ServiceSerializer(setup[6]).data['starting_from_price'] == expected


@pytest.mark.parametrize('actor', ['provider', 'customer', 'inactive', 'invalid_role', 'other_manager'])
def test_manager_only_mutation(setup, actor):
    _, other, manager, membership, customer, providers, _, assignments = setup
    if actor == 'provider':
        user = providers[0].membership.user
    elif actor == 'customer':
        user = customer
    elif actor in ('inactive', 'invalid_role'):
        if actor == 'inactive':
            membership.is_active = False
        else:
            membership.role = 'STAFF'
        membership.save()
        user = manager
    else:
        user = User.objects.create_user(email='othermanager@pricing.test')
        OrganizationMembership.objects.create(user=user, organization=other, role='MANAGER')
    client = APIClient()
    client.force_authenticate(user)
    assert client.patch(url(setup), {'custom_price': '1.00'}, format='json').status_code == 403
    assignments[0].refresh_from_db()
    assert assignments[0].custom_price == Decimal('80.00')


@pytest.mark.parametrize('price', ['bad', '-1', '1.234', 'NaN', '100000000.00'])
def test_invalid_decimal(setup, price):
    client = APIClient()
    client.force_authenticate(setup[2])
    assert client.patch(url(setup), {'custom_price': price}, format='json').status_code == 400


def test_assignment_scope_missing_and_deletion(setup):
    _, other, manager, _, _, providers, _, assignments = setup
    foreign = Service.objects.create(organization=other, name='Foreign', duration_minutes=30, price='1.00')
    invalid = ProviderService.objects.create(provider=providers[0], service=foreign)
    client = APIClient()
    client.force_authenticate(manager)
    foreign_url = url(setup).replace(f'/{assignments[0].id}/', f'/{invalid.id}/')
    assert client.patch(foreign_url, {'custom_price': '2.00'}, format='json').status_code == 404
    assert client.patch(url(setup).replace(str(providers[0].id), str(providers[1].id)), {'custom_price': '2.00'}, format='json').status_code == 404
    assert client.delete(url(setup)).status_code == 204
    assert not ProviderService.objects.filter(pk=assignments[0].pk).exists()
    assert client.patch(url(setup), {'custom_price': '2.00'}, format='json').status_code == 404


def test_service_list_minimum_uses_one_query(setup, django_assert_num_queries):
    Service.objects.create(organization=setup[0], name='Unassigned', duration_minutes=30, price='50.00')
    with django_assert_num_queries(1):
        data = ServiceSerializer(with_starting_from_price(Service.objects.all()), many=True).data
    assert [item['starting_from_price'] for item in data] == ['80.00', None]


def test_public_service_list_contract(setup):
    response = APIClient().get(f'/api/v1/organizations/{setup[0].id}/services/')
    assert response.status_code == 200
    rows = response.data if isinstance(response.data, list) else response.data['results']
    assert rows[0]['price'] == '100.00'
    assert rows[0]['starting_from_price'] == '80.00'


def test_cross_org_provider_cannot_be_mutated_via_own_org_url(setup):
    provider = setup[5][0]
    OrganizationMembership.objects.filter(pk=provider.membership_id).update(organization=setup[1])
    client = APIClient()
    client.force_authenticate(setup[2])
    assert client.patch(url(setup), {'custom_price': '2.00'}, format='json').status_code == 404


def test_mutations_lock_provider_before_assignment_in_transaction(setup):
    from django.db import connection
    events = []
    original_provider = ProviderBusiness._lock_assignment_provider
    original_assignment = ProviderBusiness._lock_assignment

    def lock_provider(provider):
        assert connection.in_atomic_block
        events.append('provider')
        return original_provider(provider)

    def lock_assignment(provider, assignment_id):
        assert connection.in_atomic_block
        events.append('assignment')
        return original_assignment(provider, assignment_id)

    with patch.object(ProviderBusiness, '_lock_assignment_provider', side_effect=lock_provider), patch.object(
        ProviderBusiness, '_lock_assignment', side_effect=lock_assignment
    ):
        ProviderBusiness.update_service_charge(provider=setup[5][0], provider_service_id=setup[7][0].id, custom_price=Decimal('70.00'))
        ProviderBusiness.remove_service_from_provider(provider=setup[5][0], provider_service_id=setup[7][0].id)
    assert events == ['provider', 'assignment', 'provider', 'assignment']
