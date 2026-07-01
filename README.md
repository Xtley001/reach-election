# REACH Election

A field-operations platform for election campaigns. Agents log voters door-to-door; coordinators track canvassing progress zone by zone; directors see the full campaign north-star dashboard. Messaging sessions let coordinators dispatch targeted WhatsApp/SMS outreach batches to agents with pre-built templates.

---

## Architecture

```
reach-election/
├── backend/              FastAPI application (Python 3.11+)
│   ├── main.py           App factory, CORS, security headers, rate limiter
│   ├── config.py         Pydantic-settings environment config
│   ├── models.py         SQLAlchemy ORM models (PostgreSQL)
│   ├── schemas.py        Pydantic v2 request/response schemas
│   ├── auth.py           OTP generation, bcrypt hashing, JWT, Brevo/Termii dispatch
│   ├── dependencies.py   FastAPI dependency injectors (auth, RBAC)
│   ├── database.py       SQLAlchemy engine + session factory
│   ├── limiter.py        SlowAPI rate-limiter instance
│   ├── storage.py        Cloudinary avatar upload
│   ├── email_client.py   HTML email templates (OTP, invite)
│   ├── scripts/
│   │   └── seed_polling_units.py  Seeds inec_reference_pus from public dataset
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
├── migrations/
│   ├── schema.sql                Full schema for fresh installs
│   └── 002_add_voter_seeding.sql Incremental migration for existing DBs
├── SETUP.md              Deployment guide (Render + Vercel + Supabase)
└── vercel.json           Frontend deployment + security headers
```

**Stack:** FastAPI · PostgreSQL (Supabase) · SQLAlchemy · Pydantic v2 · SlowAPI · bcrypt · PyJWT · Brevo (email OTP) · Termii (SMS OTP) · Cloudinary · Redis (optional) · React 18 · Vite · Vercel

---

## Roles

| Role | Scope |
|---|---|
| **director** | Owns one campaign; full read/write access; sees all zones |
| **coordinator** | Manages one zone; creates messaging sessions; sees zone agents |
| **agent** | Logs voters and sends messages for their assigned zone |

Role assignment is enforced server-side on every request via `require_director`, `require_coordinator`, `require_agent` FastAPI dependencies.

---

## Quick Start (local)

### Prerequisites
- Python 3.11+
- Node 18+
- PostgreSQL 14+

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

### Frontend

```bash
cd frontend
npm install
cp .env.example .env        # set VITE_API_URL=http://localhost:8000
npm run dev
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql+psycopg2://...`) |
| `JWT_SECRET` | Yes | HS256 signing secret (min 32 chars) |
| `JWT_SECRET_V1` | No | Previous JWT secret for key rotation (verify-only) |
| `ENVIRONMENT` | Yes | `development` or `production` |
| `ALLOWED_ORIGINS` | Yes | Comma-separated frontend origin(s) for CORS |
| `FRONTEND_URL` | Yes (prod) | Base URL for invite links (e.g. `https://app.reach-ng.com`) |
| `EMAIL_OTP_PROVIDER` | Yes (prod) | `brevo` — Brevo transactional email API |
| `SMS_OTP_PROVIDER` | Yes (prod) | `termii` — Termii SMS (Nigerian numbers) |
| `OTP_PROVIDER` | No | `console` fallback for local dev (prints OTP to terminal) |
| `BREVO_API_KEY` | If brevo | Brevo API key (from app.brevo.com → API Keys) |
| `BREVO_SENDER` | If brevo | Verified sender email address |
| `TERMII_API_KEY` | If termii | Termii API key (from termii.com dashboard) |
| `TERMII_SENDER` | If termii | Approved sender ID, max 11 chars (e.g. `REACH`) |
| `ADMIN_BACKUP_EMAIL` | No | Dev-only OTP cc address (blocked in production) |
| `ADMIN_OTP_CC_ENABLED` | No | `false` in production — startup guard enforces this |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default: 60 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Default: 30 |
| `CLOUDINARY_CLOUD_NAME` | If avatars | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | If avatars | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | If avatars | Cloudinary API secret |
| `REDIS_URL` | No | Redis URL for rate-limit persistence across restarts |
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `TRUST_PROXY_HEADERS` | No | `true` only when behind a trusted reverse proxy that strips `X-Forwarded-For` |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Backend base URL, no trailing slash (e.g. `https://your-backend.onrender.com`) |

---

## Authentication Flow

1. Client calls `POST /v1/auth/send-otp` with phone or email.
2. Server generates a 6-digit CSPRNG OTP, bcrypt-hashes it, stores the hash in `otp_sessions`, dispatches the code.
3. Client calls `POST /v1/auth/verify-otp`. On success: server issues a short-lived JWT access token (1 h) and sets a rotating httpOnly refresh cookie (`reach_refresh`).
4. Client stores the access token in memory (never `localStorage`). On expiry, calls `POST /v1/auth/refresh` — the cookie is exchanged for a new access token and a new refresh cookie (token rotation).
5. `POST /v1/auth/logout` revokes the current refresh token and clears the cookie.

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

Applied by FastAPI middleware (all API responses) and Vercel config (frontend):

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

This removes expired OTP sessions and old revoked/expired refresh tokens. It respects active lockouts — locked OTP sessions are retained until `locked_until` passes.

---

## Deployment

See [SETUP.md](SETUP.md) for the full step-by-step guide. Summary:

### Database — Supabase

Create a free Supabase project, then run `migrations/schema.sql` in the Supabase SQL Editor. No CLI or shell required.

### Backend — Render

Build: `pip install -r backend/requirements.txt`
Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

Set `ENVIRONMENT=production`. The startup guard blocks launch if `FRONTEND_URL` is unset or `ADMIN_OTP_CC_ENABLED=true` in production.

After first deploy, run the polling unit seeder once from your **local machine**:
```bash
DATABASE_URL="postgresql://..." python -m backend.scripts.seed_polling_units
```

### Frontend — Vercel

`vercel.json` is pre-configured with all security headers. Set `VITE_API_URL` in Vercel environment variables.

---

## API Reference

Interactive Swagger UI available at `/docs` when `ENVIRONMENT != production`. ReDoc at `/redoc`.

All authenticated endpoints require `Authorization: Bearer <access_token>`. Rate limits apply per IP. See individual router files for per-endpoint limits.
