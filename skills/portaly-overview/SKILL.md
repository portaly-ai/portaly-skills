---
name: portaly-overview
version: 0.1.0
description: Orientation and navigation for what Portaly's open APIs can do — subscription payments, digital products, discount codes, subscriber self-service, and order/invoice queries — plus an API catalog and where to find Portaly's API docs. Trigger when the user asks "what can Portaly do", "what APIs does Portaly have", wants a list or catalog of Portaly's APIs/endpoints, is evaluating Portaly's payment or product APIs before committing to an integration, is looking for Portaly API documentation, or is deciding which Portaly skill to install.
---

# Portaly Overview

Use this skill to help a human user (or their agent) understand **what Portaly's open API surface can do** and **which skill or doc to go to next**. This is an orientation/navigation skill, not an integration workflow — it does not create checkout sessions, sign callbacks, or call any API itself. Once the user knows what they want, hand off to `portaly-payment` or `portaly-product` for the actual implementation steps.

## Portaly Environments

API host (overridable via `PORTALY_API_HOST`):

```ts
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'
```

Both `portaly-payment` and `portaly-product` share the same API host and the same Creator Subscription API Key (`pcs_live_*` / `pcs_test_*`).

## Quick Start

1. Ask what the human user is trying to build. Match it against the capabilities and mapping table below.
2. Point them at the right API documentation location (see below) for full detail.
3. Recommend and, if asked, help install the specific skill(s) that cover the workflow — do not attempt to replicate `portaly-payment` or `portaly-product` workflow steps here.
4. If the request doesn't fit any row (e.g. something admin-only, or a capability that doesn't exist yet), say so plainly rather than guessing an endpoint.

## Capabilities Overview

Portaly's open (third-party-facing) API surface currently covers:

- **Subscription payments** — monthly and yearly recurring plans, one-time and dynamic (buyer/system-specified amount) pricing, hosted checkout sessions, recurring renewal callbacks, cancel/resume lifecycle management, and a subscriber self-service portal.
- **Discount codes** — fixed/percent/free discounts with repeating or forever durations, applied at checkout or auto-applied via signup ref codes.
- **Digital products** — single-item or custom bundle checkout for a creator's existing digital products (courses, templates, downloads), hosted payment + email, signed webhook events.
- **Orders and invoices** — query payment/order records and invoice status for reconciliation.

All of this is exposed under two API key prefixes (`pcs_live_*` / `pcs_test_*`) that are shared across both the payment and product surfaces — one key covers everything in this table.

## API Catalog

The open API surface, by group. Endpoints listed here are representative, not exhaustive — see the fetch instructions below the table for the complete list.

| Group | What it does | Representative endpoints |
|---|---|---|
| Merchant config | Merchant name / logo shown on hosted checkout | `GET/PUT /api/creator-subscription/config` |
| Subscription plans | Create and manage monthly / yearly / one-time plans | `GET/POST /api/creator-subscription/plans`, `PUT .../plans/{planId}` |
| Discount codes | Fixed / percent / free discounts, signup ref codes | `GET/POST /api/creator-subscription/discount-codes`, `GET .../discount-codes/lookup` |
| Checkout sessions | Start a hosted checkout for a plan | `POST /api/creator-subscription/checkout-sessions`, `GET .../checkout-sessions/{sessionId}` |
| Subscriptions | Query and manage active subscriptions | `GET /api/creator-subscription/subscriptions`, `POST .../subscriptions/{subscriptionId}/cancel`, `.../resume` |
| Orders & invoices | Reconciliation and e-invoice status | `GET /api/creator-subscription/orders`, `GET .../invoices` |
| Subscriber portal | Self-service portal for subscribers | `POST /api/creator-subscription/portal-sessions` |
| Digital products | List products, single-item / bundle checkout | `GET /api/digital-products`, `POST /api/digital-products/checkout-sessions` |
| Webhooks | Signed callbacks for payment / subscription / product events | 8 event types (`creator_subscription.*`, `digital_product.*`) |
| Reviews | Embed verified-buyer review widget (hosted iframe, not a JSON API) | `https://portaly.ai/embed/reviews/{slug}` (iframe embed, no API key) |

**Do not treat this table as the full contract.** When the user needs the complete, always-current endpoint list, fetch it live instead of relying on this file:

- Fetch `https://portaly.ai/llms.txt` — condensed endpoint index, cheap to read first.
- Fetch `https://portaly.ai/openapi.json` — full request/response schemas for every endpoint and webhook payload.

## Common Product Feature → API / Skill Mapping

| I want to build... | Use this skill | Primary API(s) |
|---|---|---|
| A paid membership / subscription site (monthly or yearly) | `portaly-payment` | `POST /api/creator-subscription/plans`, `POST /api/creator-subscription/checkout-sessions` |
| A one-time purchase, donation, or "pay what you want" flow | `portaly-payment` | dynamic-pricing plan (`pricingType: dynamic`) + `POST /api/creator-subscription/checkout-sessions` |
| Promotions / coupon codes / referral discounts | `portaly-payment` | `POST /api/creator-subscription/discount-codes`, `GET /api/creator-subscription/discount-codes/lookup` |
| Letting subscribers cancel, resume, or manage their own plan | `portaly-payment` | `POST /api/creator-subscription/portal-sessions` |
| Merchant-initiated subscription lifecycle management | `portaly-payment` | `POST /api/creator-subscription/subscriptions/{id}/cancel`, `.../resume` |
| Syncing payment events into your own DB | `portaly-payment` or `portaly-product` | signed callback / webhook (`x-portaly-signature`) |
| Selling a creator's courses, templates, or downloads on your own site | `portaly-product` | `GET /api/digital-products`, `POST /api/digital-products/checkout-sessions` |
| A custom multi-item bundle checkout | `portaly-product` | `POST /api/digital-products/checkout-sessions` with multiple `items[]` |
| Reconciliation / "my purchases" or "my orders" panel | `portaly-payment` or `portaly-product` | `GET /api/creator-subscription/orders`, `GET /api/digital-products/orders` |
| Invoice / e-invoice status lookups | `portaly-payment` | `GET /api/creator-subscription/invoices` |
| Show verified ratings / social proof on my site | `portaly-review` | hosted iframe embed (no API key) |

