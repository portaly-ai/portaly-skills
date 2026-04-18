English | [繁體中文](./README.zh-TW.md)

# Portaly Skills

AI agent skills for [Portaly](https://portaly.cc) creators. Integrate Portaly services — analytics, payments, user management — into any project with your AI coding agent.

## Installation

```bash
# All skills
npx skills add portaly-ai/portaly-skills

# Specific skill
npx skills add portaly-ai/portaly-skills --skill portaly-analytics
```

## Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| **portaly-analytics** | GA4 analytics setup, Portaly event tracking, and dashboard connection | `GA4`, `Google Analytics`, `event tracking` |
| **portaly-payment** | Portaly Vibe hosted checkout, subscription plans, and callback verification | `Portaly Vibe payment`, `subscription`, `checkout` |
| **portaly-user** | User sync to Portaly Vibe — migration, incremental sync, and dashboard viewing | `user sync`, `member sync`, `user management` |

## Portaly Analytics Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-analytics
```

Helps creators install Google Analytics 4 on their websites and connect analytics to the Portaly dashboard.

- GA4 installation for Next.js (App Router / Pages Router), React SPA, and vanilla HTML
- 5 Portaly standard events + GA4 ecommerce event mapping
- Portaly dashboard authorization flow

**Prerequisites:** Google Analytics 4 account with a Measurement ID (`G-XXXXXXX`) and a Portaly account.

**Skill triggers:**
- "Help me install Google Analytics on my website"
- "I want to track Portaly checkout events"
- "Set up GA4 for my Next.js project"
- "I want to see website analytics in my Portaly dashboard"
- "Connect Google Analytics to Portaly"

## Portaly Vibe Payment Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-payment
```

Helps users integrate Portaly Vibe hosted payment checkout, including merchant setup, subscription plans, checkout sessions, and callback verification.

- Merchant config and plan creation via API
- Hosted checkout session flow
- HMAC-SHA256 callback signature verification
- Recurring subscription management (cancel / resume)
- Subscriber self-service portal

**Prerequisites:** Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`). Apply at [Portaly Admin](https://portaly.cc/admin/creator-subscription).

**Skill triggers:**
- "Add a subscription product on Portaly Vibe"
- "Integrate Portaly Vibe payment into my app"
- "I want to use the Portaly Vibe payment API"
- "Help me integrate Portaly Vibe checkout"

## Portaly User Management

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-user
```

Helps vibe coders sync their application users to Portaly Vibe, so creators can view users and subscription status in the Dashboard.

- Bulk migration with batching and backoff
- Incremental sync with fire-and-forget pattern
- Dashboard viewing at `https://portaly.ai/dashboard/users`
- Sync log tracking

**Prerequisites:** Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`). Apply at [Portaly Vibe Dashboard](https://portaly.ai/dashboard/api-keys).

**Skill triggers:**
- "Sync my users to Portaly Vibe"
- "Help me migrate existing users to Portaly"
- "Set up incremental user sync with Portaly"

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
