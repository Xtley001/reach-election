"""REACH Election — Analytics Dashboards router"""
import csv
import io
from datetime import datetime, timezone, timedelta
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Campaign, Zone, PollingUnit, User, UserRole, UserStatus,
    Voter, VoterContact, MessageSend, MessagingSession,
    MessagingSessionAssignment, MessageTemplate,
)
from ..dependencies import require_director, require_coordinator, require_agent

router = APIRouter(tags=["dashboard"])

_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")


def _csv_safe(val):
    """Neutralize CSV/spreadsheet formula injection (H-5).
    Any cell that starts with a formula trigger character is prefixed with a
    single quote so Excel/Sheets treats it as a literal string."""
    if val is None:
        return val
    s = str(val)
    if s.startswith(_CSV_FORMULA_PREFIXES):
        return "'" + s
    return s


# ── Director dashboard ────────────────────────────────────────────────────────

@router.get("/dashboard/director")
async def director_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_director),
):
    cid = user.campaign_id
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    # Top-level scalars
    total_voters = db.query(func.count(Voter.id)).filter(
        Voter.campaign_id == cid, Voter.deleted_at.is_(None)
    ).scalar() or 0

    confirmed_supporters = db.query(func.count(Voter.id)).filter(
        Voter.campaign_id == cid, Voter.deleted_at.is_(None),
        Voter.support_level.in_(["strong_supporter", "leaning"]),
    ).scalar() or 0

    confirmed_pvc = db.query(func.count(Voter.id)).filter(
        Voter.campaign_id == cid, Voter.deleted_at.is_(None),
        Voter.support_level.in_(["strong_supporter", "leaning"]),
        Voter.pvc_status == "has_pvc",
    ).scalar() or 0

    pvc_gap = confirmed_supporters - confirmed_pvc

    campaign = db.query(Campaign).filter(Campaign.id == cid).first()
    target   = (campaign.target_vote_count or 0) if campaign else 0
    north_star_pct = round(confirmed_pvc / target * 100, 1) if target > 0 else 0

    total_pus = db.query(func.count(PollingUnit.id)).filter(
        PollingUnit.campaign_id == cid
    ).scalar() or 0
    pus_with_voters = db.query(
        func.count(func.distinct(Voter.polling_unit_id))
    ).filter(Voter.campaign_id == cid, Voter.deleted_at.is_(None)).scalar() or 0
    pu_coverage_pct = round(pus_with_voters / total_pus * 100, 1) if total_pus > 0 else 0

    # M-3: zone stats in a single aggregated query (was 6 queries × N zones)
    zone_rows = db.execute(text("""
        SELECT
            z.id,
            z.name,
            COALESCE(v_agg.total_voters,   0) AS total_voters,
            COALESCE(v_agg.supporters,     0) AS supporters,
            COALESCE(v_agg.pvc_confirmed,  0) AS pvc_confirmed,
            COALESCE(v_agg.pus_covered,    0) AS pus_with_voters,
            COALESCE(pu_agg.total_pus,     0) AS total_pus
        FROM zones z
        LEFT JOIN (
            SELECT zone_id,
                   COUNT(*)                                                              AS total_voters,
                   COUNT(*) FILTER (WHERE support_level IN ('strong_supporter','leaning')) AS supporters,
                   COUNT(*) FILTER (WHERE pvc_status = 'has_pvc'
                                     AND support_level IN ('strong_supporter','leaning'))  AS pvc_confirmed,
                   COUNT(DISTINCT polling_unit_id)                                       AS pus_covered
            FROM voters
            WHERE campaign_id = :cid AND deleted_at IS NULL
            GROUP BY zone_id
        ) v_agg ON v_agg.zone_id = z.id
        LEFT JOIN (
            SELECT zone_id, COUNT(*) AS total_pus
            FROM polling_units
            WHERE campaign_id = :cid
            GROUP BY zone_id
        ) pu_agg ON pu_agg.zone_id = z.id
        WHERE z.campaign_id = :cid
        ORDER BY z.name
    """), {"cid": str(cid)}).fetchall()

    zone_stats = [
        {
            "zone_id":       str(r.id),
            "zone_name":     r.name,
            "total_voters":  r.total_voters,
            "supporters":    r.supporters,
            "support_rate":  round(r.supporters / r.total_voters * 100, 1) if r.total_voters > 0 else 0,
            "pvc_confirmed": r.pvc_confirmed,
            "pvc_gap":       r.supporters - r.pvc_confirmed,
            "pvc_rate":      round(r.pvc_confirmed / r.supporters * 100, 1) if r.supporters > 0 else 0,
            "pu_coverage":   round(r.pus_with_voters / r.total_pus * 100, 1) if r.total_pus > 0 else 0,
            "total_pus":     r.total_pus,
            "pus_with_voters": r.pus_with_voters,
        }
        for r in zone_rows
    ]

    # M-3: agent stats in a single aggregated query (was 2 queries × N agents)
    agent_rows = db.execute(text("""
        SELECT
            u.id,
            u.name,
            u.last_active_at,
            z.name                            AS zone_name,
            COALESCE(v_agg.voters_logged, 0)  AS voters_logged,
            COALESCE(s_agg.messages_sent, 0)  AS messages_sent
        FROM users u
        LEFT JOIN zones z ON z.id = u.zone_id
        LEFT JOIN (
            SELECT added_by, COUNT(*) AS voters_logged
            FROM voters
            WHERE deleted_at IS NULL
            GROUP BY added_by
        ) v_agg ON v_agg.added_by = u.id
        LEFT JOIN (
            SELECT agent_id, COUNT(*) AS messages_sent
            FROM message_sends
            WHERE campaign_id = :cid
            GROUP BY agent_id
        ) s_agg ON s_agg.agent_id = u.id
        WHERE u.campaign_id = :cid
          AND u.role = 'agent'
          AND u.status = 'active'
        ORDER BY u.name
    """), {"cid": str(cid)}).fetchall()

    cutoff = seven_days_ago
    agent_stats = [
        {
            "agent_id":        str(r.id),
            "agent_name":      r.name,
            "zone_name":       r.zone_name or "—",
            "voters_logged":   r.voters_logged,
            "messages_sent":   r.messages_sent,
            "last_active_at":  r.last_active_at.isoformat() if r.last_active_at else None,
            "is_inactive_flag": (
                r.last_active_at is None
                or r.last_active_at.replace(tzinfo=timezone.utc) < cutoff
                or r.voters_logged == 0
            ),
        }
        for r in agent_rows
    ]

    # Messaging totals
    total_sessions = db.query(func.count(MessagingSession.id)).filter(
        MessagingSession.campaign_id == cid
    ).scalar() or 0
    active_sessions = db.query(func.count(MessagingSession.id)).filter(
        MessagingSession.campaign_id == cid,
        MessagingSession.status == "active",
    ).scalar() or 0
    week_sends = db.query(func.count(MessageSend.id)).filter(
        MessageSend.campaign_id == cid,
        MessageSend.sent_at >= seven_days_ago,
    ).scalar() or 0
    wa_sends = db.query(func.count(MessageSend.id)).filter(
        MessageSend.campaign_id == cid, MessageSend.channel == "whatsapp"
    ).scalar() or 0
    sms_sends = db.query(func.count(MessageSend.id)).filter(
        MessageSend.campaign_id == cid, MessageSend.channel == "sms"
    ).scalar() or 0

    # Daily log rate (last 7 days)
    daily_rows = db.execute(text("""
        SELECT DATE(created_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS count
        FROM voters
        WHERE campaign_id = :cid AND deleted_at IS NULL
          AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY day ORDER BY day
    """), {"cid": str(cid)}).fetchall()
    daily_logs = [{"day": str(r.day), "count": r.count} for r in daily_rows]

    return {
        "total_voters":             total_voters,
        "confirmed_supporters":     confirmed_supporters,
        "confirmed_pvc":            confirmed_pvc,
        "pvc_gap":                  pvc_gap,
        "north_star_pct":           north_star_pct,
        "target_vote_count":        target,
        "total_pus":                total_pus,
        "pus_with_voters":          pus_with_voters,
        "pu_coverage_pct":          pu_coverage_pct,
        "zone_stats":               zone_stats,
        "agent_stats":              agent_stats,
        "total_sessions":           total_sessions,
        "active_sessions":          active_sessions,
        "messages_sent":            wa_sends + sms_sends,
        "messages_sent_this_week":  week_sends,
        "whatsapp_sends":           wa_sends,
        "sms_sends":                sms_sends,
        "daily_log_rate":           daily_logs,
    }


