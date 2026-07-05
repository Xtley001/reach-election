"""Phase 5 — Messaging Sessions router"""
from datetime import datetime, timezone
from urllib.parse import quote as urlquote
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession
from sqlalchemy import func

from ..database import get_db
from ..models import (
    MessagingSession, MessagingSessionAssignment, MessageSend, MessageTemplate,
    User, UserRole, UserStatus, Voter, PollingUnit, Campaign,
)
from ..dependencies import require_coordinator, require_agent, log_action
from ..schemas import CreateSessionRequest, LogSendRequest

router = APIRouter(tags=["sessions"])


def _resolve(body, voter_name="", agent_name="", candidate_name="", pu_name=""):
    return (body
        .replace("{{voter_name}}",        voter_name)
        .replace("{{agent_name}}",        agent_name)
        .replace("{{candidate_name}}",    candidate_name)
        .replace("{{polling_unit_name}}", pu_name))


def _session_out(s: MessagingSession, assignment: MessagingSessionAssignment = None) -> dict:
    d = {
        "id": str(s.id), "campaign_id": str(s.campaign_id), "zone_id": str(s.zone_id),
        "created_by": str(s.created_by), "template_id": str(s.template_id),
        "filter_criteria": s.filter_criteria, "status": s.status,
        "created_at": s.created_at.isoformat(),
        "activated_at": s.activated_at.isoformat() if s.activated_at else None,
        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
    }
    if assignment:
        d["voter_count"] = assignment.voter_count
        d["sent_count"]  = assignment.sent_count
    return d


# ── 5.6  POST /sessions ──────────────────────────────────────────────────────

@router.post("/sessions")
async def create_session(body: CreateSessionRequest, db: DbSession = Depends(get_db),
                         current_user: User = Depends(require_coordinator)):
    tpl_id    = body.template_id
    agent_ids = body.agent_ids
    filt      = body.filter

    template = db.query(MessageTemplate).filter(
        MessageTemplate.id == tpl_id,
        MessageTemplate.campaign_id == current_user.campaign_id,
        MessageTemplate.is_active == True,
    ).first()
    if not template: raise HTTPException(404, "Template not found or inactive.")

    if not agent_ids: raise HTTPException(400, "At least one agent_id is required.")

    agents = db.query(User).filter(
        User.id.in_(agent_ids),
        User.zone_id == current_user.zone_id,
        User.campaign_id == current_user.campaign_id,
        User.role == UserRole.agent,
        User.status == UserStatus.active,
    ).all()
    if len(agents) != len(set(agent_ids)):
        raise HTTPException(400, "One or more agents not found in your zone.")

    # L-8: validate filter.agent_ids belong to the coordinator's own zone
    if filt.agent_ids:
        valid_agent_ids = {
            str(u.id) for u in db.query(User).filter(
                User.id.in_(filt.agent_ids),
                User.zone_id == current_user.zone_id,
                User.campaign_id == current_user.campaign_id,
                User.role == UserRole.agent,
            ).all()
        }
        bad = set(filt.agent_ids) - valid_agent_ids
        if bad:
            raise HTTPException(400, f"filter.agent_ids not in your zone: {sorted(bad)}")

    # H-6: use validated Pydantic model attrs; serialise to plain dict for JSONB storage
    filt_dict = filt.model_dump(exclude_none=True)

    q = db.query(Voter).filter(
        Voter.zone_id == current_user.zone_id,
        Voter.campaign_id == current_user.campaign_id,
        Voter.deleted_at.is_(None),
    )
    if filt.status:           q = q.filter(Voter.current_status.in_(filt.status))
    if filt.polling_unit_ids: q = q.filter(Voter.polling_unit_id.in_(filt.polling_unit_ids))
    if filt.pvc_status:       q = q.filter(Voter.pvc_status.in_(filt.pvc_status))
    if filt.support_levels:   q = q.filter(Voter.support_level.in_(filt.support_levels))
    if filt.agent_ids:        q = q.filter(Voter.added_by.in_(filt.agent_ids))

    voters = q.all()
    if not voters: raise HTTPException(400, "No voters match the selected filters.")

    session = MessagingSession(
        campaign_id=current_user.campaign_id,
        zone_id=current_user.zone_id,
        created_by=current_user.id,
        template_id=tpl_id,
        filter_criteria=filt_dict,  # H-6: store serialised dict, not raw Pydantic object
        status="draft",
    )
    db.add(session); db.flush()

    # Distribute voters round-robin across agents
    per_agent = {a.id: [] for a in agents}
    for i, v in enumerate(voters):
        per_agent[agents[i % len(agents)].id].append(v.id)

    assignments = []
    for agent in agents:
        cnt = len(per_agent[agent.id])
        asgn = MessagingSessionAssignment(
            session_id=session.id, agent_id=agent.id, voter_count=cnt,
        )
        db.add(asgn); assignments.append(asgn)

    log_action(db, current_user, "session.created", "session", str(session.id),
               metadata={"voters": len(voters), "agents": len(agents)})
    db.commit(); db.refresh(session)
    return {**_session_out(session), "voter_count": len(voters), "agent_count": len(agents)}


