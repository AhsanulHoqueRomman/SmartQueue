"""Focused M1 privacy, publication and onboarding regression contracts."""
import uuid
from datetime import time, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.organizations.models import Organization, OrganizationDocument, OrganizationMembership
from apps.providers.models import ProviderDocument, ProviderProfile, ProviderService, WeeklySchedule, ScheduleBreak, ProviderLeave
from apps.services.models import Service

pytestmark = pytest.mark.django_db
User = get_user_model()


@pytest.fixture
def env():
    users = {
        role: User.objects.create_user(email=f'm1-{role}@example.test', password=None)
        for role in ['customer', 'provider', 'manager', 'staff', 'foreign', 'admin', 'superuser']
    }
    users['admin'].is_staff = True
    users['admin'].save()
    users['superuser'].is_superuser = True
    users['superuser'].save()
    users['provider'].first_name = 'Fictional'
    users['provider'].last_name = 'Professional'
    users['provider'].save()
    org = Organization.objects.create(
        name='M1 Clinic', slug='m1-clinic', verification_status='APPROVED',
        verification_rejection_reason='private organization feedback',
    )
    foreign_org = Organization.objects.create(name='Other Clinic', slug='m1-other', verification_status='APPROVED')
    for role in ['provider', 'manager', 'staff']:
        OrganizationMembership.objects.create(user=users[role], organization=org, role=role.upper())
    foreign_membership = OrganizationMembership.objects.create(
        user=users['foreign'], organization=foreign_org, role='MANAGER',
    )
    profile = ProviderProfile.objects.create(
        membership=OrganizationMembership.objects.get(user=users['provider']),
        title='Consultant', application_status='APPROVED',
        education=[{'degree': 'Demo Qualification'}], application_reviewed_by=users['manager'],
        application_rejection_reason='private provider feedback',
    )
    # String paths exercise URL projection without writing files to media storage.
    doc = ProviderDocument.objects.create(
        provider_profile=profile, document_type='CERTIFICATE', file='private/provider.pdf',
        original_filename='private-provider.pdf', reviewed_by=users['manager'], rejection_reason='private document feedback',
    )
    OrganizationDocument.objects.create(
        organization=org, document_type='OTHER', file='private/org.pdf',
        original_filename='private-org.pdf', reviewed_by=users['admin'], rejection_reason='private org document feedback',
    )
    service = Service.objects.create(organization=org, name='Consultation', duration_minutes=30, price='1000.00')
    ProviderService.objects.create(provider=profile, service=service, custom_price='1200.00')
    return dict(users=users, org=org, foreign_org=foreign_org, profile=profile, doc=doc, service=service,
                foreign_membership=foreign_membership)


def client_for(env, role):
    client = APIClient()
    if role != 'anonymous':
        client.force_authenticate(env['users'][role])
    return client


def provider_url(env, suffix=''):
    return f"/api/v1/organizations/{env['org'].pk}/providers/{env['profile'].pk}/{suffix}"


def assert_no_private(data):
    forbidden = {
        'documents', 'documents_count', 'file', 'original_filename', 'reviewed_by', 'reviewed_at',
        'rejection_reason', 'application_rejection_reason', 'application_reviewed_by',
        'application_reviewed_by_email', 'application_reviewed_at', 'verification_rejection_reason',
        'verification_suspension_reason', 'verification_submitted_at', 'verification_reviewed_at',
    }
    if isinstance(data, dict):
        assert forbidden.isdisjoint(data)
        for value in data.values():
            assert_no_private(value)
    elif isinstance(data, list):
        for value in data:
            assert_no_private(value)


@pytest.mark.parametrize('role', ['anonymous', 'customer', 'foreign', 'staff'])
def test_public_projections_exclude_verification_material(env, role):
    client = client_for(env, role)
    org_url = f"/api/v1/organizations/{env['org'].pk}/"
    for url in [provider_url(env), provider_url(env, 'profile/'),
                f"/api/v1/organizations/{env['org'].pk}/providers/", org_url, '/api/v1/organizations/']:
        response = client.get(url)
        assert response.status_code == 200, response.data
        assert_no_private(response.data)
    public = client.get(provider_url(env)).data
    assert 'user_email' not in public
    assert public['user_first_name'] == 'Fictional'
    assert public['education'] == [{'degree': 'Demo Qualification'}]
    assert public['service_charges'][0]['effective_customer_charge'] == '1200.00'
    assert client.get(org_url).data['smartqueue_verified'] is True


