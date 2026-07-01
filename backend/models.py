"""
REACH Election — SQLAlchemy Models
All models match 02_DATABASE.md exactly. Field names are authoritative.
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, Enum, ForeignKey,
    Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from .database import Base


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    director    = "director"
    coordinator = "coordinator"
    agent       = "agent"


class UserStatus(str, enum.Enum):
    pending   = "pending"
    active    = "active"
    suspended = "suspended"


class ElectionLevel(str, enum.Enum):
    governorship  = "governorship"
    senatorial    = "senatorial"
    house_of_reps = "house_of_reps"
    state_assembly = "state_assembly"
    lga_chairman  = "lga_chairman"
    councillorship = "councillorship"


class PvcStatus(str, enum.Enum):
    has_pvc = "has_pvc"
    no_pvc  = "no_pvc"
    unknown = "unknown"


class SupportLevel(str, enum.Enum):
    strong_supporter = "strong_supporter"
    leaning          = "leaning"
    undecided        = "undecided"
    soft_opposition  = "soft_opposition"
    unknown          = "unknown"


class ContactStatus(str, enum.Enum):
    unreached      = "unreached"
    contacted      = "contacted"
    no_answer      = "no_answer"
    wrong_number   = "wrong_number"
    confirmed_voter = "confirmed_voter"
    pvc_issue      = "pvc_issue"
    needs_follow_up = "needs_follow_up"
    unreachable    = "unreachable"
    declined       = "declined"


class RecruitmentSource(str, enum.Enum):
    house_visit = "house_visit"
    rally       = "rally"
    referral    = "referral"
    whatsapp    = "whatsapp"
    csv_import  = "csv_import"
    other       = "other"


class MessageChannel(str, enum.Enum):
    whatsapp = "whatsapp"
    sms      = "sms"
    both     = "both"


class ContactChannel(str, enum.Enum):
    call     = "call"
    visit    = "visit"
    whatsapp = "whatsapp"
    sms      = "sms"
    other    = "other"


class SessionStatus(str, enum.Enum):
    draft     = "draft"
    active    = "active"
    completed = "completed"
    cancelled = "cancelled"


class BroadcastScope(str, enum.Enum):
    all_agents = "all_agents"
    zone       = "zone"
    individual = "individual"


class BroadcastChannel(str, enum.Enum):
    in_app = "in_app"
    sms    = "sms"


class InviteRole(str, enum.Enum):
    coordinator = "coordinator"
    agent       = "agent"


# ─── Models ───────────────────────────────────────────────────────────────────

def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Campaign(Base):
    __tablename__ = "campaigns"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name              = Column(String(200), nullable=False)
    election_level    = Column(Enum(ElectionLevel, name="election_level"), nullable=False)
    state             = Column(String(100), nullable=False)
    constituency_name = Column(String(200), nullable=False)
    party             = Column(String(100), nullable=False)
    candidate_name    = Column(String(200), nullable=False)
    logo_url          = Column(String(500))
    target_vote_count = Column(Integer)
    status            = Column(String(20), nullable=False, default="setup")
    director_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at        = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        CheckConstraint("status IN ('setup','active','closed')", name="chk_campaign_status"),
        CheckConstraint("target_vote_count IS NULL OR target_vote_count > 0", name="chk_target_positive"),
    )


class Zone(Base):
    __tablename__ = "zones"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id           = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    name                  = Column(String(200), nullable=False)
    registered_voter_count = Column(Integer)
    created_at            = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        UniqueConstraint("campaign_id", "name", name="uq_zone_name_campaign"),
    )


class PollingUnit(Base):
    __tablename__ = "polling_units"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id           = Column(UUID(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"), nullable=False)
    campaign_id       = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    name              = Column(String(300), nullable=False)
    inec_code         = Column(String(50))
    registered_voters = Column(Integer)
    created_at        = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        UniqueConstraint("zone_id", "name", name="uq_pu_name_zone"),
    )


class User(Base):
    __tablename__ = "users"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id    = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=True)
    zone_id        = Column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=True)
    name           = Column(String(100))
    phone          = Column(String(20))
    email          = Column(String(254))
    avatar_url     = Column(String(500))
    role           = Column(Enum(UserRole, name="user_role"), nullable=False, default=UserRole.agent)
    status         = Column(Enum(UserStatus, name="user_status"), nullable=False, default=UserStatus.pending)
    last_active_at = Column(DateTime(timezone=True))
    created_at     = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        UniqueConstraint("campaign_id", "phone", name="uq_user_phone_campaign"),
        UniqueConstraint("campaign_id", "email", name="uq_user_email_campaign"),
        CheckConstraint(
            r"phone IS NULL OR phone ~ E'^\\+[1-9]\\d{7,14}$'",
            name="chk_phone_e164"
        ),
        CheckConstraint(
            "(role = 'director' AND zone_id IS NULL) OR role != 'director'",
            name="chk_director_no_zone"
        ),
        CheckConstraint(
            "(role IN ('coordinator','agent') AND zone_id IS NOT NULL) OR role = 'director'",
            name="chk_coord_agent_has_zone"
        ),
    )


class OTPSession(Base):
    __tablename__ = "otp_sessions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    identifier_hash = Column(String(64), nullable=False, unique=True)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    otp_hash        = Column(Text, nullable=False)
    channel         = Column(String(10), nullable=False)
    attempts        = Column(Integer, nullable=False, default=0)
    locked_until    = Column(DateTime(timezone=True))
    expires_at      = Column(DateTime(timezone=True), nullable=False)
    created_at      = Column(DateTime(timezone=True), nullable=False, default=_now)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)


class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id   = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    zone_id       = Column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=True)
    token         = Column(String(128), nullable=False, unique=True)
    role          = Column(Enum(InviteRole, name="invite_role"), nullable=False)
    invited_by    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    invited_name  = Column(String(100))
    invited_email = Column(String(254))
    invited_phone = Column(String(20))
    expires_at    = Column(DateTime(timezone=True), nullable=False)
    claimed_at    = Column(DateTime(timezone=True))
    claimed_by    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at    = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        CheckConstraint(
            r"invited_phone IS NULL OR invited_phone ~ E'^\\+[1-9]\\d{7,14}$'",
            name="chk_invite_phone"
        ),
    )


class VoterImport(Base):
    __tablename__ = "voter_imports"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id   = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    imported_by   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    filename      = Column(String(255), nullable=False)
    total_rows    = Column(Integer, nullable=False, default=0)
    imported      = Column(Integer, nullable=False, default=0)
    skipped       = Column(Integer, nullable=False, default=0)
    errors        = Column(Integer, nullable=False, default=0)
    status        = Column(String(20), nullable=False, default="processing")
    error_detail  = Column(JSONB)
    created_at    = Column(DateTime(timezone=True), nullable=False, default=_now)
    completed_at  = Column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("status IN ('processing','completed','failed')", name="chk_import_status"),
    )


class INECReferencePU(Base):
    __tablename__ = "inec_reference_pus"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    state_code        = Column(String(3), nullable=False)
    state_name        = Column(String(100), nullable=False)
    lga_code          = Column(String(5), nullable=False)
    lga_name          = Column(String(200), nullable=False)
    ward_code         = Column(String(5), nullable=False)
    ward_name         = Column(String(200), nullable=False)
    pu_code           = Column(String(5), nullable=False)
    pu_name           = Column(String(300), nullable=False)
    inec_code         = Column(String(25), nullable=False, unique=True)
    registered_voters = Column(Integer)
    created_at        = Column(DateTime(timezone=True), nullable=False, default=_now)


class Voter(Base):
    __tablename__ = "voters"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id        = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    zone_id            = Column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=False)
    polling_unit_id    = Column(UUID(as_uuid=True), ForeignKey("polling_units.id"), nullable=False)
    added_by           = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    name               = Column(String(200), nullable=False)
    phone              = Column(String(20))           # nullable: seeded voters have no phone until claimed
    pvc_status         = Column(Enum(PvcStatus, name="pvc_status"), nullable=False, default=PvcStatus.unknown)
    support_level      = Column(Enum(SupportLevel, name="support_level"), nullable=False, default=SupportLevel.unknown)

    recruitment_source = Column(Enum(RecruitmentSource, name="recruitment_source"))
    age_range          = Column(String(10))
    gender             = Column(String(10))
    notes              = Column(String(500))

    current_status     = Column(Enum(ContactStatus, name="contact_status"), nullable=False, default=ContactStatus.unreached)

    # Seeding fields
    vin                = Column(String(19))
    is_seeded          = Column(Boolean, nullable=False, default=False)
    voter_import_id    = Column(UUID(as_uuid=True), ForeignKey("voter_imports.id"), nullable=True)

    is_duplicate_flag  = Column(Boolean, nullable=False, default=False)
    duplicate_of       = Column(UUID(as_uuid=True), ForeignKey("voters.id"), nullable=True)

    deleted_at         = Column(DateTime(timezone=True))
    created_at         = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        CheckConstraint(
            r"phone IS NULL OR phone ~ E'^\\+[1-9]\\d{7,14}$'",
            name="chk_voter_phone_e164"
        ),
        CheckConstraint(
            "age_range IN ('18-25','26-35','36-50','51+') OR age_range IS NULL",
            name="chk_voter_age_range"
        ),
        CheckConstraint(
            "gender IN ('male','female','other') OR gender IS NULL",
            name="chk_voter_gender"
        ),
    )


class VoterContact(Base):
    __tablename__ = "voter_contacts"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    voter_id     = Column(UUID(as_uuid=True), ForeignKey("voters.id"), nullable=False)
    agent_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    campaign_id  = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    status_set   = Column(Enum(ContactStatus, name="contact_status"), nullable=False)
    channel      = Column(Enum(ContactChannel, name="contact_channel"), nullable=False, default=ContactChannel.call)
    outcome_note = Column(String(500))
    created_at   = Column(DateTime(timezone=True), nullable=False, default=_now)


class MessageTemplate(Base):
    __tablename__ = "message_templates"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    label       = Column(String(200), nullable=False)
    body        = Column(Text, nullable=False)
    channel     = Column(Enum(MessageChannel, name="message_channel"), nullable=False, default=MessageChannel.both)
    is_active   = Column(Boolean, nullable=False, default=True)
    created_by  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at  = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        CheckConstraint("char_length(body) <= 1000", name="chk_template_body_len"),
    )


class MessagingSession(Base):
    __tablename__ = "messaging_sessions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id     = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    zone_id         = Column(UUID(as_uuid=True), ForeignKey("zones.id"), nullable=False)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    template_id     = Column(UUID(as_uuid=True), ForeignKey("message_templates.id"), nullable=False)
    filter_criteria = Column(JSONB, nullable=False, default=dict)
    status          = Column(Enum(SessionStatus, name="session_status"), nullable=False, default=SessionStatus.draft)
    created_at      = Column(DateTime(timezone=True), nullable=False, default=_now)
    activated_at    = Column(DateTime(timezone=True))
    completed_at    = Column(DateTime(timezone=True))


class MessagingSessionAssignment(Base):
    __tablename__ = "messaging_session_assignments"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id   = Column(UUID(as_uuid=True), ForeignKey("messaging_sessions.id", ondelete="CASCADE"), nullable=False)
    agent_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    voter_count  = Column(Integer, nullable=False, default=0)
    sent_count   = Column(Integer, nullable=False, default=0)
    started_at   = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("session_id", "agent_id", name="uq_session_agent"),
    )


class MessageSend(Base):
    __tablename__ = "message_sends"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    voter_id     = Column(UUID(as_uuid=True), ForeignKey("voters.id"), nullable=False)
    session_id   = Column(UUID(as_uuid=True), ForeignKey("messaging_sessions.id"), nullable=False)
    template_id  = Column(UUID(as_uuid=True), ForeignKey("message_templates.id"), nullable=False)
    agent_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    campaign_id  = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    channel      = Column(Enum(MessageChannel, name="message_channel"), nullable=False)
    message_body = Column(Text, nullable=False)
    sent_at      = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        UniqueConstraint("voter_id", "session_id", name="uq_send_voter_session"),
    )


class Broadcast(Base):
    __tablename__ = "broadcasts"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id      = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    sent_by          = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    scope            = Column(Enum(BroadcastScope, name="broadcast_scope"), nullable=False, default=BroadcastScope.all_agents)
    target_zone_id   = Column(UUID(as_uuid=True), ForeignKey("zones.id"))
    target_user_id   = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    body             = Column(Text, nullable=False)
    delivery_channel = Column(Enum(BroadcastChannel, name="broadcast_channel"), nullable=False, default=BroadcastChannel.in_app)
    scheduled_at     = Column(DateTime(timezone=True))
    sent_at          = Column(DateTime(timezone=True))
    created_at       = Column(DateTime(timezone=True), nullable=False, default=_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id  = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=True)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action       = Column(String(100), nullable=False)
    entity_type  = Column(String(50))
    entity_id    = Column(String(100))
    log_metadata = Column("metadata", JSONB)   # 'metadata' reserved by SQLAlchemy Base
    ip_address   = Column(String(45))
    created_at   = Column(DateTime(timezone=True), nullable=False, default=_now)
