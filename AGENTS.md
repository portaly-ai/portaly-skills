# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## Repository Overview

A collection of skills for AI coding agents to help Portaly creators integrate payment and digital products services. Skills are packaged instructions, reference docs, and example scripts that extend an agent's capabilities.

**This is not an application project** — there is no application build or npm dependency tree. Content is documentation-driven skill definitions, reference materials, copy-ready adapters, and a dependency-free conformance/eval harness.

## Directory Structure

```
skills/
  portaly-affiliate/          # Buyer promotion: switch it on, capture the referral code
    SKILL.md                  # Skill definition (entry point)
    references/               # Promotion API contract, attribution cookie, publishable copy
    scripts/                  # Read-only promotion preflight
  portaly-overview/           # Orientation/navigation across Portaly's open APIs
    SKILL.md                  # Skill definition (entry point; single-file, no references/scripts)
  portaly-payment/            # Portaly Payment integration
    SKILL.md                  # Skill definition (entry point)
    references/               # API contract, checkout and renewal docs
    scripts/                  # Callback adapters + production-derived conformance checks
  portaly-payment-integration/ # Lean integration-scope (pcs_*_itg_*) variant of the above
    SKILL.md                  # Skill definition (entry point)
    references/               # API contract for the integration-scope subset
    scripts/                  # Callback adapters + production-derived conformance checks
  portaly-product/            # Portaly digital products integration
    SKILL.md                  # Skill definition (entry point)
    references/               # API contract, bundle pricing algorithm
    scripts/                  # Callback adapters + production-derived conformance checks
  portaly-review/             # Embed Portaly's hosted review widget (Trustpilot-style badge)
    SKILL.md                  # Skill definition (entry point; single-file, no references/scripts)
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
- Redirect-based hosted checkout: third party lists products on their own site → checkout redirects to Portaly's hosted page. Don't reintroduce the "same as Stripe Checkout" analogy — Portaly does not use Stripe, and it was removed from the skill deliberately
- Test mode is chosen by the API key, but the payment provider follows from it: `pcs_test_*` charges via TapPay on the checkout page, `pcs_live_*` hands off to 91APP and finishes on its callback. So `paymentMethod` in a callback differs by mode, and a test run never exercises the live redirect-and-return path
- A test-mode order lands in `sandboxOrders`, which is off the settlement chain: no buyer email, no invoice, no revenue/payout, no commission, no review invite. It *is* listed and refundable under the test tab of the Payment admin — that distinction matters, and the skills state it explicitly
- Always price from `effectivePrice` (handles sale / countdown / free), never `sale ?? price`
- Bundle pricing: proportional split, last item absorbs rounding (`sum(allocations) === totalAmount`); each item becomes its own order
- Webhook events: `digital_product.checkout.completed` (per session), `digital_product.order.refunded` (per order)
- HMAC-SHA256 webhook signature verification, ISO-datetime timestamp valid within 5 minutes

**Affiliate Skill:**
- API host: `https://portaly.ai`; same Creator Subscription API Key. Writes need a **full-scope** key — `pcs_*_itg_*` gets `403 KEY_SCOPE_FORBIDDEN` on `PUT /promotion` and `PUT /plans/{planId}`, while reads work on either
- The switch is **per product, not per plan**: one `enabled` + one `commissionRate` covers every eligible plan. There is no per-plan rate
- Eligible plans are one-time, fixed-price, active, and priced above zero; the account must be Taiwan-based
- `plans[].included` is the only field that means "live" — a `200` from `PUT /promotion` does not, because that call's gate ignores the landing page
- `plans[].promotionUrl` is the **resolved** value (plan's own, else the product's `appBaseUrl`), and `commissionAmount` is computed at **list price** — re-base it against active discount codes before publishing a figure
- Attribution: `?ps=` → server-set `httpOnly` cookie `portaly:profitSharing` (3 days, last-touch) → `profitSharingId` (1–64 chars) on checkout-session creation
- Commission, refund clawback and payout are Portaly's alone — never computed or displayed from the creator's own code

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
   land in four: `portaly-payment`, `portaly-payment-integration` (both the subscription
   endpoint), `portaly-product` (digital products), and `portaly-affiliate`, which documents
   `profitSharingId` on the same subscription endpoint in both its reference and its
   copy-ready snippet.
4. Bump that skill's version — the top-level `version:`, `metadata.version` if present, and the
   literal in its "Report the installed skill version" example. The dashboard uses it to flag
   stale installs, so an unbumped skill looks current while being wrong.
5. Mirror that version into `portaly-vibe`'s `packages/skills-catalog/src/entries.ts`
   (`latestVersion`) — it feeds the public `llms.txt` skill table, and nothing links the two
   repos, so it has drifted before. Once this repo's change is on `main`, that side has
   `npx tsx scripts/sync-skills.ts --apply` (dry-run without `--apply`) to pull the versions
   across; before then it is a hand edit.

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
