import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
class TestUserModel:
    def test_create_user_successful(self):
        user = User.objects.create_user(
            email='testuser@example.com',
            password='StrongPassword123!',
            first_name='John',
            last_name='Doe',
            phone_number='01700000000'
        )
        assert user.email == 'testuser@example.com'
        assert user.check_password('StrongPassword123!') is True
        assert user.first_name == 'John'
        assert user.last_name == 'Doe'
        assert user.phone_number == '01700000000'
        assert user.is_active is True
        assert user.is_staff is False
        assert user.is_superuser is False

    def test_create_user_without_email_raises_error(self):
        with pytest.raises(ValueError, match='The Email field must be set'):
            User.objects.create_user(email='', password='StrongPassword123!')

    def test_email_is_normalized(self):
        user = User.objects.create_user(
            email='TESTUSER@EXAMPLE.COM',
            password='StrongPassword123!'
        )
        assert user.email == 'TESTUSER@example.com'

    def test_create_superuser_successful(self):
        admin_user = User.objects.create_superuser(
            email='admin@example.com',
            password='AdminPassword123!'
        )
        assert admin_user.email == 'admin@example.com'
        assert admin_user.is_staff is True
        assert admin_user.is_superuser is True
        assert admin_user.is_active is True

    def test_create_superuser_invalid_flags(self):
        with pytest.raises(ValueError, match='Superuser must have is_staff=True'):
            User.objects.create_superuser(
                email='admin1@example.com',
                password='AdminPassword123!',
                is_staff=False
            )
        with pytest.raises(ValueError, match='Superuser must have is_superuser=True'):
            User.objects.create_superuser(
                email='admin2@example.com',
                password='AdminPassword123!',
                is_superuser=False
            )

    def test_user_str_and_name_methods(self):
        user = User.objects.create_user(
            email='jane.doe@example.com',
            password='StrongPassword123!',
            first_name='Jane',
            last_name='Doe'
        )
        assert str(user) == 'jane.doe@example.com'
        assert user.get_full_name() == 'Jane Doe'
        assert user.get_short_name() == 'Jane'
