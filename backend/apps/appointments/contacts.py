"""Booking contact validation and fallback; never writes to customer profiles."""
import re

from django.core.exceptions import ValidationError


def normalize_contact_name(value):
    if not isinstance(value, str) or not value.strip():
        raise ValidationError('Contact name cannot be empty.')
    value = value.strip()
    if len(value) > 300:
        raise ValidationError('Contact name cannot exceed 300 characters.')
    return value


def normalize_contact_phone(value):
    if not isinstance(value, str):
        raise ValidationError('Enter a valid Bangladesh mobile number.')
    value = value.strip()
    if not re.fullmatch(r'(?:01[3-9][0-9]{8}|\+8801[3-9][0-9]{8})', value):
        raise ValidationError('Enter a Bangladesh mobile number such as 01712345678 or +8801712345678.')
    return value


def resolve_booking_contact(customer, *, contact_name=None, contact_phone=None):
    name = normalize_contact_name(contact_name) if contact_name is not None else (
        customer.get_full_name().strip() or customer.email
    )[:300]
    # Existing callers may have missing/unvalidated profile phones. Do not impose
    # new profile validation or copy the walk-in email placeholder as a phone.
    existing_phone = (customer.phone_number or '').strip()
    phone = normalize_contact_phone(contact_phone) if contact_phone is not None else (
        existing_phone if existing_phone and '@' not in existing_phone else None
    )
    return name, phone
