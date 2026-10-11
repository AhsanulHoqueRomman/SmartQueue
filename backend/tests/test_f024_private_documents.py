"""Synthetic private verification storage/access/cutover regression contracts."""
import io
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from PIL import Image
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.organizations.models import Organization, OrganizationMembership, OrganizationDocument, OrganizationCredential
from apps.providers.models import ProviderProfile, ProviderDocument
from config.private_documents import validate_verification_file, private_document_storage, validate_private_storage_configuration

pytestmark = pytest.mark.django_db
PDF = b'%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF'


def upload(name='proof.pdf', data=PDF, mime='application/pdf'):
    return SimpleUploadedFile(name, data, content_type=mime)


@pytest.fixture
def env(settings, tmp_path):
    settings.DEBUG = True
    settings.MEDIA_ROOT = str(tmp_path / 'public')
    users = {role: get_user_model().objects.create_user(email=f'f024-{role}@example.invalid')
             for role in ['owner', 'other', 'manager', 'inactive', 'foreign', 'staff', 'customer', 'admin', 'superuser']}
    users['admin'].is_staff = True
    users['admin'].save()
    users['superuser'].is_superuser = True
    users['superuser'].save()
    org = Organization.objects.create(name='Fictional Verification Org', slug='f024')
    foreign = Organization.objects.create(name='Foreign Org', slug='f024-foreign')
    for role, member_role, active in [('owner', 'PROVIDER', False), ('other', 'PROVIDER', True),
                                    ('manager', 'MANAGER', True), ('inactive', 'MANAGER', False), ('staff', 'STAFF', True)]:
        OrganizationMembership.objects.create(user=users[role], organization=org, role=member_role, is_active=active)
    OrganizationMembership.objects.create(user=users['foreign'], organization=foreign, role='MANAGER')
    provider = ProviderProfile.objects.create(membership=OrganizationMembership.objects.get(user=users['owner']), application_status='PENDING_REVIEW')
    docs = {
        'provider': ProviderDocument.objects.create(provider_profile=provider, document_type='CERTIFICATE', file=upload(), original_filename='proof.pdf'),
        'organization': OrganizationDocument.objects.create(organization=org, document_type='OTHER', file=upload(), original_filename='proof.pdf'),
        'credential': OrganizationCredential.objects.create(organization=org, credential_name='Demo License', document=upload()),
    }
    return dict(users=users, org=org, foreign=foreign, provider=provider, docs=docs)


def client(env, role):
    result = APIClient()
    if role != 'anonymous':
        result.force_authenticate(env['users'][role])
    return result


def url(env, kind, doc=None):
    prefix = f"/api/v1/organizations/{env['org'].pk}/"
    if kind == 'provider':
        prefix += f"providers/{env['provider'].pk}/documents/"
    else:
        prefix += 'credentials/' if kind == 'credential' else 'documents/'
    return f"{prefix}{(doc or env['docs'][kind]).pk}/download/"


@pytest.mark.parametrize('kind', ['provider', 'organization', 'credential'])
@pytest.mark.parametrize('role', ['owner', 'other', 'manager', 'inactive', 'foreign', 'staff', 'customer', 'admin', 'superuser', 'anonymous'])
def test_download_role_and_tenant_matrix(env, kind, role):
    response = client(env, role).get(url(env, kind))
    allowed = role in ['manager', 'admin', 'superuser'] or (kind == 'provider' and role == 'owner')
    if allowed:
        assert response.status_code == 200
        assert b''.join(response.streaming_content) == PDF
        assert response['Cache-Control'] == 'no-store'
        assert response['X-Content-Type-Options'] == 'nosniff'
        assert response['Content-Disposition'].startswith('attachment;')
        assert response['Content-Type'] == 'application/pdf'
        assert AuditLog.objects.filter(action='VERIFICATION_DOCUMENT_DOWNLOADED', actor=env['users'][role]).count() == 1
        assert not env['provider'].is_operationally_active
    else:
        assert response.status_code in [401, 403, 404]
        assert not AuditLog.objects.filter(action='VERIFICATION_DOCUMENT_DOWNLOADED').exists()


@pytest.mark.parametrize('kind', ['provider', 'organization', 'credential'])
def test_wrong_nested_tenant_and_document_id_denied(env, kind):
    response = client(env, 'manager').get(url(env, kind).replace(str(env['org'].pk), str(env['foreign'].pk)))
    assert response.status_code in [403, 404]
    import uuid
    assert client(env, 'manager').get(url(env, kind).replace(str(env['docs'][kind].pk), str(uuid.uuid4()))).status_code == 404
    if kind == 'provider':
        other = ProviderProfile.objects.create(membership=OrganizationMembership.objects.get(user=env['users']['other']))
        assert client(env, 'manager').get(url(env, kind).replace(str(env['provider'].pk), str(other.pk))).status_code == 404


