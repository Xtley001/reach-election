# Architecture

How REACH Election is put together: the component layout, the core request flows, the role model, the security-header set, and scheduled data maintenance. For deployment and configuration see [`SETUP.md`](../SETUP.md); for the landing overview see [`README.md`](../README.md).

## Contents

- [Component layout](#component-layout)
- [Role model](#role-model)
- [Authentication flow](#authentication-flow)
- [Invite flow](#invite-flow)
- [Messaging sessions](#messaging-sessions)
- [Team and voter management](#team-and-voter-management)
- [Security headers](#security-headers)
- [Database maintenance](#database-maintenance)
- [API reference](#api-reference)

## Component layout

```
reach-election/
├── backend/                    # FastAPI application (Python 3.11)
│   ├── main.py                 # app factory: CORS, security headers, rate limiter, Sentry
│   ├── config.py               # pydantic-settings environment config
│   ├── models.py               # SQLAlchemy ORM models (PostgreSQL)
│   ├── schemas.py              # Pydantic v2 request/response schemas
│   ├── auth.py                 # OTP generation, bcrypt hashing, JWT, Brevo/Termii dispatch
│   ├── dependencies.py         # dependency injectors (auth, RBAC)
│   ├── database.py             # SQLAlchemy engine + session factory
│   ├── limiter.py              # SlowAPI rate limiter (Redis-backed via Upstash)
│   ├── storage.py              # Cloudinary image upload
│   ├── email_client.py         # HTML email templates (OTP, invite)
│   └── routers/
│       ├── auth.py             # OTP login, JWT refresh, session management
│       ├── campaigns.py        # campaign CRUD
│       ├── zones.py            # zone CRUD
│       ├── polling_units.py    # polling-unit CRUD + CSV import
│       ├── voters.py           # voter CRUD, INEC search/claim/import, reassignment
│       ├── invites.py          # coordinator/agent invite tokens
│       ├── sessions.py         # messaging session lifecycle + analytics
│       ├── dashboard.py        # analytics dashboards + CSV exports
│       ├── templates.py        # message template CRUD
│       └── users.py            # profile, status management, team tree
├── frontend/                   # React 18 + Vite SPA
│   └── src/
│       ├── lib/api.js          # typed API client (all endpoints)
│       ├── components/ui/      # Button, Card, Badge, PageHeader, EmptyState, …
│       └── pages/
│           ├── director/       # dashboard, territory, voters, team, messaging, import
│           ├── coordinator/    # dashboard, zone voters, sessions, my agents
│           ├── agent/          # dashboard, queue, voters, add-voter, session
│           └── shared/         # VotersBrowser (role-agnostic list + detail)
├── migrations/                 # schema.sql + incremental migrations
└── run_seed.py                 # one-off INEC polling-unit seeder (run locally)
```

## Role model

| Role | Scope | Enforced by |
|---|---|---|
| `director` | Owns one campaign; full read/write; sees every zone | `require_director` |
| `coordinator` | Manages one zone; builds messaging sessions; sees zone agents | `require_coordinator` |
| `agent` | Logs voters and sends messages for their assigned zone | `require_agent` |

There is no self-registration. Directors are created via SQL (see [`SETUP.md`](../SETUP.md)); coordinators and agents join through the invite-link system. Every list endpoint scopes its results by role — for example `GET /voters` returns the whole campaign to a director, one zone to a coordinator, and only their own records to an agent.

## Authentication flow

1. The client calls `POST /v1/auth/send-otp` with a phone number or email.
2. The server looks up the contact. If no account exists it returns `404` — there is no auto-registration.
3. The server generates a 6-digit CSPRNG OTP, bcrypt-hashes it, stores the hash in `otp_sessions`, and dispatches the code via Brevo (email) or Termii (SMS).
4. The client calls `POST /v1/auth/verify-otp`. On success the server issues a short-lived JWT access token (1 h) and sets a rotating httpOnly refresh cookie (`reach_refresh`).
5. The client keeps the access token in memory, never `localStorage`. On expiry it calls `POST /v1/auth/refresh`; the cookie is exchanged for a new access token and a new refresh cookie (token rotation).
6. `POST /v1/auth/logout` revokes the current refresh token and clears the cookie.

Five failed OTP attempts trigger a 30-minute lockout. All `429` responses carry a `Retry-After` header.

## Invite flow

1. A director calls `POST /v1/invites/coordinator`, or a coordinator calls `POST /v1/invites/agent`.
2. The server generates a raw token and stores only `sha256(token)`. It returns the `invite_url` containing the raw token exactly once.
3. The invitee opens the URL and calls `POST /v1/invites/claim`. The server hashes the incoming token to look it up, then issues access and refresh tokens identical to OTP login.

Unclaimed invites are listable per zone (`GET /v1/invites/zone/{zone_id}`) and revocable (`DELETE /v1/invites/{id}`).

## Messaging sessions

1. A coordinator creates a session (`POST /v1/sessions`) selecting a template, agents, and optional voter filters (status, PVC status, support level, polling units).
2. The session stays in `draft` until activated (`POST /v1/sessions/{id}/activate`).
3. Each agent calls `GET /v1/sessions/{id}/queue` for a personalised voter queue with pre-resolved message bodies and direct WhatsApp/SMS links.
4. The agent logs each send (`POST /v1/sessions/{id}/send`); a database trigger increments the assignment's `sent_count`.
5. The coordinator tracks live progress (`GET /v1/sessions/{id}/progress`) and outcome analytics (`GET /v1/sessions/{id}/analytics` — send completion, channel mix, and the support/status breakdown of the voters messaged).

`GET /v1/sessions` returns the caller's sessions — every zone for a director, one zone for a coordinator — each enriched with its template label and aggregate progress.

## Team and voter management

- **Team tree** — `GET /v1/users/team-tree` returns, for a director, every zone with its coordinator and that zone's agents, each carrying a voter count and an inactivity flag. It backs the director Team screen in a single request.
- **Voter reassignment** — `POST /v1/voters/{id}/reassign` moves a voter to another agent. A coordinator may reassign only within their own zone and only to an agent in that zone; a director is unrestricted within the campaign.

## Security headers

Applied by FastAPI middleware on every API response and by `frontend/vercel.json` on the frontend:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | Same-origin plus explicit CDN allowlists |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Camera, microphone, geolocation denied |

## Database maintenance

`migrations/schema.sql` defines a `reach_cleanup()` function that purges expired OTP sessions and revoked or expired refresh tokens. Schedule it nightly with `pg_cron`:

```sql
SELECT cron.schedule('reach-cleanup', '0 3 * * *', 'SELECT reach_cleanup()');
```

Enable the `pg_cron` extension first in Supabase under **Database → Extensions**.

## API reference

Interactive Swagger UI is served at `/docs` and ReDoc at `/redoc` whenever `ENVIRONMENT` is not `production`. Every authenticated endpoint requires an `Authorization: Bearer <access_token>` header. Rate limits apply per IP, backed by Redis when `REDIS_URL` is set; per-endpoint limits are declared in the individual router files.
