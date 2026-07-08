"""
REACH Election — Pydantic Schemas
Request/response models. Field names match 02_DATABASE.md exactly.
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional
import re

E164_RE = re.compile(r'^\+[1-9]\d{7,14}$')

CONTACT_STATUS_VALUES = (
    'unreached', 'contacted', 'no_answer', 'wrong_number',
    'confirmed_voter', 'pvc_issue', 'needs_follow_up', 'unreachable', 'declined',
)
CONTACT_CHANNEL_VALUES = ('call', 'visit', 'whatsapp', 'sms', 'other')
PVC_STATUS_VALUES      = ('has_pvc', 'no_pvc', 'unknown')
SUPPORT_LEVEL_VALUES   = ('strong_supporter', 'leaning', 'undecided', 'soft_opposition', 'unknown')


# ─── Auth ─────────────────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    channel: str   # 'email' | 'sms'
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if v and not E164_RE.match(v):
            raise ValueError('Phone must be in E.164 format (e.g. +2348012345678)')
        return v


class VerifyOTPRequest(BaseModel):
    channel: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    otp: str
    name: Optional[str] = Field(default=None, max_length=100)
    # NOTE: campaign_id intentionally absent — a self-registering user must
    # never be able to attach themselves to an existing campaign (audit 1.1).


# ─── Voters ───────────────────────────────────────────────────────────────────

class AddVoterRequest(BaseModel):
    name: str = Field(max_length=200)
    phone: str
    polling_unit_id: str
    pvc_status: str = 'unknown'
    support_level: str = 'unknown'
    recruitment_source: Optional[str] = None
    age_range: Optional[str] = None
    gender: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if not E164_RE.match(v):
            raise ValueError('Phone must be in E.164 format')
        return v


class UpdateVoterRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    pvc_status: Optional[str] = None
    support_level: Optional[str] = None
    recruitment_source: Optional[str] = None
    age_range: Optional[str] = None
    gender: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)
    polling_unit_id: Optional[str] = None


class LogContactRequest(BaseModel):
    status_set: str
    channel: str = 'call'
    outcome_note: Optional[str] = Field(default=None, max_length=500)

    @field_validator('status_set')
    @classmethod
    def validate_status(cls, v):
        if v not in CONTACT_STATUS_VALUES:
            raise ValueError(f"status_set must be one of: {CONTACT_STATUS_VALUES}")
        return v

    @field_validator('channel')
    @classmethod
    def validate_channel(cls, v):
        if v not in CONTACT_CHANNEL_VALUES:
            raise ValueError(f"channel must be one of: {CONTACT_CHANNEL_VALUES}")
        return v


class ResolveDuplicateRequest(BaseModel):
    action: str

    @field_validator('action')
    @classmethod
    def validate_action(cls, v):
        if v not in ('keep', 'delete'):
            raise ValueError("action must be 'keep' or 'delete'")
        return v


# ─── Campaigns ────────────────────────────────────────────────────────────────

CAMPAIGN_STATUS_VALUES = ('setup', 'active', 'closed')


class CreateCampaignRequest(BaseModel):
    name: str = Field(max_length=200)
    election_level: str
    state: str = Field(max_length=100)
    constituency_name: str = Field(max_length=200)
    party: str = Field(max_length=100)
    candidate_name: str = Field(max_length=200)
    target_vote_count: Optional[int] = None


class UpdateCampaignRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    state: Optional[str] = Field(default=None, max_length=100)
    constituency_name: Optional[str] = Field(default=None, max_length=200)
    party: Optional[str] = Field(default=None, max_length=100)
    candidate_name: Optional[str] = Field(default=None, max_length=200)
    target_vote_count: Optional[int] = None
    status: Optional[str] = None

    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in CAMPAIGN_STATUS_VALUES:
            raise ValueError(f"status must be one of: {CAMPAIGN_STATUS_VALUES}")
        return v


# ─── Zones & Polling Units ────────────────────────────────────────────────────

class CreateZoneRequest(BaseModel):
    name: str = Field(max_length=200)
    registered_voter_count: Optional[int] = None


class UpdateZoneRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    registered_voter_count: Optional[int] = None


class CreatePURequest(BaseModel):
    zone_id: str
    name: str = Field(max_length=300)
    inec_code: Optional[str] = Field(default=None, max_length=50)
    registered_voters: Optional[int] = None


class UpdatePURequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=300)
    inec_code: Optional[str] = Field(default=None, max_length=50)
    registered_voters: Optional[int] = None


# ─── Invites ──────────────────────────────────────────────────────────────────

class CreateCoordinatorInviteRequest(BaseModel):
    zone_id: str


class CreateAgentInviteRequest(BaseModel):
    name: str = Field(max_length=100)
    email: EmailStr
    phone: Optional[str] = None
    zone_id: Optional[str] = None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        # Phone is optional on an invite; validate E.164 only when provided.
        if v is None or v.strip() == '':
            return None
        if not E164_RE.match(v):
            raise ValueError('Phone must be in E.164 format (e.g. +2348012345678)')
        return v


class ClaimInviteRequest(BaseModel):
    token: str
    phone: Optional[str] = None
    otp: Optional[str] = None
    name: Optional[str] = Field(default=None, max_length=100)
    email: Optional[EmailStr] = None


# ─── Templates ────────────────────────────────────────────────────────────────

class CreateTemplateRequest(BaseModel):
    label: str = Field(max_length=200)
    body: str

    channel: str = 'both'

    @field_validator('body')
    @classmethod
    def validate_body(cls, v):
        if len(v) > 1000:
            raise ValueError('Template body must be 1000 characters or fewer')
        return v


class UpdateTemplateRequest(BaseModel):
    label: Optional[str] = Field(default=None, max_length=200)
    body: Optional[str] = None
    channel: Optional[str] = None

    @field_validator('body')
    @classmethod
    def validate_body(cls, v):
        if v is not None and len(v) > 1000:
            raise ValueError('Template body must be 1000 characters or fewer')
        return v

    @field_validator('channel')
    @classmethod
    def validate_channel(cls, v):
        if v is not None and v not in ('whatsapp', 'sms', 'both'):
            raise ValueError('channel must be whatsapp, sms, or both')
        return v


# ─── Sessions ─────────────────────────────────────────────────────────────────

class SessionFilterRequest(BaseModel):
    """Typed replacement for the raw `filter: dict` (H-6).
    All list values are validated against their enum sets before storage."""
    status: Optional[List[str]] = None
    pvc_status: Optional[List[str]] = None
    support_levels: Optional[List[str]] = None
    polling_unit_ids: Optional[List[str]] = None
    agent_ids: Optional[List[str]] = None

    @field_validator('status', mode='before')
    @classmethod
    def validate_status_list(cls, v):
        if v is None:
            return v
        for item in v:
            if item not in CONTACT_STATUS_VALUES:
                raise ValueError(f"Invalid status value: '{item}'")
        return v

    @field_validator('pvc_status', mode='before')
    @classmethod
    def validate_pvc_list(cls, v):
        if v is None:
            return v
        for item in v:
            if item not in PVC_STATUS_VALUES:
                raise ValueError(f"Invalid pvc_status value: '{item}'")
        return v

    @field_validator('support_levels', mode='before')
    @classmethod
    def validate_support_list(cls, v):
        if v is None:
            return v
        for item in v:
            if item not in SUPPORT_LEVEL_VALUES:
                raise ValueError(f"Invalid support_level value: '{item}'")
        return v


class CreateSessionRequest(BaseModel):
    template_id: str
    agent_ids: List[str]
    filter: SessionFilterRequest = SessionFilterRequest()


class LogSendRequest(BaseModel):
    voter_id: str
    channel: str = 'whatsapp'


# ─── Voter Seeding ────────────────────────────────────────────────────────────

class ClaimVoterRequest(BaseModel):
    """Agent claims a pre-seeded (INEC) voter by providing contact details."""
    phone: str
    support_level: str = 'unknown'
    pvc_status: str = 'unknown'
    age_range: Optional[str] = None
    gender: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if not E164_RE.match(v):
            raise ValueError('Phone must be in E.164 format (e.g. +2348012345678)')
        return v

    @field_validator('support_level')
    @classmethod
    def validate_support(cls, v):
        if v not in SUPPORT_LEVEL_VALUES:
            raise ValueError(f"support_level must be one of: {SUPPORT_LEVEL_VALUES}")
        return v

    @field_validator('pvc_status')
    @classmethod
    def validate_pvc(cls, v):
        if v not in PVC_STATUS_VALUES:
            raise ValueError(f"pvc_status must be one of: {PVC_STATUS_VALUES}")
        return v


# ─── Users ────────────────────────────────────────────────────────────────────

class UpdateMeRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)


class UpdateUserStatusRequest(BaseModel):
    status: str

    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        if v not in ('active', 'suspended'):
            raise ValueError('status must be active or suspended')
        return v