@pytest.mark.parametrize('role', ['staff', 'customer', 'inactive', 'foreign', 'anonymous', 'owner'])
def test_organization_document_listing_not_for_ordinary_members(env, role):
    response = client(env, role).get(f"/api/v1/organizations/{env['org'].pk}/documents/")
    assert response.status_code in [401, 403]


@pytest.mark.parametrize('kind', ['provider', 'organization', 'credential'])
def test_upload_and_projection_are_private(env, kind, settings):
    if kind == 'provider':
        endpoint = f"/api/v1/organizations/{env['org'].pk}/providers/{env['provider'].pk}/documents/"
        payload = dict(file=upload(), document_type='CERTIFICATE', original_filename='proof.pdf')
        role = 'owner'
    elif kind == 'organization':
        endpoint = f"/api/v1/organizations/{env['org'].pk}/documents/"
        payload = dict(file=upload(), document_type='OTHER')
        role = 'manager'
    else:
        endpoint = f"/api/v1/organizations/{env['org'].pk}/credentials/"
        payload = dict(document=upload(), credential_name='New Demo License')
        role = 'manager'
    response = client(env, role).post(endpoint, payload, format='multipart')
    assert response.status_code == 201, response.data
    key = 'document' if kind == 'credential' else 'file'
    assert response.data[key].startswith('/api/v1/') and response.data[key].endswith('/download/')
    assert '/media/' not in str(response.data) and str(settings.STORAGES['private_documents']['OPTIONS']['location']) not in str(response.data)
    model = env['docs'][kind].__class__
    doc = model.objects.get(pk=response.data['id'])
    field = getattr(doc, key)
    assert Path(field.path).is_file() and not (Path(settings.MEDIA_ROOT) / field.name).exists()
    assert Path(field.name).name != 'proof.pdf'
    assert len(Path(field.name).stem) == 32
    with pytest.raises(ValueError, match='no public URL'):
        _ = field.url
    assert not env['provider'].is_operationally_active


@pytest.mark.parametrize('name,data,mime', [
    ('test.docx', PDF, 'application/octet-stream'), ('test.exe', PDF, 'application/pdf'),
    ('test.pdf', b'', 'application/pdf'), ('test.pdf', b'%PDF-1.4 no end marker', 'application/pdf'),
    ('test.pdf', b'not a pdf', 'application/pdf'), ('test.pdf', PDF, 'image/png'),
    ('test.png', PDF, 'image/png'), ('test.jpg', b'fake jpeg', 'image/jpeg'),
    ('test.pdf', b'x' * (5 * 1024 * 1024 + 1), 'application/pdf'),
], ids=['docx','exe','empty','incomplete-pdf','fake-pdf','mime-mismatch','fake-png','fake-jpeg','oversized'])
def test_invalid_uploads_rejected_at_api(env, name, data, mime):
    endpoint = f"/api/v1/organizations/{env['org'].pk}/providers/{env['provider'].pk}/documents/"
    before = ProviderDocument.objects.count()
    response = client(env, 'owner').post(endpoint, {'file': upload(name, data, mime), 'document_type': 'OTHER'}, format='multipart')
    assert response.status_code == 400, response.data
    assert ProviderDocument.objects.count() == before


@pytest.mark.parametrize('ext,format,mime', [('png', 'PNG', 'image/png'), ('jpg', 'JPEG', 'image/jpeg'), ('jpeg', 'JPEG', 'image/jpeg')])
def test_actual_images_accepted_and_stream_rewound(ext, format, mime):
    data = io.BytesIO()
    Image.new('RGB', (2, 2)).save(data, format=format)
    file = upload(f'test.{ext}', data.getvalue(), mime)
    validate_verification_file(file)
    assert file.tell() == 0 and file.read() == data.getvalue()
    wrong = upload('wrong.pdf', data.getvalue(), 'application/pdf')
    with pytest.raises(ValidationError):
        validate_verification_file(wrong)


def test_image_extension_signature_mismatch():
    data = io.BytesIO()
    Image.new('RGB', (2, 2)).save(data, format='PNG')
    with pytest.raises(ValidationError):
        validate_verification_file(upload('fake.jpg', data.getvalue(), 'image/jpeg'))


