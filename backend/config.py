from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # extra="ignore" prevents typos in .env from being silently absorbed as
    # arbitrary model attributes (M-4). "forbid" is stricter but can conflict
    # with deployment-platform-injected env vars, so "ignore" is the safe default.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = ""
    JWT_SECRET: str = "change-me-in-production"
    JWT_SECRET_V1: str = ""                          # rotation: old key, verify-only
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    API_PREFIX: str = "/v1"                          # used for cookie paths (L-2)

    # Only trust X-Forwarded-For when confirmed behind a stripping reverse proxy.
    # Defaults to False (trust request.client.host) — see audit 3.2.
    TRUST_PROXY_HEADERS: bool = False

    # OTP — email uses Brevo API, SMS uses Termii (Nigeria) or Brevo SMS
    # Set EMAIL_OTP_PROVIDER and SMS_OTP_PROVIDER independently.
    # Legacy OTP_PROVIDER is a fallback for both if the split vars are unset.
    OTP_PROVIDER: str = "console"                    # "console" | "brevo" | "termii"
    EMAIL_OTP_PROVIDER: str = ""                     # overrides OTP_PROVIDER for email
    SMS_OTP_PROVIDER: str = ""                       # overrides OTP_PROVIDER for sms
    # Brevo (email + optionally SMS)
    BREVO_API_KEY: str = ""
    BREVO_SENDER: str = ""
    # Termii (SMS — recommended for Nigerian numbers)
    TERMII_API_KEY: str = ""
    TERMII_SENDER: str = "REACH"                     # 11-char max alphanumeric
    ADMIN_BACKUP_EMAIL: str = ""
    ADMIN_OTP_CC_ENABLED: bool = False               # guarded by startup guard in main.py

    # Tokens
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # Redis (optional — for rate-limit persistence across restarts)
    REDIS_URL: str = ""

    # Optional
    SENTRY_DSN: str = ""
    FRONTEND_URL: str = ""                           # required in production (M-11)
    SESSION_INACTIVITY_HOURS: int = 168              # 7 days

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def refresh_cookie_path(self) -> str:
        return f"{self.API_PREFIX}/auth/refresh"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
