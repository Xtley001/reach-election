# REACH Election

A field-operations platform for election campaigns — agents log voters door-to-door, coordinators run zone-level canvassing, directors watch the north-star dashboard.

[![Python 3.11](https://img.shields.io/badge/python-3.11-3776AB.svg)](https://www.python.org/)
[![React 18](https://img.shields.io/badge/react-18-61DAFB.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688.svg)](https://fastapi.tiangolo.com/)
[![Live app](https://img.shields.io/badge/demo-reach--election.vercel.app-000000.svg)](https://reach-election.vercel.app)
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey.svg)](#license)

REACH turns a campaign's voter contact into structured data. Agents search the INEC register and log door-to-door contacts from their phones; coordinators build targeted WhatsApp/SMS messaging sessions and track their zone; directors see PVC coverage, support rate, and polling-unit reach across the whole campaign. There is no self-registration — every account is provisioned by a director or through an invite link.

## Contents

- [Roles](#roles)
- [Quickstart](#quickstart)
- [Architecture](#architecture)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Roles

| Role | Scope |
|---|---|
| `director` | Owns one campaign; full read/write; sees every zone |
| `coordinator` | Manages one zone; builds messaging sessions; sees zone agents |
| `agent` | Logs voters and sends messages for their assigned zone |

Roles are enforced server-side on every request via the `require_director`, `require_coordinator`, and `require_agent` dependencies.

## Quickstart

Prerequisites: Python 3.11+, Node 18+, and a PostgreSQL 14+ database (or a Supabase project).

Backend:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                 # set DATABASE_URL, JWT_SECRET, OTP_PROVIDER=console
psql "$DATABASE_URL" -f ../migrations/schema.sql
uvicorn main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env                                 # set VITE_API_URL=http://localhost:8000
npm run dev
```

Interactive API docs are served at `http://localhost:8000/docs`. With `OTP_PROVIDER=console`, login codes print to the backend terminal — no email or SMS credentials needed for local development.

## Architecture

```
reach-election/
├── backend/            # FastAPI application (Python 3.11)
│   ├── main.py         # app factory: CORS, security headers, rate limiter, Sentry
│   ├── models.py       # SQLAlchemy ORM (PostgreSQL)
│   ├── auth.py         # OTP, bcrypt, JWT, Brevo/Termii dispatch
│   └── routers/        # auth, campaigns, zones, polling_units, voters,
│                       #   invites, sessions, dashboard, templates, users
├── frontend/           # React 18 + Vite SPA (deployed to Vercel)
│   └── src/            # pages/ (director, coordinator, agent), components/ui, lib/
├── migrations/         # schema.sql + incremental migrations
├── docs/               # ARCHITECTURE, plans, audit report
└── run_seed.py         # one-off INEC polling-unit seeder (run locally)
```

**Stack:** FastAPI · PostgreSQL (Supabase) · SQLAlchemy · Pydantic v2 · SlowAPI · PyJWT · Brevo (email OTP) · Termii (SMS OTP) · Cloudinary · Redis (Upstash) · Sentry · React 18 · Vite.

For request flows (auth, invites, messaging sessions), the security-header set, and database maintenance, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Testing

```bash
cd frontend && npm run build     # production build (typecheck + bundle)
```

The backend ships an end-to-end suite driven against a seeded PostgreSQL instance via FastAPI `TestClient`; see [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md) for the latest verified run.

## Deployment

Render (backend) + Vercel (frontend) + Supabase (PostgreSQL). Full step-by-step — environment variables, OTP providers, image uploads, rate limiting, seeding, and troubleshooting — lives in [`SETUP.md`](SETUP.md).

## Documentation

| Document | Purpose |
|---|---|
| [`SETUP.md`](SETUP.md) | Deployment and configuration guide |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Request flows, security model, data maintenance |
| [`docs/PLAN_BACKEND.md`](docs/PLAN_BACKEND.md) | Backend function map and gap audit |
| [`docs/PLAN_DESIGN.md`](docs/PLAN_DESIGN.md) | Responsive UI/UX plan |
| [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md) | Build and live-test results |
| [`SECURITY.md`](SECURITY.md) | Vulnerability disclosure and security posture |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Development setup and PR process |

## Security

Accounts are provisioned only by directors or invite links — self-registration is disabled by design. Authentication is OTP-based with bcrypt-hashed codes, short-lived JWT access tokens, and rotating httpOnly refresh cookies. Report vulnerabilities per the [security policy](SECURITY.md); do not open a public issue for a suspected vulnerability.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, code style, and the pull-request process.

## License

No open-source license is granted. All rights reserved by the project owners; contact them for usage or distribution permissions.
