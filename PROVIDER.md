# Provider Configuration

These skills target [Portaly](https://portaly.ai)'s hosted backend by default. If you installed them from `portaly-ai/portaly-skills`, no setup is needed.

This doc is for forks running against a self-hosted or compatible backend, and for contributors editing the skill content.

## TL;DR

The API host is overridable via a single environment variable:

```bash
PORTALY_API_HOST=https://your-backend.example.com
```

When unset, all scripts and generated code fall back to `https://portaly.ai`. Direct installers see no change.

## What's overridable today

Only the **API host**. Everything else (brand name, dashboard URLs, etc.) is still hardcoded `portaly.ai` strings in `SKILL.md` and reference docs — forks adapting to a different domain will need a `find/replace` pass.

| Concern | Override |
|---|---|
| REST API host (scripts and generated code) | `PORTALY_API_HOST` env var, default `https://portaly.ai` |
| Hosted UI URLs (`/checkout`, `/waitlist/{slug}`, `/r/{code}`, `/dashboard/*`) | None — hardcoded in `SKILL.md` and refs as `portaly.ai` strings |
| Brand name ("Portaly", "Portaly Vibe") | None — hardcoded in `SKILL.md` and refs |
| API key prefix (`pcs_live_`, `pcs_test_`) | None — wire-format compatibility required |

## Backend compatibility contract

To work unmodified, a fork's backend must be wire-compatible with the Portaly REST API:

- **Auth**: `Authorization: Bearer ${PORTALY_API_KEY}` on all admin endpoints.
- **Endpoints** referenced by the skills (relative to `PORTALY_API_HOST`):
  - Payment: `/api/creator-subscription/{config,plans,checkout-sessions,subscriptions,orders,portal-sessions,discount-codes,...}`
  - Email templates (toggled from the payment flow): `/api/creator-email/templates/{name}`
  - Digital products: `/api/digital-products/{,{productId},checkout-sessions,orders}`
- **Callback signatures**: HMAC-SHA256 of `${timestamp}.${stableJson(payload)}` using the merchant's `callbackSecret`. See `skills/portaly-payment/scripts/sign_callback.mjs` for the canonical implementation.
- **Response shapes**: The skills assume `{ data: ... }`-wrapped responses. See `skills/portaly-payment/references/api-contract.md` and `skills/portaly-product/references/api-contract.md` for the full contract.

If your backend diverges from any of the above, `PORTALY_API_HOST` alone won't be enough — you'll need to fork the skills.

## Setting `PORTALY_API_HOST`

In your shell or `.env` file:

```bash
PORTALY_API_HOST=https://your-backend.example.com
PORTALY_API_KEY=...        # the same auth token used by the default backend
PORTALY_CALLBACK_SECRET=... # for verifying inbound payment callbacks
```

The bundled scripts (`skills/*/scripts/sign_callback.{mjs,py}`) are host-agnostic — they only verify HMAC signatures and never call the API, so they don't reference the host at all.

When generating code that does call the API, the agent should read the host from this var:

```ts
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'
```

The literal `https://portaly.ai` strings in `SKILL.md` and reference docs are kept as the documented default — that's how the agent learns the canonical host. Forks should swap them when adapting to a different backend.

## Roadmap

Possible future work to deepen the abstraction:

- Pull brand name and dashboard URL into a single `provider.json` so a fork can rebrand without editing every `SKILL.md`.
- Split the repo into a generic upstream (`creator-commerce-skills`) and a `portaly` profile.
