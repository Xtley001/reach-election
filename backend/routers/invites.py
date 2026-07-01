"""REACH Election — Invites router"""
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import InviteToken, User, UserRole, UserStatus, Zone, Campaign, RefreshToken
from ..auth import (
    generate_otp, hash_value, verify_hash, sha256_hash,
    dispatch_otp, create_access_token, create_refresh_token_value,
)
from ..dependencies import (
    require_director, require_coordinator, get_current_user,
    get_client_ip, log_action,
)
from ..limiter import limiter
from ..email_client import _agent_invite_html
from ..schemas import CreateCoordinatorInviteRequest, CreateAgentInviteRequest, ClaimInviteRequest
from .auth import _set_refresh_cookie

router = APIRouter(tags=["invites"])

INVITE_EXPIRE_DAYS = 7


def _make_raw_token() -> str:
    """64-char URL-safe raw token. SHA-256 of this is stored in the DB (H-1)."""
    return secrets.token_urlsafe(48)


def _invite_out(inv: InviteToken, raw_token: str = None) -> dict:
    """Serialize an invite. raw_token is only passed at creation time (H-1):
    once stored hashed, the raw value cannot be recovered from the DB."""
    d = {
        "id":            str(inv.id),
        "campaign_id":   str(inv.campaign_id),
        "zone_id":       str(inv.zone_id) if inv.zone_id else None,
        "role":          inv.role,
        "invited_name":  inv.invited_name,
        "invited_email": inv.invited_email,
        "invited_phone": inv.invited_phone,
        "invited_by":    str(inv.invited_by),
        "expires_at":    inv.expires_at.isoformat(),
        "claimed_at":    inv.claimed_at.isoformat() if inv.claimed_at else None,
        "claimed_by":    str(inv.claimed_by) if inv.claimed_by else None,
        "created_at":    inv.created_at.isoformat(),
    }
    if raw_token:
        base = settings.FRONTEND_URL or "http://localhost:5173"
        d["invite_url"] = f"{base}/join?token={raw_token}"
    return d


# ─── 3.1  POST /invites/coordinator ──────────────────────────────────────────

