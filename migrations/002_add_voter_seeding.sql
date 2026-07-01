-- REACH Election — Migration 002: Voter Seeding Support
-- Safe to run on an existing database (all statements are idempotent).
-- For a fresh install, schema.sql already includes these definitions.

-- ── 1. voter_imports tracking table ──────────────────────────────────────────

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

-- ── 2. INEC national reference polling units ──────────────────────────────────

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

-- ── 3. Add seeding columns to voters ─────────────────────────────────────────

ALTER TABLE voters ADD COLUMN IF NOT EXISTS vin VARCHAR(19);
ALTER TABLE voters ADD COLUMN IF NOT EXISTS is_seeded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE voters ADD COLUMN IF NOT EXISTS voter_import_id UUID REFERENCES voter_imports(id);

-- Allow phone to be NULL for seeded voters (INEC data has no phone numbers)
ALTER TABLE voters ALTER COLUMN phone DROP NOT NULL;

-- Update the E.164 check to allow NULL (seeded voters have no phone yet)
DO $$ BEGIN
  ALTER TABLE voters DROP CONSTRAINT IF EXISTS chk_voter_phone_e164;
  ALTER TABLE voters ADD CONSTRAINT chk_voter_phone_e164
    CHECK (phone IS NULL OR phone ~ E'^\\+[1-9]\\d{7,14}$');
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS ix_voter_vin       ON voters(vin) WHERE vin IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_voter_is_seeded ON voters(is_seeded, campaign_id) WHERE is_seeded = TRUE;
