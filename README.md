# REACH Election

A field-operations platform for election campaigns. Agents log voters door-to-door; coordinators track canvassing progress zone by zone; directors see the full campaign north-star dashboard. Messaging sessions let coordinators dispatch targeted WhatsApp/SMS outreach batches to agents with pre-built templates.

---

## Architecture

```
reach-election/
├── backend/              FastAPI application (Python 3.11+)
│   ├── main.py           App factory, CORS, security headers, rate limiter, Sentry
│   ├── config.py         Pydantic-settings environment config
│   ├── models.py         SQLAlchemy ORM models (PostgreSQL)
│   ├── schemas.py        Pydantic v2 request/response schemas
│   ├── auth.py           OTP generation, bcrypt hashing, JWT, Brevo/Termii dispatch
│   ├── dependencies.py   FastAPI dependency injectors (auth, RBAC)
│   ├── database.py       SQLAlchemy engine + session factory
│   ├── limiter.py        SlowAPI rate-limiter (Redis-backed via Upstash)
│   ├── storage.py        Cloudinary image upload
│   ├── email_client.py   HTML email templates (OTP, invite)
│   ├── scripts/
│   │   └── seed_polling_units.py  Seeds inec_reference_pus from polling-units.csv
│   └── routers/
│       ├── auth.py           OTP login, JWT refresh, session management
│       ├── campaigns.py      Campaign CRUD
│       ├── zones.py          Zone CRUD
│       ├── polling_units.py  Polling unit CRUD + CSV import
│       ├── voters.py         Voter CRUD, INEC search/claim/import flow
│       ├── invites.py        Coordinator/agent invite tokens
│       ├── sessions.py       Messaging session lifecycle
│       ├── dashboard.py      Analytics dashboards + CSV exports
│       ├── templates.py      Message template CRUD
│       └── users.py          User profile, status management
├── frontend/             React 18 + Vite SPA (deployed to Vercel)
│   ├── vercel.json       SPA rewrite + security headers (must live inside frontend/)
│   └── src/
│       ├── main.jsx      App entry point + Sentry init
│       └── pages/
│           └── LandingPage.jsx  Public landing page at /
├── migrations/
│   ├── schema.sql                Full schema for fresh installs
│   └── 002_add_voter_seeding.sql Incremental migration for existing DBs
├── run_seed.py           Standalone polling-unit seeder (run locally, not on Render)
└── SETUP.md              Full deployment guide (Render + Vercel + Supabase)
```

**Stack:** FastAPI · PostgreSQL (Supabase) · SQLAlchemy · Pydantic v2 · SlowAPI · bcrypt · PyJWT · Brevo (email OTP) · Termii (SMS OTP) · Cloudinary · Redis/Upstash · Sentry · React 18 · Vite · Vercel

---

## Roles

| Role | Scope |
|---|---|
| **director** | Owns one campaign; full read/write access; sees all zones |
| **coordinator** | Manages one zone; creates messaging sessions; sees zone agents |
| **agent** | Logs voters and sends messages for their assigned zone |

Role assignment is enforced server-side on every request via `require_director`, `require_coordinator`, `require_agent` FastAPI dependencies. **There is no self-registration.** All accounts must be pre-created — directors via SQL, coordinators/agents via the app's invite link system.

---

## Quick Start (local)

### Prerequisites
- Python 3.11+
- Node 18+
- PostgreSQL 14+ (or a Supabase project)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy and edit the environment file
cp .env.example .env

# Apply the schema
psql $DATABASE_URL -f ../migrations/schema.sql

# Start the dev server
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

For local OTP development, set `OTP_PROVIDER=console` in your `.env`. The OTP code is printed to the terminal — no email or SMS credentials needed.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env        # set VITE_API_URL=http://localhost:8000
npm run dev
```

---

## Environment Variables

### Backend (`backend/.env` or Render environment tab)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase **session pooler** URI — `postgresql://postgres.[ref]:...@aws-0-[region].pooler.supabase.com:5432/postgres` |
| `JWT_SECRET` | Yes | HS256 signing secret — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_SECRET_V1` | No | Previous JWT secret for key rotation (verify-only) |
| `ENVIRONMENT` | Yes | `development` or `production` |
| `ALLOWED_ORIGINS` | Yes | Comma-separated frontend origins for CORS (e.g. `https://your-app.vercel.app`) |
| `FRONTEND_URL` | Yes (prod) | Base URL for invite links |
| `TRUST_PROXY_HEADERS` | Yes (prod) | `true` on Render |
| `EMAIL_OTP_PROVIDER` | Yes (prod) | `brevo` |
| `BREVO_API_KEY` | If brevo | From app.brevo.com → API Keys |
| `BREVO_SENDER` | If brevo | Verified sender email in Brevo |
| `SMS_OTP_PROVIDER` | No | `termii` (when Termii sender ID is approved) |
| `TERMII_API_KEY` | If termii | From termii.com dashboard |
| `TERMII_SENDER` | If termii | Approved sender ID, max 11 chars (e.g. `REACH`) |
| `OTP_PROVIDER` | Local dev | `console` — prints OTP to terminal (blocked in production) |
| `CLOUDINARY_URL` | If uploads | Single-URL form: `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` |
| `REDIS_URL` | No | `rediss://...` from Upstash — persists rate-limit counters across restarts |
| `SENTRY_DSN` | No | From sentry.io → your project → DSN |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default: `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Default: `30` |

### Frontend (`frontend/.env` or Vercel environment tab)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Backend base URL, no trailing slash (e.g. `https://your-backend.onrender.com`) |
| `VITE_ENV` | Yes (prod) | `production` |
| `VITE_SENTRY_DSN` | No | Sentry DSN for frontend error tracking (same DSN as backend, or a separate React project) |