def assert_private_email_absent(data, email):
    if isinstance(data, dict):
        for key, value in data.items():
            assert_private_email_absent(key, email)
            assert_private_email_absent(value, email)
    elif isinstance(data, list):
        for value in data:
            assert_private_email_absent(value, email)
    elif isinstance(data, str):
        assert email.lower() not in data.lower()


@pytest.mark.parametrize('role', ['anonymous', 'customer', 'foreign'])
@pytest.mark.parametrize('first,last,title,expected', [
    ('Farhana', 'Rahman', 'Consultant', 'Farhana Rahman'),
    ('Farhana', '', 'Consultant', 'Farhana'),
    ('', 'Rahman', 'Consultant', 'Rahman'),
    ('', '', ' Consultant ', 'Consultant'),
    ('', '', '', 'Service Provider'),
    ('  ', '\t', '  ', 'Service Provider'),
    (' Farhana ', ' Rahman ', 'Consultant', 'Farhana Rahman'),
])
def test_public_profile_name_never_falls_back_to_account_email(env, role, first, last, title, expected):
    user = env['users']['provider']
    user.first_name, user.last_name = first, last
    user.save()
    env['profile'].title = title
    env['profile'].save()
    response = client_for(env, role).get(provider_url(env, 'profile/'))
    assert response.status_code == 200, response.data
    assert response.data['provider_name'] == expected
    assert set(response.data) == {
        'id', 'provider_name', 'profile_photo', 'title', 'bio',
        'organization_id', 'organization_name', 'experience_years',
        'education', 'experience_history', 'certifications', 'specialties',
        'categories', 'services', 'rating', 'reviews_count',
    }
    assert response.data['id'] == str(env['profile'].pk)
    assert response.data['organization_id'] == str(env['org'].pk)
    assert response.data['education'] == [{'degree': 'Demo Qualification'}]
    assert response.data['services'][0]['effective_customer_charge'] == '1200.00'
    assert_no_private(response.data)
    assert_private_email_absent(response.data, user.email)


@pytest.mark.parametrize('role', ['provider', 'manager', 'admin', 'superuser'])
def test_authorized_profile_still_retains_account_and_verification_fields(env, role):
    user = env['users']['provider']
    user.first_name = user.last_name = ''
    user.save()
    client = client_for(env, role)
    private = client.get(provider_url(env))
    assert private.status_code == 200
    assert private.data['user_email'] == user.email
    assert private.data['documents'][0]['id'] == str(env['doc'].pk)
    public = client.get(provider_url(env, 'profile/'))
    assert public.status_code == 200
    assert public.data['provider_name'] == 'Consultant'
    assert_no_private(public.data)
    assert_private_email_absent(public.data, user.email)


@pytest.mark.parametrize('role', ['provider', 'manager', 'admin', 'superuser'])
def test_authorized_provider_detail_retains_private_review(env, role):
    response = client_for(env, role).get(provider_url(env))
    assert response.status_code == 200
    assert response.data['documents'][0]['id'] == str(env['doc'].pk)
    assert response.data['application_reviewed_by'] == env['users']['manager'].pk


@pytest.mark.parametrize('role', ['manager', 'admin', 'superuser'])
def test_authorized_organization_detail_retains_verification(env, role):
    response = client_for(env, role).get(f"/api/v1/organizations/{env['org'].pk}/")
    assert response.status_code == 200
    assert response.data['documents'][0]['original_filename'] == 'private-org.pdf'
    assert response.data['verification_rejection_reason'] == 'private organization feedback'


@pytest.fixture
def schedule_env(env):
    schedule = WeeklySchedule.objects.create(
        provider=env['profile'], day_of_week=timezone.localdate().weekday(),
        start_time=time(9), end_time=time(17),
    )
    ScheduleBreak.objects.create(weekly_schedule=schedule, start_time=time(12), end_time=time(13), title='Private medical note')
    start = timezone.now() + timedelta(days=10)
    ProviderLeave.objects.create(provider=env['profile'], start_datetime=start, end_datetime=start + timedelta(hours=2), reason='Private family note')
    env['schedule'] = schedule
    return env


