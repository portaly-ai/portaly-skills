---
name: portaly-payment-integration
version: 0.6.2
description: Lean Portaly Payment integration skill for a team's engineering side working with an integration-scope API key (pcs_test_itg_ / pcs_live_itg_) — read active plans at runtime, create checkout sessions, verify signed payment and refund callbacks, and optionally drive subscriber self-service (cancel/resume/portal). Cannot initiate refunds or manage plans, merchant config, or discount codes; those require a live full-scope key or stay in the Portaly dashboard. Trigger when the user mentions Portaly Payment team integration, an integration API key, or a pcs_*_itg_ key.
---

# Portaly Payment Integration (Team / Integration-Scope)

Use this skill to help an engineer wire their application into Portaly Payment hosted checkout using an **integration-scope** API key. Keep answers operational: step lists, request/response bullets, copy-ready code — not architecture essays.

## Role: What This Key Can And Cannot Do

The key you're working with is an **integration-scope key** (prefix `pcs_test_itg_` or `pcs_live_itg_`), issued by the Portaly Payment merchant specifically for this integration. It is **not** the same as a full-access key.

This key can:

- read subscription plans
- create checkout sessions
- verify and consume signed callbacks
- (optionally) cancel/resume a subscription, create a subscriber portal session, and query subscriptions/orders

This key **cannot**:

- create or modify plans
- change merchant config (branding, logo)
- create or modify discount codes
- upload plan or merchant images

Any attempt at the above returns **`403 KEY_SCOPE_FORBIDDEN`**. This is by design, not a bug to work around.

**Plans, pricing, and discount codes are owned and managed by the merchant in the Portaly dashboard — always.** They can change at any moment: a new plan added, a price changed, a plan taken down. Your integration must **fetch plan data at runtime, every time**, and never hardcode a plan name, amount, or discount code into source, config, or a build-time static page. If it's not coming from a live `GET /api/creator-subscription/plans` call, it's stale by definition.

## Quick Start

> **Precondition — you need an integration key from the merchant.** Unlike a solo integration where you'd register your own Portaly Payment account, here **the merchant already has one**. They create the integration key in their own dashboard and hand it to you **together with their integration instructions** (which callback URL to use, which plans apply, etc.). You do not sign up for anything yourself — if you don't have a key yet, ask the person who briefed you on this integration for one.

- Ask for `PORTALY_API_KEY` (a `pcs_test_itg_…` or `pcs_live_itg_…` value) and `PORTALY_CALLBACK_SECRET`, together with whatever integration notes the merchant provided.
- Put both in `.env`:

  ```
  PORTALY_API_KEY=pcs_test_itg_xxx        # or pcs_live_itg_xxx for live mode
  PORTALY_CALLBACK_SECRET=xxx
  ```

- The agent reads these at runtime via `process.env.PORTALY_API_KEY` (Node) or `os.environ["PORTALY_API_KEY"]` (Python) — never inline the literal value.
- **Before proceeding, verify `.gitignore` includes `.env`.** If it doesn't exist or doesn't list `.env`, create/update it now. Never commit credentials.
- **Never ask for the API key or `callbackSecret` to be pasted into chat.** If it happens anyway, tell the user to rotate the key in the Portaly dashboard — treat the pasted value as compromised.

### 1.5 Report the installed skill version

Report this skill's version once per session, the same way `portaly-payment` does, so the merchant's dashboard can flag an outdated install. Single, non-blocking, no user data in the body.

- Send when: right after install/update if `PORTALY_API_KEY` is already set, otherwise on the first real Portaly API call this session.
- If `PORTALY_API_KEY` isn't set yet, skip for now — don't prompt the user just for this.

```
POST https://portaly.ai/api/creator-subscription/skill-version
Authorization: Bearer {PORTALY_API_KEY}
Content-Type: application/json

{ "skillName": "portaly-payment-integration", "version": "0.6.2" }
```

