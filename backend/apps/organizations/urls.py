from django.urls import path
from .views import (
    OrganizationListCreateView,
    OrganizationDetailView,
    OrganizationMemberListAddView,
    OrganizationMemberDetailUpdateView,
    ManagerVerificationSubmitView,
    OrganizationDocumentListUploadView,
    OrganizationDocumentDetailDeleteView,
    AdminOrganizationVerificationQueueView,
    AdminOrganizationStartReviewView,
    AdminOrganizationApproveView,
    AdminOrganizationRejectView,
    AdminOrganizationSuspendView,
    AdminOrganizationUnsuspendView,
)

app_name = 'organizations'

urlpatterns = [
    path('', OrganizationListCreateView.as_view(), name='organization_list_create'),
    path('admin/verification/', AdminOrganizationVerificationQueueView.as_view(), name='admin_verification_queue'),
    path('<uuid:organization_id>/', OrganizationDetailView.as_view(), name='organization_detail'),
    path('<uuid:organization_id>/verification/submit/', ManagerVerificationSubmitView.as_view(), name='verification_submit'),
    path('<uuid:organization_id>/documents/', OrganizationDocumentListUploadView.as_view(), name='document_list_upload'),
    path('<uuid:organization_id>/documents/<uuid:document_id>/', OrganizationDocumentDetailDeleteView.as_view(), name='document_detail_delete'),
    path('<uuid:organization_id>/members/', OrganizationMemberListAddView.as_view(), name='member_list_add'),
    path('<uuid:organization_id>/members/<int:membership_id>/', OrganizationMemberDetailUpdateView.as_view(), name='member_detail_update'),
    path('<uuid:organization_id>/admin/start-review/', AdminOrganizationStartReviewView.as_view(), name='admin_start_review'),
    path('<uuid:organization_id>/admin/approve/', AdminOrganizationApproveView.as_view(), name='admin_approve'),
    path('<uuid:organization_id>/admin/reject/', AdminOrganizationRejectView.as_view(), name='admin_reject'),
    path('<uuid:organization_id>/admin/suspend/', AdminOrganizationSuspendView.as_view(), name='admin_suspend'),
    path('<uuid:organization_id>/admin/unsuspend/', AdminOrganizationUnsuspendView.as_view(), name='admin_unsuspend'),
]

