from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, OpenApiResponse

# pyrefly: ignore [missing-import]
from apps.organizations.models import Organization, OrganizationMembership
# pyrefly: ignore [missing-import]
from apps.organizations.permissions import IsOrganizationManager
from .models import Service
from .serializers import ServiceSerializer, ServiceCreateUpdateSerializer
from .services import ServiceService
from config.api import apply_list_query, list_response


from rest_framework.permissions import AllowAny, IsAuthenticated

def _is_org_manager_or_admin(user, organization_id):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return OrganizationMembership.objects.filter(
        user=user,
        organization_id=organization_id,
        role=OrganizationMembership.Role.MANAGER,
        is_active=True,
    ).exists()


class ServiceListCreateView(APIView):
    """
    GET  /api/v1/organizations/{organization_id}/services/
        - Managers/admins: all services in the organization.
        - Staff/provider/customer/public: active services only.

    POST /api/v1/organizations/{organization_id}/services/
        - Only MANAGER can create a new service.
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsOrganizationManager()]
        return [AllowAny()]

    @extend_schema(
        responses={200: ServiceSerializer(many=True)},
        summary="List services for an organization"
    )
    def get(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        if not _is_org_manager_or_admin(request.user, organization_id):
            if not (org.is_active and org.verification_status == Organization.VerificationStatus.APPROVED):
                return Response({'detail': 'Organization not found.'}, status=status.HTTP_404_NOT_FOUND)
            services = Service.objects.filter(organization=org, is_active=True)
        else:
            services = Service.objects.filter(organization=org)
        services = apply_list_query(
            services, request,
            filter_fields=('is_active',),
            search_fields=('name', 'description'),
            ordering_fields=('name', 'price', 'duration_minutes', 'created_at'),
            default_ordering=('name',),
        )
        response = list_response(services, ServiceSerializer, request)
        response.status_code = status.HTTP_200_OK
        return response

    @extend_schema(
        request=ServiceCreateUpdateSerializer,
        responses={
            201: ServiceSerializer,
            400: OpenApiResponse(description="Validation Error"),
            403: OpenApiResponse(description="Forbidden — Manager only"),
            409: OpenApiResponse(description="Duplicate service name"),
        },
        summary="Create a service (Manager only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id, is_active=True)
        serializer = ServiceCreateUpdateSerializer(data=request.data, context={'organization': org})
        if serializer.is_valid():
            service = ServiceService.create_service(
                organization=org,
                **serializer.validated_data
            )
            return Response(ServiceSerializer(service).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ServiceDetailView(APIView):
    """
    GET   /api/v1/organizations/{organization_id}/services/{service_id}/
    PATCH /api/v1/organizations/{organization_id}/services/{service_id}/
    DELETE /api/v1/organizations/{organization_id}/services/{service_id}/

    Tenant isolation enforced by scoping get_object_or_404 to organization.
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated(), IsOrganizationManager()]

    def _get_service(self, organization_id, service_id):
        org = get_object_or_404(Organization, id=organization_id, is_active=True)
        service = get_object_or_404(Service, id=service_id, organization=org)
        return service

    @extend_schema(
        responses={200: ServiceSerializer, 404: OpenApiResponse(description="Not Found")},
        summary="Retrieve a service"
    )
    def get(self, request, organization_id, service_id):
        service = self._get_service(organization_id, service_id)
        # Non-managers may only retrieve active services
        if not service.is_active and not _is_org_manager_or_admin(request.user, organization_id):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ServiceSerializer(service).data, status=status.HTTP_200_OK)

    @extend_schema(
        request=ServiceCreateUpdateSerializer,
        responses={
            200: ServiceSerializer,
            400: OpenApiResponse(description="Validation Error"),
            403: OpenApiResponse(description="Forbidden"),
            404: OpenApiResponse(description="Not Found"),
            409: OpenApiResponse(description="Duplicate service name"),
        },
        summary="Update a service (Manager only)"
    )
    def patch(self, request, organization_id, service_id):
        service = self._get_service(organization_id, service_id)
        serializer = ServiceCreateUpdateSerializer(service, data=request.data, partial=True, context={'organization': service.organization})
        if serializer.is_valid():
            updated = ServiceService.update_service(service=service, **serializer.validated_data)
            return Response(ServiceSerializer(updated).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        responses={
            204: OpenApiResponse(description="Deleted"),
            403: OpenApiResponse(description="Forbidden"),
            404: OpenApiResponse(description="Not Found"),
        },
        summary="Delete a service (Manager only)"
    )
    def delete(self, request, organization_id, service_id):
        service = self._get_service(organization_id, service_id)
        service.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Category Views
