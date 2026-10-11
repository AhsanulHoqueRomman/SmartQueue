"""Object-scoped verification access, independent of the storage backend."""
from django.shortcuts import get_object_or_404
from django.urls import reverse
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework import serializers
from drf_spectacular.utils import extend_schema

from apps.audit.services import AuditService
from apps.providers.models import ProviderDocument
from config.private_documents import document_response
from .models import OrganizationDocument, OrganizationCredential, OrganizationMembership
from .permissions import IsSystemAdmin


def manager_or_admin(user, organization_id):
    # Reuse the established platform-verification permission, not a new role bypass.
    from types import SimpleNamespace
    return IsSystemAdmin().has_permission(SimpleNamespace(user=user), None) or OrganizationMembership.objects.filter(
        user=user, organization_id=organization_id, role='MANAGER', is_active=True).exists()


def provider_document_queryset(user, organization_id, provider_id):
    qs = ProviderDocument.objects.filter(provider_profile_id=provider_id,
        provider_profile__membership__organization_id=organization_id,
        provider_profile__membership__role='PROVIDER')
    if manager_or_admin(user, organization_id):
        return qs
    return qs.filter(provider_profile__membership__user=user)


def organization_document_queryset(model, user, organization_id):
    if not manager_or_admin(user, organization_id):
        raise PermissionDenied('Only authorized organization managers or platform reviewers may access verification documents.')
    return model.objects.filter(organization_id=organization_id)


def download_url(instance):
    if isinstance(instance, ProviderDocument):
        return reverse('providers:provider_document_download', kwargs={
            'organization_id': instance.provider_profile.membership.organization_id,
            'provider_id': instance.provider_profile_id, 'document_id': instance.pk})
    kind = 'credential_download' if isinstance(instance, OrganizationCredential) else 'document_download'
    key = 'credential_id' if kind == 'credential_download' else 'document_id'
    return reverse(f'organizations:{kind}', kwargs={'organization_id': instance.organization_id, key: instance.pk})


class VerificationDocumentFileField(serializers.FileField):
    """Multipart input and authenticated API-path output; never call storage.url()."""
    def to_representation(self, value):
        return download_url(value.instance) if value else None


class VerificationDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated]
    kind = None

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    @extend_schema(responses={(200, 'application/octet-stream'): bytes}, description='Authorized private attachment; no public storage URL.')
    def get(self, request, organization_id, document_id=None, provider_id=None, credential_id=None):
        if self.kind == 'provider':
            qs = provider_document_queryset(request.user, organization_id, provider_id)
            doc = get_object_or_404(qs, pk=document_id)
        else:
            model = OrganizationCredential if self.kind == 'credential' else OrganizationDocument
            qs = organization_document_queryset(model, request.user, organization_id)
            doc = get_object_or_404(qs, pk=credential_id or document_id)
        field = doc.document if self.kind == 'credential' else doc.file
        if not field:
            from django.http import Http404
            raise Http404('No document file is available.')
        response = document_response(field, getattr(doc, 'original_filename', '') or field.name)
        AuditService.record(action='VERIFICATION_DOCUMENT_DOWNLOADED', entity_type=doc.__class__.__name__,
                            entity_id=doc.pk, organization_id=organization_id, actor=request.user)
        return response
