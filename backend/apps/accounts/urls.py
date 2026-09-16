from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView,
    RegisterManagerView,
    RegisterProviderView,
    LoginView,
    LogoutView,
    CurrentUserView,
    ChangePasswordView,
)

app_name = 'accounts'

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('register/customer/', RegisterView.as_view(), name='register_customer'),
    path('register/manager/', RegisterManagerView.as_view(), name='register_manager'),
    path('register/provider/', RegisterProviderView.as_view(), name='register_provider'),
    path('login/', LoginView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', CurrentUserView.as_view(), name='current_user'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
]
