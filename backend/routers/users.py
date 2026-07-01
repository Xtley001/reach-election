"""REACH Election — Users router"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, UserRole, UserStatus
from ..dependencies import require_director, require_coordinator, get_current_user, log_action
from ..schemas import UpdateMeRequest, UpdateUserStatusRequest

router = APIRouter(tags=["users"])


def _user_out(u: User) -> dict:
    return {
        "id":             str(u.id),
        "name":           u.name,
        "phone":          u.phone,
        "email":          u.email,
        "role":           u.role,
        "status":         u.status,
        "zone_id":        str(u.zone_id) if u.zone_id else None,
        "avatar_url":     u.avatar_url,
        "last_active_at": u.last_active_at.isoformat() if u.last_active_at else None,
        "created_at":     u.created_at.isoformat(),
    }


@router.get("/users/agents")
async def list_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    q = db.query(User).filter(
        User.campaign_id == current_user.campaign_id,
        User.role == UserRole.agent,
        User.status == UserStatus.active,
    )
    if current_user.role == UserRole.coordinator:
        q = q.filter(User.zone_id == current_user.zone_id)
    return [_user_out(u) for u in q.all()]


@router.get("/users/coordinators")
async def list_coordinators(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    q = db.query(User).filter(
        User.campaign_id == current_user.campaign_id,
        User.role == UserRole.coordinator,
        User.status == UserStatus.active,
    )
    return [_user_out(u) for u in q.all()]


@router.get("/users/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)


@router.patch("/users/me")
async def update_me(
    body: UpdateMeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.name is not None:
        current_user.name = body.name
    db.commit()
    db.refresh(current_user)
    return _user_out(current_user)


@router.post("/users/me/avatar")
async def upload_avatar_route(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..storage import upload_avatar

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image.")

    data = await file.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 5 MB.")

    try:
        url = await upload_avatar(data)
    except Exception:
        raise HTTPException(503, "Avatar upload failed. Check Cloudinary config.")

    current_user.avatar_url = url
    db.commit()
    return {"avatar_url": url}


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    body: UpdateUserStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    u = db.query(User).filter(
        User.id == user_id,
        User.campaign_id == current_user.campaign_id,
    ).first()
    if not u:
        raise HTTPException(404, "User not found.")

    u.status = body.status
    log_action(db, current_user, f"user.{body.status}", "user", user_id)
    db.commit()
    return _user_out(u)
