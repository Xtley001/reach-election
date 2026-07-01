"""REACH Election — Auth Router"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import User, UserRole, UserStatus, OTPSession, RefreshToken
from ..schemas import SendOTPRequest, VerifyOTPRequest
from ..auth import (
    generate_otp, hash_value, verify_hash, sha256_hash,
    dispatch_otp, create_access_token, decode_access_token,
    create_refresh_token_value,
)
from ..dependencies import get_current_user, require_director, get_client_ip, log_action
from ..limiter import limiter

router = APIRouter(tags=["auth"])

OTP_EXPIRE_MINUTES  = 10
OTP_MAX_ATTEMPTS    = 5
OTP_LOCKOUT_MINUTES = 30


def _set_refresh_cookie(response: Response, value: str) -> None:
    """Single place that controls all refresh-cookie attributes (L-2)."""
    is_prod = settings.ENVIRONMENT == "production"
    response.set_cookie(
        key="reach_refresh",
        value=value,
        httponly=True,
        secure=is_prod,
        samesite="strict",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path=settings.refresh_cookie_path,
    )


# ─── 1.1  POST /auth/send-otp ─────────────────────────────────────────────────

@router.post("/auth/send-otp")
@limiter.limit("10/minute")
async def send_otp(body: SendOTPRequest, request: Request, db: Session = Depends(get_db)):
    identifier = body.phone if body.channel == "sms" else body.email
    if not identifier:
        raise HTTPException(400, "Email or phone is required.")

    identifier_hash = sha256_hash(identifier)
    now = datetime.now(timezone.utc)

    # Suppress existing-user status from the response (audit 3.1)
    if body.channel == "sms":
        existing_user = db.query(User).filter(User.phone == identifier).first()
    else:
        existing_user = db.query(User).filter(User.email == identifier).first()

    # Identifier lockout
    session = db.query(OTPSession).filter(OTPSession.identifier_hash == identifier_hash).first()
    if session and session.locked_until and session.locked_until > now:
        wait_secs = int((session.locked_until - now).total_seconds())
        raise HTTPException(
            429,
            f"Too many attempts. Try again in {wait_secs // 60 + 1} minutes.",
            headers={"Retry-After": str(wait_secs)},
        )

    # Cross-channel lockout (same user, different channel)
    if existing_user:
        cross_lock = db.query(OTPSession).filter(
            OTPSession.user_id == existing_user.id,
            OTPSession.locked_until > now,
        ).first()
        if cross_lock:
            wait_secs = int((cross_lock.locked_until - now).total_seconds())
            raise HTTPException(
                429,
                f"Too many attempts. Try again in {wait_secs // 60 + 1} minutes.",
                headers={"Retry-After": str(wait_secs)},
            )
        if session:
            session.user_id = existing_user.id

    otp      = generate_otp()
    otp_hash = hash_value(otp)
    expires  = now + timedelta(minutes=OTP_EXPIRE_MINUTES)

    if session:
        # Preserve attempt counter — never reset on resend
        session.otp_hash   = otp_hash
        session.expires_at = expires
        session.channel    = body.channel
    else:
        session = OTPSession(
            identifier_hash=identifier_hash,
            user_id=existing_user.id if existing_user else None,
            otp_hash=otp_hash,
            channel=body.channel,
            expires_at=expires,
        )
        db.add(session)

    db.commit()

    sent = await dispatch_otp(identifier, otp, body.channel)
    if not sent:
        raise HTTPException(503, "Failed to send verification code. Please try again.")

    return {"detail": "OTP sent."}


# ─── 1.2  POST /auth/verify-otp ───────────────────────────────────────────────

@router.post("/auth/verify-otp")
@limiter.limit("10/minute")
async def verify_otp(
    body: VerifyOTPRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    identifier      = body.phone if body.channel == "sms" else body.email
    identifier_hash = sha256_hash(identifier)
    now             = datetime.now(timezone.utc)

    session = db.query(OTPSession).filter(OTPSession.identifier_hash == identifier_hash).first()

    if not session:
        raise HTTPException(400, "No verification code found. Please request a new code.")

    if session.locked_until and session.locked_until > now:
        wait_secs = int((session.locked_until - now).total_seconds())
        raise HTTPException(
            429,
            f"Too many attempts. Try again in {wait_secs // 60 + 1} minutes.",
            headers={"Retry-After": str(wait_secs)},   # M-1: consistent Retry-After
        )

    if session.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(400, "Code has expired. Please request a new code.")

    # Increment BEFORE verifying (prevents timing-based enumeration)
    session.attempts += 1
    if session.attempts >= OTP_MAX_ATTEMPTS:
        session.locked_until = now + timedelta(minutes=OTP_LOCKOUT_MINUTES)
        db.commit()
        raise HTTPException(
            429,
            f"Too many failed attempts. Account locked for {OTP_LOCKOUT_MINUTES} minutes.",
            headers={"Retry-After": str(OTP_LOCKOUT_MINUTES * 60)},
        )

    if not verify_hash(body.otp, session.otp_hash):
        db.commit()
        remaining = OTP_MAX_ATTEMPTS - session.attempts
        raise HTTPException(400, f"Incorrect code. {remaining} attempt(s) remaining.")

    # OTP valid — look up or create user
    if body.channel == "sms":
        user = db.query(User).filter(User.phone == identifier).first()
    else:
        user = db.query(User).filter(User.email == identifier).first()

    is_new = user is None
    if is_new:
        user = User(
            campaign_id=None,   # audit 1.1: never trust client input here
            name=body.name,
            phone=body.phone if body.channel == "sms" else None,
            email=body.email if body.channel == "email" else None,
            role=UserRole.director,
            status=UserStatus.active,
        )
        db.add(user)
        db.flush()

    user.last_active_at = now

    access_token  = create_access_token(
        user_id=str(user.id),
        role=user.role,
        campaign_id=str(user.campaign_id) if user.campaign_id else "",
        zone_id=str(user.zone_id) if user.zone_id else None,
    )
    refresh_value = create_refresh_token_value()
    rt = RefreshToken(
        user_id=user.id,
        token_hash=sha256_hash(refresh_value),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent", "")[:500],
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(rt)
    db.delete(session)
    db.commit()

    log_action(db, user, "auth.login", ip_address=get_client_ip(request))
    db.commit()

    _set_refresh_cookie(response, refresh_value)

    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "user": {
            "id":          str(user.id),
            "name":        user.name,
            "role":        user.role,
            "status":      user.status,
            "campaign_id": str(user.campaign_id) if user.campaign_id else None,
            "zone_id":     str(user.zone_id) if user.zone_id else None,
            "is_new":      is_new,
        },
    }


# ─── 1.3  POST /auth/refresh ──────────────────────────────────────────────────

@router.post("/auth/refresh")
@limiter.limit("20/minute")   # C-3: rate-limit the refresh endpoint
async def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_value = request.cookies.get("reach_refresh")
    if not refresh_value:
        raise HTTPException(401, "No refresh token.")

    token_hash = sha256_hash(refresh_value)
    now        = datetime.now(timezone.utc)

    rt = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked_at.is_(None),
        RefreshToken.expires_at > now,
    ).first()

    if not rt:
        response.delete_cookie("reach_refresh", path=settings.refresh_cookie_path)
        raise HTTPException(401, "Refresh token invalid or expired.")

    user = db.query(User).filter(User.id == rt.user_id).first()
    if not user or user.status == UserStatus.suspended:
        raise HTTPException(403, "Account unavailable.")

    # Rotate: revoke old, issue new
    rt.revoked_at = now
    new_value = create_refresh_token_value()
    new_rt = RefreshToken(
        user_id=user.id,
        token_hash=sha256_hash(new_value),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent", "")[:500],
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_rt)

    access_token = create_access_token(
        user_id=str(user.id),
        role=user.role,
        campaign_id=str(user.campaign_id) if user.campaign_id else "",
        zone_id=str(user.zone_id) if user.zone_id else None,
    )
    user.last_active_at = now
    db.commit()

    _set_refresh_cookie(response, new_value)

    return {"access_token": access_token, "token_type": "bearer"}


# ─── 1.4  POST /auth/logout ───────────────────────────────────────────────────

@router.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    refresh_value = request.cookies.get("reach_refresh")
    if refresh_value:
        token_hash = sha256_hash(refresh_value)
        rt = db.query(RefreshToken).filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        ).first()
        if rt:
            rt.revoked_at = datetime.now(timezone.utc)
            db.commit()

    response.delete_cookie("reach_refresh", path=settings.refresh_cookie_path)
    log_action(db, current_user, "auth.logout", ip_address=get_client_ip(request))
    db.commit()

    return {"detail": "Logged out."}


# ─── 1.5  GET /auth/me ────────────────────────────────────────────────────────

@router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..models import Campaign, Zone
    campaign = (
        db.query(Campaign).filter(Campaign.id == current_user.campaign_id).first()
        if current_user.campaign_id else None
    )
    zone = (
        db.query(Zone).filter(Zone.id == current_user.zone_id).first()
        if current_user.zone_id else None
    )

    return {
        "id":             str(current_user.id),
        "name":           current_user.name,
        "email":          current_user.email,
        "phone":          current_user.phone,
        "role":           current_user.role,
        "status":         current_user.status,
        "avatar_url":     current_user.avatar_url,
        "campaign_id":    str(current_user.campaign_id) if current_user.campaign_id else None,
        "zone_id":        str(current_user.zone_id) if current_user.zone_id else None,
        "campaign_name":  campaign.name if campaign else None,
        "zone_name":      zone.name if zone else None,
        "last_active_at": current_user.last_active_at.isoformat() if current_user.last_active_at else None,
    }


# ─── 1.6  GET /auth/sessions ──────────────────────────────────────────────────

@router.get("/auth/sessions")
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    tokens = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .order_by(RefreshToken.created_at.desc())
        .all()
    )

    return [
        {
            "id":         str(t.id),
            "ip_address": t.ip_address,
            "user_agent": t.user_agent,
            "created_at": t.created_at.isoformat(),
            "expires_at": t.expires_at.isoformat(),
        }
        for t in tokens
    ]


# ─── 1.7  DELETE /auth/sessions/{id} ─────────────────────────────────────────

@router.delete("/auth/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rt = db.query(RefreshToken).filter(
        RefreshToken.id == session_id,
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked_at.is_(None),
    ).first()
    if not rt:
        raise HTTPException(404, "Session not found.")

    rt.revoked_at = datetime.now(timezone.utc)
    log_action(
        db, current_user, "auth.session_revoked",
        entity_type="refresh_token", entity_id=session_id,
    )
    db.commit()
    return {"detail": "Session revoked."}


# ─── 1.8  POST /auth/revoke-all ───────────────────────────────────────────────

@router.post("/auth/revoke-all")
async def revoke_all_sessions(
    request: Request,
    response: Response,
    current_user: User = Depends(require_director),
    db: Session = Depends(get_db),
):
    now     = datetime.now(timezone.utc)
    updated = db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked_at.is_(None),
    ).all()

    for rt in updated:
        rt.revoked_at = now

    response.delete_cookie("reach_refresh", path=settings.refresh_cookie_path)
    log_action(db, current_user, "auth.revoke_all", ip_address=get_client_ip(request))
    db.commit()

    return {"detail": f"Revoked {len(updated)} session(s)."}
