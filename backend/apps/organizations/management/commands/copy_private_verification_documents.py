"""Owner-approved legacy cutover helper: dry-run by default; never deletes files."""
import hashlib
from pathlib import Path
from django.conf import settings
from django.core.files import File
from django.core.exceptions import SuspiciousFileOperation
from django.core.management.base import BaseCommand, CommandError
from config.private_documents import checked_storage_name, private_document_storage, LEGACY_PREFIXES
from apps.organizations.models import OrganizationDocument, OrganizationCredential
from apps.providers.models import ProviderDocument


def digest(stream):
    result = hashlib.sha256()
    for chunk in iter(lambda: stream.read(65536), b''):
        result.update(chunk)
    return result.digest()


class Command(BaseCommand):
    help = 'Inventory/copy referenced legacy verification files into private storage. No database writes or public-file deletion.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Copy only after owner approval, with application writers stopped.')

    def handle(self, *args, **options):
        storage = private_document_storage()
        root = Path(settings.MEDIA_ROOT).resolve()
        missing = copied = ready = pending = 0
        for model, field in [(ProviderDocument, 'file'), (OrganizationDocument, 'file'), (OrganizationCredential, 'document')]:
            for pk, raw_name in model.objects.exclude(**{field: ''}).exclude(**{field: None}).values_list('pk', field):
                try:
                    name = checked_storage_name(raw_name)
                    source = (root / name).resolve()
                    if not source.is_relative_to(root):
                        raise ValueError('Legacy reference escapes MEDIA_ROOT.')
                    exists = storage.exists(name)
                    if not source.is_file():
                        if exists:
                            ready += 1
                        else:
                            missing += 1
                            self.stderr.write(f'Missing file: {model.__name__} record {pk}')
                        continue
                    with source.open('rb') as stream:
                        expected = digest(stream)
                    if exists:
                        with storage.open(name, 'rb') as stream:
                            if digest(stream) != expected:
                                raise CommandError(f'Private-copy conflict: {model.__name__} record {pk}. No overwrite performed.')
                        ready += 1
                        continue
                    pending += 1
                    if not options['apply']:
                        continue
                    # Keep database names/ownership/status unchanged. Never overwrite.
                    if not model.objects.filter(pk=pk, **{field: raw_name}).exists():
                        raise CommandError('Reference changed during cutover. Stop application writers and retry.')
                    with source.open('rb') as stream:
                        saved = storage.save(name, File(stream))
                    if saved != name:
                        raise CommandError('Concurrent private-file collision. Stop writers; inspect the private copy before retrying.')
                    with storage.open(name, 'rb') as stream:
                        if digest(stream) != expected:
                            raise CommandError('Copy checksum mismatch; legacy source retained.')
                    if not model.objects.filter(pk=pk, **{field: raw_name}).exists():
                        raise CommandError('Reference changed during cutover; legacy source retained.')
                    copied += 1
                except (OSError, ValueError, SuspiciousFileOperation) as exc:
                    raise CommandError(f'Unsafe or unreadable reference in {model.__name__} record {pk}; no source removed.') from exc
        legacy_files = sum(sum(p.is_file() for p in (root / prefix).rglob('*')) for prefix in LEGACY_PREFIXES)
        self.stdout.write(f'apply={options["apply"]} ready={ready} pending={pending} copied={copied} missing={missing} legacy_files_retained={legacy_files}')
        if missing:
            raise CommandError('Missing referenced files require owner review. Existing records and source files were preserved.')
