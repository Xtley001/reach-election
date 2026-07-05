# REACH Election — Product Design Plan (Responsive UI/UX)

> Goal: one coherent, Apple-grade design system. No redundant navigation, no
> content hidden behind chrome, one nav pattern per breakpoint, and every
> "coming soon" screen replaced with a real, considered interface.

---

## 1. The bugs (diagnosed from the live build)

### 1.1 🔴 CRITICAL — desktop content is hidden behind the sidebar
`styles/responsive.css`:

```css
@media (min-width: 768px)  { .page-content { margin-left: 240px; } }
@media (min-width: 1024px) { .page-content { margin: 0 auto; } }  /* ← cancels margin-left */
```

At ≥1024px the shorthand `margin: 0 auto` **resets `margin-left` to 0**, so the
centered content column slides underneath the `position: fixed` 220px sidebar.
This is exactly why the screenshots show clipped titles — `Dashboard`→"ard",
`Export Voters CSV`→"ers CSV", `Territory`→(blank left edge).

**Fix:** never zero the left offset while the sidebar is present. Reserve the
sidebar's column with a body-level padding/grid instead of a shorthand that can
be overridden, and center content *within* the remaining space.

### 1.2 🔴 Redundant navigation (sidebar **and** bottom-nav)
The user's core complaint. Each layout renders *both* an `<aside class="sidebar">`
and a `<nav class="bottom-nav">`. They're meant to be mutually exclusive by
breakpoint (CSS hides one), but:
- On desktop the bottom-nav is hidden — OK, but the sidebar overlaps content (§1.1).
- On mobile the sidebar is `display:none` — yet the device screenshots show it
  visible because the page was opened in desktop-width mode. The redundancy is
  real in the markup and confuses the mental model.

**Principle (Jobs test):** *one* primary navigation per context. Phone → bottom
tab bar. Desktop → left sidebar. Never both on screen. Enforce with a single
`AppLayout` primitive so the rule can't drift per-role again.

### 1.3 🟠 Sidebar has no width reserved → all pages must self-pad
`main` uses inline `marginLeft: 0`, delegating offset entirely to fragile CSS.
Consolidate into the layout primitive.

### 1.4 🟠 Director nav has 7 items but bottom-nav shows only 5 (`NAV.slice(0,5)`)
"Messaging" and "Settings" are unreachable from the phone tab bar. Needs an
overflow ("More") affordance or a reduced, prioritized tab set + settings in header.

### 1.5 🟠 Inconsistent spacing / typography between pages
Pages are hand-built with ad-hoc inline styles. Acceptable, but headers,
filter rows, and empty-states should share primitives (`PageHeader`,
`FilterBar`, `EmptyState`) so they read as one product.

### 1.6 🟡 Misc
- Emoji icons (🗳️ 📊) render inconsistently across platforms — keep for now
  (matches brand), but standardize sizing (`bottom-nav-icon` fixed 24px).
- `Settings` reachable twice for director (sidebar item + footer "Sign out").
- Coordinator title "Coordinator — Coordinator" (name falls back to role → dupes).

---

## 2. Design system decisions

| Token area | Decision |
|---|---|
| Nav model | Mobile = bottom tab bar (max 5, "More" if >5). Desktop = fixed 220px sidebar. Exactly one visible. |
| Content column | Desktop: `margin-left: 220px` reserved for sidebar, inner `max-width: 960px` centered *inside* remaining width. Never zero the offset. |
| Grid | Stat cards: `repeat(auto-ffill, minmax(180px, 1fr))` — no fixed columns that overflow on mobile. |
| Header | Shared `PageHeader` (title + subtitle + right-slot actions), sticky-safe. |
| Empty state | Shared `EmptyState` (icon, title, hint, optional CTA). |
| Motion | 0.12s ease on nav/hover only. No gratuitous animation. |
| Color | Keep existing CSS custom properties in `global.css` (light/dark already themed). |

---

## 3. Screens to build (replacing "coming soon")

| Screen | Role | Data source | Key UX |
|---|---|---|---|
| **Voters** | Director | `GET /voters` (campaign-scoped) | Search + filters, list, click→detail, CSV export. Read-mostly. |
| **Team** | Director | `/users/coordinators` + `/users/agents` + `/invites/*` | Coordinators with agent counts; suspend/reinstate; invite; revoke invites. |
| **Messaging** | Director | `TemplateManager` + `/sessions` + `/sessions/{id}/progress` | Tabbed: Templates \| Sessions. Live progress bars. |
| **Zone Voters** | Coordinator | `GET /voters` (zone-scoped) | Same list primitive, zone-scoped, agent column. |
| **My Agents** | Coordinator | `/users/agents` + `POST /invites/agent` | Agent cards w/ stats, invite agent, revoke. |

All reuse `Card`, `Button`, `Badge` and the `labels.js` maps for consistent
status pills.

---

## 4. Responsive layout system (the fix)

New rules in `responsive.css` (mobile-first):

```css
/* mobile: bottom-nav visible, sidebar hidden, content full-width */
.sidebar     { display: none; }
.page-content{ margin-left: 0; padding-bottom: calc(64px + safe-area); }

@media (min-width: 900px) {
  .bottom-nav { display: none; }
  .sidebar    { display: flex; }
  .page-content {
    margin-left: 220px;              /* reserve sidebar, NEVER overridden */
    padding-bottom: var(--space-8);
  }
  .page-content > .page-inner {      /* center content inside remaining space */
    max-width: 960px;
    margin: 0 auto;
  }
}
```

Key change: centering moves from `.page-content` (which owns the sidebar offset)
to an inner `.page-inner` wrapper, so the two concerns never collide. Single
breakpoint (900px) for the mobile↔desktop nav swap — no in-between state where
both could show.

---

## 5. Acceptance checklist

- [ ] Desktop ≥900px: no content clipped; sidebar and content never overlap.
- [ ] Desktop: bottom-nav not rendered/visible.
- [ ] Mobile <900px: sidebar not visible; bottom-nav is the only nav.
- [ ] Every director/coordinator nav item routes to a real screen (no placeholder).
- [ ] All five new screens: loading, empty, and populated states handled.
- [ ] Status pills use shared `labels.js` variants everywhere.
- [ ] Dark mode intact on all new screens (uses tokens only).
- [ ] `npm run build` passes with no errors.
