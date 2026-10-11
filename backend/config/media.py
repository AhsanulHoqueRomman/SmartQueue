"""Development public media excludes every verification-file path."""
from pathlib import Path
from django.conf import settings
from django.http import Http404
from django.views.static import serve
from config.private_documents import checked_storage_name, LEGACY_PREFIXES


def public_media(request, path):
    if not settings.DEBUG:
        raise Http404()
    from apps.providers.models import ProviderDocument
    from apps.organizations.models import OrganizationDocument, OrganizationCredential
    from django.core.exceptions import SuspiciousFileOperation
    try:
        name = checked_storage_name(path)
    except SuspiciousFileOperation as exc:
        raise Http404() from exc
    resolved = (Path(settings.MEDIA_ROOT) / name).resolve()
    root = Path(settings.MEDIA_ROOT).resolve()
    if not resolved.is_relative_to(root):
        raise Http404()
    relative = resolved.relative_to(root).as_posix()
    if name.split('/')[0].lower() in LEGACY_PREFIXES or relative.split('/')[0].lower() in LEGACY_PREFIXES:
        raise Http404()
    # Also deny legacy references outside the conventional upload directories.
    for model, field in [(ProviderDocument, 'file'), (OrganizationDocument, 'file'), (OrganizationCredential, 'document')]:
        references = model.objects.exclude(**{field: ''}).exclude(**{field: None}).values_list(field, flat=True)
        for reference in references:
            try:
                protected = (root / checked_storage_name(reference)).resolve()
            except SuspiciousFileOperation:
                continue
            # Path equality also handles Windows case aliases and legacy backslashes.
            if protected == resolved:
                raise Http404()
    return serve(request, name, document_root=settings.MEDIA_ROOT)
