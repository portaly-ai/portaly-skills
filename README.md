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
| **portaly-payment-integration** | Team/engineer integration using a merchant-issued integration-scope key (`pcs_*_itg_*`) — read active plans at runtime, create checkout sessions, verify signed callbacks; cannot manage plans, merchant config, or discount codes | `Portaly Payment team integration`, `integration API key`, `pcs_*_itg_ key` |
| **portaly-product** | Sell a creator's Portaly digital products from your own vibe-coded site — list products, build single or bundle checkout sessions, hosted payment + email, signed webhooks | `Portaly digital products`, `bundle checkout`, `digital downloads`, `creator product API` |
| **portaly-review** | Embed Portaly's hosted, verified-buyer review widget (Trustpilot-style rating badge) on your own site via a Portaly-hosted iframe — no API key needed | `embed Portaly reviews`, `review widget`, `show my ratings`, `Trustpilot-style badge`, `social proof from Portaly` |
| **portaly-affiliate** | Let the creator's own buyers earn a commission for referring other buyers — switch promotion on for the product, set the one rate every eligible one-time plan shares, and capture the referral code on your own site; Portaly issues the link and owns the payout | `affiliate program`, `referral program`, `buyer promotion`, `分潤`, `推廣連結`, `聯盟行銷`, `推廣夥伴` |

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
- Runtime-aware HMAC-SHA256 callback verification for Node.js, server-side WebCrypto, Python, and Go, with production-derived conformance vectors
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

## Portaly Payment Integration (Team / Integration-Scope)

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-payment-integration
```

For an engineer wiring Portaly Payment into an existing merchant's app using an integration-scope key (`pcs_test_itg_*` / `pcs_live_itg_*`) that merchant issued — not for setting up your own Portaly account.

- Read active plans at runtime and create checkout sessions against a merchant-issued integration key
- Verify signed callbacks the same way `portaly-payment` does (runtime-aware HMAC-SHA256 adapters + production-derived conformance vectors)
- Optional subscriber self-service: cancel / resume, portal sessions, subscription/order queries
- Cannot create or modify plans, merchant config, or discount codes — those stay in the merchant's own Portaly dashboard (`403 KEY_SCOPE_FORBIDDEN` by design, not a bug to work around)

**Prerequisites:** an integration-scope API key (`pcs_test_itg_*` / `pcs_live_itg_*`) and callback secret handed to you by the merchant — you don't register your own account for this one.

**Skill triggers:**
- "Integrate Portaly Payment using our integration key"
- "I have a pcs_*_itg_ key from a merchant"
- "Wire up Portaly Payment for this client's account"

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

## Portaly Review

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-review
```

Embeds Portaly's hosted, verified-buyer review widget — a Trustpilot-style rating badge — onto your own site via a Portaly-hosted iframe. Ratings stay Portaly-hosted and verifiable; this skill never rebuilds the UI or hardcodes a score.

- One-line iframe embed: `https://portaly.ai/embed/reviews/{slug}?theme=light&locale=zh-TW`
- `theme` (`light`/`dark`) and `locale` (`zh-TW`/`en-US`) params, matched to your site
- Click-through backlink to the public review page opens in a new tab — required for the score to stay verifiable
- No API key needed — a public, unauthenticated embed keyed by your public Portaly slug
- Zero JS API by design — MVP ships one score-badge layout; no restyling or scripting from the host page

**Prerequisites:** a Portaly account with Portaly Payment enabled and a public slug (`portaly.cc/{slug}`). Verified buyers get review links automatically after checkout — this skill doesn't create them.

**Skill triggers:**
- "Embed Portaly reviews on my site"
- "Add a review widget"
- "Show my ratings"
- "Trustpilot-style badge"
- "Social proof from Portaly"


## Portaly Affiliate

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-affiliate
```

Turns on **buyer promotion** for a Portaly Payment product: after someone buys, Portaly offers them their own referral link on its hosted purchase-complete page, and they earn a commission when someone else buys through it.

- One switch and one commission rate for the whole product, covering every eligible one-time plan; the allowed range and default are read from Portaly rather than hardcoded
- Capture the `?ps=` referral code on your own site (server-set, `httpOnly`, 3-day last-touch) and hand it to Portaly at checkout-session creation
- Portaly issues the promoter's link, computes every commission, handles refund clawback, and pays out — none of that is rebuilt in your project
- Promoters see their earnings and withdraw at `https://rewards.portaly.cc`
- Ready-to-publish 正體中文 copy for explaining the program on your own site

**Prerequisites:** a working Portaly Payment setup with at least one **active, one-time, fixed-price** plan (subscription and dynamic-pricing plans are not supported), and a **Taiwan-based** Portaly account. Promoters collect a link and accrue commission with nothing but an email; the payout rules live in [Portaly Rewards](https://rewards.portaly.cc) — link there instead of restating them.

**Skill triggers:**
- "Let my customers refer other buyers and earn a commission"
- "Set up an affiliate / referral program"
- "我想讓買過的人幫我推廣"
- "分潤怎麼設定"

## Using a Different Backend

These skills default to `https://portaly.ai` — direct installers need no setup. To run a fork against a self-hosted or compatible backend, set `PORTALY_API_HOST`; both the bundled scripts and agent-generated code honor it:

```bash
PORTALY_API_HOST=https://your-backend.example.com
```

See [PROVIDER.md](./PROVIDER.md) for the backend compatibility contract.

## Version Telemetry

Once a Portaly Payment API key is present, each skill sends a one-time, non-blocking version report to `POST https://portaly.ai/api/creator-subscription/skill-version`. The request body contains only the skill name and version (e.g. `{ "skillName": "portaly-payment", "version": "0.6.0" }`) — no project content or user data — and lets your Portaly dashboard flag when an installed skill is out of date. The agent will mention it the first time it runs. To opt out, remove the "Report the installed skill version" step from the skill's `SKILL.md`.

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
