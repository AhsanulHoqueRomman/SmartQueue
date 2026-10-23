from datetime import datetime, time, timezone as datetime_timezone
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership, OrganizationOperatingHours
from apps.organizations.operating_hours import organization_hours_status, update_organization_hours
from apps.organizations.serializers import OrganizationSerializer

pytestmark = pytest.mark.django_db


def row(day, opening=time(9), closing=time(20), closed=False):
    return SimpleNamespace(day_of_week=day, open_time=opening, close_time=closing, is_closed=closed)


def calculate(rows, value):
    return organization_hours_status(rows, now=datetime.fromisoformat(value).replace(tzinfo=ZoneInfo('Asia/Dhaka')))


@pytest.mark.parametrize('hour,expected', [(8, False), (9, True), (12, True), (20, False), (21, False)])
def test_normal_boundaries(hour, expected):
    result = calculate([row(0), row(1)], f'2026-10-05T{hour:02}:00:00')
    state = result['current_status']
    assert state['is_open_now'] is expected
    assert state['status_label'] == ('Open Now' if expected else 'Closed Now')
    if hour == 8:
        assert state['status_detail'] == 'Opens today at 9:00 AM'
    elif expected:
        assert state['status_detail'] == 'Closes at 8:00 PM'
    else:
        assert state['status_detail'] == 'Opens tomorrow at 9:00 AM'


def test_closed_days_and_next_valid_period():
    rows = [row(0, closed=True), row(1, closed=True), row(2, opening=None), row(3)]
    state = calculate(rows, '2026-10-05T10:00:00')['current_status']
    assert state['is_open_now'] is False
    assert state['status_detail'] == 'Opens on Thursday at 9:00 AM'


def test_week_wraparound_and_same_day_next_week():
    state = calculate([row(0), row(6, closed=True)], '2026-10-11T10:00:00')['current_status']
    assert state['status_detail'] == 'Opens tomorrow at 9:00 AM'
    state = calculate([row(0)], '2026-10-05T21:00:00')['current_status']
    assert state['next_opens_at'] == '2026-10-12T09:00:00+06:00'


@pytest.mark.parametrize('rows', [[], [row(0, opening=None)], [row(0, closing=None)], [row(0, opening=time(20))]])
def test_unknown_hours_never_fake_open(rows):
    result = calculate(rows, '2026-10-05T12:00:00')
    assert result['current_status']['is_open_now'] is None
    assert result['current_status']['status_label'] == 'Hours unavailable'
    assert result['today_hours']['is_open'] is None
    assert 'Standard Hours' not in result['today_hours']['text']


@override_settings(TIME_ZONE='Asia/Dhaka')
def test_project_timezone_ignores_utc_day_and_activated_timezone():
    # Sunday UTC is already Monday 00:30 in Dhaka.
    instant = datetime(2026, 10, 4, 18, 30, tzinfo=datetime_timezone.utc)
    with timezone.override('America/New_York'):
        state = organization_hours_status([row(0, time(0), time(2))], now=instant)
    assert state['today_hours']['weekday'] == 0
    assert state['current_status']['is_open_now'] is True


@pytest.mark.parametrize('instant,expected', [
    ('2026-10-05T20:00:00', True), ('2026-10-06T01:00:00', True), ('2026-10-06T02:00:00', False),
])
def test_overnight_hours(instant, expected):
    state = calculate([row(0, time(20), time(2)), row(1)], instant)['current_status']
    assert state['is_open_now'] is expected
    if expected:
        assert state['closes_at'] == '2026-10-06T02:00:00+06:00'


def test_overnight_carryover_with_missing_today_and_explicit_closed_override():
    overnight = row(0, time(20), time(2))
    assert calculate([overnight], '2026-10-06T01:00:00')['current_status']['is_open_now'] is True
    assert calculate([overnight, row(1, closed=True)], '2026-10-06T01:00:00')['current_status']['is_open_now'] is False


def test_overnight_closed_day_closing_detail_and_incomplete_day():
    overnight = row(0, time(20), time(2))
    state = calculate([overnight, row(1, closed=True)], '2026-10-05T21:00:00')['current_status']
    assert state['closes_at'] == '2026-10-06T00:00:00+06:00'
    state = calculate([overnight, row(1, opening=None)], '2026-10-06T01:00:00')['current_status']
    assert state['status_label'] == 'Hours unavailable'