# ── Coordinator dashboard ─────────────────────────────────────────────────────

@router.get("/dashboard/coordinator")
async def coordinator_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_coordinator),
):
    cid = user.campaign_id
    zid = user.zone_id
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    zone     = db.query(Zone).filter(Zone.id == zid).first()
    campaign = db.query(Campaign).filter(Campaign.id == cid).first()

    total_voters = db.query(func.count(Voter.id)).filter(
        Voter.zone_id == zid, Voter.deleted_at.is_(None)
    ).scalar() or 0
    confirmed = db.query(func.count(Voter.id)).filter(
        Voter.zone_id == zid, Voter.deleted_at.is_(None),
        Voter.current_status == "confirmed_voter",
    ).scalar() or 0
    supporters = db.query(func.count(Voter.id)).filter(
        Voter.zone_id == zid, Voter.deleted_at.is_(None),
        Voter.support_level.in_(["strong_supporter", "leaning"]),
    ).scalar() or 0
    pvc_confirmed = db.query(func.count(Voter.id)).filter(
        Voter.zone_id == zid, Voter.deleted_at.is_(None),
        Voter.pvc_status == "has_pvc",
        Voter.support_level.in_(["strong_supporter", "leaning"]),
    ).scalar() or 0

    # M-5: include campaign_id filter to prevent cross-campaign data leakage
    agents = db.query(User).filter(
        User.zone_id == zid,
        User.campaign_id == cid,
        User.role == UserRole.agent,
        User.status == UserStatus.active,
    ).all()

    agent_rows = []
    for a in agents:
        v = db.query(func.count(Voter.id)).filter(
            Voter.added_by == a.id, Voter.deleted_at.is_(None)
        ).scalar() or 0
        s = db.query(func.count(MessageSend.id)).filter(
            MessageSend.agent_id == a.id, MessageSend.campaign_id == cid
        ).scalar() or 0
        agent_rows.append({
            "agent_id":        str(a.id),
            "agent_name":      a.name,
            "phone":           a.phone,
            "voters_logged":   v,
            "messages_sent":   s,
            "last_active_at":  a.last_active_at.isoformat() if a.last_active_at else None,
            "is_inactive_flag": (
                a.last_active_at is None
                or a.last_active_at.replace(tzinfo=timezone.utc) < seven_days_ago
            ),
        })

    sessions = db.query(func.count(MessagingSession.id)).filter(
        MessagingSession.zone_id == zid, MessagingSession.status == "active"
    ).scalar() or 0
    total_sends = db.query(func.count(MessageSend.id)).filter(
        MessageSend.campaign_id == cid,
        MessageSend.agent_id.in_([a.id for a in agents]),
    ).scalar() or 0

    return {
        "zone_name":       zone.name if zone else None,
        "campaign_name":   campaign.name if campaign else None,
        "total_voters":    total_voters,
        "confirmed_voters": confirmed,
        "supporters":      supporters,
        "pvc_confirmed":   pvc_confirmed,
        "pvc_gap":         supporters - pvc_confirmed,
        "support_rate":    round(supporters / total_voters * 100, 1) if total_voters > 0 else 0,
        "active_sessions": sessions,
        "total_agents":    len(agents),
        "messages_sent":   total_sends,
        "agent_stats":     agent_rows,
    }


