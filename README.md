English | [繁體中文](./README.zh-TW.md)

# Portaly Skills

AI agent skills for [Portaly](https://portaly.cc) creators. Integrate Portaly services — payments and digital products — into any project with your AI coding agent.

## Installation

```bash
# All skills
npx skills add portaly-ai/portaly-skills

# Specific skill
npx skills add portaly-ai/portaly-skills --skill portaly-payment
```

## Updating

```bash
# Update all installed skills to latest
npx skills update

# Update a specific skill
npx skills update portaly-payment
```

## Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| **portaly-overview** | Orientation and navigation across Portaly's open APIs — an API catalog by capability group, a feature-to-API mapping table, and where to find the full API docs | `what can Portaly do`, `what APIs does Portaly have`, `list Portaly APIs`, `Portaly API docs`, `which Portaly skill do I need`, evaluating Portaly before integrating |
| **portaly-payment** | Portaly Payment hosted checkout, subscription plans, dynamic / one-time pricing, discount codes, and callback verification | `Portaly Payment`, `subscription`, `checkout`, `discount code`, `one-time`, `dynamic pricing` |
| **portaly-product** | Sell a creator's Portaly digital products from your own vibe-coded site — list products, build single or bundle checkout sessions, hosted payment + email, signed webhooks | `Portaly digital products`, `bundle checkout`, `digital downloads`, `creator product API` |

## Portaly Overview

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-overview
```

Orientation and navigation skill — helps you figure out what Portaly's open APIs can do before you commit to an integration, and which skill to install next. Does not perform any integration work itself.

- A capabilities overview of the open API surface: subscription payments, digital products, discount codes, subscriber self-service, and order/invoice queries
- An API catalog by capability group, with instructions to fetch the always-current endpoint list live from `llms.txt` / `openapi.json`
- A "common product feature → API / skill" mapping table
- Pointers to Portaly's full API documentation:
  - [`portaly.ai/docs`](https://portaly.ai/docs) — interactive docs for humans
  - [`portaly.ai/openapi.json`](https://portaly.ai/openapi.json) — machine-readable OpenAPI spec
  - [`portaly.ai/llms.txt`](https://portaly.ai/llms.txt) — condensed LLM-oriented index
- Routes you to `portaly-payment` and/or `portaly-product` for the actual implementation

**Skill triggers:**
- "What can Portaly do?"
- "What APIs does Portaly have?"
- "Where are Portaly's API docs?"
- "Which Portaly skill do I need for X?"
- "I'm evaluating Portaly's payment or product APIs"

## Portaly Payment Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-payment
```

Helps users integrate Portaly Payment hosted checkout, including merchant setup, subscription plans, checkout sessions, and callback verification.

- Merchant config and plan creation via API
- Hosted checkout session flow
- Fixed plans for subscriptions (`monthly` / `yearly`) and **dynamic plans** for one-time purchases, donations, tip jars, or any buyer-specified amount — the amount is set per checkout session. Yearly plans use 12-month deferred disbursement: the buyer pays upfront, the creator receives 1/12 of net revenue per month, and refunds are blocked once the first installment has been released.
- Discount codes — fixed / percent / free, repeating or forever, with ref-code auto-apply at checkout
- HMAC-SHA256 callback signature verification
- Recurring subscription management (cancel / resume)
- Subscriber self-service portal

**Prerequisites:** Portaly Payment API Key (`pcs_live_*` or `pcs_test_*`). No account yet? Register at [portaly.cc/payment](https://portaly.cc/payment), then create the key in the [Portaly Payment Dashboard](https://portaly.cc/admin/creator-subscription).

**Skill triggers:**
- "Add a subscription product on Portaly Payment"
- "Integrate Portaly Payment into my app"
- "I want to use the Portaly Payment API"
- "Help me integrate Portaly Payment checkout"
- "Create a discount code on Portaly Payment"
- "Add a one-time purchase or pay-what-you-want flow with Portaly"
- "Set up a tip jar / donation checkout with Portaly Payment"

## Portaly Digital Products Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-product
```

Helps vibe coders sell a creator's Portaly digital products from their own site — they own the product display UI, Portaly owns checkout, payment, email, and the post-purchase deliverables page.

- List a creator's products via API and render them in your own UI (always price from `effectivePrice`)
- Single-item or custom bundle checkout sessions via Portaly's hosted page
- Bundle pricing with proportional split — each item becomes its own order in Portaly
- HMAC-SHA256 webhook signature verification (5-minute timestamp window)
- Per-order events: `digital_product.checkout.completed` and `digital_product.order.refunded`
- Hosted confirmation emails — one per paid order, free items skip email

**Prerequisites:** Portaly Payment API Key (`pcs_live_*` or `pcs_test_*`) — shared with the payment skill. No account yet? Register at [portaly.cc/payment](https://portaly.cc/payment), then create the key in the [Portaly Payment Dashboard](https://portaly.cc/admin/creator-subscription).

**Skill triggers:**
- "Sell Portaly digital products from my own site"
- "Build a bundle checkout for Portaly products"
- "List a creator's downloads / templates / courses on my site"
- "Add a 'powered by Portaly' storefront"
- "Set up Portaly digital product webhooks"

## Using a Different Backend

These skills default to `https://portaly.ai` — direct installers need no setup. To run a fork against a self-hosted or compatible backend, set `PORTALY_API_HOST`; both the bundled scripts and agent-generated code honor it:

```bash
PORTALY_API_HOST=https://your-backend.example.com
```

See [PROVIDER.md](./PROVIDER.md) for the backend compatibility contract.

## Version Telemetry

Once a Portaly Payment API key is present, each skill sends a one-time, non-blocking version report to `POST https://portaly.ai/api/creator-subscription/skill-version`. The request body contains only the skill name and version (e.g. `{ "skillName": "portaly-payment", "version": "0.5.5" }`) — no project content or user data — and lets your Portaly dashboard flag when an installed skill is out of date. The agent will mention it the first time it runs. To opt out, remove the "Report the installed skill version" step from the skill's `SKILL.md`.

## Migrating from Old Repos

If you previously installed skills from the individual repositories:

```bash
rm -rf ~/.claude/skills/portaly-payment-skill
npx skills add portaly-ai/portaly-skills --all -g
```

The old repositories have been archived:
- `real-engine-tw/portaly-payment-skill` (archived)

## License

MIT
