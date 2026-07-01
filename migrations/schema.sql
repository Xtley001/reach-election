-- REACH Election — Full Schema
-- Run once on a fresh database: psql $DATABASE_URL -f migrations/schema.sql

SET statement_timeout = '0';
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE user_role AS ENUM (
  'director',
  'coordinator',
  'agent'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE user_status AS ENUM ('pending','active','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE election_level AS ENUM (
  'governorship','senatorial','house_of_reps',
  'state_assembly','lga_chairman','councillorship'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE pvc_status AS ENUM ('has_pvc','no_pvc','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE support_level AS ENUM (
  'strong_supporter','leaning','undecided','soft_opposition','unknown'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE contact_status AS ENUM (
  'unreached',
  'contacted',
  'no_answer',
  'wrong_number',
  'confirmed_voter',
  'pvc_issue',
  'needs_follow_up',
  'unreachable',
  'declined'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE recruitment_source AS ENUM (
  'house_visit','rally','referral','whatsapp','csv_import','other'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE message_channel AS ENUM ('whatsapp','sms','both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE contact_channel AS ENUM (
  'call','visit','whatsapp','sms','other'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE session_status AS ENUM (
  'draft','active','completed','cancelled'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE broadcast_scope AS ENUM (
  'all_agents','zone','individual'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE broadcast_channel AS ENUM ('in_app','sms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE invite_role AS ENUM ('coordinator','agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaigns (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(200)  NOT NULL,
  election_level      election_level NOT NULL,
  state               VARCHAR(100)  NOT NULL,
  constituency_name   VARCHAR(200)  NOT NULL,
  party               VARCHAR(100)  NOT NULL,
  candidate_name      VARCHAR(200)  NOT NULL,
  logo_url            VARCHAR(500),
  target_vote_count   INTEGER,
  status              VARCHAR(20)   NOT NULL DEFAULT 'setup',
  director_id         UUID,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_campaign_status CHECK (status IN ('setup','active','closed')),
  CONSTRAINT chk_target_positive CHECK (target_vote_count IS NULL OR target_vote_count > 0)
);

CREATE TABLE IF NOT EXISTS zones (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name                  VARCHAR(200) NOT NULL,
  registered_voter_count INTEGER,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_zone_name_campaign UNIQUE (campaign_id, name)
);

CREATE INDEX IF NOT EXISTS ix_zones_campaign_id ON zones(campaign_id);

CREATE TABLE IF NOT EXISTS polling_units (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id           UUID         NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  campaign_id       UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name              VARCHAR(300) NOT NULL,
  inec_code         VARCHAR(50),
  registered_voters INTEGER,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_pu_inec_code_campaign UNIQUE (campaign_id, inec_code)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT uq_pu_name_zone UNIQUE (zone_id, name)
);

CREATE INDEX IF NOT EXISTS ix_pu_zone_id     ON polling_units(zone_id);
CREATE INDEX IF NOT EXISTS ix_pu_campaign_id ON polling_units(campaign_id);

CREATE TABLE IF NOT EXISTS users (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID         REFERENCES campaigns(id),
  zone_id     UUID         REFERENCES zones(id),
  name        VARCHAR(100),
  phone       VARCHAR(20),
  email       VARCHAR(254),
  avatar_url  VARCHAR(500),
  role        user_role    NOT NULL DEFAULT 'agent',
  status      user_status  NOT NULL DEFAULT 'pending',
  last_active_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_phone_campaign  UNIQUE (campaign_id, phone),
  CONSTRAINT uq_user_email_campaign  UNIQUE (campaign_id, email),
  CONSTRAINT chk_phone_e164          CHECK (phone IS NULL OR phone ~ E'^\\+[1-9]\\d{7,14}$'),
  CONSTRAINT chk_director_no_zone    CHECK (
    (role = 'director' AND zone_id IS NULL)
    OR role != 'director'
  ),
  CONSTRAINT chk_coord_agent_has_zone CHECK (
    (role IN ('coordinator','agent') AND zone_id IS NOT NULL)
    OR role = 'director'
  )
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS director_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS ix_users_campaign_id ON users(campaign_id);
CREATE INDEX IF NOT EXISTS ix_users_zone_id     ON users(zone_id);
CREATE INDEX IF NOT EXISTS ix_users_role        ON users(role);
CREATE INDEX IF NOT EXISTS ix_users_status      ON users(status);

CREATE TABLE IF NOT EXISTS otp_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_hash VARCHAR(64) NOT NULL,
  user_id         UUID        REFERENCES users(id),
  otp_hash        TEXT        NOT NULL,
  channel         VARCHAR(10) NOT NULL,
  attempts        INTEGER     NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_otp_identifier UNIQUE (identifier_hash)
);

CREATE INDEX IF NOT EXISTS ix_otp_identifier ON otp_sessions(identifier_hash);
CREATE INDEX IF NOT EXISTS ix_otp_user_id    ON otp_sessions(user_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_rt_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_rt_token_hash ON refresh_tokens(token_hash);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID         NOT NULL REFERENCES campaigns(id),
  zone_id        UUID         REFERENCES zones(id),
  token          VARCHAR(128) NOT NULL UNIQUE,
  role           invite_role  NOT NULL,
  invited_by     UUID         NOT NULL REFERENCES users(id),
  invited_name   VARCHAR(100),
  invited_email  VARCHAR(254),
  invited_phone  VARCHAR(20),
  expires_at     TIMESTAMPTZ   NOT NULL,
  claimed_at     TIMESTAMPTZ,
  claimed_by     UUID          REFERENCES users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_invite_agent_email UNIQUE (campaign_id, invited_email)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT chk_invite_phone CHECK (invited_phone IS NULL OR invited_phone ~ E'^\\+[1-9]\\d{7,14}$')
);

CREATE INDEX IF NOT EXISTS ix_invite_token      ON invite_tokens(token);
CREATE INDEX IF NOT EXISTS ix_invite_campaign   ON invite_tokens(campaign_id);
CREATE INDEX IF NOT EXISTS ix_invite_zone       ON invite_tokens(zone_id);

CREATE TABLE IF NOT EXISTS voters (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID              NOT NULL REFERENCES campaigns(id),
  zone_id           UUID              NOT NULL REFERENCES zones(id),
  polling_unit_id   UUID              NOT NULL REFERENCES polling_units(id),
  added_by          UUID              NOT NULL REFERENCES users(id),

  name              VARCHAR(200)      NOT NULL,
  phone             VARCHAR(20),                                           -- NULL for seeded (INEC) voters until claimed
  pvc_status        pvc_status        NOT NULL DEFAULT 'unknown',
  support_level     support_level     NOT NULL DEFAULT 'unknown',

  recruitment_source recruitment_source,
  age_range         VARCHAR(10),
  gender            VARCHAR(10),
  notes             VARCHAR(500),

  current_status    contact_status    NOT NULL DEFAULT 'unreached',

  -- Seeding fields
  vin               VARCHAR(19),
  is_seeded         BOOLEAN           NOT NULL DEFAULT FALSE,
  voter_import_id   UUID              REFERENCES voter_imports(id),

  is_duplicate_flag BOOLEAN           NOT NULL DEFAULT FALSE,
  duplicate_of      UUID              REFERENCES voters(id),

  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- uq_voter_phone_campaign removed: cross-agent duplicates allowed (Phase 4 AC)
  CONSTRAINT chk_voter_phone_e164    CHECK (phone IS NULL OR phone ~ E'^\\+[1-9]\\d{7,14}$'),
  CONSTRAINT chk_voter_age_range     CHECK (age_range IN ('18-25','26-35','36-50','51+') OR age_range IS NULL),
  CONSTRAINT chk_voter_gender        CHECK (gender IN ('male','female','other') OR gender IS NULL)
);

CREATE INDEX IF NOT EXISTS ix_voter_campaign_id     ON voters(campaign_id);
CREATE INDEX IF NOT EXISTS ix_voter_zone_id         ON voters(zone_id);
CREATE INDEX IF NOT EXISTS ix_voter_polling_unit_id ON voters(polling_unit_id);
CREATE INDEX IF NOT EXISTS ix_voter_added_by        ON voters(added_by);
CREATE INDEX IF NOT EXISTS ix_voter_status          ON voters(current_status);
CREATE INDEX IF NOT EXISTS ix_voter_phone           ON voters(phone);
CREATE INDEX IF NOT EXISTS ix_voter_pvc             ON voters(pvc_status);
CREATE INDEX IF NOT EXISTS ix_voter_support         ON voters(support_level);
CREATE INDEX IF NOT EXISTS ix_voter_deleted         ON voters(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_voter_vin             ON voters(vin) WHERE vin IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_voter_is_seeded       ON voters(is_seeded, campaign_id) WHERE is_seeded = TRUE;

CREATE TABLE IF NOT EXISTS voter_contacts (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id      UUID             NOT NULL REFERENCES voters(id),
  agent_id      UUID             NOT NULL REFERENCES users(id),
  campaign_id   UUID             NOT NULL REFERENCES campaigns(id),
  status_set    contact_status   NOT NULL,
  channel       contact_channel  NOT NULL DEFAULT 'call',
  outcome_note  VARCHAR(500),
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_vc_voter_id    ON voter_contacts(voter_id);
CREATE INDEX IF NOT EXISTS ix_vc_agent_id    ON voter_contacts(agent_id);
CREATE INDEX IF NOT EXISTS ix_vc_campaign_id ON voter_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS ix_vc_created_at  ON voter_contacts(created_at DESC);

CREATE TABLE IF NOT EXISTS message_templates (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID           NOT NULL REFERENCES campaigns(id),
  label       VARCHAR(200)   NOT NULL,
  body        TEXT           NOT NULL,
  channel     message_channel NOT NULL DEFAULT 'both',
  is_active   BOOLEAN        NOT NULL DEFAULT TRUE,
  created_by  UUID           NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_template_body_len CHECK (char_length(body) <= 1000)
);

CREATE INDEX IF NOT EXISTS ix_template_campaign ON message_templates(campaign_id);

CREATE TABLE IF NOT EXISTS messaging_sessions (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID           NOT NULL REFERENCES campaigns(id),
  zone_id         UUID           NOT NULL REFERENCES zones(id),
  created_by      UUID           NOT NULL REFERENCES users(id),
  template_id     UUID           NOT NULL REFERENCES message_templates(id),
  filter_criteria JSONB          NOT NULL DEFAULT '{}',
  status          session_status NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  activated_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_session_campaign ON messaging_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS ix_session_zone     ON messaging_sessions(zone_id);
CREATE INDEX IF NOT EXISTS ix_session_status   ON messaging_sessions(status);

CREATE TABLE IF NOT EXISTS messaging_session_assignments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES messaging_sessions(id) ON DELETE CASCADE,
  agent_id     UUID        NOT NULL REFERENCES users(id),
  voter_count  INTEGER     NOT NULL DEFAULT 0,
  sent_count   INTEGER     NOT NULL DEFAULT 0,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  CONSTRAINT uq_session_agent UNIQUE (session_id, agent_id)
);

CREATE INDEX IF NOT EXISTS ix_msa_session ON messaging_session_assignments(session_id);
CREATE INDEX IF NOT EXISTS ix_msa_agent   ON messaging_session_assignments(agent_id);

CREATE TABLE IF NOT EXISTS message_sends (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id      UUID            NOT NULL REFERENCES voters(id),
  session_id    UUID            NOT NULL REFERENCES messaging_sessions(id),
  template_id   UUID            NOT NULL REFERENCES message_templates(id),
  agent_id      UUID            NOT NULL REFERENCES users(id),
  campaign_id   UUID            NOT NULL REFERENCES campaigns(id),
  channel       message_channel NOT NULL,
  message_body  TEXT            NOT NULL,
  sent_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_send_voter_session UNIQUE (voter_id, session_id)
);

CREATE INDEX IF NOT EXISTS ix_ms_campaign      ON message_sends(campaign_id);
CREATE INDEX IF NOT EXISTS ix_ms_session       ON message_sends(session_id);
CREATE INDEX IF NOT EXISTS ix_ms_agent         ON message_sends(agent_id);
CREATE INDEX IF NOT EXISTS ix_ms_sent_at       ON message_sends(sent_at DESC);
CREATE INDEX IF NOT EXISTS ix_ms_session_agent ON message_sends(session_id, agent_id);

CREATE TABLE IF NOT EXISTS broadcasts (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID             NOT NULL REFERENCES campaigns(id),
  sent_by          UUID             NOT NULL REFERENCES users(id),
  scope            broadcast_scope  NOT NULL DEFAULT 'all_agents',
  target_zone_id   UUID             REFERENCES zones(id),
  target_user_id   UUID             REFERENCES users(id),
  body             TEXT             NOT NULL,
  delivery_channel broadcast_channel NOT NULL DEFAULT 'in_app',
  scheduled_at     TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_broadcast_campaign ON broadcasts(campaign_id);
CREATE INDEX IF NOT EXISTS ix_broadcast_zone     ON broadcasts(target_zone_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID        REFERENCES campaigns(id),
  user_id     UUID        REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   VARCHAR(100),
  metadata    JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_campaign ON audit_logs(campaign_id);
CREATE INDEX IF NOT EXISTS ix_audit_user     ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_action   ON audit_logs(action);
CREATE INDEX IF NOT EXISTS ix_audit_created  ON audit_logs(created_at DESC);

-- ─── Triggers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_voter_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE voters
  SET current_status = NEW.status_set
  WHERE id = NEW.voter_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voter_status ON voter_contacts;
CREATE TRIGGER trg_voter_status
  AFTER INSERT ON voter_contacts
  FOR EACH ROW EXECUTE FUNCTION update_voter_status();

CREATE OR REPLACE FUNCTION increment_session_sent()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE messaging_session_assignments
  SET sent_count = sent_count + 1
  WHERE session_id = NEW.session_id AND agent_id = NEW.agent_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_sent ON message_sends;
CREATE TRIGGER trg_session_sent
  AFTER INSERT ON message_sends
  FOR EACH ROW EXECUTE FUNCTION increment_session_sent();

-- ─── Views ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW voter_queue_priority AS
SELECT
  v.*,
  CASE v.current_status
    WHEN 'unreached'     THEN 1
    WHEN 'pvc_issue'     THEN 2
    WHEN 'needs_follow_up' THEN 3
    WHEN 'no_answer'     THEN 4
    WHEN 'confirmed_voter' THEN 5
    ELSE 99
  END AS priority_order
FROM voters v
WHERE v.deleted_at IS NULL
  AND v.current_status NOT IN ('declined','wrong_number','unreachable');

-- ─── Voter Seeding Support ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS voter_imports (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID         NOT NULL REFERENCES campaigns(id),
  imported_by  UUID         NOT NULL REFERENCES users(id),
  filename     VARCHAR(255) NOT NULL,
  total_rows   INTEGER      NOT NULL DEFAULT 0,
  imported     INTEGER      NOT NULL DEFAULT 0,
  skipped      INTEGER      NOT NULL DEFAULT 0,
  errors       INTEGER      NOT NULL DEFAULT 0,
  status       VARCHAR(20)  NOT NULL DEFAULT 'processing',
  error_detail JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_import_status CHECK (status IN ('processing','completed','failed'))
);

CREATE INDEX IF NOT EXISTS ix_vi_campaign  ON voter_imports(campaign_id);
CREATE INDEX IF NOT EXISTS ix_vi_status    ON voter_imports(status);

CREATE TABLE IF NOT EXISTS inec_reference_pus (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code        VARCHAR(3)   NOT NULL,
  state_name        VARCHAR(100) NOT NULL,
  lga_code          VARCHAR(5)   NOT NULL,
  lga_name          VARCHAR(200) NOT NULL,
  ward_code         VARCHAR(5)   NOT NULL,
  ward_name         VARCHAR(200) NOT NULL,
  pu_code           VARCHAR(5)   NOT NULL,
  pu_name           VARCHAR(300) NOT NULL,
  inec_code         VARCHAR(25)  NOT NULL UNIQUE,
  registered_voters INTEGER,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ref_pu_inec_code ON inec_reference_pus(inec_code);
CREATE INDEX IF NOT EXISTS ix_ref_pu_state     ON inec_reference_pus(state_name);
CREATE INDEX IF NOT EXISTS ix_ref_pu_lga       ON inec_reference_pus(state_name, lga_name);
CREATE INDEX IF NOT EXISTS ix_ref_pu_ward      ON inec_reference_pus(state_name, lga_name, ward_name);

-- ─── Maintenance / Cleanup (M-9) ──────────────────────────────────────────────
-- These statements are safe to run on a schedule (e.g. pg_cron daily job).
-- They delete rows that are no longer operationally useful and cannot be
-- "rotated back" — expired OTP sessions and revoked/expired refresh tokens.

-- Delete OTP sessions that have expired AND are fully resolved (no pending lock).
-- Locked sessions are kept until locked_until passes so the lockout is honoured
-- even if the user tries a new send-otp immediately after.
DELETE FROM otp_sessions
WHERE expires_at < NOW() - INTERVAL '1 hour'
  AND (locked_until IS NULL OR locked_until < NOW());

-- Delete refresh tokens that are both revoked and older than 30 days
-- (keep revoked tokens briefly for forensic audit purposes).
DELETE FROM refresh_tokens
WHERE revoked_at IS NOT NULL
  AND revoked_at < NOW() - INTERVAL '30 days';

-- Delete refresh tokens that expired naturally and were never revoked.
DELETE FROM refresh_tokens
WHERE expires_at < NOW() - INTERVAL '1 day'
  AND revoked_at IS NULL;

-- Wrap the above as a named function so pg_cron can call it with a single line:
--   SELECT cron.schedule('reach-cleanup', '0 3 * * *', 'SELECT reach_cleanup()');
CREATE OR REPLACE FUNCTION reach_cleanup() RETURNS void LANGUAGE sql AS $$
  DELETE FROM otp_sessions
  WHERE expires_at < NOW() - INTERVAL '1 hour'
    AND (locked_until IS NULL OR locked_until < NOW());

  DELETE FROM refresh_tokens
  WHERE revoked_at IS NOT NULL
    AND revoked_at < NOW() - INTERVAL '30 days';

  DELETE FROM refresh_tokens
  WHERE expires_at < NOW() - INTERVAL '1 day'
    AND revoked_at IS NULL;
$$;
