from slowapi import Limiter


def _get_real_ip(request):
    # Reuse the single, trust-gated implementation (see audit 3.2 and
    # dependencies.get_client_ip) instead of duplicating XFF parsing here.
    from .dependencies import get_client_ip
    return get_client_ip(request)


limiter = Limiter(key_func=_get_real_ip, default_limits=["300/minute"])
