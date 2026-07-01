from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .database import get_db
from .models import User, UserRole, UserStatus, AuditLog
from .auth import decode_access_token
from .config import settings
from typing import Optional

bearer = HTTPBearer(auto_error=False)


def get_client_ip(request: Request) -> str:
    # X-Forwarded-For is client-suppliable unless a trusted reverse proxy in
    # front of this app strips/overwrites it — see audit 3.2. Only trust it
    # when that's been explicitly confirmed via TRUST_PROXY_HEADERS.
    if settings.TRUST_PROXY_HEADERS:
        fwd = request.headers.get("X-Forwarded-For", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host or "unknown"


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(401, "Authentication required.")
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(401, "Invalid or expired token.")
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(401, "User not found.")
    if user.status == UserStatus.suspended:
        raise HTTPException(403, "Account suspended.")
    return user


async def require_active(user: User = Depends(get_current_user)) -> User:
    if user.status != UserStatus.active:
        raise HTTPException(403, "Account not yet active.")
    return user


async def require_director(user: User = Depends(require_active)) -> User:
    if user.role != UserRole.director:
        raise HTTPException(403, "Campaign Director access required.")
    return user


async def require_coordinator(user: User = Depends(require_active)) -> User:
    if user.role not in {UserRole.coordinator, UserRole.director}:
        raise HTTPException(403, "Coordinator access required.")
    return user


async def require_agent(user: User = Depends(require_active)) -> User:
    if user.role not in {UserRole.agent, UserRole.coordinator, UserRole.director}:
        raise HTTPException(403, "Agent access required.")
    return user


def assert_zone_access(user: User, zone_id: str):
    """Coordinator/Agent may only access their own zone. Director is unrestricted."""
    if user.role == UserRole.director:
        return
    if str(user.zone_id) != str(zone_id):
        raise HTTPException(403, "Zone access denied.")


def log_action(
    db: Session,
    user: Optional[User],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    metadata: Optional[dict] = None,
):
    log = AuditLog(
        campaign_id=user.campaign_id if user else None,
        user_id=user.id if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        ip_address=ip_address,
        log_metadata=metadata,
    )
    db.add(log)
    # Flush within the caller's current transaction so the row exists even if
    # the caller's later commit logic changes — caller is still responsible
    # for the final db.commit() to persist it.
    db.flush()
