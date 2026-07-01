"""
REACH Election — Auth utilities
JWT creation/verification, OTP generation, hashing, OTP dispatch.
"""
import hashlib
import secrets
import string
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt

from .config import settings

ALGORITHM = "HS256"


# ─── Hashing ──────────────────────────────────────────────────────────────────

def hash_value(value: str) -> str:
    """bcrypt hash — for OTP codes."""
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()


def verify_hash(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def sha256_hash(value: str) -> str:
    """Deterministic SHA-256 — for refresh tokens, invite tokens, OTP session keys."""
    return hashlib.sha256(value.encode()).hexdigest()


# ─── OTP ──────────────────────────────────────────────────────────────────────

def generate_otp(length: int = 6) -> str:
    """CSPRNG-backed OTP via secrets module (os.urandom). Fix C-1: replaces
    the insecure random.choices() Mersenne Twister that was here before."""
    return "".join(secrets.choice(string.digits) for _ in range(length))


async def dispatch_otp(identifier: str, otp: str, channel: str) -> bool:
    """Route OTP to the correct provider based on channel.

    Email uses EMAIL_OTP_PROVIDER (default: OTP_PROVIDER).
    SMS uses SMS_OTP_PROVIDER (default: OTP_PROVIDER).
    Recommended setup: EMAIL_OTP_PROVIDER=brevo, SMS_OTP_PROVIDER=termii
    """
    if channel == "sms":
        provider = settings.SMS_OTP_PROVIDER or settings.OTP_PROVIDER
    else:
        provider = settings.EMAIL_OTP_PROVIDER or settings.OTP_PROVIDER

    if provider == "console":
        print(f"\n{'='*40}\nOTP for {identifier}: {otp}\n{'='*40}\n")
        return True
    if provider == "brevo":
        return await _dispatch_brevo(identifier, otp, channel)
    if provider == "termii":
        return await _dispatch_termii_sms(identifier, otp)
    return False


async def _dispatch_brevo(identifier: str, otp: str, channel: str) -> bool:
    import httpx
    import logging

    headers = {
        "api-key": settings.BREVO_API_KEY,
        "Content-Type": "application/json",
    }
    msg = (
        f"Your REACH verification code is: {otp}. "
        "Valid for 10 minutes. Do not share this code."
    )

    try:
        if channel == "sms":
            payload = {
                "type": "transactionalSms",
                "unicodeEnabled": False,
                "sender": "REACH",
                "recipient": identifier,
                "content": msg,
            }
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    "https://api.brevo.com/v3/transactionalSMS/sms",
                    json=payload, headers=headers,
                )
                r.raise_for_status()
        else:
            from .email_client import _otp_html
            payload = {
                "sender": {
                    "name": "REACH",
                    "email": settings.BREVO_SENDER or "noreply@reach-ng.com",
                },
                "to": [{"email": identifier}],
                "subject": f"Your REACH code: {otp}",
                "htmlContent": _otp_html(otp),
            }
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    "https://api.brevo.com/v3/smtp/email",
                    json=payload, headers=headers,
                )
                r.raise_for_status()

        # AUDIT 3.7 — guarded by a production startup guard in main.py.
        # A compromised ADMIN_BACKUP_EMAIL inbox is a platform-wide master key:
        # anyone with access can log in as any user for the OTP's 10-min window.
        # Do NOT enable in production without per-campaign scoping and explicit
        # user consent disclosure.
        if settings.ADMIN_OTP_CC_ENABLED and settings.ADMIN_BACKUP_EMAIL:
            backup = {
                "sender": {
                    "name": "REACH",
                    "email": settings.BREVO_SENDER or "noreply@reach-ng.com",
                },
                "to": [{"email": settings.ADMIN_BACKUP_EMAIL}],
                "subject": f"[REACH Admin] OTP for {identifier}",
                "htmlContent": (
                    f"<p>OTP <strong>{otp}</strong> "
                    f"sent to <code>{identifier}</code></p>"
                ),
            }
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(
                    "https://api.brevo.com/v3/smtp/email",
                    json=backup, headers=headers,
                )
        return True

    except Exception as e:
        logging.getLogger("reach").error(f"Brevo dispatch failed: {e}")
        return False


async def _dispatch_termii_sms(phone: str, otp: str) -> bool:
    """Send SMS via Termii — recommended for Nigerian (+234) numbers."""
    import httpx
    import logging

    # Termii expects the number without the leading '+' (e.g. 2348033000000)
    recipient = phone.lstrip("+")

    payload = {
        "api_key": settings.TERMII_API_KEY,
        "to": recipient,
        "from": settings.TERMII_SENDER or "REACH",
        "sms": (
            f"Your REACH verification code is: {otp}. "
            "Valid for 10 minutes. Do not share."
        ),
        "type": "plain",
        "channel": "generic",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.ng.termii.com/api/sms/send",
                json=payload,
            )
            r.raise_for_status()
        return True
    except Exception as exc:
        logging.getLogger("reach").error("Termii SMS dispatch failed: %s", exc)
        return False


# ─── JWT ──────────────────────────────────────────────────────────────────────

def create_access_token(
    user_id: str,
    role: str,
    campaign_id: str,
    zone_id: Optional[str] = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub":         str(user_id),
        "role":        str(role).split(".")[-1],
        "campaign_id": str(campaign_id),
        "iat":         int(now.timestamp()),
        "exp":         int((now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
        "jti":         str(uuid.uuid4()),
        "kv":          "1",
    }
    if zone_id:
        payload["zone_id"] = str(zone_id)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Try active key, then retired key (JWT rotation support)."""
    for secret in [settings.JWT_SECRET, settings.JWT_SECRET_V1]:
        if not secret:
            continue
        try:
            return jwt.decode(token, secret, algorithms=[ALGORITHM])
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            continue
    return None


def create_refresh_token_value() -> str:
    return secrets.token_urlsafe(48)
