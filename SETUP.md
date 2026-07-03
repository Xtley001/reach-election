# REACH Election — Deployment & Setup Guide

Render (backend) + Vercel (frontend) + Supabase (PostgreSQL).

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Supabase Database](#supabase-database)
3. [Backend — Render](#backend--render)
4. [Frontend — Vercel](#frontend--vercel)
5. [Environment Variables Reference](#environment-variables-reference)
6. [OTP Providers](#otp-providers)
7. [Image Uploads — Cloudinary](#image-uploads--cloudinary)
8. [Rate Limiting — Redis (Upstash)](#rate-limiting--redis-upstash)
9. [Error Tracking — Sentry](#error-tracking--sentry)
10. [Seeding the First Director](#seeding-the-first-director)
11. [Seeding Polling Units (run locally)](#seeding-polling-units-run-locally)
12. [INEC Voter CSV Import](#inec-voter-csv-import)
13. [Nightly Cleanup (pg_cron)](#nightly-cleanup-pgcron)
14. [Upgrading an Existing Database](#upgrading-an-existing-database)
15. [First-Run Checklist](#first-run-checklist)
16. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| Git | any recent |

---

## Supabase Database

Supabase provides a free-tier PostgreSQL instance with pg_cron built in — no separate database service needed on Render.

### Create the project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note the database password — you will need it once.
3. Go to **Settings → Database → Connection string** and copy the **Session pooler** URI:
   ```
   postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
   ```
   Use this as `DATABASE_URL` in Render. Do **not** use the direct connection host (`db.[ref].supabase.co`) — it may not resolve when the project is paused.

### Run the schema migration

Use the **SQL Editor** in Supabase (no local tooling required):

1. Open **SQL Editor → New query**.
2. Paste the full contents of `migrations/schema.sql`.
3. Click **Run**.

> You can also run locally with psql:
> ```bash
> "C:\Program Files\PostgreSQL\18\bin\psql" "postgresql://postgres.[ref]:..." -f migrations/schema.sql
> ```

### Enable pg_cron

Go to **Database → Extensions**, search for `pg_cron`, toggle it **on**. Required for nightly cleanup.

---

## Backend — Render

### Create the Web Service

1. Go to [render.com](https://render.com) → **New → Web Service**.
2. Connect your GitHub repo.

| Field | Value |
|---|---|
| **Root Directory** | *(leave blank)* |
| **Runtime** | Python 3 |
| **Build Command** | `pip install -r backend/requirements.txt` |
| **Start Command** | `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |

3. Add environment variables (see [reference table](#environment-variables-reference)).
4. Deploy.

> **Free tier:** Render spins down after 15 minutes of inactivity. First request after sleep takes ~30 s. Use [UptimeRobot](https://uptimerobot.com) (free) to ping `/health` every 5 minutes to keep it warm.

### Health check

Set health check path to `/health` in Render service settings.

---

## Frontend — Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `frontend`.
3. Framework preset: **Vite** (auto-detected).
4. Add environment variables under **Settings → Environment Variables**:
   - `VITE_API_URL` = `https://your-backend.onrender.com`
   - `VITE_ENV` = `production`
   - `VITE_SENTRY_DSN` = your Sentry DSN (optional)
5. Deploy.

> **Important:** Vite bakes env vars at build time. If you add or change a `VITE_*` variable, you must trigger a redeploy — go to **Deployments → latest → Redeploy**.

### CORS

Render's `ALLOWED_ORIGINS` must include the exact Vercel URL (no trailing slash):
```
ALLOWED_ORIGINS=https://your-app.vercel.app
```

---

## Environment Variables Reference

### Backend (Render → Environment tab)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase **session pooler** URI |
| `JWT_SECRET` | ✅ | 64-char random hex — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_SECRET_V1` | — | Previous JWT secret for key rotation (verify-only) |
| `ENVIRONMENT` | ✅ | `production` |
| `ALLOWED_ORIGINS` | ✅ | `https://your-app.vercel.app` |
| `FRONTEND_URL` | ✅ | Same Vercel URL — used in invite links |
| `TRUST_PROXY_HEADERS` | ✅ | `true` on Render |
| `EMAIL_OTP_PROVIDER` | ✅ | `brevo` |
| `BREVO_API_KEY` | ✅ | From Brevo → API Keys |
| `BREVO_SENDER` | ✅ | Verified sender email in Brevo |
| `SMS_OTP_PROVIDER` | — | `termii` (add when Termii key is ready) |
| `TERMII_API_KEY` | If SMS | From Termii dashboard |
| `TERMII_SENDER` | If SMS | Approved sender ID, max 11 chars (e.g. `REACH`) |
| `CLOUDINARY_URL` | If uploads | `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` |
| `REDIS_URL` | — | `rediss://...` from Upstash — persists rate-limit counters across restarts |
| `SENTRY_DSN` | — | From sentry.io → your project → DSN |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | — | Default: `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | — | Default: `30` |

### Frontend (Vercel → Settings → Environment Variables)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | ✅ | `https://your-backend.onrender.com` (no trailing slash) |
| `VITE_ENV` | ✅ | `production` |
| `VITE_SENTRY_DSN` | — | Same DSN as `SENTRY_DSN` above |

---

## OTP Providers

### Email — Brevo

Brevo sends transactional email via API (not SMTP). Works from Render without Gmail restrictions.

1. Sign up at [brevo.com](https://brevo.com) (free: 300 emails/day).
2. Go to **Account → API Keys** and create a key.
3. Go to **Senders & IPs → Senders** and verify your sender email.
   > **Note:** Using a Gmail address as sender works but may land in spam (freemail domain). For production, add a custom domain sender in **Senders & IPs → Domains** and authenticate DKIM.
4. Set in Render: `EMAIL_OTP_PROVIDER=brevo`, `BREVO_API_KEY=...`, `BREVO_SENDER=...`

### SMS — Termii

Termii is a Nigerian communications platform designed for +234 numbers.

1. Sign up at [termii.com](https://termii.com).
2. Go to **Settings → API Key** and copy your key.
3. Request sender ID approval under **Settings → Sender ID** (1–2 business days).
4. Set in Render: `SMS_OTP_PROVIDER=termii`, `TERMII_API_KEY=...`, `TERMII_SENDER=REACH`

> **Local development:** Set `OTP_PROVIDER=console` in your local `.env`. The OTP prints to the terminal — no credentials needed.

---

## Image Uploads — Cloudinary

Cloudinary handles campaign logo and user avatar uploads.

1. Sign up at [cloudinary.com](https://cloudinary.com) (free tier: 25 GB storage, 25 GB bandwidth/month).
2. From the Cloudinary dashboard, note your:
   - **Cloud name** (e.g. `dmnj4btxg`)
   - **API Key** (numeric, e.g. `779795173454257`)
   - **API Secret** (alphanumeric string)
3. Build a single `CLOUDINARY_URL` and set it in Render:
   ```
   CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
   ```
   Example:
   ```
   CLOUDINARY_URL=cloudinary://779795173454257:your_secret@dmnj4btxg
   ```

The backend (`storage.py`) auto-configures from this single URL. No need to set the three separate vars.

---

## Rate Limiting — Redis (Upstash)

Without Redis, rate-limit counters live in memory and reset on every Render cold-start. With Redis they persist across restarts and are shared across all workers.

1. Sign up at [upstash.com](https://upstash.com) (free tier: 10,000 commands/day).
2. Create a Redis database → choose **Global** region for lowest latency from Render.
3. Copy the **REST URL** — it looks like:
   ```
   rediss://default:PASSWORD@name-xxxxx.upstash.io:6379
   ```
4. Set in Render: `REDIS_URL=rediss://...`

The backend logs `Redis connected ✅` on startup when the connection succeeds.

---

## Error Tracking — Sentry

Sentry catches unhandled exceptions in both the FastAPI backend and the React frontend.

1. Sign up at [sentry.io](https://sentry.io) (free: 5,000 errors/month).
2. Create a **Python** project for the backend → copy the DSN.
3. Create a **React** project for the frontend → the DSN is the same format.
   > You can use one DSN for both or create two separate projects — your choice.
4. Set in Render: `SENTRY_DSN=https://...@....ingest.sentry.io/...`
5. Set in Vercel: `VITE_SENTRY_DSN=` (same DSN), then **redeploy**.

The backend reports at 10% trace sample rate (`traces_sample_rate=0.1`). The frontend also reports at 10%.

---

## Seeding the First Director

Accounts must be pre-created — no one can self-register. Run this block once in the **Supabase SQL Editor**, editing only the email at the top:

```sql
DO $$
DECLARE
  v_base_email  TEXT := 'you@example.com';  -- ← only edit this
  v_coord_email TEXT;
  v_agent_email TEXT;
  v_campaign_id UUID;
  v_zone_id     UUID;
  v_director_id UUID;
BEGIN
  v_coord_email := regexp_replace(v_base_email, '@', '+coord@');
  v_agent_email := regexp_replace(v_base_email, '@', '+agent@');

  INSERT INTO campaigns (name, election_level, state, constituency_name, party, candidate_name, status)
  VALUES ('My Campaign', 'governorship', 'Lagos', 'Lagos State', 'APC', 'Candidate Name', 'setup')
  RETURNING id INTO v_campaign_id;

  INSERT INTO zones (campaign_id, name)
  VALUES (v_campaign_id, 'Zone A')
  RETURNING id INTO v_zone_id;

  INSERT INTO users (name, email, role, status, campaign_id)
  VALUES ('Director', v_base_email, 'director', 'active', v_campaign_id)
  RETURNING id INTO v_director_id;

  UPDATE campaigns SET director_id = v_director_id WHERE id = v_campaign_id;

  INSERT INTO users (name, email, role, status, campaign_id, zone_id)
  VALUES ('Coordinator', v_coord_email, 'coordinator', 'active', v_campaign_id, v_zone_id);

  INSERT INTO users (name, email, role, status, campaign_id, zone_id)
  VALUES ('Agent', v_agent_email, 'agent', 'active', v_campaign_id, v_zone_id);

  RAISE NOTICE 'Done — coord: %, agent: %', v_coord_email, v_agent_email;
END $$;
```

This creates:
- **Director** → `you@example.com`
- **Coordinator** → `you+coord@example.com` (Gmail delivers `+` aliases to the same inbox)
- **Agent** → `you+agent@example.com`

After setup, coordinators and agents should be invited via the app's invite system instead.

---

## Seeding Polling Units (run locally)

> **Why locally?** Render's free tier has no shell access. The seeder downloads a ~12 MB CSV from GitHub and bulk-inserts ~174,000 polling unit records into `inec_reference_pus`. Run it once from your machine.

### Steps

1. Download `polling-units.csv` from the [inec-polling-units](https://github.com/mykeels/inec-polling-units) repo and save it to the project root as `polling-units.csv`.
2. Set `DATABASE_URL` to your Supabase session pooler URI.
3. Run:

```bash
# Windows
set DATABASE_URL=postgresql://postgres.[ref]:...
python run_seed.py

# macOS / Linux
DATABASE_URL="postgresql://..." python run_seed.py
```

Expected output:
```
INFO  Using local polling-units.csv…
INFO  Read 11.7 MB — parsing…
INFO  Built 174486 rows. Inserting into DB…
INFO    …21000 / 174486 rows
...
INFO  Done. 174486 inserted, 0 skipped.
```

The script is **idempotent** — already-present `inec_code` values are skipped via `ON CONFLICT DO NOTHING`. If your connection drops mid-run, just re-run.

---

## INEC Voter CSV Import

### Obtaining the voter register

The voter register requires a formal request to your INEC State Office. Your campaign must:

1. Submit a formal request letter to the relevant INEC State/LGA office.
2. Request the voter register for your target ward(s) or LGA(s).
3. INEC provides a CSV or Excel file per ward or polling unit.

> VIN scanning is not used. Agents search voters by name only.

### Expected CSV format

The importer auto-detects columns. Known aliases:

| Field | Accepted column names |
|---|---|
| Last name | `surname`, `last_name`, `lastname`, `family_name` |
| First name | `firstname`, `first_name`, `given_name`, `other_names` |
| VIN | `vin`, `voter_id`, `voter_identification_number` |
| INEC code | `inec_code`, `pu_code`, `polling_unit_code` |
| Gender | `gender`, `sex` |
| Age | `age`, `age_range` |

Minimum per row: a name field + a valid INEC code that exists in your campaign territory.

### Import steps

1. Director logs in and navigates to **Import** (sidebar).
2. Review pre-import requirements: polling units must already be set up in Territory.
3. Drag-and-drop the CSV (max 20 MB).
4. Click **Import Voters**.
5. Review: imported / skipped (duplicate VINs) / errors (unmatched INEC codes).

---

## Nightly Cleanup (pg_cron)

Run once in Supabase SQL Editor to schedule the nightly cleanup:

```sql
SELECT cron.schedule('reach-cleanup', '0 3 * * *', 'SELECT reach_cleanup()');
```

Verify it was scheduled:
```sql
SELECT * FROM cron.job;
```

The `reach_cleanup()` function purges expired OTP sessions and revoked/expired refresh tokens. It runs at 03:00 UTC daily.

---

## Upgrading an Existing Database

If you already have REACH deployed and are adding voter seeding for the first time:

1. Open **SQL Editor → New query** in Supabase.
2. Paste the contents of `migrations/002_add_voter_seeding.sql`.
3. Click **Run**.

This migration is idempotent — safe to run multiple times.

---

## First-Run Checklist

- [ ] Supabase project created, schema migration run
- [ ] pg_cron extension enabled
- [ ] pg_cron cleanup job scheduled
- [ ] Render service deployed with all required env vars
- [ ] Vercel project deployed with `VITE_API_URL` and `VITE_ENV`
- [ ] CORS verified: open the Vercel URL and complete a login
- [ ] Director account seeded via SQL
- [ ] Polling units seeded from local machine (`python run_seed.py`)
- [ ] Cloudinary configured — test by uploading a campaign logo
- [ ] Redis connected — check Render logs for `Redis connected ✅`
- [ ] Sentry configured — trigger a test error and verify it appears in your Sentry dashboard

---

## Troubleshooting

**`Failed to fetch` on login**
Check that `VITE_API_URL` is set in Vercel environment variables AND that you've redeployed after setting it (Vite bakes env vars at build time).

**CSP blocks API calls**
The `connect-src` in `frontend/index.html` must include your Render URL. If you change domains, update that file and redeploy.

**CORS errors**
`ALLOWED_ORIGINS` on Render must exactly match the Vercel URL — protocol included, no trailing slash.

**`RuntimeError: FATAL: OTP_PROVIDER=console is not allowed in production`**
Set `EMAIL_OTP_PROVIDER=brevo` in Render. The startup guard passes if at least one channel-specific provider is configured.

**OTP not received (email)**
- Check Brevo → **Transactional → Email logs**.
- Confirm the sender is verified under **Senders & IPs → Senders**.
- Gmail senders may land in spam — check the spam folder.

**OTP not received (SMS)**
- Check Termii → **Reports → SMS** for delivery status.
- Nigerian numbers must be E.164 format: `+2348033000000`.
- Confirm sender ID is approved (**Settings → Sender ID**).

**Image upload fails**
- Check Render logs for `Cloudinary is not configured` — means `CLOUDINARY_URL` is not set.
- Format: `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`

**`Redis connected` not in logs**
- Check `REDIS_URL` is set and starts with `rediss://` (TLS) for Upstash.
- The app falls back to in-memory rate limiting — not an error, just no persistence.

**Seeder fails partway through**
Re-run `python run_seed.py` — rows already inserted are skipped. The seeder retries failed chunks up to 5 times with 15–60 s backoff to survive temporary network drops.

**Render service cold-start delay**
Free tier spins down after 15 minutes idle. First request takes ~30 s. Use [UptimeRobot](https://uptimerobot.com) to ping `/health` every 5 minutes.

**`No account found` on login**
Accounts must be pre-created. Run the director seed SQL, or invite the user via the app's invite system. Self-registration is disabled by design.

**Supabase project paused**
Free Supabase projects pause after 1 week of inactivity. Go to your Supabase dashboard and click **Resume project**. DNS resolution will fail until the project is active.