# ── Agent dashboard ───────────────────────────────────────────────────────────

@router.get("/dashboard/agent")
async def agent_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_agent),
):
    now        = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago   = now - timedelta(days=7)

    total_logged = db.query(func.count(Voter.id)).filter(
        Voter.added_by == user.id, Voter.deleted_at.is_(None)
    ).scalar() or 0
    confirmed = db.query(func.count(Voter.id)).filter(
        Voter.added_by == user.id, Voter.deleted_at.is_(None),
        Voter.current_status == "confirmed_voter",
    ).scalar() or 0

    queue_counts = db.execute(text("""
        SELECT current_status, COUNT(*) AS count FROM voters
        WHERE added_by = :uid AND deleted_at IS NULL
          AND current_status NOT IN ('declined','wrong_number','unreachable')
        GROUP BY current_status
    """), {"uid": str(user.id)}).fetchall()
    queue_total = sum(r.count for r in queue_counts)

    sends_week  = db.query(func.count(MessageSend.id)).filter(
        MessageSend.agent_id == user.id, MessageSend.sent_at >= week_ago
    ).scalar() or 0
    sends_today = db.query(func.count(MessageSend.id)).filter(
        MessageSend.agent_id == user.id, MessageSend.sent_at >= today_start
    ).scalar() or 0
    added_today = db.query(func.count(Voter.id)).filter(
        Voter.added_by == user.id, Voter.deleted_at.is_(None),
        Voter.created_at >= today_start,
    ).scalar() or 0

    active = (
        db.query(MessagingSession, MessagingSessionAssignment)
        .join(MessagingSessionAssignment,
              MessagingSessionAssignment.session_id == MessagingSession.id)
        .filter(
            MessagingSessionAssignment.agent_id == user.id,
            MessagingSession.status == "active",
            MessagingSessionAssignment.completed_at.is_(None),
        )
        .all()
    )
    session_info = []
    for sess, asgn in active:
        tpl     = db.query(MessageTemplate).filter(MessageTemplate.id == sess.template_id).first()
        pending = asgn.voter_count - asgn.sent_count
        session_info.append({
            "session_id":      str(sess.id),
            "template_label":  tpl.label if tpl else "—",
            "voter_count":     asgn.voter_count,
            "sent_count":      asgn.sent_count,
            "pending_count":   pending,
            "completion_pct":  round(asgn.sent_count / asgn.voter_count * 100, 1)
                               if asgn.voter_count > 0 else 0,
        })

    return {
        "total_logged":    total_logged,
        "confirmed_voters": confirmed,
        "queue_total":     queue_total,
        "added_today":     added_today,
        "sends_today":     sends_today,
        "sends_this_week": sends_week,
        "queue_breakdown": [
            {"status": r.current_status, "count": r.count}
            for r in sorted(queue_counts, key=lambda r: r.count, reverse=True)
        ],
        "active_sessions": session_info,
    }


