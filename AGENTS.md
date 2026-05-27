# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## Repository Overview

A collection of skills for AI coding agents to help Portaly creators integrate analytics, payment, and user management services. Skills are packaged instructions, reference docs, and example scripts that extend an agent's capabilities.

**This is not an application project** — no build system, no npm dependencies, no tests. Content is documentation-driven skill definitions, reference materials, and copy-ready example code.

## Directory Structure

```
skills/
  portaly-analytics/          # GA4 analytics integration
    SKILL.md                  # Skill definition (entry point)
    references/               # GA4 setup guide, event tracking contract
    scripts/                  # gtag.js and event tracking examples (.mjs)
  portaly-payment/            # Portaly Vibe payment integration
    SKILL.md                  # Skill definition (entry point)
    references/               # API contract, checkout and renewal docs
    scripts/                  # Callback verification examples (.mjs, .py)
  portaly-user/               # User management and sync
    SKILL.md                  # Skill definition (entry point)
    references/               # User sync API contract
    scripts/                  # Migration and sync examples (.mjs)
  portaly-sentry/             # Pre-deploy health check for payment integrations
    SKILL.md                  # Skill definition (entry point)
    references/               # Health check contract (26 checks), common pitfalls
    scripts/                  # Static analyzers (.mjs) — signature sort, subscription lifecycle
  portaly-product/            # Portaly digital products integration
    SKILL.md                  # Skill definition (entry point)
    references/               # API contract, bundle pricing algorithm
    scripts/                  # Callback verification examples (.mjs, .py)
```

## Skill Architecture

Each skill follows the same structure:

1. **SKILL.md** — Core skill definition with YAML frontmatter (name, description, triggers), workflow steps, guardrails, and output preferences
2. **references/** — Detailed technical docs (API contracts, setup guides, event definitions)
3. **scripts/** — Copy-ready reference implementations (`.mjs`, `.py`)

SKILL.md is the entry point when an agent loads a skill. References are loaded on-demand — do not read all of them upfront.

## Key Domain Concepts

**Analytics Skill:**
- Supported frameworks: Next.js (App Router / Pages Router), React SPA, vanilla HTML
- GA4 Measurement ID format: `G-XXXXXXX` (not `UA-XXXXX`)
- 5 Portaly custom events + GA4 ecommerce event mapping
- GA4 data has a 24–48 hour processing delay

**Payment Skill:**
- API host and payment page: `https://portaly.ai`
- Dual mode: live (`pcs_live_`) / test (`pcs_test_`), determined by API key
- Plans are shared across modes — query existing plans before creating new ones
- Core contract: `subscriptionId === checkoutSessionId === sessionId`
- Callback verification: HMAC-SHA256, timestamp is ISO datetime (not Unix), valid within 5 minutes
- Rate limit: read 120 req/min, write 20 req/min
- `callbackUrl` must use HTTPS

**User Skill:**
- API host: `https://portaly.ai`
- Uses the same Creator Subscription API Key (`pcs_live_*` / `pcs_test_*`)
- Email is the dedup key: `UNIQUE(profile_id, api_key_id, email)`
- Batch limit: max 100 users per sync call
- Sync calls must be fire-and-forget — never block the main business flow
- Deletion: sync with `status: "deleted"` removes the user (no separate DELETE endpoint)

**Sentry Skill:**
- 26 checks across 8 categories: `SIG` (signature), `SUB` (subscription), `CBK` (callback), `ENV` (env & credentials), `SEC` (security), `WEB` (web fundamentals), `DEP` (dependencies), `DATA` (data handling)
- Three severity levels: `CRITICAL` (must fix before deploy), `WARNING` (should fix), `INFO` (fix when convenient)
- Static analysis only — read-only audit, never modifies user code
- Depends on `portaly-payment` skill's `references/api-contract.md` as the canonical reference for correct integration
- Reporting API (optional): `POST /api/creator-subscription/health-check-reports` on host `https://portaly.ai`, authenticated with `Authorization: Bearer {PORTALY_API_KEY}` — same key as the payment skill. May return 404 if not yet live; in that case skip reporting and show results locally only.
- Results flow into the creator's Vibe dashboard at `https://portaly.ai/dashboard/sentry-scans`

## Provider Abstraction

API host defaults to `https://portaly.ai`, overridable via `PORTALY_API_HOST`. See `PROVIDER.md` for the backend compatibility contract.

When editing skill content:

- **Scripts** (`.mjs` in `scripts/`) must read the host via `process.env.PORTALY_API_HOST || 'https://portaly.ai'`. Never hardcode it.
- **`SKILL.md` / `references/`** keep the literal `https://portaly.ai` as the documented default. Example code in these docs should use the env-var pattern.
- **Dashboard URLs and brand strings** are intentionally hardcoded today — forks rebrand via find/replace.

## End-User Installation

```bash
npx skills add portaly-ai/portaly-skills
```
