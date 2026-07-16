# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## Repository Overview

A collection of skills for AI coding agents to help Portaly creators integrate payment and digital products services. Skills are packaged instructions, reference docs, and example scripts that extend an agent's capabilities.

**This is not an application project** — there is no application build or npm dependency tree. Content is documentation-driven skill definitions, reference materials, copy-ready adapters, and dependency-free per-skill conformance checks.

## Directory Structure

```
skills/
  portaly-payment/            # Portaly Payment integration
    SKILL.md                  # Skill definition (entry point)
    references/               # API contract, checkout and renewal docs
    scripts/                  # Callback adapters + production-derived conformance checks
  portaly-product/            # Portaly digital products integration
    SKILL.md                  # Skill definition (entry point)
    references/               # API contract, bundle pricing algorithm
    scripts/                  # Callback adapters + production-derived conformance checks
```

## Skill Architecture

Each skill follows the same structure:

1. **SKILL.md** — Core skill definition with YAML frontmatter (name, description, triggers), workflow steps, guardrails, and output preferences
2. **references/** — Detailed technical docs (API contracts, setup guides, event definitions)
3. **scripts/** — Copy-ready reference implementations (`.mjs`, `.py`, `.go`) plus local conformance checks

SKILL.md is the entry point when an agent loads a skill. References are loaded on-demand — do not read all of them upfront.

## Key Domain Concepts

**Payment Skill:**
- API host and payment page: `https://portaly.ai`
- Dual mode: live (`pcs_live_`) / test (`pcs_test_`), determined by API key
- Plans are shared across modes — query existing plans before creating new ones
- Core contract: `subscriptionId === checkoutSessionId === sessionId`
- Callback verification: HMAC-SHA256, timestamp is ISO datetime (not Unix), valid within 5 minutes
- Rate limit: read 120 req/min, write 20 req/min
- `callbackUrl` must use HTTPS

**Product Skill:**
- API host: `https://portaly.ai`
- Uses the same Creator Subscription API Key (`pcs_live_*` / `pcs_test_*`) as the payment skill
- Stripe Checkout pattern: third party lists products on their own site → checkout redirects to Portaly's hosted page
- Always price from `effectivePrice` (handles sale / countdown / free), never `sale ?? price`
- Bundle pricing: proportional split, last item absorbs rounding (`sum(allocations) === totalAmount`); each item becomes its own order
- Webhook events: `digital_product.checkout.completed` (per session), `digital_product.order.refunded` (per order)
- HMAC-SHA256 webhook signature verification, ISO-datetime timestamp valid within 5 minutes

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
