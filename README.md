[繁體中文](./README.zh-TW.md) | English

# Portaly Skills

AI agent skills for [Portaly](https://portaly.cc) creators. Integrate Portaly services — analytics, payments — into any project with your AI coding agent.

## Installation

```bash
# All skills
npx skills add portaly-ai/portaly-skills

# Specific skill
npx skills add portaly-ai/portaly-skills --skill portaly-analytics-integration
```

## Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| **portaly-analytics-integration** | GA4 analytics setup, Portaly event tracking, and dashboard connection | `GA4`, `Google Analytics`, `event tracking` |
| **portaly-vibe-payment-integration** | Portaly Vibe hosted checkout, subscription plans, and callback verification | `Portaly Vibe payment`, `subscription`, `checkout` |

## Portaly Analytics Integration

Helps creators install Google Analytics 4 on their websites and connect analytics to the Portaly dashboard.

- GA4 installation for Next.js (App Router / Pages Router), React SPA, and vanilla HTML
- 5 Portaly standard events + GA4 ecommerce event mapping
- Portaly dashboard authorization flow

**Prerequisites:** Google Analytics 4 account with a Measurement ID (`G-XXXXXXX`) and a Portaly account.

## Portaly Vibe Payment Integration

Helps users integrate Portaly Vibe hosted payment checkout, including merchant setup, subscription plans, checkout sessions, and callback verification.

- Merchant config and plan creation via API
- Hosted checkout session flow
- HMAC-SHA256 callback signature verification
- Recurring subscription management (cancel / resume)
- Subscriber self-service portal

**Prerequisites:** Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`). Apply at [Portaly Admin](https://portaly.cc/admin/creator-subscription).

## Migrating from Old Repos

If you previously installed skills from the individual repositories:

```bash
rm -rf ~/.claude/skills/portaly-analytics-skill
rm -rf ~/.claude/skills/portaly-payment-skill
npx skills add portaly-ai/portaly-skills --all -g
```

The old repositories have been archived:
- `real-engine-tw/portaly-analytics-skill` (archived)
- `real-engine-tw/portaly-payment-skill` (archived)

## License

MIT