@pytest.fixture
def setup():
    org = Organization.objects.create(name='Hours', slug='hours', verification_status='APPROVED')
    other = Organization.objects.create(name='Other', slug='other-hours', verification_status='APPROVED')
    manager = User.objects.create_user(email='manager@hours.test')
    OrganizationMembership.objects.create(user=manager, organization=org, role='MANAGER')
    client = APIClient()
    client.force_authenticate(manager)
    return org, other, client


def test_manager_write_and_weekly_read_compatibility(setup):
    org, _, client = setup
    path = f'/api/v1/organizations/{org.id}/operating-hours/'
    response = client.put(path, {'hours': [
        {'day_of_week': 0, 'open_time': '20:00:00', 'close_time': '02:00:00'},
        {'day_of_week': 1, 'is_closed': True, 'open_time': '09:00:00', 'close_time': '20:00:00'},
    ]}, format='json')
    assert response.status_code == 200
    assert response.data[0]['open_time'] == '20:00:00'
    assert response.data[1]['is_closed'] is True
    assert response.data[1]['open_time'] is None
    assert set(response.data[0]) == {'id', 'day_of_week', 'day_name', 'open_time', 'close_time', 'is_closed'}
    assert APIClient().get(path).data == response.data
    with patch('django.utils.timezone.now', return_value=datetime(2026, 10, 5, 21, tzinfo=ZoneInfo('Asia/Dhaka'))):
        detail = APIClient().get(f'/api/v1/organizations/{org.id}/').data
    assert detail['current_status']['status_label'] == 'Open Now'
    assert len(detail['operating_hours']) == 2
    assert detail['today_hours']['weekday'] == 0


def test_cross_org_write_denied(setup):
    _, other, client = setup
    assert client.put(f'/api/v1/organizations/{other.id}/operating-hours/', [
        {'day_of_week': 0, 'is_closed': True},
    ], format='json').status_code == 403
    assert not other.operating_hours.exists()


@pytest.mark.parametrize('invalid', [
    {'day_of_week': 7, 'is_closed': True}, {'day_of_week': -1, 'is_closed': True},
    {'day_of_week': 1, 'open_time': 'bad', 'close_time': '20:00'},
    {'day_of_week': 1, 'open_time': '09:00'},
    {'day_of_week': 1, 'open_time': '09:00', 'close_time': '09:00'},
    {'day_of_week': 1, 'is_closed': 'invalid'}, {},
])
def test_invalid_batch_does_not_partially_write(setup, invalid):
    org, _, client = setup
    old = OrganizationOperatingHours.objects.create(organization=org, day_of_week=0, open_time=time(8), close_time=time(18))
    response = client.put(f'/api/v1/organizations/{org.id}/operating-hours/', [
        {'day_of_week': 0, 'open_time': '09:00', 'close_time': '20:00'}, invalid,
    ], format='json')
    assert response.status_code == 400
    old.refresh_from_db()
    assert old.open_time == time(8)
    assert org.operating_hours.count() == 1


def test_duplicate_weekday_rejected(setup):
    org, _, client = setup
    response = client.post(f'/api/v1/organizations/{org.id}/operating-hours/', [
        {'day_of_week': 0, 'is_closed': True}, {'day_of_week': 0, 'is_closed': True},
    ], format='json')
    assert response.status_code == 400
    assert not org.operating_hours.exists()


def test_database_failure_rolls_back_whole_batch(setup):
    org = setup[0]
    actual = OrganizationOperatingHours.objects.update_or_create
    def write(**kwargs):
        if kwargs['day_of_week'] == 1:
            raise RuntimeError('simulated write failure')
        return actual(**kwargs)
    with patch.object(OrganizationOperatingHours.objects, 'update_or_create', side_effect=write):
        with pytest.raises(RuntimeError):
            update_organization_hours(organization=org, rows=[
                {'day_of_week': 0, 'is_closed': True}, {'day_of_week': 1, 'is_closed': True},
            ])
    assert not org.operating_hours.exists()


def test_prefetched_hours_reused_for_all_status_fields(setup, django_assert_num_queries):
    org = setup[0]
    OrganizationOperatingHours.objects.create(organization=org, day_of_week=0, open_time=time(9), close_time=time(20))
    Organization.objects.create(name='Second', slug='second-hours', verification_status='APPROVED')
    serializer = OrganizationSerializer()
    with django_assert_num_queries(2):
        for organization in Organization.objects.prefetch_related('operating_hours'):
            serializer.get_operating_hours(organization)
            serializer.get_today_hours(organization)
            serializer.get_current_status(organization)