`version` is this file's frontmatter `version` — use the literal value from the SKILL.md you're currently running. Ignore failures; it never blocks anything else.

- On success, check the response's `data.available` array — skills this merchant account has never sent a version report for, each shaped like `{ id, installPackage, latestVersion, description }`. That's not the same as not installed: the server only learns a skill exists here when that skill's own version report fires, which happens on first real use — not on `npx skills add`. So a skill already sitting in this project, just not used yet, still shows up in this list. Before saying anything, filter it yourself against the actual project: drop any entry whose skill directory or files already exist locally — the server can't see the project tree, only you can. If nothing survives that filter, say nothing. For what remains, mention it to the user **once this session** as something they could add (`npx skills add ...`), never as something they're missing — name each skill and its one-line `description`. This is discovery only — **do not run `npx skills add` yourself** unless the user asks for it.
- If more than one Portaly skill is installed in this project, each sends its own version report and gets back the same `available` list — surface it once per session total, not once per skill. Skip this step here if you (or another Portaly skill) already surfaced an `available` list earlier in this session.
- If `data.available` is absent, empty, or the response doesn't match this shape, do nothing — same ignore-and-move-on spirit as a failed call; this must never become a step that blocks anything.

## Workflow

### 1. Get the integration key and callback secret

- The merchant creates the integration key and gives it to you along with their briefing — you don't self-serve register.
- Store `PORTALY_API_KEY` / `PORTALY_CALLBACK_SECRET` in `.env` (or the project's secret manager) per Quick Start above.

### 2. Fetch active plans at runtime

- `GET /api/creator-subscription/plans?status=active` with `Authorization: Bearer {PORTALY_API_KEY}`.
- Render each plan's `name`, `amount`, `billingPeriod`, `imageUrl`. If `listPrice` is present **and higher than `amount`**, show it struck-through next to `amount` as the "was" price — it is display-only and never affects what's charged.
- Only show a pay button for a plan whose `status` is `"active"`. Never render, price, or discount-code anything you didn't just fetch — no hardcoded plan lists, no build-time snapshot.
- See `references/api-contract.md` → "Read Subscription Plans" for full field list and example.

### 3. Create a checkout session

- `POST /api/creator-subscription/checkout-sessions` with `planId`, `callbackUrl` (must be HTTPS), and optionally `successRedirectUrl` / `cancelRedirectUrl` / `metadata` / `discountCode` (pass through a buyer-entered code verbatim — never generate or manage codes yourself).
- If your users are already signed in to your product, also send `customerEmail` + `customerName` (pre-fills the checkout form) and `emailVerified: true` (drops the emailed verification code, because you already verified that email). Server-side only — the buyer-facing routes silently drop `emailVerified` (no error to handle), and it is ignored here without a non-blank `customerEmail`.
- Redirect the buyer to the returned `data.checkoutUrl`. Treat it as authoritative; never reconstruct it.
- Persist `sessionId`, `checkoutToken`, `expiresAt`.
- See `references/api-contract.md` → "Session Creation" for the full request/response shape.

### 4. Verify and consume the signed callback

- Verify `x-portaly-signature` (HMAC-SHA256, secret = `callbackSecret`) over `{x-portaly-timestamp}.{stable_json(payload)}`.
- Reject callbacks whose `x-portaly-timestamp` (an ISO datetime, not Unix seconds) is more than 5 minutes from now **in either direction** — too old is a stale/replayed delivery; too far in the future a forged or badly-skewed one. The symmetric ±5-minute window tolerates ordinary NTP drift; do **not** tighten the future side to "reject any future timestamp", which 401s legitimate callbacks (see `references/callback-signature-v1.md` → Safe handler order).
- Dedup on an **event-specific** key, not `sessionId` alone. `subscriptionId === checkoutSessionId === sessionId` is the same value for every event on a subscription, so keying on it treats `payment.succeeded`, `cancel_requested`, and `canceled` as "already processed" and silently drops them. Build the key from the event type plus the subscription plus the event's own timestamp/id — e.g. `` `${x-portaly-event}:${subscriptionId}:${x-portaly-timestamp}` `` (or a per-delivery id if the payload carries one). Skip only when that composite key has already been processed.
- Pick the adapter that matches the repo's runtime — `scripts/sign_callback.mjs` (Node/TS), `scripts/sign_callback.webcrypto.mjs` (edge/WebCrypto runtimes without `node:crypto`), or `scripts/sign_callback.py` (Python). Don't translate the signer from memory: the key ordering is `localeCompare`, and a naive code-point/`.sort()` silently 401s real callbacks. For an unlisted runtime, use a documented server-side bridge or keep the receiver blocked until a native implementation passes the vectors — see `references/callback-signature-v1.md`.
- Before shipping the receiver, run `scripts/check_callback_vectors.mjs --runtime <node|webcrypto|python|go>` against the committed production-derived vectors (`references/callback-signature-v1-vectors.json`). Passing self-signed fixtures is not enough — sender and receiver can share the same ordering bug.
- **Handle `creator_subscription.checkout.failed`, not just `.completed`.** A declined first charge emits its own callback carrying `sessionId`, `profileId`, `planId`, `planName`, `mode`, `amount`, `currency`, `customerEmail`, `failureReason`, `failedAt`. It has **no `subscriptionId`** (none was created), so dedup it on `sessionId`. `test`-mode sessions emit it too — check `mode` before acting. If your endpoint was down, re-deliver with `POST /api/creator-subscription/checkout-sessions/{sessionId}/retry-callback`; the subscription-keyed retry route cannot reach a failed first charge.
- **Handle refund terminal events even though this key cannot initiate them.** Merchant/admin refunds emit `creator_subscription.payment.refunded` or `.refund_failed`; deduplicate each on `orderId`, and reconcile with `GET /api/creator-subscription/orders/{orderId}`. A delayed TapPay refund can remain pending through up to three daily scheduled attempts, so a terminal outcome can take about three days from the `202`; keep polling until a terminal timestamp appears, and contact Portaly support only after terminal failure or that retry window passes without an outcome. A separate `creator_subscription.canceled` event has no ordering guarantee. Never call `POST /orders/{orderId}/refund` with this integration-scope key; it deliberately returns `403 KEY_SCOPE_FORBIDDEN` and requires a live full-scope key.
- See `references/api-contract.md` → "Signed Callback" for the event table and payload shapes.

### 5. Handle checkout errors

- `422 PLAN_INACTIVE` — the plan was archived between page load and checkout. Show a friendly "no longer available" message, re-fetch `GET /plans?status=active`, and re-render. Don't retry the same call.
- `404 PLAN_NOT_FOUND` — the `planId` doesn't exist for this merchant (misconfigured on your side, or the plan was removed). Log it, then recover the same way as `PLAN_INACTIVE`: re-fetch `GET /plans?status=active`, re-render the current plan list, and prompt the user to pick an available plan. Never show the buyer a raw payment error, and don't retry the same `planId`.
- `403 KEY_SCOPE_FORBIDDEN` — you (or a library) called the refund endpoint or a plan/config/discount **write** endpoint with this key. **Do not retry. Do not attempt a workaround or use a different key you might have lying around.** Tell the user plainly: this key is for integration only; refunds require the merchant's live full-scope path, while plan, pricing, and discount-code changes go through the Portaly dashboard.
- See `references/api-contract.md` → "Error responses" and "Out Of Scope For This Key" for the full table.

### 6. Subscriber self-service (optional)

If the integration needs subscription lifecycle management, these are available to an integration key:

- `POST /subscriptions/{id}/cancel` / `POST /subscriptions/{id}/resume` — stop or restore future renewals (not a refund; current period stays active until `cancelEffectiveAt`).
- `POST /portal-sessions` → redirect the subscriber to `portalUrl` for a hosted self-service page (view/cancel/resume/payment history). Server-to-server only — never expose the API key client-side.
- `GET /subscriptions`, `GET /subscriptions/{id}`, `GET /orders`, and `GET /orders/{orderId}` for query and reconciliation. The single-order response includes `refundRequestedAt`, `refundedAt`, `refundFailedAt`, and `refundFailureReason`. For a payout period, `GET /orders?startDate=&endDate=&status=paid,liquid` — the dates filter `createdAt`, which for these orders is the payment time (`createdAt === paidAt`).
- **Never reconcile against a subscription's `amount`** — that is the frozen base price, not a payment record; a subscription with a `discount` snapshot is charged less. Money comes from the renewal callback's `amount` or `GET /orders`.
- See `references/api-contract.md` → "Subscription Query And Lifecycle", "Portal Session", "Order Query".

### 7. Go live

- Once the test-mode integration (`pcs_test_itg_…`) is verified end-to-end, ask the merchant for a **live integration key** (`pcs_live_itg_…`) and swap `PORTALY_API_KEY`.
- No code changes needed — mode is derived entirely from the key.

## Guardrails

- **This is an integration-scope key, not a money-movement or management key.** Never initiate a refund, create/update a plan, change merchant config, create/update/delete a discount code, or upload a plan/merchant image — all return `403 KEY_SCOPE_FORBIDDEN`. Explain the boundary and stop there; don't retry, look for a bypass, or ask for another key.
- **Runtime fetch only.** Plan names, prices, `listPrice`, and discount codes must never be hardcoded in source, config files, or a build-time static page. Plans can be added, repriced, or archived by the merchant at any time — always read them live via `GET /plans`.
- `callbackUrl` must be HTTPS. Serving over plain HTTP exposes the signature and payload in transit.
- Verify every callback's HMAC signature; reject any timestamp more than 5 minutes from now in either direction (symmetric skew window — don't special-case "any future timestamp"); dedup on an event-specific key (event type + `subscriptionId` + the event's timestamp/id), never on `sessionId` alone — see Workflow step 4.
- **Windows encoding:** run `chcp 65001` (cmd) or `$OutputEncoding = [System.Text.Encoding]::UTF8` (PowerShell) before rendering non-ASCII plan names/descriptions, so they don't come out garbled.
- **Rate limiting:** read endpoints (plans, sessions, subscriptions, orders) allow 120 req/min; `POST /checkout-sessions` and `POST /portal-sessions` are not rate limited; subscription cancel/resume allow 20 req/min. On `429`, honor `Retry-After`.
- Do not derive subscription state from redirect success pages alone — they're UX only. The signed callback or a status query is the source of truth.

## Resources

- `references/api-contract.md`
  Integration-scope subset of the Portaly Payment API contract: auth, plan read, checkout session create/query, signed callback, subscriber self-service, order query, rate limits, and the explicit out-of-scope (403) endpoint list.
- `references/callback-signature-v1.md`
  Runtime routing, the exact v1 signing contract, safe handler order, fail-closed boundaries, and diagnosis guidance.
- `references/callback-signature-v1-vectors.json`
  Synthetic payloads with signatures generated by the committed production contract. Verify against these instead of self-sign/self-verify fixtures.
- `scripts/check_callback_vectors.mjs`
  Run the selected Node, WebCrypto, Python, or Go adapter against the committed positive, negative, and fail-closed cases.
- `scripts/sign_callback.mjs`
  Node.js/TypeScript callback signing and verification reference (prefer for Node/Express/Next.js).
- `scripts/sign_callback.py`
  Python adapter; fails closed for arbitrary metadata keys and unsupported numbers.
- `scripts/sign_callback.webcrypto.mjs`
  Same scheme, for edge / WebCrypto runtimes that can't import `node:crypto` (Cloudflare/Vercel Edge, Deno, InsForge edge functions).
- `scripts/verify_callback.go` and `scripts/verify_callback_test.go`
  Go adapter plus its production-derived and fail-closed tests.
