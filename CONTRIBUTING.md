# Contributing

Thanks for working on REACH Election. This guide covers local setup, the branch and pull-request process, and the code conventions the project follows.

## Contents

- [Development setup](#development-setup)
- [Branching and pull requests](#branching-and-pull-requests)
- [Commit messages](#commit-messages)
- [Code style](#code-style)
- [Testing](#testing)

## Development setup

Prerequisites: Python 3.11+, Node 18+, and a PostgreSQL 14+ database (or a Supabase project). Full environment-variable reference is in [`SETUP.md`](SETUP.md).

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

With `OTP_PROVIDER=console`, login codes print to the backend terminal — no email or SMS credentials are needed locally.

## Branching and pull requests

- Branch from `main`; name branches `feat/…`, `fix/…`, `docs/…`, or `chore/…`.
- Keep a pull request focused on one change. Describe what changed and why, and link any related issue.
- A pull request should build cleanly: `npm run build` for the frontend and `python -m py_compile` for any changed backend modules.
- Do not commit secrets. `DATABASE_URL`, API keys, and tokens belong in environment variables only.

## Commit messages

Use short, imperative subject lines with a conventional prefix (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`). Add a body when the change needs context. Example:

```
feat: add voter reassignment endpoint

Coordinators can move a voter to another agent within their zone;
directors are unrestricted within the campaign.
```

## Code style

- **Backend** — FastAPI routers grouped by resource under `backend/routers/`. Validate request bodies with Pydantic schemas in `schemas.py`; enforce access with the `require_*` dependencies; scope every query by campaign and, where relevant, zone. Record state changes with `log_action`.
- **Frontend** — React function components. Reuse the primitives in `components/ui/` (`Button`, `Card`, `Badge`, `PageHeader`, `EmptyState`) and the status maps in `lib/labels.js` rather than re-styling inline. Call the backend only through `lib/api.js`; never hard-code fetch URLs in a page.
- Match the surrounding code's naming, spacing, and idioms in any file you touch.

## Testing

- Frontend: `cd frontend && npm run build` runs the production build and fails on errors.
- Backend: exercise changed endpoints with a FastAPI `TestClient` against a seeded PostgreSQL database, as documented in [`docs/AUDIT_REPORT.md`](docs/AUDIT_REPORT.md). Create and clean up any test data so shared databases are left unchanged.