> **Heads-up:** Vite bakes env vars at build time. Adding or changing a `VITE_*` variable in Vercel requires a redeploy to take effect.

---

## Authentication Flow

1. Client calls `POST /v1/auth/send-otp` with phone or email.
2. Server looks up the contact in the database. If no account exists, returns **404** — there is no auto-registration.
3. Server generates a 6-digit CSPRNG OTP, bcrypt-hashes it, stores the hash in `otp_sessions`, and dispatches the code via Brevo (email) or Termii (SMS).
4. Client calls `POST /v1/auth/verify-otp`. On success: server issues a short-lived JWT access token (1 h) and sets a rotating httpOnly refresh cookie (`reach_refresh`).
5. Client stores the access token in memory (never `localStorage`). On expiry, calls `POST /v1/auth/refresh` — the cookie is exchanged for a new access token and a new refresh cookie (token rotation).
6. `POST /v1/auth/logout` revokes the current refresh token and clears the cookie.

OTP lockout: 5 failed attempts triggers a 30-minute lockout. All 429 responses include `Retry-After` headers.

---

## Invite Flow

1. Director calls `POST /v1/invites/coordinator` or `POST /v1/invites/agent`.
2. Server generates a raw token, stores **only** `sha256(token)` in the database. Returns `invite_url` containing the raw token once.
3. Invitee opens the URL, calls `POST /v1/invites/claim`. Server hashes the incoming token for lookup. On success, issues access + refresh tokens identical to OTP login.

---

## Messaging Sessions

1. Coordinator creates a session (`POST /v1/sessions`) selecting a template, agents, and optional voter filters (status, PVC status, support level, polling units).
2. Session stays in `draft` until activated (`POST /v1/sessions/{id}/activate`).
3. Each agent calls `GET /v1/sessions/{id}/queue` to get their personalised voter queue with pre-resolved message bodies and direct WhatsApp/SMS links.
4. Agent logs each send (`POST /v1/sessions/{id}/send`). A DB trigger increments the assignment `sent_count`.
5. Coordinator tracks progress at `GET /v1/sessions/{id}/progress`.

---

## Security Headers

Applied by FastAPI middleware (all API responses) and `frontend/vercel.json` (frontend):

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | Locked to same-origin + explicit CDN allowlists |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Camera, mic, geolocation denied |

---

## Database Maintenance

A `reach_cleanup()` SQL function is defined in `migrations/schema.sql`. Schedule it with `pg_cron` to run nightly:

```sql
SELECT cron.schedule('reach-cleanup', '0 3 * * *', 'SELECT reach_cleanup()');
```

This removes expired OTP sessions and old revoked/expired refresh tokens. Enable the `pg_cron` extension first in Supabase → **Database → Extensions**.

---

## Deployment

See [SETUP.md](SETUP.md) for the full step-by-step guide. Summary:

### Database — Supabase

Create a free Supabase project, run `migrations/schema.sql` in the SQL Editor, enable `pg_cron`. Use the **session pooler** connection string (port 5432) as `DATABASE_URL`.

### Backend — Render

Build: `pip install -r backend/requirements.txt`  
Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

Set `ENVIRONMENT=production` and `EMAIL_OTP_PROVIDER=brevo`. The startup guard blocks launch if no real OTP provider is configured.

After first deploy, run the polling unit seeder once from your **local machine** (Render free tier has no shell access):
```bash
set DATABASE_URL=postgresql://postgres.[ref]:...
python run_seed.py
```

### Frontend — Vercel

Set root directory to `frontend`. Set `VITE_API_URL` in Vercel environment variables. `frontend/vercel.json` handles the SPA rewrite and security headers automatically.

---

## API Reference

Interactive Swagger UI available at `/docs` when `ENVIRONMENT != production`. ReDoc at `/redoc`.

All authenticated endpoints require `Authorization: Bearer <access_token>`. Rate limits apply per IP (backed by Redis when `REDIS_URL` is set). See individual router files for per-endpoint limits.