def test_storage_names_are_unpredictable_and_user_paths_not_used(env, settings):
    a = ProviderDocument.objects.create(provider_profile=env['provider'], document_type='OTHER', file=upload('C:\\private\\proof.pdf'), original_filename='proof.pdf')
    b = ProviderDocument.objects.create(provider_profile=env['provider'], document_type='OTHER', file=upload('proof.pdf'), original_filename='proof.pdf')
    assert a.file.name != b.file.name and '\\' not in a.file.name and 'proof' not in a.file.name
    for name in ['../escape.pdf', '/absolute.pdf', 'C:\\escape.pdf']:
        from django.core.exceptions import SuspiciousFileOperation
        with pytest.raises(SuspiciousFileOperation):
            private_document_storage().open(name)
    a.file.name = '../escape.pdf'
    a.save(update_fields=['file'])
    assert client(env, 'owner').get(url(env, 'provider', a)).status_code == 404


@pytest.mark.parametrize('kind', ['provider', 'organization', 'credential'])
def test_missing_document_returns_safe_404(env, kind):
    doc = env['docs'][kind]
    field = doc.document if kind == 'credential' else doc.file
    field.storage.delete(field.name)  # synthetic isolated file only
    response = client(env, 'manager').get(url(env, kind))
    assert response.status_code == 404 and 'private' not in str(response.data)


@pytest.mark.parametrize('prefix', ['provider_docs', 'organization_docs', 'org_credentials'])
def test_old_media_paths_blocked_even_for_authenticated_owner(env, settings, prefix):
    target = Path(settings.MEDIA_ROOT) / prefix / 'old.pdf'
    target.parent.mkdir(parents=True)
    target.write_bytes(PDF)
    for role in ['anonymous', 'owner', 'manager', 'admin']:
        assert client(env, role).get(f'/media/{prefix}/old.pdf').status_code == 404
    assert target.read_bytes() == PDF


def test_public_avatar_still_served_and_nonstandard_sensitive_reference_denied(env, settings):
    root = Path(settings.MEDIA_ROOT)
    root.mkdir()
    (root / 'avatar.png').write_bytes(b'public avatar')
    response = client(env, 'anonymous').get('/media/avatar.png')
    assert response.status_code == 200 and b''.join(response.streaming_content) == b'public avatar'
    doc = env['docs']['provider']
    doc.file.name = 'unusual.pdf'
    doc.save(update_fields=['file'])
    (root / 'unusual.pdf').write_bytes(PDF)
    assert client(env, 'anonymous').get('/media/unusual.pdf').status_code == 404


def test_legacy_media_aliases_cannot_bypass_reference_denial(env, settings):
    doc = env['docs']['provider']
    doc.file.name = 'alternate\\license.pdf'
    doc.save(update_fields=['file'])
    target = Path(settings.MEDIA_ROOT) / 'alternate' / 'license.pdf'
    target.parent.mkdir(parents=True)
    target.write_bytes(PDF)
    for path in ['alternate/license.pdf', 'alternate/LICENSE.PDF']:
        assert client(env, 'anonymous').get(f'/media/{path}').status_code == 404


def test_legacy_copy_dry_run_checksum_idempotency_and_metadata_preservation(env, settings):
    doc = env['docs']['provider']
    doc.file.name = 'provider_docs/old.pdf'
    doc.status = 'APPROVED'
    doc.save(update_fields=['file', 'status'])
    source = Path(settings.MEDIA_ROOT) / doc.file.name
    source.parent.mkdir(parents=True)
    source.write_bytes(PDF)
    before = ProviderDocument.objects.values().get(pk=doc.pk)
    out = io.StringIO()
    call_command('copy_private_verification_documents', stdout=out)
    assert 'pending=1' in out.getvalue() and not doc.file.storage.exists(doc.file.name)
    call_command('copy_private_verification_documents', apply=True, stdout=io.StringIO())
    assert source.read_bytes() == PDF
    assert b''.join(client(env, 'owner').get(url(env, 'provider')).streaming_content) == PDF
    out = io.StringIO()
    call_command('copy_private_verification_documents', apply=True, stdout=out)
    assert 'copied=0' in out.getvalue()
    assert ProviderDocument.objects.values().get(pk=doc.pk) == before
    source.write_bytes(b'conflicting source')
    with pytest.raises(CommandError, match='conflict'):
        call_command('copy_private_verification_documents', apply=True)
    assert source.read_bytes() == b'conflicting source'


def test_missing_legacy_file_is_reported_without_record_mutation(env):
    doc = env['docs']['organization']
    doc.file.name = 'organization_docs/missing.pdf'
    doc.save(update_fields=['file'])
    out = io.StringIO()
    with pytest.raises(CommandError, match='Missing referenced'):
        call_command('copy_private_verification_documents', apply=True, stderr=out, stdout=io.StringIO())
    assert str(doc.pk) in out.getvalue()
    doc.refresh_from_db()
    assert doc.file.name == 'organization_docs/missing.pdf'