# ── 5.7  POST /sessions/{id}/activate ────────────────────────────────────────

@router.post("/sessions/{session_id}/activate")
async def activate_session(session_id: str, db: DbSession = Depends(get_db),
                           current_user: User = Depends(require_coordinator)):
    s = _get_session(session_id, current_user, db)
    if s.status != "draft": raise HTTPException(409, f"Session is {s.status}, not draft.")

    now = datetime.now(timezone.utc)
    s.status = "active"; s.activated_at = now

    # Stamp started_at on each assignment
    asgns = db.query(MessagingSessionAssignment).filter(
        MessagingSessionAssignment.session_id == session_id
    ).all()
    for a in asgns:
        a.started_at = now

    log_action(db, current_user, "session.activated", "session", session_id)
    db.commit(); db.refresh(s)
    return _session_out(s)


# ── 5.8  POST /sessions/{id}/cancel ──────────────────────────────────────────

@router.post("/sessions/{session_id}/cancel")
async def cancel_session(session_id: str, db: DbSession = Depends(get_db),
                         current_user: User = Depends(require_coordinator)):
    s = _get_session(session_id, current_user, db)
    if s.status not in ("draft", "active"):
        raise HTTPException(409, f"Session is already {s.status}.")
    s.status = "cancelled"
    log_action(db, current_user, "session.cancelled", "session", session_id)
    db.commit(); db.refresh(s)
    return _session_out(s)


# ── 5.9  GET /sessions ───────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(db: DbSession = Depends(get_db),
                        current_user: User = Depends(require_coordinator)):
    q = db.query(MessagingSession).filter(
        MessagingSession.campaign_id == current_user.campaign_id,
    )
    # Director sees every zone's sessions; coordinator is scoped to their zone.
    if current_user.role == UserRole.coordinator:
        q = q.filter(MessagingSession.zone_id == current_user.zone_id)
    sessions = q.order_by(MessagingSession.created_at.desc()).all()

    out = []
    for s in sessions:
        d = _session_out(s)
        tpl = db.query(MessageTemplate).filter(MessageTemplate.id == s.template_id).first()
        d["template_label"] = tpl.label if tpl else None
        asgns = db.query(MessagingSessionAssignment).filter(
            MessagingSessionAssignment.session_id == s.id
        ).all()
        tv = sum(a.voter_count for a in asgns)
        ts = sum(a.sent_count for a in asgns)
        d["voter_count"] = tv
        d["sent_count"]  = ts
        d["overall_pct"] = round(ts / tv * 100, 1) if tv else 0
        d["agent_count"] = len(asgns)
        out.append(d)
    return out


# ── 5.11 GET /sessions/active ────────────────────────────────────────────────

@router.get("/sessions/active")
async def get_active_sessions(db: DbSession = Depends(get_db),
                              current_user: User = Depends(require_agent)):
    asgns = db.query(MessagingSessionAssignment).filter(
        MessagingSessionAssignment.agent_id == current_user.id,
        MessagingSessionAssignment.completed_at.is_(None),
    ).all()
    result = []
    for a in asgns:
        s = db.query(MessagingSession).filter(
            MessagingSession.id == a.session_id,
            MessagingSession.status == "active",
        ).first()
        if not s: continue
        tpl = db.query(MessageTemplate).filter(MessageTemplate.id == s.template_id).first()
        result.append({**_session_out(s, a), "template_label": tpl.label if tpl else ""})
    return result


# ── 5.10 GET /sessions/{id} ──────────────────────────────────────────────────

@router.get("/sessions/{session_id}")
async def get_session_detail(session_id: str, db: DbSession = Depends(get_db),
                             current_user: User = Depends(require_coordinator)):
    s = _get_session(session_id, current_user, db)
    asgns = db.query(MessagingSessionAssignment).filter(
        MessagingSessionAssignment.session_id == session_id
    ).all()
    total_voters = sum(a.voter_count for a in asgns)
    total_sent   = sum(a.sent_count  for a in asgns)
    result = _session_out(s)
    result.update({"voter_count": total_voters, "sent_count": total_sent,
                   "assignment_count": len(asgns)})
    return result


# ── 5.12 GET /sessions/{id}/queue ────────────────────────────────────────────

