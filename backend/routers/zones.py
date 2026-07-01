"""Phase 2 — Zones router"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Zone, PollingUnit, User, Voter
from ..schemas import CreateZoneRequest, UpdateZoneRequest
from ..dependencies import require_director, require_coordinator, log_action, assert_zone_access

router = APIRouter(tags=["zones"])


def _zone_out(z: Zone, voter_count=0, agent_count=0, pu_count=0) -> dict:
    return {
        "id":                     str(z.id),
        "campaign_id":            str(z.campaign_id),
        "name":                   z.name,
        "registered_voter_count": z.registered_voter_count,
        "voter_count":            voter_count,
        "agent_count":            agent_count,
        "pu_count":               pu_count,
        "created_at":             z.created_at.isoformat(),
    }


@router.post("/zones")
async def create_zone(
    body: CreateZoneRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    existing = db.query(Zone).filter(
        Zone.campaign_id == current_user.campaign_id,
        Zone.name == body.name,
    ).first()
    if existing:
        raise HTTPException(409, f"Zone '{body.name}' already exists.")

    zone = Zone(
        campaign_id=current_user.campaign_id,
        name=body.name,
        registered_voter_count=body.registered_voter_count,
    )
    db.add(zone)
    log_action(db, current_user, "zone.created", "zone", None)
    db.commit()
    db.refresh(zone)
    return _zone_out(zone)


@router.get("/zones")
async def list_zones(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    zones = db.query(Zone).filter(Zone.campaign_id == current_user.campaign_id).all()
    results = []
    for z in zones:
        voter_count = db.query(func.count(Voter.id)).filter(
            Voter.zone_id == z.id, Voter.deleted_at.is_(None)
        ).scalar()
        agent_count = db.query(func.count(User.id)).filter(
            User.zone_id == z.id, User.role == "agent", User.status == "active"
        ).scalar()
        pu_count = db.query(func.count(PollingUnit.id)).filter(
            PollingUnit.zone_id == z.id
        ).scalar()
        results.append(_zone_out(z, voter_count, agent_count, pu_count))
    return results


@router.get("/zones/{zone_id}")
async def get_zone(
    zone_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    assert_zone_access(current_user, zone_id)
    z = db.query(Zone).filter(
        Zone.id == zone_id,
        Zone.campaign_id == current_user.campaign_id,
    ).first()
    if not z:
        raise HTTPException(404, "Zone not found.")

    pus = db.query(PollingUnit).filter(PollingUnit.zone_id == zone_id).all()
    voter_count = db.query(func.count(Voter.id)).filter(
        Voter.zone_id == zone_id, Voter.deleted_at.is_(None)
    ).scalar()
    agent_count = db.query(func.count(User.id)).filter(
        User.zone_id == zone_id, User.role == "agent", User.status == "active"
    ).scalar()
    pu_count = len(pus)
    result = _zone_out(z, voter_count, agent_count, pu_count)
    result["polling_units"] = [_pu_out(p) for p in pus]
    return result


@router.patch("/zones/{zone_id}")
async def update_zone(
    zone_id: str,
    body: UpdateZoneRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    z = db.query(Zone).filter(
        Zone.id == zone_id,
        Zone.campaign_id == current_user.campaign_id,
    ).first()
    if not z:
        raise HTTPException(404, "Zone not found.")

    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        clash = db.query(Zone).filter(
            Zone.campaign_id == current_user.campaign_id,
            Zone.name == data["name"],
            Zone.id != zone_id,
        ).first()
        if clash:
            raise HTTPException(409, f"Zone name '{data['name']}' already exists.")
        z.name = data["name"]
    if "registered_voter_count" in data:
        z.registered_voter_count = data["registered_voter_count"]

    log_action(db, current_user, "zone.updated", "zone", zone_id)
    db.commit()
    db.refresh(z)
    return _zone_out(z)


@router.delete("/zones/{zone_id}")
async def delete_zone(
    zone_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    z = db.query(Zone).filter(
        Zone.id == zone_id,
        Zone.campaign_id == current_user.campaign_id,
    ).first()
    if not z:
        raise HTTPException(404, "Zone not found.")

    agents = db.query(func.count(User.id)).filter(User.zone_id == zone_id).scalar()
    voters = db.query(func.count(Voter.id)).filter(
        Voter.zone_id == zone_id, Voter.deleted_at.is_(None)
    ).scalar()

    if agents > 0 or voters > 0:
        raise HTTPException(409, f"Zone has {agents} agent(s) and {voters} voter(s). Reassign before deleting.")

    db.delete(z)
    log_action(db, current_user, "zone.deleted", "zone", zone_id)
    db.commit()
    return {"detail": "Zone deleted."}


def _pu_out(p: PollingUnit) -> dict:
    return {
        "id": str(p.id), "zone_id": str(p.zone_id), "campaign_id": str(p.campaign_id),
        "name": p.name, "inec_code": p.inec_code,
        "registered_voters": p.registered_voters, "created_at": p.created_at.isoformat(),
    }
