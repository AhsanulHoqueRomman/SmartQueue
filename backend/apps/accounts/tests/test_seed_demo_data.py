import pytest
from datetime import time, timedelta
from unittest.mock import patch
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone
from apps.accounts.management.commands.seed_demo_data import Command
from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.services.models import Category, Service
from apps.providers.models import ProviderProfile, ProviderService, WeeklySchedule, ScheduleBreak
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.feedback.models import Review
from apps.notifications.models import Notification
from apps.audit.models import AuditLog


@pytest.fixture(autouse=True)
def fast_seed_passwords(settings):
    settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']


@pytest.fixture
def unrelated_records():
    customer = User.objects.create_user(email='customer.demo.sentinel@example.com', password='private',
                                        first_name='Private', last_name='Customer', phone_number='01712345678')
    admin = User.objects.create_superuser(email='private.admin@example.com', password='private')
    org = Organization.objects.create(name='Dhaka Care Clinic', slug='unrelated-sentinel')
    manager = OrganizationMembership.objects.create(user=admin, organization=org, role='MANAGER')
    member = OrganizationMembership.objects.create(user=customer, organization=org, role='PROVIDER')
    provider = ProviderProfile.objects.create(membership=member, title='Sentinel')
    category = Category.objects.create(organization=org, name='Private', slug='private')
    service = Service.objects.create(organization=org, category=category, name='Private',
                                     duration_minutes=20, price='700.00')
    assignment = ProviderService.objects.create(provider=provider, service=service)
    schedule = WeeklySchedule.objects.create(provider=provider, day_of_week=0,
                                              start_time=time(9), end_time=time(17))
    rest = ScheduleBreak.objects.create(weekly_schedule=schedule, title='Private break',
                                       start_time=time(13), end_time=time(14))
    now = timezone.now()
    appointment = Appointment.objects.create(organization=org, customer=customer, provider=provider,
        service=service, start_datetime=now, end_datetime=now + timedelta(minutes=20),
        appointment_date=now.date(), serial_number=1, status='COMPLETED')
    queue = QueueEntry.objects.create(organization=org, provider=provider, appointment=appointment,
                                      queue_date=now.date(), serial_number=1, token_number=1)
    review = Review.objects.create(organization=org, appointment=appointment, customer=customer,
                                    provider=provider, rating=5)
    notification = Notification.objects.create(organization=org, recipient=customer, appointment=appointment,
        queue_entry=queue, kind='APPOINTMENT_BOOKED', title='Private', message='Keep this')
    audit = AuditLog.objects.create(organization=org, actor=admin, action='PRIVATE', entity_type='sentinel')
    return [customer, admin, org, manager, member, provider, category, service, assignment,
            schedule, rest, appointment, queue, review, notification, audit]


