from django.urls import path
from .views import (
    OrganizationListCreateView,
    OrganizationDetailView,
    OrganizationMemberListAddView,
    OrganizationMemberDetailUpdateView,
)

app_name = 'organizations'

urlpatterns = [
    path('', OrganizationListCreateView.as_view(), name='organization_list_create'),
    path('<uuid:organization_id>/', OrganizationDetailView.as_view(), name='organization_detail'),
    path('<uuid:organization_id>/members/', OrganizationMemberListAddView.as_view(), name='member_list_add'),
    path('<uuid:organization_id>/members/<int:membership_id>/', OrganizationMemberDetailUpdateView.as_view(), name='member_detail_update'),
]