# ── CSV exports (H-4: streamed row-by-row, H-5: all fields sanitized) ─────────

@router.get("/dashboard/export/voters")
async def export_voters(
    db: Session = Depends(get_db),
    user: User = Depends(require_director),
):
    def generate():
        buf = io.StringIO()
        w   = csv.writer(buf)
        w.writerow([
            "Name", "Phone", "Zone", "Polling Unit", "INEC Code",
            "PVC Status", "Support Level", "Contact Status",
            "Age Range", "Gender", "Recruitment Source",
            "Logged By", "Notes", "Date Added",
        ])
        yield buf.getvalue()

        # H-4: yield_per(500) streams in DB-side batches to avoid OOM
        q = (
            db.query(Voter, PollingUnit, Zone, User)
            .join(PollingUnit, Voter.polling_unit_id == PollingUnit.id)
            .join(Zone,        Voter.zone_id         == Zone.id)
            .join(User,        Voter.added_by        == User.id)
            .filter(Voter.campaign_id == user.campaign_id, Voter.deleted_at.is_(None))
            .order_by(Zone.name, PollingUnit.name, Voter.name)
            .yield_per(500)
        )
        for v, pu, z, agent in q:
            buf.seek(0); buf.truncate(0)
            # H-5: ALL user-controlled string fields wrapped in _csv_safe
            w.writerow([
                _csv_safe(v.name),
                v.phone,
                _csv_safe(z.name),
                _csv_safe(pu.name),
                _csv_safe(pu.inec_code) or "",
                v.pvc_status,
                v.support_level,
                v.current_status,
                v.age_range or "",
                v.gender or "",
                v.recruitment_source or "",
                _csv_safe(agent.name),
                _csv_safe(v.notes) or "",
                v.created_at.strftime("%Y-%m-%d %H:%M UTC"),
            ])
            yield buf.getvalue()

    # L-5: RFC 5987-encoded Content-Disposition filename
    fn = f"reach_voters_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fn)}"},
    )


@router.get("/dashboard/export/contacts")
async def export_contacts(
    db: Session = Depends(get_db),
    user: User = Depends(require_director),
):
    def generate():
        buf = io.StringIO()
        w   = csv.writer(buf)
        w.writerow([
            "Voter Name", "Phone", "Zone", "Polling Unit",
            "Status Set", "Channel", "Outcome Note", "Agent", "Timestamp (UTC)",
        ])
        yield buf.getvalue()

        # H-4: raw SQL with server-side cursor for streaming
        rows = db.execute(text("""
            SELECT v.name AS voter_name, v.phone,
                   z.name AS zone, pu.name AS polling_unit,
                   vc.status_set, vc.channel, vc.outcome_note,
                   a.name AS agent_name, vc.created_at
            FROM voter_contacts vc
            JOIN voters       v  ON v.id  = vc.voter_id
            JOIN zones        z  ON z.id  = v.zone_id
            JOIN polling_units pu ON pu.id = v.polling_unit_id
            JOIN users        a  ON a.id  = vc.agent_id
            WHERE vc.campaign_id = :cid
            ORDER BY vc.created_at DESC
        """), {"cid": str(user.campaign_id)})

        for r in rows:
            buf.seek(0); buf.truncate(0)
            # H-5: all user-controlled fields sanitized
            w.writerow([
                _csv_safe(r.voter_name),
                r.phone,
                _csv_safe(r.zone),
                _csv_safe(r.polling_unit),
                r.status_set,
                r.channel,
                _csv_safe(r.outcome_note) or "",
                _csv_safe(r.agent_name),
                r.created_at.strftime("%Y-%m-%d %H:%M UTC"),
            ])
            yield buf.getvalue()

    fn = f"reach_contacts_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fn)}"},
    )
