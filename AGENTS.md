# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## Repository Overview

A collection of skills for AI coding agents to help Portaly creators integrate payment and digital products services. Skills are packaged instructions, reference docs, and example scripts that extend an agent's capabilities.

**This is not an application project** — there is no application build or npm dependency tree. Content is documentation-driven skill definitions, reference materials, copy-ready adapters, and a dependency-free conformance/eval harness.

## Directory Structure

```
skills/
  portaly-overview/           # Orientation/navigation across Portaly's open APIs
    SKILL.md                  # Skill definition (entry point; single-file, no references/scripts)
  portaly-payment/            # Portaly Payment integration
    SKILL.md                  # Skill definition (entry point)
    references/               # API contract, checkout and renewal docs
    scripts/                  # Callback adapters + production-derived conformance checks
  portaly-product/            # Portaly digital products integration
    SKILL.md                  # Skill definition (entry point)
    references/               # API contract, bundle pricing algorithm
    scripts/                  # Callback adapters + production-derived conformance checks
evals/                        # Cross-skill contract runner and fresh-agent prompt corpus
.github/workflows/            # Deterministic skill eval gate
```

## Skill Architecture

Each skill follows the same structure:

1. **SKILL.md** — Core skill definition with YAML frontmatter (name, description, triggers), workflow steps, guardrails, and output preferences
2. **references/** — Detailed technical docs (API contracts, setup guides, event definitions)
3. **scripts/** — Copy-ready reference implementations (`.mjs`, `.py`, `.go`) plus local conformance checks

Repository-level `evals/` verifies that both independently installable skills keep byte-identical callback artifacts and provides behavior prompts without shipping answer-bearing eval content inside either skill package.

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

## These Skills Mirror a Backend That Ships Without Them

The APIs documented here are implemented in a **separate repo** (`portaly-vibe`, the Portaly
Payment backend). Nothing in that repo's build can see this one, so a shipped API change does
**not** automatically reach the skill docs. It has already gone wrong once: POR-4373 added
`customerName` / `emailVerified` to both create-checkout-session calls, the feature went live,
and integrators had no way to discover it.

That repo now carries a tripwire test (`lib/api-docs/__tests__/public-checkout-fields.test.ts`)
that goes red when a merchant-facing checkout field is added or removed, pointing back here.
When that test sends you here, or when you otherwise learn of an API change:

1. Update `references/api-contract.md` — field rules **and** the JSON request example.
2. Update `SKILL.md` — the workflow bullet and any copy-ready code snippet. Agents act on
   SKILL.md first and often never open the reference.
3. Do all of the above for **every** skill that touches the endpoint. Checkout-session fields
   land in three: `portaly-payment`, `portaly-payment-integration` (both the subscription
   endpoint), and `portaly-product` (digital products).
4. Bump that skill's version — the top-level `version:`, `metadata.version` if present, and the
   literal in its "Report the installed skill version" example. The dashboard uses it to flag
   stale installs, so an unbumped skill looks current while being wrong.

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
