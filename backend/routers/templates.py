"""Phase 5 — Message Templates router"""
from urllib.parse import quote as urlquote
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import MessageTemplate, User, Voter, PollingUnit, Campaign
from ..dependencies import require_director, require_coordinator, require_agent, log_action, assert_zone_access
from ..schemas import CreateTemplateRequest, UpdateTemplateRequest

router = APIRouter(tags=["templates"])

MERGE_FIELDS = {"{{voter_name}}", "{{agent_name}}", "{{candidate_name}}", "{{polling_unit_name}}"}


def _resolve(body: str, voter_name="", agent_name="", candidate_name="", pu_name="") -> str:
    return (body
        .replace("{{voter_name}}",        voter_name)
        .replace("{{agent_name}}",        agent_name)
        .replace("{{candidate_name}}",    candidate_name)
        .replace("{{polling_unit_name}}", pu_name))


def _tpl_out(t: MessageTemplate) -> dict:
    return {
        "id": str(t.id), "campaign_id": str(t.campaign_id), "label": t.label,
        "body": t.body, "channel": t.channel, "is_active": t.is_active,
        "created_by": str(t.created_by), "created_at": t.created_at.isoformat(),
    }


@router.post("/templates")
async def create_template(body: CreateTemplateRequest, db: Session = Depends(get_db),
                          current_user: User = Depends(require_director)):
    label   = body.label.strip()
    tpl_body = body.body.strip()
    channel = body.channel

    if not label:  raise HTTPException(400, "label is required.")
    if not tpl_body: raise HTTPException(400, "body is required.")
    if channel not in ("whatsapp", "sms", "both"):
        raise HTTPException(400, "channel must be whatsapp, sms, or both.")

    t = MessageTemplate(campaign_id=current_user.campaign_id, label=label,
                        body=tpl_body, channel=channel, created_by=current_user.id)
    db.add(t)
    log_action(db, current_user, "template.created", "template", None)
    db.commit(); db.refresh(t)
    return _tpl_out(t)


@router.get("/templates")
async def list_templates(db: Session = Depends(get_db),
                         current_user: User = Depends(require_coordinator)):
    ts = db.query(MessageTemplate).filter(
        MessageTemplate.campaign_id == current_user.campaign_id,
        MessageTemplate.is_active == True,
    ).order_by(MessageTemplate.created_at.desc()).all()
    return [_tpl_out(t) for t in ts]


@router.patch("/templates/{tpl_id}")
async def update_template(tpl_id: str, body: UpdateTemplateRequest, db: Session = Depends(get_db),
                          current_user: User = Depends(require_director)):
    t = db.query(MessageTemplate).filter(
        MessageTemplate.id == tpl_id,
        MessageTemplate.campaign_id == current_user.campaign_id,
    ).first()
    if not t: raise HTTPException(404, "Template not found.")
    data = body.model_dump(exclude_unset=True)
    if "label" in data:   t.label = data["label"]
    if "channel" in data: t.channel = data["channel"]
    if "body" in data:    t.body = data["body"]
    log_action(db, current_user, "template.updated", "template", tpl_id)
    db.commit(); db.refresh(t)
    return _tpl_out(t)


@router.delete("/templates/{tpl_id}")
async def deactivate_template(tpl_id: str, db: Session = Depends(get_db),
                              current_user: User = Depends(require_director)):
    t = db.query(MessageTemplate).filter(
        MessageTemplate.id == tpl_id,
        MessageTemplate.campaign_id == current_user.campaign_id,
    ).first()
    if not t: raise HTTPException(404, "Template not found.")
    t.is_active = False
    log_action(db, current_user, "template.deactivated", "template", tpl_id)
    db.commit()
    return {"detail": "Template deactivated."}


@router.post("/templates/{tpl_id}/preview")
async def preview_template(tpl_id: str, body: dict, db: Session = Depends(get_db),
                           current_user: User = Depends(require_coordinator)):
    t = db.query(MessageTemplate).filter(
        MessageTemplate.id == tpl_id,
        MessageTemplate.campaign_id == current_user.campaign_id,
    ).first()
    if not t: raise HTTPException(404, "Template not found.")

    voter_id = body.get("voter_id")
    voter = db.query(Voter).filter(
        Voter.id == voter_id, Voter.campaign_id == current_user.campaign_id
    ).first() if voter_id else None
    if voter:
        assert_zone_access(current_user, voter.zone_id)

    campaign = db.query(Campaign).filter(Campaign.id == current_user.campaign_id).first()
    pu = db.query(PollingUnit).filter(PollingUnit.id == voter.polling_unit_id).first() if voter else None

    resolved = _resolve(t.body,
        voter_name=voter.name if voter else "{{voter_name}}",
        agent_name=current_user.name or "{{agent_name}}",
        candidate_name=campaign.candidate_name if campaign else "{{candidate_name}}",
        pu_name=pu.name if pu else "{{polling_unit_name}}",
    )

    wa_phone = voter.phone.lstrip("+") if voter else ""
    return {
        "resolved": resolved,
        "whatsapp_link": f"https://wa.me/{wa_phone}?text={urlquote(resolved)}" if voter else None,
        "sms_link":      f"sms:{voter.phone}?body={urlquote(resolved)}" if voter else None,
    }
