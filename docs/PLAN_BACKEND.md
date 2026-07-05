# REACH Election — Backend Functions Plan & Audit

> Status legend: ✅ implemented & wired · 🟡 implemented, needs frontend · 🔴 missing / to build

This document is the authoritative map of every backend function the **full platform**
(not an MVP) requires, cross-checked against the code that already exists in
`backend/routers/*.py`. It drives the frontend build in `PLAN_DESIGN.md`.

---

## 0. Architecture snapshot

- **Framework:** FastAPI + SQLAlchemy, Postgres (see `backend/database.py`, `backend/models.py`).
- **Auth:** OTP (SMS/email) → JWT access token + httpOnly refresh cookie (`routers/auth.py`).
- **Roles:** `director` → `coordinator` → `agent`, enforced by `dependencies.py`
  (`require_director`, `require_coordinator`, `require_agent`, `get_current_user`).
- **Scoping rule (critical):** `GET /voters` already role-scopes results —
  agent → own voters, coordinator → own zone, director → whole campaign. New
  read pages can reuse it directly with no new endpoint.
- **API prefix:** all routes are mounted under `/v1` (`frontend/src/lib/api.js`, `BASE`).

---

## 1. Auth & session — ✅ complete

| Function | Endpoint | Status |
|---|---|---|
| Send OTP (sms/email) | `POST /auth/send-otp` | ✅ |
| Verify OTP → tokens | `POST /auth/verify-otp` | ✅ |
| Refresh access token | `POST /auth/refresh` | ✅ |
| Logout (revoke refresh) | `POST /auth/logout` | ✅ |
| Current user | `GET /auth/me` | ✅ |
| List active login sessions | `GET /auth/sessions` | ✅ |
| Revoke one / all sessions | `DELETE /auth/sessions/{id}`, `POST /auth/revoke-all` | ✅ |

**No work required.** Frontend already consumes these (`useAuth.jsx`, `SettingsPage`).

---

## 2. Campaigns — ✅ complete

`POST /campaigns`, `GET /campaigns/mine`, `PATCH /campaigns/{id}`,
`GET /campaigns/{id}/stats`, `POST /campaigns/{id}/logo`.
Setup wizard (`SetupCampaign.jsx`) drives creation. No work required.

---

## 3. Territory: Zones & Polling Units — ✅ complete

| Function | Endpoint | Status |
|---|---|---|
| CRUD zones | `POST/GET/PATCH/DELETE /zones` | ✅ |
| CRUD polling units | `POST/GET/PATCH/DELETE /polling-units` | ✅ |
| Bulk PU import (INEC CSV) | `POST /polling-units/import` | ✅ |
| PU CSV template | `GET /polling-units/template` | ✅ |

Consumed by `TerritoryPage.jsx`. No work required.

---

## 4. Voters — ✅ complete (frontend gaps only)

| Function | Endpoint | Status |
|---|---|---|
| List (role-scoped, filtered) | `GET /voters` | 🟡 director/coordinator pages missing |
| Detail + contact history | `GET /voters/{id}` | ✅ (agent) |
| Add / bulk / INEC import | `POST /voters`, `/voters/bulk`, `/voters/import/inec` | ✅ |
| Update / delete | `PATCH/DELETE /voters/{id}` | ✅ |
| Log contact | `POST /voters/{id}/contacts` | ✅ |
| Call queue | `GET /voters/queue` | ✅ |
| Duplicate detection / resolve | `GET /voters/duplicates`, `POST /voters/{id}/resolve-duplicate` | ✅ |
| INEC register search / claim | `GET /voters/search`, `PATCH /voters/{id}/claim` | ✅ |
| Import history | `GET /voters/imports` | ✅ |

**Backend gap: none.** The "Voters — coming in next phase" director page and
"Zone Voters — coming soon" coordinator page are **frontend-only** builds that
reuse `GET /voters` (already correctly scoped). Director view should be
read-mostly with export; coordinator view is zone-scoped with reassignment.

