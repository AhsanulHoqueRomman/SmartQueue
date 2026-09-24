from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ContactMessageSerializer
from .throttling import ContactRateThrottle


class ContactMessageCreateView(APIView):
    """
    Public API endpoint to submit a Contact Us inquiry.
    Supports both anonymous visitors and authenticated customers.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ContactRateThrottle]
    serializer_class = ContactMessageSerializer

    @extend_schema(
        request=ContactMessageSerializer,
        responses={
            201: ContactMessageSerializer,
            400: OpenApiResponse(description="Validation Error"),
            429: OpenApiResponse(description="Too Many Requests"),
        },
        summary="Submit a public Contact Us inquiry"
    )
    def post(self, request):
        serializer = ContactMessageSerializer(data=request.data)
        if serializer.is_valid():
            contact_message = serializer.save()
            return Response(
                ContactMessageSerializer(contact_message).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