@pytest.mark.parametrize('role', ['customer', 'foreign'])
def test_customer_safe_schedule_annotations(schedule_env, role):
    env = schedule_env
    client = client_for(env, role)
    schedule = client.get(provider_url(env, 'schedules/'))
    breaks = client.get(provider_url(env, f"schedules/{env['schedule'].pk}/breaks/"))
    leaves = client.get(provider_url(env, 'leaves/'))
    assert schedule.status_code == breaks.status_code == leaves.status_code == 200
    assert schedule.data[0]['start_time'] == '09:00:00'
    assert 'title' not in schedule.data[0]['breaks'][0]
    assert 'title' not in breaks.data[0]
    assert 'reason' not in leaves.data[0]
    assert 'Private' not in str([schedule.data, breaks.data, leaves.data])
    denied = client.post(provider_url(env, 'schedules/'), {
        'day_of_week': 0, 'start_time': '08:00', 'end_time': '16:00',
    })
    assert denied.status_code == 403


@pytest.mark.parametrize('role', ['provider', 'manager', 'staff', 'admin', 'superuser'])
def test_operational_schedule_annotations_preserved(schedule_env, role):
    env = schedule_env
    client = client_for(env, role)
    schedule = client.get(provider_url(env, 'schedules/'))
    breaks = client.get(provider_url(env, f"schedules/{env['schedule'].pk}/breaks/"))
    leaves = client.get(provider_url(env, 'leaves/'))
    assert schedule.status_code == breaks.status_code == leaves.status_code == 200
    assert schedule.data[0]['breaks'][0]['title'] == 'Private medical note'
    assert breaks.data[0]['title'] == 'Private medical note'
    assert leaves.data[0]['reason'] == 'Private family note'


def test_anonymous_schedule_reads_remain_authenticated(schedule_env):
    env = schedule_env
    client = client_for(env, 'anonymous')
    for suffix in ['schedules/', 'leaves/', f"schedules/{env['schedule'].pk}/breaks/"]:
        assert client.get(provider_url(env, suffix)).status_code == 401


def test_schedule_scoping_and_unpublished_provider(schedule_env):
    env = schedule_env
    client = client_for(env, 'customer')
    wrong_org = provider_url(env, 'schedules/').replace(str(env['org'].pk), str(env['foreign_org'].pk))
    assert client.get(wrong_org).status_code == 404
    env['profile'].application_status = 'PENDING_REVIEW'
    env['profile'].save()
    assert client.get(provider_url(env, 'schedules/')).status_code == 404


def test_customer_availability_still_uses_schedule(schedule_env):
    env = schedule_env
    response = client_for(env, 'customer').get(provider_url(env, 'availability/'), {
        'service_id': str(env['service'].pk), 'date': str(timezone.localdate() + timedelta(days=7)),
    })
    assert response.status_code == 200, response.data
    assert 'Private' not in str(response.data)


@pytest.mark.parametrize('role', ['anonymous', 'customer', 'foreign', 'manager', 'admin', 'superuser'])
@pytest.mark.parametrize('org_state', ['APPROVED', 'SUBMITTED', 'REJECTED', 'SUSPENDED', 'inactive'])
def test_service_list_detail_publication_parity(env, role, org_state):
    org = env['org']
    if org_state == 'inactive':
        org.is_active = False
    else:
        org.verification_status = org_state
    org.save()
    client = client_for(env, role)
    url = f'/api/v1/organizations/{org.pk}/services/'
    expected = 200 if role in ['manager', 'admin', 'superuser'] or org_state == 'APPROVED' else 404
    assert client.get(url).status_code == expected
    response = client.get(f"{url}{env['service'].pk}/")
    assert response.status_code == expected, response.data
    if expected == 200:
        assert response.data['starting_from_price'] == ('1200.00' if org_state == 'APPROVED' else None)


def test_service_inactive_and_foreign_scope(env):
    service = env['service']
    service.is_active = False
    service.save()
    url = f"/api/v1/organizations/{env['org'].pk}/services/{service.pk}/"
    assert client_for(env, 'customer').get(url).status_code == 404
    assert client_for(env, 'manager').get(url).status_code == 200
    assert client_for(env, 'foreign').patch(url, {'name': 'Forged'}).status_code == 403
    wrong_url = url.replace(str(env['org'].pk), str(env['foreign_org'].pk))
    assert client_for(env, 'foreign').get(wrong_url).status_code == 404