# ---------------------------------------------------------------------------

from .models import Category
from .serializers import CategorySerializer, CategoryCreateUpdateSerializer


class CategoryListCreateView(APIView):
    """
    GET  /api/v1/organizations/{organization_id}/categories/
        - Manager/Admin: all categories for organization.
        - Staff/Provider/Customer/Public: active categories only.

    POST /api/v1/organizations/{organization_id}/categories/
        - Manager only.
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsOrganizationManager()]
        return [AllowAny()]

    @extend_schema(
        responses={200: CategorySerializer(many=True)},
        summary="List categories for an organization"
    )
    def get(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id)
        if not _is_org_manager_or_admin(request.user, organization_id):
            if not (org.is_active and org.verification_status == Organization.VerificationStatus.APPROVED):
                return Response({'detail': 'Organization not found.'}, status=status.HTTP_404_NOT_FOUND)
            categories = Category.objects.filter(organization=org, is_active=True)
        else:
            categories = Category.objects.filter(organization=org)
        categories = apply_list_query(
            categories, request,
            filter_fields=('is_active',),
            search_fields=('name', 'description'),
            ordering_fields=('display_order', 'name', 'created_at'),
            default_ordering=('display_order', 'name'),
        )
        response = list_response(categories, CategorySerializer, request)
        response.status_code = status.HTTP_200_OK
        return response

    @extend_schema(
        request=CategoryCreateUpdateSerializer,
        responses={
            201: CategorySerializer,
            400: OpenApiResponse(description="Validation Error"),
            403: OpenApiResponse(description="Forbidden — Manager only"),
        },
        summary="Create a category (Manager only)"
    )
    def post(self, request, organization_id):
        org = get_object_or_404(Organization, id=organization_id, is_active=True)
        serializer = CategoryCreateUpdateSerializer(data=request.data, context={'organization': org})
        if serializer.is_valid():
            category = Category.objects.create(
                organization=org,
                **serializer.validated_data
            )
            return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CategoryDetailView(APIView):
    """
    GET    /api/v1/organizations/{organization_id}/categories/{category_id}/
    PATCH  /api/v1/organizations/{organization_id}/categories/{category_id}/
    DELETE /api/v1/organizations/{organization_id}/categories/{category_id}/
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated(), IsOrganizationManager()]

    def _get_category(self, organization_id, category_id):
        org = get_object_or_404(Organization, id=organization_id, is_active=True)
        category = get_object_or_404(Category, id=category_id, organization=org)
        return category

    @extend_schema(
        responses={200: CategorySerializer, 404: OpenApiResponse(description="Not Found")},
        summary="Retrieve a category"
    )
    def get(self, request, organization_id, category_id):
        category = self._get_category(organization_id, category_id)
        if not category.is_active and not _is_org_manager_or_admin(request.user, organization_id):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(CategorySerializer(category).data, status=status.HTTP_200_OK)

    @extend_schema(
        request=CategoryCreateUpdateSerializer,
        responses={
            200: CategorySerializer,
            400: OpenApiResponse(description="Validation Error"),
            403: OpenApiResponse(description="Forbidden"),
            404: OpenApiResponse(description="Not Found"),
        },
        summary="Update a category (Manager only)"
    )
    def patch(self, request, organization_id, category_id):
        category = self._get_category(organization_id, category_id)
        serializer = CategoryCreateUpdateSerializer(
            category, data=request.data, partial=True, context={'organization': category.organization}
        )
        if serializer.is_valid():
            for key, val in serializer.validated_data.items():
                setattr(category, key, val)
            category.save()
            return Response(CategorySerializer(category).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        responses={
            204: OpenApiResponse(description="Deleted"),
            400: OpenApiResponse(description="Cannot delete category with linked services"),
            403: OpenApiResponse(description="Forbidden"),
            404: OpenApiResponse(description="Not Found"),
        },
        summary="Delete a category (Manager only)"
    )
    def delete(self, request, organization_id, category_id):
        category = self._get_category(organization_id, category_id)
        if category.services.exists():
            return Response(
                {"detail": "Cannot delete category that has linked services. Deactivate it instead."},
                status=status.HTTP_400_BAD_REQUEST
            )
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