@router.get("/sessions/{session_id}/queue")
async def get_session_queue(session_id: str, db: DbSession = Depends(get_db),
                            current_user: User = Depends(require_agent)):
    s = db.query(MessagingSession).filter(
        MessagingSession.id == session_id,
        MessagingSession.campaign_id == current_user.campaign_id,
        MessagingSession.status == "active",
    ).first()
    if not s: raise HTTPException(404, "Active session not found.")

    asgn = db.query(MessagingSessionAssignment).filter(
        MessagingSessionAssignment.session_id == session_id,
        MessagingSessionAssignment.agent_id == current_user.id,
    ).first()
    if not asgn: raise HTTPException(403, "You are not assigned to this session.")

    # Voters already sent in this session by this agent
    sent_ids = {ms.voter_id for ms in db.query(MessageSend.voter_id).filter(
        MessageSend.session_id == session_id,
        MessageSend.agent_id == current_user.id,
    ).all()}

    # Get all voters added by this agent in this zone (their assignment)
    all_voters = db.query(Voter).filter(
        Voter.campaign_id == current_user.campaign_id,
        Voter.zone_id == s.zone_id,
        Voter.added_by == current_user.id,
        Voter.deleted_at.is_(None),
    ).all()

    # Apply session filter criteria
    filt = s.filter_criteria or {}
    if filt.get("status"):           all_voters = [v for v in all_voters if v.current_status in filt["status"]]
    if filt.get("pvc_status"):       all_voters = [v for v in all_voters if v.pvc_status in filt["pvc_status"]]
    if filt.get("support_levels"):   all_voters = [v for v in all_voters if v.support_level in filt["support_levels"]]
    if filt.get("polling_unit_ids"): all_voters = [v for v in all_voters if str(v.polling_unit_id) in filt["polling_unit_ids"]]

    unsent = [v for v in all_voters if v.id not in sent_ids]

    tpl = db.query(MessageTemplate).filter(MessageTemplate.id == s.template_id).first()
    campaign = db.query(Campaign).filter(Campaign.id == current_user.campaign_id).first()

    queue = []
    for v in unsent:
        pu = db.query(PollingUnit).filter(PollingUnit.id == v.polling_unit_id).first()
        pu_name = pu.name if pu else ""
        resolved = _resolve(tpl.body if tpl else "",
            voter_name=v.name, agent_name=current_user.name or "",
            candidate_name=campaign.candidate_name if campaign else "", pu_name=pu_name)
        wa_phone = v.phone.lstrip("+")
        queue.append({
            "voter_id": str(v.id), "voter_name": v.name, "phone": v.phone,
            "polling_unit_name": pu_name,
            "resolved_message": resolved,
            "whatsapp_link": f"https://wa.me/{wa_phone}?text={urlquote(resolved)}",
            "sms_link":      f"sms:{v.phone}?body={urlquote(resolved)}",
        })

    return {"queue": queue, "total": asgn.voter_count, "sent": asgn.sent_count,
            "remaining": len(unsent)}


# ── 5.13 POST /sessions/{id}/send ────────────────────────────────────────────

@router.post("/sessions/{session_id}/send")
async def log_send(session_id: str, body: LogSendRequest, db: DbSession = Depends(get_db),
                   current_user: User = Depends(require_agent)):
    voter_id = body.voter_id
    channel  = body.channel

    s = db.query(MessagingSession).filter(
        MessagingSession.id == session_id,
        MessagingSession.campaign_id == current_user.campaign_id,
        MessagingSession.status == "active",
    ).first()
    if not s: raise HTTPException(404, "Active session not found.")

    asgn = db.query(MessagingSessionAssignment).filter(
        MessagingSessionAssignment.session_id == session_id,
        MessagingSessionAssignment.agent_id == current_user.id,
    ).first()
    if not asgn: raise HTTPException(403, "Not assigned to this session.")

    voter = db.query(Voter).filter(
        Voter.id == voter_id,
        Voter.campaign_id == current_user.campaign_id,
        Voter.zone_id == s.zone_id,
        Voter.added_by == current_user.id,
        Voter.deleted_at.is_(None),
    ).first()
    if not voter: raise HTTPException(404, "Voter not found.")

    tpl = db.query(MessageTemplate).filter(MessageTemplate.id == s.template_id).first()
    campaign = db.query(Campaign).filter(Campaign.id == current_user.campaign_id).first()
    pu = db.query(PollingUnit).filter(PollingUnit.id == voter.polling_unit_id).first()

    resolved = _resolve(tpl.body if tpl else "",
        voter_name=voter.name, agent_name=current_user.name or "",
        candidate_name=campaign.candidate_name if campaign else "",
        pu_name=pu.name if pu else "")

    send = MessageSend(
        voter_id=voter_id, session_id=session_id, template_id=str(s.template_id),
        agent_id=current_user.id, campaign_id=current_user.campaign_id,
        channel=channel, message_body=resolved,
    )
    db.add(send)
    try:
        db.flush()
    except Exception:
        db.rollback()
        raise HTTPException(409, "This voter has already been logged in this session.")

    # Check completion (DB trigger handles sent_count increment)
    db.commit()
    db.refresh(asgn)

    if asgn.sent_count >= asgn.voter_count and not asgn.completed_at:
        asgn.completed_at = datetime.now(timezone.utc)
        db.commit()

    return {
        "detail": "Send logged.",
        "sent_count": asgn.sent_count,
        "total": asgn.voter_count,
        "is_complete": asgn.completed_at is not None,
    }