@pytest.mark.parametrize('parent', ['MEDIA_ROOT', 'STATIC_ROOT', 'frontend'])
def test_private_root_must_be_outside_public_directories(settings, parent):
    location = str(settings.BASE_DIR.parent / 'frontend') if parent == 'frontend' else getattr(settings, parent)
    settings.STORAGES = {**settings.STORAGES, 'private_documents': {'BACKEND': 'config.private_documents.PrivateDocumentStorage', 'OPTIONS': {'location': location}}}
    with pytest.raises(ImproperlyConfigured, match='separate'):
        validate_private_storage_configuration()


@pytest.mark.parametrize('configured,persistent,allowed', [(False, False, False), (True, False, False), (False, True, False), (True, True, True)])
def test_production_explicit_persistent_private_storage_required(settings, configured, persistent, allowed):
    settings.PRIVATE_DOCUMENT_PRODUCTION = True
    settings.PRIVATE_DOCUMENT_STORAGE_CONFIGURED = configured
    settings.PRIVATE_DOCUMENT_STORAGE_PERSISTENT = persistent
    if allowed:
        validate_private_storage_configuration()
    else:
        with pytest.raises(ImproperlyConfigured, match='Production requires'):
            validate_private_storage_configuration()


def test_real_jwt_authentication_required(env):
    from rest_framework_simplejwt.tokens import AccessToken
    token = AccessToken.for_user(env['users']['owner'])
    authenticated = APIClient()
    authenticated.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    response = authenticated.get(url(env, 'provider'))
    assert response.status_code == 200 and b''.join(response.streaming_content) == PDF
    authenticated.credentials(HTTP_AUTHORIZATION='Bearer invalid')
    response = authenticated.get(url(env, 'provider'))
    assert response.status_code == 401 and response['Cache-Control'] == 'no-store'


def test_own_document_history_access_does_not_grant_revoked_provider_operations(env):
    provider = env['provider']
    provider.application_status = 'APPROVED'
    provider.save(update_fields=['application_status'])
    endpoint = f"/api/v1/organizations/{env['org'].pk}/providers/{provider.pk}/documents/"
    response = client(env, 'owner').get(endpoint)
    assert response.status_code == 200 and response.data[0]['id'] == str(env['docs']['provider'].pk)
    assert not provider.is_operationally_active
    assert client(env, 'owner').get(endpoint.replace('documents/', 'services/')).status_code in [403, 404]
    response = client(env, 'owner').post(endpoint, {'file': upload(), 'document_type': 'OTHER', 'original_filename': 'proof.pdf'}, format='multipart')
    assert response.status_code == 403 and provider.documents.count() == 1


def test_production_module_refuses_missing_storage_configuration(production_environment):
    import os
    import subprocess
    import sys
    variables = {**production_environment, 'SECRET_KEY': 'f024-configuration-test-only-9374' * 3,
                 'ALLOWED_HOSTS': 'localhost', 'PRIVATE_DOCUMENT_ROOT': '',
                 'PRIVATE_DOCUMENT_STORAGE_BACKEND': '', 'PRIVATE_DOCUMENT_STORAGE_PERSISTENT': ''}
    result = subprocess.run([sys.executable, '-c',
        "import os; os.environ['DJANGO_SETTINGS_MODULE']='config.settings.production'; import django; django.setup()"],
        env=variables, cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
    assert result.returncode != 0 and 'private_documents storage alias' in result.stderr


def test_production_module_accepts_explicit_private_persistent_configuration(tmp_path, production_environment):
    import json
    import os
    import subprocess
    import sys
    variables = {**production_environment, 'SECRET_KEY': 'f024-configuration-test-only-9374' * 3,
                 'ALLOWED_HOSTS': 'localhost', 'PRIVATE_DOCUMENT_STORAGE_BACKEND': 'config.private_documents.PrivateDocumentStorage',
                 'PRIVATE_DOCUMENT_STORAGE_OPTIONS': json.dumps({'location': str(tmp_path / 'persistent')}),
                 'PRIVATE_DOCUMENT_STORAGE_PERSISTENT': 'true'}
    result = subprocess.run([sys.executable, '-c',
        "import os; os.environ['DJANGO_SETTINGS_MODULE']='config.settings.production'; import django; django.setup()"],
        env=variables, cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_public_filesystem_backend_cannot_be_reused_for_private_documents(settings):
    settings.STORAGES = {**settings.STORAGES, 'private_documents': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}}
    with pytest.raises(ImproperlyConfigured, match='never public'):
        validate_private_storage_configuration()
