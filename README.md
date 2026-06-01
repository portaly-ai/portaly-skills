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
| **portaly-payment** | Portaly Vibe hosted checkout, subscription plans, dynamic / one-time pricing, discount codes, and callback verification | `Portaly Vibe payment`, `subscription`, `checkout`, `discount code`, `one-time`, `dynamic pricing` |
| **portaly-product** | Sell a creator's Portaly digital products from your own vibe-coded site — list products, build single or bundle checkout sessions, hosted payment + email, signed webhooks | `Portaly digital products`, `bundle checkout`, `digital downloads`, `creator product API` |

## Portaly Vibe Payment Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-payment
```

Helps users integrate Portaly Vibe hosted payment checkout, including merchant setup, subscription plans, checkout sessions, and callback verification.

- Merchant config and plan creation via API
- Hosted checkout session flow
- Fixed plans for subscriptions (`monthly`) and **dynamic plans** for one-time purchases, donations, tip jars, or any buyer-specified amount — the amount is set per checkout session
- Discount codes — fixed / percent / free, repeating or forever, with ref-code auto-apply at checkout
- HMAC-SHA256 callback signature verification
- Recurring subscription management (cancel / resume)
- Subscriber self-service portal

**Prerequisites:** Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`). Apply at [Portaly Vibe Dashboard](https://portaly.cc/admin/creator-subscription).

**Skill triggers:**
- "Add a subscription product on Portaly Vibe"
- "Integrate Portaly Vibe payment into my app"
- "I want to use the Portaly Vibe payment API"
- "Help me integrate Portaly Vibe checkout"
- "Create a discount code on Portaly Vibe"
- "Add a one-time purchase or pay-what-you-want flow with Portaly"
- "Set up a tip jar / donation checkout with Portaly Vibe"

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

**Prerequisites:** Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`) — shared with the payment skill. Apply at [Portaly Vibe Dashboard](https://portaly.cc/admin/creator-subscription).

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