def registration_payload(env):
    return {
        'email': 'm1-applicant@example.test', 'first_name': 'Demo', 'last_name': 'Applicant',
        'password': 'ProviderStrong123!', 'password_confirm': 'ProviderStrong123!',
        'organization_id': str(env['org'].pk), 'title': 'Consultant',
    }


@pytest.mark.parametrize('failure', ['unknown_org', 'inactive_org', 'malformed_org', 'missing_password', 'password_mismatch'])
def test_failed_provider_registration_leaves_no_partial_records(env, failure):
    payload = registration_payload(env)
    if failure == 'unknown_org':
        payload['organization_id'] = str(uuid.uuid4())
    elif failure == 'inactive_org':
        env['org'].is_active = False
        env['org'].save()
    elif failure == 'malformed_org':
        payload['organization_id'] = 'invalid'
    elif failure == 'missing_password':
        payload.pop('password')
    else:
        payload['password_confirm'] = 'Different123!'
    before = (User.objects.count(), OrganizationMembership.objects.count(), ProviderProfile.objects.count())
    response = APIClient().post('/api/v1/auth/register/provider/', payload, format='json')
    assert response.status_code == 400, response.data
    assert not User.objects.filter(email=payload['email']).exists()
    assert before == (User.objects.count(), OrganizationMembership.objects.count(), ProviderProfile.objects.count())


@pytest.mark.parametrize('bound', [True, False])
def test_successful_provider_registration_preserves_contract(env, bound):
    payload = registration_payload(env)
    # A forged account role never supplies authority over the selected organization.
    payload['role'] = 'MANAGER'
    if not bound:
        payload.pop('organization_id')
    response = APIClient().post('/api/v1/auth/register/provider/', payload, format='json')
    assert response.status_code == 201, response.data
    assert 'access' in response.data and 'refresh' in response.data
    assert response.data['is_pending_approval'] is bound
    user = User.objects.get(email=payload['email'])
    if bound:
        membership = OrganizationMembership.objects.get(user=user)
        assert membership.role == 'PROVIDER' and membership.is_active is False
        assert membership.provider_profile.application_status == 'INCOMPLETE'
        assert response.data['provider_profile_id'] == str(membership.provider_profile.pk)
    else:
        assert not OrganizationMembership.objects.filter(user=user).exists()
        assert response.data['provider_profile_id'] is None


def test_registration_exception_rolls_back_user_and_membership(env, monkeypatch):
    def fail_profile(**kwargs):
        raise ValueError('simulated profile write failure')
    monkeypatch.setattr(ProviderProfile.objects, 'create', fail_profile)
    before = (User.objects.count(), OrganizationMembership.objects.count(), ProviderProfile.objects.count())
    with pytest.raises(ValueError, match='simulated profile'):
        APIClient().post('/api/v1/auth/register/provider/', registration_payload(env), format='json')
    assert before == (User.objects.count(), OrganizationMembership.objects.count(), ProviderProfile.objects.count())


def upload_payload(**extra):
    return dict(document_type='CERTIFICATE', original_filename='demo.pdf',
                file=SimpleUploadedFile('demo.pdf', b'%PDF-1.4 demo', content_type='application/pdf'), **extra)