# ── 5.14 GET /sessions/{id}/progress ─────────────────────────────────────────

@router.get("/sessions/{session_id}/progress")
async def session_progress(session_id: str, db: DbSession = Depends(get_db),
                           current_user: User = Depends(require_coordinator)):
    s = _get_session(session_id, current_user, db)
    asgns = db.query(MessagingSessionAssignment).filter(
        MessagingSessionAssignment.session_id == session_id
    ).all()
    rows = []
    for a in asgns:
        agent = db.query(User).filter(User.id == a.agent_id).first()
        rows.append({
            "agent_id":    str(a.agent_id),
            "agent_name":  agent.name if agent else None,
            "voter_count": a.voter_count,
            "sent_count":  a.sent_count,
            "pct":         round(a.sent_count / a.voter_count * 100, 1) if a.voter_count else 0,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        })
    total_v = sum(a.voter_count for a in asgns)
    total_s = sum(a.sent_count  for a in asgns)
    return {
        "session_id": session_id, "status": s.status,
        "total_voters": total_v, "total_sent": total_s,
        "overall_pct": round(total_s / total_v * 100, 1) if total_v else 0,
        "agents": rows,
    }


# ── 5.14 GET /sessions/{id}/analytics — outcome breakdown for a session ──────

@router.get("/sessions/{session_id}/analytics")
async def session_analytics(session_id: str, db: DbSession = Depends(get_db),
                            current_user: User = Depends(require_coordinator)):
    """Send completion + channel mix + outcome/support breakdown for the voters
    this session actually messaged. (Delivery/reply receipts are not tracked —
    MessageSend has no such column — so those rates are intentionally omitted.)"""
    s = _get_session(session_id, current_user, db)

    asgns = db.query(MessagingSessionAssignment).filter(
        MessagingSessionAssignment.session_id == session_id
    ).all()
    total_voters = sum(a.voter_count for a in asgns)
    total_sent   = sum(a.sent_count for a in asgns)

    # Channel mix of actual sends
    by_channel = dict(
        db.query(MessageSend.channel, func.count(MessageSend.id))
        .filter(MessageSend.session_id == session_id)
        .group_by(MessageSend.channel).all()
    )
    by_channel = {str(k).split(".")[-1]: int(v) for k, v in by_channel.items()}

    # Outcome + support breakdown of voters messaged in this session
    sent_voter_ids = [r[0] for r in db.query(MessageSend.voter_id)
                      .filter(MessageSend.session_id == session_id).distinct().all()]
    outcomes, support = {}, {}
    if sent_voter_ids:
        for status, cnt in (db.query(Voter.current_status, func.count(Voter.id))
                            .filter(Voter.id.in_(sent_voter_ids))
                            .group_by(Voter.current_status).all()):
            outcomes[status] = int(cnt)
        for lvl, cnt in (db.query(Voter.support_level, func.count(Voter.id))
                        .filter(Voter.id.in_(sent_voter_ids))
                        .group_by(Voter.support_level).all()):
            support[lvl] = int(cnt)

    confirmed = outcomes.get("confirmed_voter", 0)
    return {
        "session_id":    session_id,
        "status":        s.status,
        "total_voters":  total_voters,
        "total_sent":    total_sent,
        "send_pct":      round(total_sent / total_voters * 100, 1) if total_voters else 0,
        "reached_voters": len(sent_voter_ids),
        "confirm_pct":   round(confirmed / len(sent_voter_ids) * 100, 1) if sent_voter_ids else 0,
        "by_channel":    by_channel,
        "outcomes":      outcomes,
        "support_breakdown": support,
    }


def _get_session(session_id, user, db):
    s = db.query(MessagingSession).filter(
        MessagingSession.id == session_id,
        MessagingSession.campaign_id == user.campaign_id,
    ).first()
    if not s: raise HTTPException(404, "Session not found.")
    if user.role == UserRole.coordinator and str(s.zone_id) != str(user.zone_id):
        raise HTTPException(403, "Zone access denied.")
    return s
