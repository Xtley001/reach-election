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
7. [First-Run Checklist](#first-run-checklist)
8. [Seeding Polling Units (run locally)](#seeding-polling-units-run-locally)
9. [INEC Voter CSV Import](#inec-voter-csv-import)
10. [Nightly Cleanup (pg_cron)](#nightly-cleanup-pgcron)
11. [Upgrading an Existing Database](#upgrading-an-existing-database)
12. [Troubleshooting](#troubleshooting)

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
2. Note the database password you set — you will need it once.
3. Go to **Settings → Database** and copy the **Connection string** (URI format):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[REF].supabase.co:5432/postgres
   ```
   Use this as `DATABASE_URL` in both local `.env` and Render.

### Run the schema migration

Use the Supabase **SQL Editor** (no local tooling required):

1. Open **SQL Editor** in your Supabase dashboard.
2. Click **New query**.
3. Paste the full contents of `migrations/schema.sql`.
4. Click **Run**.

That's it — all tables, indexes, constraints, and the `reach_cleanup` function are created in one shot.

> You can also run migrations locally if you have `psql` installed:
> ```bash
> psql "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" -f migrations/schema.sql
> ```

---

## Backend — Render

### Create the Web Service

1. Go to [render.com](https://render.com) and click **New → Web Service**.
2. Connect your GitHub repo.
3. Set the following:

| Field | Value |
|---|---|
| **Root Directory** | *(leave blank)* |
| **Runtime** | Python 3 |
| **Build Command** | `pip install -r backend/requirements.txt` |
| **Start Command** | `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |

4. Add all environment variables from the [reference table](#environment-variables-reference) below.
5. Deploy.

> **Free tier note:** Render's free tier spins down after 15 minutes of inactivity. The first request after a cold start takes ~30 seconds. This is fine for a campaign tool used by active agents. To avoid this, upgrade to the Starter plan ($7/month) or keep the service warm with a scheduled ping.

### Health check

Set the health check path to `/v1/health` in your Render service settings.

---

## Frontend — Vercel

1. Import the repo on [vercel.com](https://vercel.com).
2. Set **Root Directory** to `frontend/`.
3. Framework preset: **Vite** (auto-detected).
4. Add `VITE_API_URL` under **Settings → Environment Variables**.
5. Deploy.

### CORS

Your Render backend `ALLOWED_ORIGINS` must include the exact Vercel URL (no trailing slash):

```
ALLOWED_ORIGINS=https://your-app.vercel.app
```

If you use a custom domain on Vercel, add it too (comma-separated).

---

## Environment Variables Reference

### Backend (Render → Environment tab)

| Variable | Required | Example / Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase connection string (see above) |
| `JWT_SECRET` | ✅ | 64-char random string — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_SECRET_V1` | No | Previous JWT secret for key rotation (verify-only) |
| `ENVIRONMENT` | ✅ | `production` |
| `ALLOWED_ORIGINS` | ✅ | `https://your-app.vercel.app` |
| `FRONTEND_URL` | ✅ | `https://your-app.vercel.app` — used in invite links |
| `TRUST_PROXY_HEADERS` | ✅ | `true` on Render (it sets `X-Forwarded-For` reliably) |
| `EMAIL_OTP_PROVIDER` | ✅ | `brevo` |
| `SMS_OTP_PROVIDER` | ✅ | `termii` |
| `BREVO_API_KEY` | ✅ | From Brevo dashboard → API Keys |
| `BREVO_SENDER` | ✅ | Verified sender email, e.g. `noreply@yourdomain.com` |
| `TERMII_API_KEY` | ✅ | From Termii dashboard |
| `TERMII_SENDER` | ✅ | Approved sender ID (max 11 chars), e.g. `REACH` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default: `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Default: `30` |
| `CLOUDINARY_CLOUD_NAME` | If avatars | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | If avatars | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | If avatars | Cloudinary API secret |
| `REDIS_URL` | No | Redis URL — for rate-limit persistence across restarts |
| `SENTRY_DSN` | No | Sentry error tracking |

### Frontend (Vercel → Settings → Environment Variables)

| Variable | Required | Value |
|---|---|---|
| `VITE_API_URL` | ✅ | `https://your-backend.onrender.com` |

---

## OTP Providers

### Email — Brevo

Brevo sends transactional email via their API (not SMTP). This works from Render without any Gmail or SMTP restrictions.

1. Sign up at [brevo.com](https://brevo.com) (free tier: 300 emails/day).
2. Go to **Account → API Keys** and create a key.
3. Go to **Senders & IPs → Senders** and verify your sender email.
4. Set in Render:
   ```
   EMAIL_OTP_PROVIDER=brevo
   BREVO_API_KEY=xkeysib-...
   BREVO_SENDER=noreply@yourdomain.com
   ```

### SMS — Termii

Termii is a Nigerian communications platform designed for Nigerian (+234) numbers. Registration and approval are straightforward.

1. Sign up at [termii.com](https://termii.com).
2. Complete account verification.
3. Go to **Settings → API Key** and copy your key.
4. Request sender ID approval for `REACH` (or your preferred 11-char name) under **Settings → Sender ID** — approval typically takes 1–2 business days.
5. Set in Render:
   ```
   SMS_OTP_PROVIDER=termii
   TERMII_API_KEY=TL...
   TERMII_SENDER=REACH
   ```

> **Local development:** Set `OTP_PROVIDER=console` in your local `.env`. The OTP will print to the terminal — no provider credentials needed.

---

## First-Run Checklist

After initial deploy:

- [ ] Run schema migration in Supabase SQL Editor (`migrations/schema.sql`)
- [ ] Set all Render environment variables
- [ ] Set `VITE_API_URL` in Vercel and redeploy
- [ ] Verify CORS by opening the Vercel frontend and completing a login
- [ ] Seed national polling units (see below — run from your local machine)
- [ ] Set up pg_cron nightly cleanup (see below)
- [ ] Test an OTP login via both email and SMS

---

## Seeding Polling Units (run locally)

> **Why local?** Render's free tier has no shell access. The seeder script downloads ~37 JSON files from GitHub and inserts ~176,000 polling unit records into `inec_reference_pus`. Run it once from your local machine, pointing at your Supabase database.

### Steps

```bash
# 1. Clone the repo locally if you haven't already
git clone <your-repo-url>
cd reach-election

# 2. Install backend dependencies
pip install -r backend/requirements.txt

# 3. Set your Supabase DATABASE_URL
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"

# 4. Run the seeder
python -m backend.scripts.seed_polling_units
```

Expected output:
```
INFO  Fetching .../abia.json…
INFO    Abia: 2,963 PUs processed
INFO  Fetching .../adamawa.json…
...
INFO  Seeding complete. 176,846 inserted, 0 skipped (already present).
```

The script is **idempotent** — re-running it skips already-present records. It uses batched inserts of 1,000 rows and takes about 2–5 minutes depending on your connection.

### After seeding

Directors can now use the **Territory** page to assign polling units from the national reference to their campaign zones. The `inec_code` on each unit links INEC import data to your territory.

---

## INEC Voter CSV Import

### Obtaining the voter register

The voter register (names, VINs) requires a formal request to your INEC State Office. This data is not publicly downloadable. Your campaign must:

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
5. Review the result: imported / skipped (duplicate VINs) / errors (unmatched INEC codes).

### Agent claim flow

1. Agent opens **Add Voter** and types the voter's name (min 2 characters).
2. Live search returns INEC-verified matches within their zone.
3. Agent taps the correct voter — the detail card appears.
4. Enters the voter's phone number + taps their support level.
5. Submits — voter is claimed and linked to that agent. Target: **≤15 seconds per entry**.

---

## Nightly Cleanup (pg_cron)

The `reach_cleanup()` function purges expired OTP sessions and revoked/expired refresh tokens. Supabase has pg_cron available — run this once in the Supabase SQL Editor:

```sql
SELECT cron.schedule(
  'reach-nightly-cleanup',
  '0 3 * * *',
  'SELECT reach_cleanup();'
);
```

To verify it was scheduled:

```sql
SELECT * FROM cron.job;
```

---

## Upgrading an Existing Database

If you already have REACH deployed and are adding voter seeding for the first time, run the incremental migration instead of the full schema. In the Supabase SQL Editor:

1. Open **SQL Editor → New query**.
2. Paste the contents of `migrations/002_add_voter_seeding.sql`.
3. Click **Run**.

This migration is idempotent — safe to run multiple times. It adds the `voter_imports` table, `inec_reference_pus` table, new columns on `voters` (`vin`, `is_seeded`, `voter_import_id`), makes `phone` nullable for seeded voters, and adds the required indexes.

After the migration, run the polling unit seeder from your local machine (see above).

---

## Troubleshooting

**CORS errors in browser**
Ensure `ALLOWED_ORIGINS` on the backend matches the exact Vercel URL — protocol included, no trailing slash.

**`401` on every request after login**
Check `VITE_API_URL` points to the correct Render URL. Ensure both are on HTTPS (`ENVIRONMENT=production` and `SECURE_COOKIES` implicit). Check that `TRUST_PROXY_HEADERS=true` is set on Render.

**OTP not received (email)**
- Check Brevo dashboard → **Transactional → Email logs** for delivery status.
- Verify the sender address is approved under **Senders & IPs**.
- Confirm `EMAIL_OTP_PROVIDER=brevo` and `BREVO_API_KEY` is set in Render.

**OTP not received (SMS)**
- Check Termii dashboard → **Reports → SMS** for delivery status.
- Confirm the sender ID is approved (check **Settings → Sender ID**).
- Nigerian numbers must be in E.164 format: `+2348033000000`.
- Confirm `SMS_OTP_PROVIDER=termii` and `TERMII_API_KEY` is set in Render.

**Seeder fails with `URLError`**
The seeder downloads from GitHub raw URLs. Check your internet connection. If one state fails, re-run — already-inserted rows are skipped.

**INEC code mismatch on voter import**
The INEC code in your CSV must match a code in `inec_reference_pus` AND be linked to a polling unit in your territory. Inspect format with:
```sql
SELECT inec_code FROM inec_reference_pus WHERE state_name ILIKE '%lagos%' LIMIT 5;
```
Format is `SS/LL/WWW/PPPP` with zero-padded segments.

**Render service cold-start delay**
The free tier spins down after 15 minutes idle. First request takes ~30s. Upgrade to Starter ($7/mo) or add an external uptime monitor (UptimeRobot free tier pings every 5 min) to keep the service warm.
