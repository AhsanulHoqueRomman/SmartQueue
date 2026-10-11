"""Private verification files: storage, validation and safe attachment responses."""
import io
import re
import uuid
from pathlib import Path, PurePosixPath

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, SuspiciousFileOperation, ValidationError
from django.core.files.storage import FileSystemStorage, storages
from django.http import FileResponse, Http404
from django.utils.module_loading import import_string
from PIL import Image, UnidentifiedImageError

MAX_VERIFICATION_BYTES = 5 * 1024 * 1024
CONTENT_TYPES = {'.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}
LEGACY_PREFIXES = ('provider_docs', 'organization_docs', 'org_credentials')


def safe_filename(name):
    name = str(name or '').replace('\\', '/').rsplit('/', 1)[-1]
    return ''.join(c for c in name if c.isprintable() and c not in '\";')[:255] or 'document'


def validate_verification_file(file):
    """Bounded signature/content inspection; never trust the client MIME alone."""
    ext = Path(file.name).suffix.lower()
    if ext not in CONTENT_TYPES:
        raise ValidationError('Allowed formats: PDF, JPG, JPEG and PNG.')
    if not file.size or file.size > MAX_VERIFICATION_BYTES:
        raise ValidationError('Upload a nonempty file no larger than 5 MB.')
    position = file.tell()
    try:
        file.seek(0)
        data = file.read(MAX_VERIFICATION_BYTES + 1)
        if not data or len(data) > MAX_VERIFICATION_BYTES:
            raise ValidationError('Upload a nonempty file no larger than 5 MB.')
        supplied_type = getattr(file, 'content_type', None)
        if supplied_type and supplied_type not in (CONTENT_TYPES[ext], 'application/octet-stream'):
            raise ValidationError('File content type does not match its format.')
        if ext == '.pdf':
            valid = bool(re.match(rb'%PDF-1\.[0-9]|%PDF-2\.0', data)) and b'%%EOF' in data[-1024:]
            if not valid:
                raise ValidationError('Upload a valid PDF document.')
        else:
            try:
                with Image.open(io.BytesIO(data)) as image:
                    if image.format != ('PNG' if ext == '.png' else 'JPEG'):
                        raise ValidationError('File content does not match its extension.')
                    image.verify()
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
                raise ValidationError('Upload a valid JPG, JPEG or PNG image.') from exc
    finally:
        file.seek(position)


def validate_private_storage_configuration():
    config = settings.STORAGES.get('private_documents', {})
    if not config.get('BACKEND'):
        raise ImproperlyConfigured('Configure the private_documents storage alias.')
    backend = import_string(config['BACKEND'])
    local = issubclass(backend, FileSystemStorage)
    if local and not issubclass(backend, PrivateDocumentStorage):
        raise ImproperlyConfigured('Filesystem verification storage must use PrivateDocumentStorage, never public default storage.')
    if local:
        root = Path(config.get('OPTIONS', {}).get('location', ''))
        if not root.is_absolute():
            raise ImproperlyConfigured('Private document storage requires an absolute filesystem root.')
        root = root.resolve()
        public_roots = [Path(settings.MEDIA_ROOT), Path(settings.STATIC_ROOT), settings.BASE_DIR.parent / 'frontend']
        for public in public_roots:
            public = public.resolve()
            if root == public or root.is_relative_to(public) or public.is_relative_to(root):
                raise ImproperlyConfigured('Private document storage must be separate from public media/static/frontend roots.')
    if getattr(settings, 'PRIVATE_DOCUMENT_PRODUCTION', False):
        if not getattr(settings, 'PRIVATE_DOCUMENT_STORAGE_CONFIGURED', False) or not settings.PRIVATE_DOCUMENT_STORAGE_PERSISTENT:
            raise ImproperlyConfigured('Production requires explicitly configured persistent private document storage and private serving rules.')


class PrivateDocumentStorage(FileSystemStorage):
    def __init__(self, *args, **kwargs):
        validate_private_storage_configuration()
        kwargs.setdefault('file_permissions_mode', 0o600)
        kwargs.setdefault('directory_permissions_mode', 0o700)
        super().__init__(*args, **kwargs)

    def url(self, name):
        raise ValueError('Private documents have no public URL.')

    @property
    def location(self):
        # Read the alias options each time so override_settings isolates test files.
        validate_private_storage_configuration()
        return str(Path(settings.STORAGES['private_documents']['OPTIONS']['location']).resolve())

    def path(self, name):
        result = super().path(name)
        if not Path(result).resolve().is_relative_to(Path(self.location).resolve()):
            raise SuspiciousFileOperation('Unsafe private document path.')
        return result


def private_document_storage():
    validate_private_storage_configuration()
    return storages['private_documents']


def verification_upload_path(instance, filename):
    prefix = {'ProviderDocument': 'provider_docs', 'OrganizationDocument': 'organization_docs',
              'OrganizationCredential': 'org_credentials'}[instance.__class__.__name__]
    return f'{prefix}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


def checked_storage_name(name):
    name = str(name).replace('\\', '/')
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or ':' in name or '\x00' in name:
        raise SuspiciousFileOperation('Unsafe document reference.')
    return name


def document_response(field, filename):
    try:
        name = checked_storage_name(field.name)
        stream = field.storage.open(name, 'rb')
    except (OSError, SuspiciousFileOperation) as exc:
        raise Http404('Document file is unavailable. Contact your organization.') from exc
    # Legacy unsupported files remain downloadable as opaque, non-executable attachments.
    extension = Path(name).suffix.lower()
    attachment_name = safe_filename(filename)
    safe_extension = extension if extension in CONTENT_TYPES else '.bin'
    if Path(attachment_name).suffix.lower() != safe_extension:
        attachment_name = f'{Path(attachment_name).stem}{safe_extension}'
    response = FileResponse(stream, as_attachment=True, filename=attachment_name,
                            content_type=CONTENT_TYPES.get(extension, 'application/octet-stream'))
    response['Cache-Control'] = 'no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response