@pytest.mark.django_db
class TestSeedDemoDataCommand:

    def test_reset_preserves_exact_non_demo_graph_and_account_data(self, unrelated_records):
        snapshots = [(record, type(record).objects.filter(pk=record.pk).values().get())
                     for record in unrelated_records]
        call_command('seed_demo_data', reset=True)
        for record, original in snapshots:
            assert type(record).objects.filter(pk=record.pk).values().get() == original

    def test_reset_replaces_demo_roots_and_is_idempotent(self):
        call_command('seed_demo_data', reset=True)
        old_org = Organization.objects.get(slug='dhaka-care-clinic').pk
        old_user = User.objects.get(email='customer.demo@example.com').pk
        old_appointments = list(Appointment.objects.values_list('pk', flat=True))
        models = [User, Organization, OrganizationMembership, Category, Service, ProviderProfile,
                  ProviderService, WeeklySchedule, ScheduleBreak, Appointment, QueueEntry, Review]
        counts = [model.objects.count() for model in models]
        call_command('seed_demo_data', reset=True)
        assert not Organization.objects.filter(pk=old_org).exists()
        assert not User.objects.filter(pk=old_user).exists()
        assert not Appointment.objects.filter(pk__in=old_appointments).exists()
        assert [model.objects.count() for model in models] == counts
        call_command('seed_demo_data', reset=True)
        assert [model.objects.count() for model in models] == counts

    def test_mixed_users_and_non_demo_relationships_survive(self, unrelated_records):
        call_command('seed_demo_data')
        outsider = unrelated_records[0]
        demo_org = Organization.objects.get(slug='dhaka-care-clinic')
        link = OrganizationMembership.objects.create(user=outsider, organization=demo_org, role='CUSTOMER')
        demo_user = User.objects.get(email='customer.demo@example.com')
        demo_user.first_name = 'Shared account'
        demo_user.set_password('keep-private-password')
        demo_user.save()
        non_demo_org = unrelated_records[2]
        non_demo_link = OrganizationMembership.objects.create(user=demo_user, organization=non_demo_org, role='STAFF')
        notification = Notification.objects.create(recipient=demo_user, organization=non_demo_org,
            kind='APPOINTMENT_BOOKED', title='Keep', message='Non-demo')
        standalone = AuditLog.objects.create(actor=demo_user, action='KEEP', entity_type='account')
        original = User.objects.filter(pk=demo_user.pk).values().get()
        call_command('seed_demo_data', reset=True)
        assert User.objects.filter(pk=outsider.pk).exists()
        assert not OrganizationMembership.objects.filter(pk=link.pk).exists()
        assert User.objects.filter(pk=demo_user.pk).values().get() == original
        assert OrganizationMembership.objects.filter(pk=non_demo_link.pk).exists()
        assert Notification.objects.filter(pk=notification.pk).exists()
        assert AuditLog.objects.filter(pk=standalone.pk, actor=demo_user).exists()

    def test_cross_org_cascade_is_blocked_and_rolled_back(self, unrelated_records):
        call_command('seed_demo_data')
        demo_provider = ProviderProfile.objects.get(membership__user__email='provider.demo@example.com')
        appointment = unrelated_records[11]
        appointment.provider = demo_provider
        appointment.serial_number = 99
        appointment.save()
        old_orgs = set(Organization.objects.values_list('pk', flat=True))
        old_appts = set(Appointment.objects.values_list('pk', flat=True))
        with pytest.raises(CommandError, match='non-demo organization data'):
            call_command('seed_demo_data', reset=True)
        assert set(Organization.objects.values_list('pk', flat=True)) == old_orgs
        assert set(Appointment.objects.values_list('pk', flat=True)) == old_appts
        assert Appointment.objects.filter(pk=appointment.pk).exists()

    def test_rebuild_failure_rolls_back_cleanup(self):
        call_command('seed_demo_data')
        old_orgs = set(Organization.objects.values_list('pk', flat=True))
        old_users = set(User.objects.values_list('pk', flat=True))
        old_appts = set(Appointment.objects.values_list('pk', flat=True))
        with patch.object(Command, 'seed_all', side_effect=RuntimeError('seed failed')):
            with pytest.raises(RuntimeError, match='seed failed'):
                call_command('seed_demo_data', reset=True)
        assert set(Organization.objects.values_list('pk', flat=True)) == old_orgs
        assert set(User.objects.values_list('pk', flat=True)) == old_users
        assert set(Appointment.objects.values_list('pk', flat=True)) == old_appts

    def test_protected_non_demo_service_reference_blocks_reset(self, unrelated_records):
        call_command('seed_demo_data')
        appointment = unrelated_records[11]
        appointment.service = Service.objects.filter(organization__slug='dhaka-care-clinic').first()
        appointment.save()
        old_orgs = set(Organization.objects.values_list('pk', flat=True))
        old_appts = set(Appointment.objects.values_list('pk', flat=True))
        with pytest.raises(CommandError, match='protected cross-dataset references'):
            call_command('seed_demo_data', reset=True)
        assert set(Organization.objects.values_list('pk', flat=True)) == old_orgs
        assert set(Appointment.objects.values_list('pk', flat=True)) == old_appts

    def test_standalone_audit_preserves_allowlisted_account(self):
        call_command('seed_demo_data')
        admin = User.objects.get(email='admin@example.com')
        audit = AuditLog.objects.create(actor=admin, action='EXTERNAL', entity_type='account')
        original = User.objects.filter(pk=admin.pk).values().get()
        call_command('seed_demo_data', reset=True)
        assert User.objects.filter(pk=admin.pk).values().get() == original
        assert AuditLog.objects.filter(pk=audit.pk, actor=admin).exists()

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
