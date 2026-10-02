from rest_framework.throttling import AnonRateThrottle


class PasswordResetAnonRateThrottle(AnonRateThrottle):
    """
    Throttles password reset request attempts by IP address to prevent email spam,
    account enumeration, and abuse. Uses the 'password_reset' scope (5/hour).
    """
    scope = 'password_reset'