@pytest.mark.parametrize('role', ['provider', 'manager', 'admin', 'superuser'])
def test_document_upload_without_owner_is_server_scoped(env, role, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    response = client_for(env, role).post(provider_url(env, 'documents/'), upload_payload(), format='multipart')
    assert response.status_code == 201, response.data
    doc = ProviderDocument.objects.get(pk=response.data['id'])
    assert doc.provider_profile_id == env['profile'].pk
    assert doc.status == 'PENDING' and doc.reviewed_by is None


@pytest.mark.parametrize('role', ['provider', 'manager', 'admin', 'superuser', 'customer', 'staff', 'foreign'])
def test_document_list_authority(env, role):
    response = client_for(env, role).get(provider_url(env, 'documents/'))
    allowed = role in ['provider', 'manager', 'admin', 'superuser']
    assert response.status_code == (200 if allowed else 403)
    if allowed:
        assert response.data[0]['id'] == str(env['doc'].pk)


def test_document_forged_owner_rejected_and_review_fields_not_writable(env, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    client = client_for(env, 'provider')
    before = ProviderDocument.objects.count()
    response = client.post(provider_url(env, 'documents/'), upload_payload(provider_profile=str(uuid.uuid4())), format='multipart')
    assert response.status_code == 400
    assert ProviderDocument.objects.count() == before
    response = client.post(provider_url(env, 'documents/'), upload_payload(
        provider_profile=str(env['profile'].pk), status='APPROVED',
        reviewed_by=str(env['users']['provider'].pk), rejection_reason='forged review',
    ), format='multipart')
    assert response.status_code == 201, response.data
    doc = ProviderDocument.objects.get(pk=response.data['id'])
    assert doc.provider_profile_id == env['profile'].pk
    assert doc.status == 'PENDING' and doc.reviewed_by is None and doc.rejection_reason == ''


@pytest.mark.parametrize('role', ['manager', 'admin', 'superuser', 'provider', 'customer', 'staff', 'foreign'])
def test_document_review_authority_and_actual_relationship(env, role):
    url = provider_url(env, f"documents/{env['doc'].pk}/review/")
    response = client_for(env, role).post(url, {'status': 'APPROVED'}, format='json')
    allowed = role in ['manager', 'admin', 'superuser']
    assert response.status_code == (200 if allowed else 403), response.data
    env['doc'].refresh_from_db()
    assert env['doc'].status == ('APPROVED' if allowed else 'PENDING')
    if allowed:
        assert env['doc'].reviewed_by_id == env['users'][role].pk


def test_document_nested_owner_and_tenant_cannot_be_substituted(env):
    user = User.objects.create_user(email='m1-other-provider@example.test')
    membership = OrganizationMembership.objects.create(user=user, organization=env['org'], role='PROVIDER')
    other = ProviderProfile.objects.create(membership=membership, application_status='APPROVED')
    other_doc = ProviderDocument.objects.create(provider_profile=other, document_type='OTHER', file='private/other.pdf', original_filename='other.pdf')
    url = provider_url(env, f'documents/{other_doc.pk}/review/')
    assert client_for(env, 'manager').post(url, {'status': 'APPROVED'}).status_code == 404
    wrong_org = provider_url(env, 'documents/').replace(str(env['org'].pk), str(env['foreign_org'].pk))
    assert client_for(env, 'foreign').get(wrong_org).status_code == 404
    assert client_for(env, 'provider').get(provider_url(env, 'documents/').replace(str(env['profile'].pk), str(other.pk))).status_code == 403


@pytest.mark.parametrize('application_state', ['INCOMPLETE', 'PENDING_REVIEW', 'REJECTED'])
def test_pending_owner_onboarding_without_operational_authority(env, application_state, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    profile = env['profile']
    profile.application_status = application_state
    profile.save()
    profile.membership.is_active = False
    profile.membership.save()
    client = client_for(env, 'provider')
    assert client.get(provider_url(env)).status_code == 200
    response = client.patch(provider_url(env), {'bio': 'Updated application', 'application_status': 'APPROVED'}, format='json')
    assert response.status_code == 200, response.data
    profile.refresh_from_db()
    assert profile.application_status == application_state
    assert client.get(provider_url(env, 'documents/')).status_code == 200
    assert client.post(provider_url(env, 'documents/'), upload_payload(), format='multipart').status_code == 201
    for suffix in ['schedules/', 'leaves/']:
        assert client.post(provider_url(env, suffix), {}, format='json').status_code == 403
    queue_url = f"/api/v1/organizations/{env['org'].pk}/queue/providers/{profile.pk}/"
    assert client.get(queue_url).status_code == 403
    assert client.post(provider_url(env, 'review-application/'), {'action': 'APPROVE'}).status_code == 403
    assert client.post(provider_url(env, f"documents/{env['doc'].pk}/review/"), {'status': 'APPROVED'}).status_code == 403
    assert client_for(env, 'foreign').post(provider_url(env, 'submit-application/')).status_code == 403
    wrong_org = provider_url(env, 'documents/').replace(str(env['org'].pk), str(env['foreign_org'].pk))
    assert client.get(wrong_org).status_code == 403
    assert client.post(provider_url(env, 'submit-application/')).status_code == 200
    profile.refresh_from_db()
    profile.membership.refresh_from_db()
    assert profile.application_status == 'PENDING_REVIEW'
    assert profile.application_rejection_reason == ''
    assert profile.membership.is_active is False
    assert not profile.is_operationally_active


def test_registration_upload_submit_review_http_flow(env, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    client = APIClient()
    registration = client.post('/api/v1/auth/register/provider/', registration_payload(env), format='json')
    assert registration.status_code == 201, registration.data
    profile_id = registration.data['provider_profile_id']
    assert profile_id
    url = f"/api/v1/organizations/{env['org'].pk}/providers/{profile_id}/"
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {registration.data['access']}")
    assert client.get(url).status_code == 200
    assert client.patch(url, {'education': [{'degree': 'Demo qualification'}]}, format='json').status_code == 200
    assert client.post(f'{url}documents/', upload_payload(), format='multipart').status_code == 201
    documents = client.get(f'{url}documents/')
    assert documents.status_code == 200 and len(documents.data) == 1
    assert client.post(f'{url}submit-application/').status_code == 200
    assert client.get(provider_url(env, 'documents/')).status_code == 403
    assert client.post(f'{url}schedules/', {}).status_code == 403
    review_client = client_for(env, 'manager')
    document_id = documents.data[0]['id']
    assert review_client.post(f'{url}documents/{document_id}/review/', {'status': 'APPROVED'}).status_code == 200
    assert review_client.post(f'{url}review-application/', {'action': 'APPROVE'}).status_code == 200
    profile = ProviderProfile.objects.get(pk=profile_id)
    assert profile.user.pk == registration.data['user']['id']
    profile.membership.refresh_from_db()
    assert profile.is_operationally_active
    assert profile.membership.is_active
    assert client.post(f'{url}schedules/', {
        'day_of_week': 0, 'start_time': '09:00', 'end_time': '17:00',
    }).status_code == 201


def test_inactive_approved_owner_does_not_gain_onboarding_access(env):
    membership = env['profile'].membership
    membership.is_active = False
    membership.save()
    client = client_for(env, 'provider')
    assert client.get(provider_url(env)).status_code == 404
    assert client.patch(provider_url(env), {'bio': 'forged'}).status_code == 403
    assert client.get(provider_url(env, 'documents/')).status_code == 403
    assert client.post(provider_url(env, 'submit-application/')).status_code == 403


@pytest.mark.parametrize('role', ['manager', 'admin', 'superuser'])
def test_manager_platform_can_review_pending_owner(env, role):
    profile = env['profile']
    profile.application_status = 'PENDING_REVIEW'
    profile.save()
    profile.membership.is_active = False
    profile.membership.save()
    client = client_for(env, role)
    assert client.get(provider_url(env)).status_code == 200
    assert client.get(provider_url(env, 'documents/')).status_code == 200
    assert client.post(provider_url(env, 'review-application/'), {'action': 'APPROVE'}).status_code == 200
    profile.refresh_from_db()
    assert profile.is_operationally_active


def test_public_paginated_projections_and_manager_provider_list(env):
    client = client_for(env, 'customer')
    for url in ['/api/v1/organizations/', f"/api/v1/organizations/{env['org'].pk}/providers/"]:
        response = client.get(url, {'page': 1, 'page_size': 10})
        assert response.status_code == 200
        assert 'results' in response.data
        assert_no_private(response.data)
    response = client_for(env, 'manager').get(f"/api/v1/organizations/{env['org'].pk}/providers/")
    assert response.status_code == 200
    assert response.data[0]['documents'][0]['id'] == str(env['doc'].pk)


def test_inactive_membership_does_not_grant_private_schedule_annotations(schedule_env):
    env = schedule_env
    membership = OrganizationMembership.objects.get(user=env['users']['staff'])
    membership.is_active = False
    membership.save()
    response = client_for(env, 'staff').get(provider_url(env, 'schedules/'))
    assert response.status_code == 200
    assert 'title' not in response.data[0]['breaks'][0]


@pytest.mark.parametrize('role', ['provider', 'manager', 'staff', 'admin', 'superuser', 'customer', 'foreign', 'anonymous'])
def test_dedicated_organization_document_authority_preserved(env, role):
    response = client_for(env, role).get(f"/api/v1/organizations/{env['org'].pk}/documents/")
    allowed = role in ['provider', 'manager', 'staff', 'admin', 'superuser']
    assert response.status_code == (200 if allowed else 401 if role == 'anonymous' else 403)
    if allowed:
        assert response.data[0]['original_filename'] == 'private-org.pdf'
