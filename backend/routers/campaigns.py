"""Phase 2 — Campaigns router"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Campaign, Zone, PollingUnit, User, Voter, AuditLog
from ..schemas import CreateCampaignRequest, UpdateCampaignRequest
from ..dependencies import require_director, get_current_user, log_action

router = APIRouter(tags=["campaigns"])


@router.post("/campaigns")
async def create_campaign(
    body: CreateCampaignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.campaign_id:
        raise HTTPException(409, "You already have a campaign.")

    campaign = Campaign(
        name=body.name,
        election_level=body.election_level,
        state=body.state,
        constituency_name=body.constituency_name,
        party=body.party,
        candidate_name=body.candidate_name,
        target_vote_count=body.target_vote_count,
        status="active",
        director_id=current_user.id,
    )
    db.add(campaign)
    db.flush()

    current_user.campaign_id = campaign.id
    current_user.status = "active"
    log_action(db, current_user, "campaign.created", "campaign", str(campaign.id))
    db.commit()

    return _campaign_out(campaign)


@router.get("/campaigns/mine")
async def get_my_campaign(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    c = db.query(Campaign).filter(Campaign.id == current_user.campaign_id).first()
    if not c:
        raise HTTPException(404, "No campaign found.")
    return _campaign_out(c)


@router.patch("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: str,
    body: UpdateCampaignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    c = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.director_id == current_user.id,
    ).first()
    if not c:
        raise HTTPException(404, "Campaign not found.")

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(c, k, v)

    log_action(db, current_user, "campaign.updated", "campaign", campaign_id)
    db.commit()
    return _campaign_out(c)


@router.get("/campaigns/{campaign_id}/stats")
async def campaign_stats(
    campaign_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    if str(current_user.campaign_id) != str(campaign_id):
        raise HTTPException(404, "Campaign not found.")
    cid = current_user.campaign_id
    total_voters = db.query(func.count(Voter.id)).filter(
        Voter.campaign_id == cid, Voter.deleted_at.is_(None)
    ).scalar()
    confirmed = db.query(func.count(Voter.id)).filter(
        Voter.campaign_id == cid,
        Voter.current_status == "confirmed_voter",
        Voter.deleted_at.is_(None),
    ).scalar()
    pvc = db.query(func.count(Voter.id)).filter(
        Voter.campaign_id == cid,
        Voter.pvc_status == "has_pvc",
        Voter.deleted_at.is_(None),
    ).scalar()
    zones = db.query(func.count(Zone.id)).filter(Zone.campaign_id == cid).scalar()
    pus   = db.query(func.count(PollingUnit.id)).filter(PollingUnit.campaign_id == cid).scalar()
    agents = db.query(func.count(User.id)).filter(
        User.campaign_id == cid, User.role == "agent", User.status == "active"
    ).scalar()
    campaign = db.query(Campaign).filter(Campaign.id == cid).first()

    return {
        "total_voters":    total_voters,
        "confirmed_voters": confirmed,
        "has_pvc":         pvc,
        "zones":           zones,
        "polling_units":   pus,
        "active_agents":   agents,
        "target_vote_count": campaign.target_vote_count if campaign else None,
        "progress_pct": round((confirmed / campaign.target_vote_count * 100), 1)
            if campaign and campaign.target_vote_count and campaign.target_vote_count > 0 else 0,
    }


@router.post("/campaigns/{campaign_id}/logo")
async def upload_logo(
    campaign_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    from ..storage import upload_campaign_logo
    c = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.director_id == current_user.id,
    ).first()
    if not c:
        raise HTTPException(404, "Campaign not found.")

    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image.")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 5 MB.")

    try:
        url = await upload_campaign_logo(data)
    except Exception:
        raise HTTPException(503, "Logo upload failed. Check Cloudinary config.")

    c.logo_url = url
    db.commit()
    return {"logo_url": url}


def _campaign_out(c: Campaign) -> dict:
    return {
        "id":                 str(c.id),
        "name":               c.name,
        "election_level":     c.election_level,
        "state":              c.state,
        "constituency_name":  c.constituency_name,
        "party":              c.party,
        "candidate_name":     c.candidate_name,
        "logo_url":           c.logo_url,
        "target_vote_count":  c.target_vote_count,
        "status":             c.status,
        "director_id":        str(c.director_id) if c.director_id else None,
        "created_at":         c.created_at.isoformat(),
    }
