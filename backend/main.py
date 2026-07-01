"""REACH Election — FastAPI application entry point."""
import re
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import settings
from .database import engine, Base
from .limiter import limiter
from .models import (
    Campaign, Zone, PollingUnit, User, OTPSession, RefreshToken,
    InviteToken, Voter, VoterContact, MessageTemplate, MessagingSession,
    MessagingSessionAssignment, MessageSend, Broadcast, AuditLog,
    VoterImport, INECReferencePU,
)

from .routers.auth          import router as auth_router
from .routers.campaigns     import router as campaigns_router
from .routers.zones         import router as zones_router
from .routers.polling_units import router as pu_router
from .routers.invites       import router as invites_router
from .routers.voters        import router as voters_router
from .routers.templates     import router as templates_router
from .routers.sessions      import router as sessions_router
from .routers.dashboard     import router as dashboard_router
from .routers.users         import router as users_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("reach")

if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration()],
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

# Strips non-printable ASCII characters from log values to prevent log injection.
_UNSAFE_CHARS = re.compile(r"[^\x20-\x7e]")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Production startup guards — crash fast rather than run insecurely."""
    if settings.ENVIRONMENT == "production":
        # Guard 1: OTP provider must not be console
        if settings.OTP_PROVIDER == "console":
            raise RuntimeError("FATAL: OTP_PROVIDER=console is not allowed in production.")
        # Guard 2: JWT secret must be changed from default
        if settings.JWT_SECRET == "change-me-in-production":
            raise RuntimeError("FATAL: JWT_SECRET must be changed in production.")
        # Guard 3: Database URL must be set
        if not settings.DATABASE_URL:
            raise RuntimeError("FATAL: DATABASE_URL is required in production.")
        # Guard 4: ALLOWED_ORIGINS must not contain wildcard
        if "*" in settings.ALLOWED_ORIGINS:
            raise RuntimeError("FATAL: ALLOWED_ORIGINS must not contain '*' in production.")
        # Guard 5: ALLOWED_ORIGINS must be set
        if not settings.allowed_origins_list:
            raise RuntimeError("FATAL: ALLOWED_ORIGINS must contain at least one origin in production.")
        # Guard 6 (C-2/H-9): ADMIN_OTP_CC_ENABLED is a platform-wide master key
        if settings.ADMIN_OTP_CC_ENABLED:
            raise RuntimeError(
                "FATAL: ADMIN_OTP_CC_ENABLED must not be true in production. "
                "A compromised ADMIN_BACKUP_EMAIL gives login access to every user."
            )
        # Guard 7 (M-11): FRONTEND_URL must be set so invite links are valid
        if not settings.FRONTEND_URL:
            raise RuntimeError("FATAL: FRONTEND_URL must be set in production.")

    if settings.ENVIRONMENT == "development":
        Base.metadata.create_all(bind=engine)

    if settings.REDIS_URL:
        try:
            from redis import asyncio as aioredis
            rc = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=3)
            await rc.ping()
            app.state.redis = rc
            logger.info("Redis connected ✅")
        except Exception as e:
            logger.warning(f"Redis unavailable: {e}")
            app.state.redis = None
    else:
        app.state.redis = None

    yield

    if getattr(app.state, "redis", None):
        await app.state.redis.aclose()


app = FastAPI(
    title="REACH Election API",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# ── Rate limiting ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)


# ── Security headers ───────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"]  = "nosniff"
    response.headers["X-Frame-Options"]          = "DENY"
    response.headers["Referrer-Policy"]          = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]       = "camera=(), microphone=(), geolocation=()"
    response.headers["X-XSS-Protection"]         = "1; mode=block"
    if settings.ENVIRONMENT == "production":
        # M-6: includes preload directive for HSTS preload-list eligibility
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
    return response


# ── Request logger (M-7: sanitize path to prevent log injection) ───────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    t = time.monotonic()
    response = await call_next(request)
    ms = (time.monotonic() - t) * 1000
    safe_path = _UNSAFE_CHARS.sub("?", request.url.path)
    logger.info(f"{request.method} {safe_path} → {response.status_code} ({ms:.0f}ms)")
    return response


# ── Routes ────────────────────────────────────────────────────────────────────
PREFIX = settings.API_PREFIX
app.include_router(auth_router,      prefix=PREFIX)
app.include_router(campaigns_router, prefix=PREFIX)
app.include_router(zones_router,     prefix=PREFIX)
app.include_router(pu_router,        prefix=PREFIX)
app.include_router(invites_router,   prefix=PREFIX)
app.include_router(voters_router,    prefix=PREFIX)
app.include_router(templates_router, prefix=PREFIX)
app.include_router(sessions_router,  prefix=PREFIX)
app.include_router(dashboard_router, prefix=PREFIX)
app.include_router(users_router,     prefix=PREFIX)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    # H-7: env field removed — no information disclosure to unauthenticated callers.
    return {"status": "ok"}
