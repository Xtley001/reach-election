from slowapi import Limiter
from .config import settings


def _get_real_ip(request):
    from .dependencies import get_client_ip
    return get_client_ip(request)


limiter = Limiter(
    key_func=_get_real_ip,
    default_limits=["300/minute"],
    # Persist counters in Redis when available so rate limits survive restarts
    # and are shared across multiple worker processes. Falls back to in-process
    # memory when REDIS_URL is not set.
    storage_uri=settings.REDIS_URL if settings.REDIS_URL else "memory://",
)
