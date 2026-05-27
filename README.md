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

## Updating

```bash
# Update all installed skills to latest
npx skills update

# Update a specific skill
npx skills update portaly-analytics
```

## Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| **portaly-analytics** | GA4 analytics setup, Portaly event tracking, and dashboard connection | `GA4`, `Google Analytics`, `event tracking` |
| **portaly-payment** | Portaly Vibe hosted checkout, subscription plans, dynamic / one-time pricing, discount codes, and callback verification | `Portaly Vibe payment`, `subscription`, `checkout`, `discount code`, `one-time`, `dynamic pricing` |
| **portaly-product** | Sell a creator's Portaly digital products from your own vibe-coded site — list products, build single or bundle checkout sessions, hosted payment + email, signed webhooks | `Portaly digital products`, `bundle checkout`, `digital downloads`, `creator product API` |
| **portaly-user** | User sync to Portaly Vibe — migration, incremental sync, and dashboard viewing | `user sync`, `member sync`, `user management` |
| **portaly-sentry** | Security & reliability health check for Portaly Vibe payment integrations, with report-back to the Vibe dashboard | `Portaly health check`, `sentry scan`, `payment security audit` |
| **portaly-email** | Wire invitation-email registration links to either a Portaly-hosted CTA (zero setup) or a self-hosted waitlist landing page on the vibe coder's own domain | `invitation email`, `waitlist landing page`, `app base URL` |

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
- Fixed plans for subscriptions (`monthly` / `yearly`) and **dynamic plans** for one-time purchases, donations, tip jars, or any buyer-specified amount — the amount is set per checkout session
- Discount codes — fixed / percent / free, repeating or forever, with ref-code auto-apply at checkout
- HMAC-SHA256 callback signature verification
- Recurring subscription management (cancel / resume)
- Subscriber self-service portal

**Prerequisites:** Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`). Apply at [Portaly Vibe Dashboard](https://portaly.ai/dashboard).

**Skill triggers:**
- "Add a subscription product on Portaly Vibe"
- "Integrate Portaly Vibe payment into my app"
- "I want to use the Portaly Vibe payment API"
- "Help me integrate Portaly Vibe checkout"
- "Create a discount code on Portaly Vibe"
- "Add a one-time purchase or pay-what-you-want flow with Portaly"
- "Set up a tip jar / donation checkout with Portaly Vibe"

## Portaly User Management

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-user
```

Helps vibe coders sync their application users to Portaly Vibe, so creators can view users and subscription status in the Dashboard.

- Bulk migration with batching and backoff
- Incremental sync with fire-and-forget pattern
- Dashboard viewing at `https://portaly.ai/dashboard/users`
- Sync log tracking

**Prerequisites:** Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`). Apply at [Portaly Vibe Dashboard](https://portaly.ai/dashboard).

**Skill triggers:**
- "Sync my users to Portaly Vibe"
- "Help me migrate existing users to Portaly"
- "Set up incremental user sync with Portaly"

## Portaly Sentry Health Check

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-sentry
```

Runs a pre-deploy security and reliability audit on a Portaly Vibe payment integration. Pairs with `portaly-payment` — its API contract is used as the canonical reference for what a correct integration looks like.

- 26 checks across 8 categories: signature verification, subscription lifecycle, callback endpoint, environment & credentials, security, web fundamentals, dependencies, and data handling
- Static analysis only — no runtime access to the project required
- Read-only audit — never modifies user code
- Optionally reports results to the Vibe dashboard at `https://portaly.ai/dashboard/sentry-scans`
- Supports manual and weekly-scheduled scans

**Prerequisites:** `portaly-payment` skill installed (used as the canonical reference). Optional: Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`) to report results to the Vibe dashboard.

**Skill triggers:**
- "Run a Portaly health check before I deploy"
- "Audit my Portaly payment integration for security issues"
- "Scan my Portaly callback for signature verification bugs"
- "Is my Portaly integration safe to go live?"
- "Run a Portaly sentry scan"

## Portaly Invitation Email Integration

```bash
npx skills add portaly-ai/portaly-skills --skill portaly-email
```

Helps vibe coders wire the registration link inside Portaly Vibe invitation emails to the right destination — either Portaly's hosted waitlist page (zero setup) or the vibe coder's own `/waitlist/[creatorSlug]` landing page (full UX control).

- Mode A — embed `https://portaly.ai/waitlist/{creatorSlug}` as a CTA, no backend code
- Mode B — register `appBaseUrl` and host the page yourself; click tracking still goes through Portaly
- Templates for Next.js, React SPA, and plain HTML in Mode B
- Cross-links to `portaly-user` for syncing the new signup back to the dashboard

**Prerequisites:** Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`). For Mode B, an HTTPS-reachable domain for the waitlist page.

**Skill triggers:**
- "Where does the registration email link land?"
- "Set up a Portaly waitlist landing page on my own site"
- "Embed a Portaly waitlist CTA in my hero section"
- "Configure the app base URL for invitation emails"

## Using a Different Backend

These skills default to `https://portaly.ai` — direct installers need no setup. To run a fork against a self-hosted or compatible backend, set `PORTALY_API_HOST`; both the bundled scripts and agent-generated code honor it:

```bash
PORTALY_API_HOST=https://your-backend.example.com
```

See [PROVIDER.md](./PROVIDER.md) for the backend compatibility contract.

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
