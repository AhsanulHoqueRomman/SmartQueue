from rest_framework.views import exception_handler
from rest_framework.exceptions import APIException
from rest_framework import status


class ApplicationError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'APPLICATION_ERROR'
    default_detail = 'An application error occurred.'

    def __init__(self, message=None, code=None, status_code=None, details=None):
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.default_code = code
        if message is not None:
            self.default_detail = message
        self.details = details or {}
        super().__init__(detail=message or self.default_detail, code=self.default_code)


class LastManagerProtectionException(ApplicationError):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'LAST_MANAGER_PROTECTION'
    default_detail = 'The organization must have at least one active manager.'


class DuplicateMembershipException(ApplicationError):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'DUPLICATE_MEMBERSHIP'
    default_detail = 'User is already a member of this organization.'


class InvalidRoleAssignmentException(ApplicationError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'INVALID_ROLE_ASSIGNMENT'
    default_detail = 'You do not have permission to assign this role.'


def custom_exception_handler(exc, context):
    """
    Standardized DRF Exception Handler formatting all API errors into:
    {
        "error": {
            "code": "ERROR_CODE",
            "message": "Human-readable message.",
            "details": {}
        }
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        error_code = getattr(exc, 'default_code', 'INVALID_REQUEST')
        if hasattr(exc, 'detail') and isinstance(exc.detail, dict) and 'code' in exc.detail:
            error_code = exc.detail['code']
            
        message = "An error occurred while processing your request."
        details = {}

        if isinstance(response.data, dict):
            if 'detail' in response.data:
                message = str(response.data['detail'])
            else:
                message = "Validation failed for the submitted data."
                details = response.data
        elif isinstance(response.data, list):
            message = "Validation errors occurred."
            details = {'non_field_errors': response.data}

        # Override code for custom ApplicationError subclasses
        if isinstance(exc, ApplicationError):
            error_code = exc.default_code
            message = str(exc.detail)
            details = getattr(exc, 'details', {})

        response.data = {
            'error': {
                'code': str(error_code).upper(),
                'message': message,
                'details': details
            }
        }

    return response
