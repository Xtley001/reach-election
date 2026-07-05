"""REACH Election — Users router"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import User, UserRole, UserStatus, Zone, Voter
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


@router.get("/users/team-tree")
async def team_tree(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    """Nested team for the director Team view: every zone with its coordinator
    (if any) and that zone's active agents, each carrying a voter count.
    Single-pass aggregation to avoid N+1 per agent."""
    cid = current_user.campaign_id
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    zones = db.query(Zone).filter(Zone.campaign_id == cid).order_by(Zone.name).all()
    users = db.query(User).filter(
        User.campaign_id == cid,
        User.role.in_([UserRole.coordinator, UserRole.agent]),
    ).all()

    # voter counts per agent (added_by), one grouped query
    counts = dict(
        db.query(Voter.added_by, func.count(Voter.id))
        .filter(Voter.campaign_id == cid, Voter.deleted_at.is_(None))
        .group_by(Voter.added_by).all()
    )

    coord_by_zone = {}
    agents_by_zone = {}
    for u in users:
        if u.role == UserRole.coordinator:
            coord_by_zone[str(u.zone_id)] = u
        elif u.role == UserRole.agent:
            agents_by_zone.setdefault(str(u.zone_id), []).append(u)

    def agent_row(a):
        return {
            **_user_out(a),
            "voters_logged": int(counts.get(a.id, 0)),
            "is_inactive_flag": (
                a.last_active_at is None
                or a.last_active_at.replace(tzinfo=timezone.utc) < seven_days_ago
            ),
        }

    tree = []
    for z in zones:
        coord = coord_by_zone.get(str(z.id))
        agents = agents_by_zone.get(str(z.id), [])
        tree.append({
            "zone_id":     str(z.id),
            "zone_name":   z.name,
            "coordinator": _user_out(coord) if coord else None,
            "agents":      [agent_row(a) for a in agents],
            "agent_count": len(agents),
        })
    return {"zones": tree}


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
