from rest_framework.throttling import SimpleRateThrottle


class ContactRateThrottle(SimpleRateThrottle):
    """
    Custom rate throttle for the public Contact Us endpoint.
    Restricts request frequency to protect against basic spam and abuse.
    """
    scope = 'contact'

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)

        return self.cache_format % {
            'scope': self.scope,
            'ident': ident,
        }