@router.post("/invites/coordinator")
async def create_coordinator_invite(
    body: CreateCoordinatorInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    if not body.zone_id:
        raise HTTPException(400, "zone_id is required.")

    zone = db.query(Zone).filter(
        Zone.id == body.zone_id,
        Zone.campaign_id == current_user.campaign_id,
    ).first()
    if not zone:
        raise HTTPException(404, "Zone not found.")

    raw_token   = _make_raw_token()
    token_hash  = sha256_hash(raw_token)          # H-1: store hash, not raw token
    now         = datetime.now(timezone.utc)

    inv = InviteToken(
        campaign_id=current_user.campaign_id,
        zone_id=body.zone_id,
        token=token_hash,
        role="coordinator",
        invited_by=current_user.id,
        expires_at=now + timedelta(days=INVITE_EXPIRE_DAYS),
    )
    db.add(inv)
    log_action(db, current_user, "invite.coordinator_created", "invite", None,
               metadata={"zone_id": body.zone_id})
    db.commit()
    db.refresh(inv)
    return _invite_out(inv, raw_token=raw_token)


# ─── 3.2  POST /invites/agent ────────────────────────────────────────────────

@router.post("/invites/agent")
async def create_agent_invite(
    body: CreateAgentInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    name  = body.name.strip()
    email = body.email.strip().lower()
    phone = body.phone.strip()

    if not name:
        raise HTTPException(400, "name is required.")

    zone_id = body.zone_id or str(current_user.zone_id)

    # Reject if an unclaimed invite for this email already exists in this campaign
    existing = db.query(InviteToken).filter(
        InviteToken.campaign_id == current_user.campaign_id,
        InviteToken.invited_email == email,
        InviteToken.claimed_at.is_(None),
    ).first()
    if existing:
        raise HTTPException(409, f"An unclaimed invite for {email} already exists.")

    raw_token  = _make_raw_token()
    token_hash = sha256_hash(raw_token)           # H-1
    now        = datetime.now(timezone.utc)

    inv = InviteToken(
        campaign_id=current_user.campaign_id,
        zone_id=zone_id,
        token=token_hash,
        role="agent",
        invited_by=current_user.id,
        invited_name=name,
        invited_email=email,
        invited_phone=phone,
        expires_at=now + timedelta(days=INVITE_EXPIRE_DAYS),
    )
    db.add(inv)
    db.flush()

    # Send invite email
    base       = settings.FRONTEND_URL or "http://localhost:5173"
    invite_url = f"{base}/join?token={raw_token}"
    zone       = db.query(Zone).filter(Zone.id == zone_id).first()
    campaign   = db.query(Campaign).filter(Campaign.id == current_user.campaign_id).first()

    if settings.OTP_PROVIDER == "brevo" and settings.BREVO_API_KEY:
        import httpx
        html = _agent_invite_html(
            name,
            current_user.name or "Your coordinator",
            campaign.name if campaign else "",
            zone.name if zone else "",
            invite_url,
        )
        payload = {
            "sender": {"name": "REACH", "email": settings.BREVO_SENDER or "noreply@reach-ng.com"},
            "to": [{"email": email, "name": name}],
            "subject": f"You're invited to join {campaign.name if campaign else 'REACH Election'}",
            "htmlContent": html,
        }
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                await c.post(
                    "https://api.brevo.com/v3/smtp/email",
                    json=payload,
                    headers={"api-key": settings.BREVO_API_KEY},
                )
        except Exception:
            pass
    else:
        print(f"\n{'='*45}\nAGENT INVITE for {name} <{email}>\nURL: {invite_url}\n{'='*45}\n")

    log_action(db, current_user, "invite.agent_created", "invite", None,
               metadata={"invited_email": email, "zone_id": zone_id})
    db.commit()
    db.refresh(inv)
    return _invite_out(inv, raw_token=raw_token)


# ─── 3.3  GET /invites/preview/{token} — public, rate-limited ────────────────

@router.get("/invites/preview/{token}")
@limiter.limit("30/minute")                       # M-2: rate-limit this public endpoint
async def preview_invite(token: str, request: Request, db: Session = Depends(get_db)):
    token_hash = sha256_hash(token)               # H-1: hash before lookup
    inv = db.query(InviteToken).filter(InviteToken.token == token_hash).first()
    if not inv:
        raise HTTPException(404, "Invite not found.")

    now = datetime.now(timezone.utc)
    if inv.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(410, "This invite has expired.")
    if inv.claimed_at:
        raise HTTPException(409, "This invite has already been claimed.")

    zone     = db.query(Zone).filter(Zone.id == inv.zone_id).first() if inv.zone_id else None
    campaign = db.query(Campaign).filter(Campaign.id == inv.campaign_id).first()
    inviter  = db.query(User).filter(User.id == inv.invited_by).first()

    return {
        "token":          token,
        "role":           inv.role,
        "invited_name":   inv.invited_name,
        "invited_email":  inv.invited_email,
        "invited_phone":  inv.invited_phone,
        "zone_name":      zone.name if zone else None,
        "campaign_name":  campaign.name if campaign else None,
        "candidate_name": campaign.candidate_name if campaign else None,
        "party":          campaign.party if campaign else None,
        "inviter_name":   inviter.name if inviter else None,
        "expires_at":     inv.expires_at.isoformat(),
    }


# ─── 3.4  POST /invites/claim ────────────────────────────────────────────────

@router.post("/invites/claim")
@limiter.limit("10/minute")
async def claim_invite(
    body: ClaimInviteRequest,
    request: Request,
    response: Response,           # H-2: Response parameter for setting cookie
    db: Session = Depends(get_db),
):
    from ..models import OTPSession

    raw_token  = body.token.strip()
    token_hash = sha256_hash(raw_token)           # H-1: hash before lookup
    otp        = (body.otp or "").strip()
    phone      = (body.phone or "").strip()
    name       = (body.name or "").strip()

    inv = db.query(InviteToken).filter(InviteToken.token == token_hash).first()
    if not inv:
        raise HTTPException(404, "Invite not found.")

    now = datetime.now(timezone.utc)
    if inv.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(410, "This invite has expired.")
    if inv.claimed_at:
        raise HTTPException(409, "This invite has already been claimed.")

    # ── Step 1: send OTP ─────────────────────────────────────────────────────
    if not otp:
        # Agent invites: phone/email fixed at creation — never let caller override (audit 1.2)
        # Coordinator invites: pin identifier on first claim attempt
        if inv.role == "agent":
            identifier = inv.invited_phone or inv.invited_email
            channel    = "sms" if inv.invited_phone else "email"
        else:
            candidate_id = phone or inv.invited_phone or inv.invited_email
            if not candidate_id:
                raise HTTPException(400, "Phone or email required to receive OTP.")
            if inv.invited_phone or inv.invited_email:
                pinned = inv.invited_phone or inv.invited_email
                if candidate_id != pinned:
                    raise HTTPException(409, "This invite is already in progress with a different identifier.")
            else:
                if phone:
                    inv.invited_phone = phone
            identifier = candidate_id
            channel    = "sms" if (phone or inv.invited_phone) else "email"

        if not identifier:
            raise HTTPException(400, "Phone or email required to receive OTP.")

        identifier_hash  = sha256_hash(identifier)
        existing_session = db.query(OTPSession).filter(
            OTPSession.identifier_hash == identifier_hash
        ).first()
        if (existing_session
                and existing_session.locked_until
                and existing_session.locked_until > now):
            wait_secs = int((existing_session.locked_until - now).total_seconds())
            raise HTTPException(
                429,
                f"Too many attempts. Try again in {wait_secs // 60 + 1} minutes.",
                headers={"Retry-After": str(wait_secs)},
            )

        otp_code = generate_otp()
        expires  = now + timedelta(minutes=10)

        if existing_session:
            existing_session.otp_hash   = hash_value(otp_code)
            existing_session.expires_at = expires
        else:
            db.add(OTPSession(
                identifier_hash=identifier_hash,
                otp_hash=hash_value(otp_code),
                channel=channel,
                expires_at=expires,
            ))
        db.commit()

        sent = await dispatch_otp(identifier, otp_code, channel)
        if not sent:
            raise HTTPException(503, "Failed to send verification code.")
        return {"detail": "OTP sent.", "step": "otp_required", "channel": channel}

    # ── Step 2: verify OTP ───────────────────────────────────────────────────
    if inv.role == "agent":
        identifier = inv.invited_phone or inv.invited_email
        channel    = "sms" if inv.invited_phone else "email"
    else:
        identifier = inv.invited_phone or inv.invited_email or phone
        channel    = "sms" if (inv.invited_phone or phone) else "email"
    identifier_hash = sha256_hash(identifier)

    otp_session = db.query(OTPSession).filter(
        OTPSession.identifier_hash == identifier_hash
    ).first()
    if not otp_session:
        raise HTTPException(400, "No OTP session found. Please request a new code.")
    if otp_session.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(400, "OTP has expired. Please request a new code.")

    otp_session.attempts += 1
    if otp_session.attempts >= 5:
        otp_session.locked_until = now + timedelta(minutes=30)
        db.commit()
        raise HTTPException(
            429, "Too many failed attempts. Try again in 30 minutes.",
            headers={"Retry-After": "1800"},
        )

    if not verify_hash(otp, otp_session.otp_hash):
        db.commit()
        raise HTTPException(400, f"Incorrect code. {5 - otp_session.attempts} attempt(s) remaining.")

    # OTP valid — create or activate user
    effective_name  = name or inv.invited_name or ""
    effective_phone = inv.invited_phone
    effective_email = inv.invited_email

    existing_user = None
    if effective_phone:
        existing_user = db.query(User).filter(
            User.campaign_id == inv.campaign_id,
            User.phone == effective_phone,
        ).first()
    if not existing_user and effective_email:
        existing_user = db.query(User).filter(
            User.campaign_id == inv.campaign_id,
            User.email == effective_email,
        ).first()

    if existing_user:
        user = existing_user
        if inv.role == "coordinator":
            user.role = UserRole.coordinator
        elif inv.role == "agent":
            user.role = UserRole.agent
        user.status  = UserStatus.active
        user.zone_id = inv.zone_id
        user.name    = effective_name or user.name
    else:
        user = User(
            campaign_id=inv.campaign_id,
            zone_id=inv.zone_id,
            name=effective_name,
            phone=effective_phone,
            email=effective_email,
            role=UserRole[inv.role],
            status=UserStatus.active,
        )
        db.add(user)
        db.flush()

    inv.claimed_at = now
    inv.claimed_by = user.id

    access_token  = create_access_token(
        user_id=str(user.id),
        role=user.role,
        campaign_id=str(user.campaign_id),
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
    db.delete(otp_session)
    log_action(db, user, "invite.claimed", "invite", str(inv.id))
    db.commit()

    # H-2: set httpOnly refresh cookie so the claimed user can silently refresh
    _set_refresh_cookie(response, refresh_value)

    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "user": {
            "id":          str(user.id),
            "name":        user.name,
            "role":        user.role,
            "status":      user.status,
            "campaign_id": str(user.campaign_id),
            "zone_id":     str(user.zone_id) if user.zone_id else None,
        },
    }


# ─── 3.5  GET /invites/zone/{zone_id} ────────────────────────────────────────

@router.get("/invites/zone/{zone_id}")
async def list_zone_invites(
    zone_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    from ..dependencies import assert_zone_access
    assert_zone_access(current_user, zone_id)

    invites = (
        db.query(InviteToken)
        .filter(
            InviteToken.zone_id == zone_id,
            InviteToken.campaign_id == current_user.campaign_id,
        )
        .order_by(InviteToken.created_at.desc())
        .all()
    )
    # H-1: raw_token not passed — invite_url is omitted from list responses
    return [_invite_out(i) for i in invites]


# ─── 3.6  DELETE /invites/{invite_id} ────────────────────────────────────────

@router.delete("/invites/{invite_id}")
async def revoke_invite(
    invite_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    inv = db.query(InviteToken).filter(
        InviteToken.id == invite_id,
        InviteToken.campaign_id == current_user.campaign_id,
    ).first()
    if not inv:
        raise HTTPException(404, "Invite not found.")
    if inv.claimed_at:
        raise HTTPException(409, "Cannot revoke a claimed invite.")

    db.delete(inv)
    log_action(db, current_user, "invite.revoked", "invite", invite_id)
    db.commit()
    return {"detail": "Invite revoked."}
