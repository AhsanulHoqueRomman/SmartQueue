import pytest
from django.core.management import call_command
from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.services.models import Category, Service
from apps.providers.models import ProviderProfile, ProviderService


@pytest.mark.django_db
class TestSeedDemoDataCommand:

    def test_seed_runs_successfully_and_populates_all_industries(self):
        # Run seed command
        call_command('seed_demo_data', reset=True)

        # 1. Industry coverage test
        industries = set(Organization.objects.values_list('industry_type', flat=True))
        expected_industries = {'HEALTHCARE', 'LEGAL', 'BEAUTY', 'REPAIR', 'CONSULTING', 'OTHER'}
        assert expected_industries.issubset(industries)

        # 2. Categories & Services integrity test
        services = Service.objects.all()
        assert services.count() > 0
        for svc in services:
            assert svc.category is not None, f"Service {svc.name} must have a category."
            assert svc.category.organization_id == svc.organization_id, f"Service {svc.name} category org mismatch."

        # 3. Provider profile structured data test
        providers = ProviderProfile.objects.all()
        assert providers.count() > 0
        for prov in providers:
            assert isinstance(prov.education, list)
            assert isinstance(prov.experience_history, list)
            assert isinstance(prov.certifications, list)
            assert isinstance(prov.specialties, list)
            assert prov.experience_years >= 0

        # 4. Multi-category provider test (1 ProviderProfile, single queue, multiple service categories)
        provider_demo = ProviderProfile.objects.get(membership__user__email='provider.demo@example.com')
        offered_categories = {ps.service.category for ps in provider_demo.provider_services.all() if ps.service.category}
        assert len(offered_categories) >= 2, "Dr. Tanvir Ahmed should offer services across multiple categories."
        assert ProviderProfile.objects.filter(membership__user__email='provider.demo@example.com').count() == 1

        # 5. Core demo account preservation test
        assert User.objects.filter(email='admin@example.com').exists()
        assert User.objects.filter(email='manager.demo@example.com').exists()
        assert User.objects.filter(email='provider.demo@example.com').exists()
        assert User.objects.filter(email='staff.demo@example.com').exists()
        assert User.objects.filter(email='customer.demo@example.com').exists()

    def test_seed_command_idempotency(self):
        """Running the seed command twice without --reset must not duplicate records or crash."""
        # Initial seed
        call_command('seed_demo_data', reset=True)

        org_count_1 = Organization.objects.count()
        cat_count_1 = Category.objects.count()
        svc_count_1 = Service.objects.count()
        prov_count_1 = ProviderProfile.objects.count()

        # Second seed without --reset
        call_command('seed_demo_data')

        org_count_2 = Organization.objects.count()
        cat_count_2 = Category.objects.count()
        svc_count_2 = Service.objects.count()
        prov_count_2 = ProviderProfile.objects.count()

        assert org_count_1 == org_count_2, f"Orgs duplicated: {org_count_1} -> {org_count_2}"
        assert cat_count_1 == cat_count_2, f"Categories duplicated: {cat_count_1} -> {cat_count_2}"
        assert svc_count_1 == svc_count_2, f"Services duplicated: {svc_count_1} -> {svc_count_2}"
        assert prov_count_1 == prov_count_2, f"Providers duplicated: {prov_count_1} -> {prov_count_2}"