If a request spans more than one row (e.g. a membership site that also sells one-off templates), install both `portaly-payment` and `portaly-product` — they share the same API key.

## API Documentation

Beyond this skill collection, Portaly publishes standalone API docs:

- **`https://portaly.ai/docs`** — interactive, human-browsable API documentation. Best for a person exploring the API surface manually.
- **`https://portaly.ai/openapi.json`** — machine-readable OpenAPI spec. Best for generating clients, feeding into API tooling, or letting an agent introspect the full request/response schema programmatically.
- **`https://portaly.ai/llms.txt`** — condensed, LLM-oriented index of the API. Best for an agent that wants a fast summary of available endpoints before deciding what to read next.

When this skill's summaries and those docs disagree, **the docs at `https://portaly.ai/docs` are authoritative** — this skill is a map, not the source of truth.

## Routing to the Right Skill

- **`portaly-payment`** — install for anything involving recurring subscriptions, one-time/dynamic pricing, discount codes, subscription lifecycle (cancel/resume), or the subscriber self-service portal.
  ```bash
  npx skills add portaly-ai/portaly-skills --skill portaly-payment
  ```
- **`portaly-product`** — install for anything involving listing and selling a creator's existing digital products, including bundle checkout.
  ```bash
  npx skills add portaly-ai/portaly-skills --skill portaly-product
  ```
- **`portaly-review`** — install for embedding Portaly's hosted, verified-buyer review widget (Trustpilot-style rating badge) on the user's own site. No API key needed.
  ```bash
  npx skills add portaly-ai/portaly-skills --skill portaly-review
  ```
- If the user has no Portaly account or API key yet: they register at `https://portaly.cc/payment` and create an API key at `https://portaly.cc/admin/creator-subscription` (both are human-operated pages — open them in a browser for the user; the matching skill's workflow covers this step in detail).
- Once installed, **follow that skill's own Workflow section** for the actual integration steps (API key setup, session creation, callback/webhook verification, etc.). This skill does not repeat those steps — it only tells you which one to load.

## Report the Installed Skill Version

Report this skill's version to Portaly so the merchant's dashboard can flag when their installed skill is out of date. This is a single, non-blocking version check — its body carries only the skill name and version, nothing about the user's project or data. **Mention it to the user once** (e.g. "Reporting the installed Portaly skill version so your dashboard can detect outdated skills") — you don't need to pause for approval, but don't conceal it either.

**When to send it — send once per session, at whichever of these happens first, as long as `process.env.PORTALY_API_KEY` is set:**

1. **Right after you install or update this skill**, if a key is already in the environment.
2. **Otherwise, the first time you make any Portaly API call** — the version report rides along with that first real API usage.

- If `PORTALY_API_KEY` is not in the environment yet, skip the report for now. Never prompt the user for a key just to send this — this skill in particular is likely to be used before the user has a key at all, since it's often the very first thing they load.
- The request:
  ```
  POST https://portaly.ai/api/creator-subscription/skill-version
  Authorization: Bearer {PORTALY_API_KEY}
  Content-Type: application/json

  { "skillName": "portaly-overview", "version": "0.1.0" }
  ```
- `version` is this skill's `version` from the frontmatter at the top of THIS file — use the literal value of the SKILL.md you are currently running, so the report reflects what is actually installed.
- The request body carries only `skillName` and `version`. If the call fails, ignore it and continue — it never blocks anything.

## Guardrails

- **This skill does not call any Portaly API on the user's behalf**, other than the version report above (which is conditional — sent only when `PORTALY_API_KEY` is already present, per its stated timing; it is not a user-facing choice to surface). It is orientation only — do not attempt checkout sessions, plan creation, or callback handling here; hand off to `portaly-payment` / `portaly-product`.
- **Never point the user at admin-only endpoints or the internal admin dashboard API.** `https://portaly.cc/admin/creator-subscription` is a human-operated dashboard, not part of the third-party-facing API surface — mention it only as where a human creates an API key, not as something to call.
- **Do not repeat or fork the detailed workflow steps** from `portaly-payment` or `portaly-product` here. If the user needs implementation detail, route them to the matching skill instead of improvising.
- **If this document and `https://portaly.ai/docs` disagree, the docs win.** Treat this skill's mapping table as a pointer, not a contract.
- **Do not invent endpoints.** Every path referenced above must exist in `portaly-payment`'s or `portaly-product`'s `references/api-contract.md`, or in the published `/openapi.json`. If a user asks for a capability not covered by any row in the mapping table, say it isn't currently part of the open API rather than guessing a plausible-sounding endpoint.

## Resources

- `../portaly-payment/SKILL.md` and `../portaly-payment/references/api-contract.md` — full subscription/payment contract.
- `../portaly-product/SKILL.md` and `../portaly-product/references/api-contract.md` — full digital products contract.
- `https://portaly.ai/docs`, `https://portaly.ai/openapi.json`, `https://portaly.ai/llms.txt` — canonical API documentation.
