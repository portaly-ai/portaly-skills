# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## Repository Overview

A collection of skills for AI coding agents to help Portaly creators integrate analytics and payment services. Skills are packaged instructions, reference docs, and example scripts that extend an agent's capabilities.

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
- API host: `https://portaly.cc`, payment page: `https://payment.portaly.cc`
- Dual mode: live (`pcs_live_`) / test (`pcs_test_`), determined by API key
- Plans are shared across modes — query existing plans before creating new ones
- Core contract: `subscriptionId === checkoutSessionId === sessionId`
- Callback verification: HMAC-SHA256, timestamp is ISO datetime (not Unix), valid within 5 minutes
- Rate limit: read 120 req/min, write 20 req/min
- `callbackUrl` must use HTTPS

## End-User Installation

```bash
npx skills add portaly-ai/portaly-skills
```