### 4.1 One optional enhancement (🔴 nice-to-have, not blocking)
- `PATCH /voters/{id}` currently allows agents to edit their own voters.
  For coordinator **reassignment** (move a voter to another agent/PU) the
  existing `PATCH` accepts `polling_unit_id`; add `added_by` to the allowed
  update fields if drag-to-reassign is desired. Deferred — not needed for the
  read/detail pages shipping now.

---

## 5. Team management — 🟡 (endpoints exist, pages missing)

| Function | Endpoint | Status |
|---|---|---|
| List coordinators (director) | `GET /users/coordinators` | 🟡 no page |
| List agents (dir=all, coord=zone) | `GET /users/agents` | 🟡 no page |
| Suspend / reinstate user | `PATCH /users/{id}/status` | 🟡 no UI |
| Invite coordinator | `POST /invites/coordinator` | ✅ (Territory) |
| Invite agent | `POST /invites/agent` | 🟡 no coord UI |
| List / revoke zone invites | `GET /invites/zone/{id}`, `DELETE /invites/{id}` | 🟡 no UI |

**Director "Team" page** and **Coordinator "My Agents" page** are the main
frontend deliverables here. All data + mutation endpoints already exist.

### 5.1 Gap to close (🔴 minor)
`GET /users/agents` scopes to zone for coordinators and to whole campaign for
directors — good. But the director Team page also wants **per-coordinator agent
counts and last-active**. Two options:
1. Compute client-side by joining `/users/coordinators` + `/users/agents` (zone_id). ← chosen, zero backend change.
2. Add `GET /users/team-tree` returning nested coordinators→agents with counts. ← deferred optimization.

---

## 6. Messaging: Templates & Sessions — 🟡 (endpoints exist, director hub missing)

| Function | Endpoint | Status |
|---|---|---|
| CRUD templates | `POST/GET/PATCH/DELETE /templates` | ✅ `TemplateManager` |
| Preview template (var fill) | `POST /templates/{id}/preview` | ✅ |
| Create session (template+filters+agents) | `POST /sessions` | ✅ `SessionBuilder` |
| Activate / cancel session | `POST /sessions/{id}/activate`, `/cancel` | ✅ |
| List sessions / active | `GET /sessions`, `/sessions/active` | 🟡 no director hub |
| Session detail / progress | `GET /sessions/{id}`, `/sessions/{id}/progress` | 🟡 partial |
| Agent queue for session | `GET /sessions/{id}/queue` | ✅ `AgentSession` |
| Log a send | `POST /sessions/{id}/send` | ✅ |

**Director "Messaging" page** = a hub that (a) mounts the existing
`TemplateManager`, and (b) lists sessions with live progress via
`GET /sessions` + `GET /sessions/{id}/progress`. No new endpoint required.

---

## 7. Dashboards & Export — ✅ complete

`GET /dashboard/director|coordinator|agent`,
`GET /dashboard/export/voters`, `GET /dashboard/export/contacts`.
Fully consumed. No work required.

---

## 8. Cross-cutting concerns — status

| Concern | State | Action |
|---|---|---|
| Rate limiting | ✅ slowapi (`limiter.py`) | none |
| Audit log | ✅ `log_action`, `AuditLog` model | none |
| Offline sync (agent) | ✅ `useOfflineSync`, `lib/offline.js` | verify queue drains after new pages |
| Production startup guards | ✅ `main.py` lifespan | none |
| CORS | ✅ configured | none |

---

## 9. Verdict — backend is ~95% complete

The platform was mis-described by its own UI ("coming in next phase"): the
**backend for every "coming soon" screen already exists and is tested-shaped.**
The remaining backend work is essentially zero for the pages shipping in this
pass; the deferred items (§4.1, §5.1) are optimizations, not blockers.

**Therefore the implementation effort is concentrated in the frontend** — build
the five missing pages against existing endpoints and fix the layout system.
See `PLAN_DESIGN.md`.

### Deferred backend backlog (post-ship, optional)
1. `PATCH /voters/{id}` — allow coordinator `added_by` reassignment.
2. `GET /users/team-tree` — nested team with counts (perf).
3. Session-level analytics endpoint (`GET /sessions/{id}/analytics`) for reply/confirm rates.
4. Webhook ingestion for delivery receipts (if a real SMS gateway is wired).
