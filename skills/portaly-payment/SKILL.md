---
name: portaly-payment
version: 0.5.5
description: Help users integrate Portaly Payment hosted checkout, including merchant setup, subscription plans (monthly, yearly with 12-month deferred disbursement, one-time), checkout sessions, recurring renewal callbacks, and callback verification. Trigger when the user mentions Portaly Payment, creator subscription, or wants to add subscription-based checkout to their application.
---

# Portaly Payment Integration

Use this skill to help a human user finish a Portaly Payment API integration quickly. Keep answers operational: prefer step lists, API request and response bullets, and copy-ready examples over long architecture explanations.

## Portaly Payment Environments

Portaly Payment supports two modes per API key: **live** and **test**.

### API Host & Payment site

Both the API host and the payment site (where buyers are redirected for checkout) live on the same unified domain for both modes:

- `https://portaly.ai` (default)

The host is overridable via the `PORTALY_API_HOST` environment variable. When generating code that calls the Portaly API, prefer this pattern over hardcoding the URL:

```ts
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'
```

See `PROVIDER.md` at the repo root for the backend compatibility contract.

### Mode behavior

| Aspect | Live mode | Test mode |
|---|---|---|
| API key prefix | `pcs_live_` | `pcs_test_` |
| Payment provider | TapPay production | TapPay sandbox |
| Order storage | `orders` collection | `sandboxOrders` collection |
| Callback payload | `mode: "live"` or absent | `mode: "test"` |

- Mode is set at API key creation time and cannot be changed after creation.
- A single merchant (`profileId`) can have both a live key and a test key active at the same time.
- All API endpoints accept both live and test keys. The mode is derived from the key, not from a request parameter.
- Test mode is intended for integration testing. Real charges are not made in test mode when using TapPay sandbox credentials.
- **Plans and merchant config are shared across modes.** They belong to the merchant (`profileId`), not to the API key mode. A plan created with a live key is visible and usable with a test key, and vice versa. Do **not** create duplicate plans when switching between live and test keys — query existing plans first with `GET /api/creator-subscription/plans` and reuse them.

## Quick Start

> **Precondition — a Portaly Payment account is required.** This integration needs a Portaly Payment API key. **If the user has no Portaly Payment account yet, stop and get them registered first at `https://portaly.cc/payment` before anything else** — offer to open the page for them, and open it once they say yes:
>
> ```bash
> # Open the Portaly Payment registration page — pick the line for the user's OS
> Start-Process "https://portaly.cc/payment"   # Windows (PowerShell)
> open "https://portaly.cc/payment"            # macOS
> xdg-open "https://portaly.cc/payment"        # Linux
> ```
>
> Do not continue until they have an account and have created a key. Once registered, they create the key in the dashboard at `https://portaly.cc/admin/creator-subscription`.

- Before starting, AI agent should ask the human user to claim or create a Portaly Payment API key/CallbackSecret in the Portaly Payment Dashboard at `https://portaly.cc/admin/creator-subscription` and store the issued secret material safely.
- Ask the human user whether they want a **live** or **test** key, but make the constraint clear: a **live key can only be created after the merchant passes Portaly payment verification (金流審核 / KYC)**. First-time users have almost always not passed it yet, so in the dashboard the Live option is **locked** and only Test is selectable. **Recommend starting with a test key** to build and test the whole integration now; once payment verification passes, they can come back to the dashboard and create a live key for production.

1. Confirm what the human user is trying to build.
   Prepare for payment integration tasks such as:
   1. create merchant config
   2. create subscription plans
   3. upload merchant or plan images (Agent should ask human user to provide image assets if needed)
2. After setup, integrate the checkout session creation and callback handling into current system:
   1. create checkout session before buyer initiates payment
   2. redirect buyer to Portaly checkout
   3. verify and consume the callback from Portaly after checkout completion
   4. if the integration needs subscription lifecycle management, also wire cancel and resume APIs for recurring plans
   5. if the integration needs subscriber self-service (letting subscribers manage their own subscriptions), wire the portal session API
3. Start with `references/api-contract.md`.
   Use it for endpoint lists, auth, request bodies, response bodies, and callback headers.
4. Load `references/checkout-and-renewal.md` only when needed.
   Use it only as supplemental reference when the human user asks about post-checkout charging, renewal, payout, invoice, or bridge-order behavior.
5. Return implementation-ready output.
   Prefer numbered steps, API endpoint lists, request and response bullets, and Node.js or TypeScript examples.

## Output Style

- Write for an AI agent that is helping a human user complete integration work.
- Lead with the next concrete steps the human should take.
- Be explicit when an API can be called directly by the Agent with the Portaly Payment API key.
- Prefer using the setup APIs directly for merchant config, plan creation, plan updates, image uploads, and checkout session creation when the user has already provided valid credentials and required inputs.
- Use lists for:
  - setup steps
  - API endpoints
  - required headers
  - request fields
  - response fields
  - callback verification steps
- Prefer concise code samples in JavaScript or TypeScript when the user does not ask for another stack.
- Keep Portaly-owned behavior and third-party-owned behavior clearly separated.

## Workflow

### 1. Apply for the API key

- Require a Portaly Payment API key and CallbackSecret for this integration.
- Instruct the human user to apply for or create the Portaly Payment API key in the Portaly Payment Dashboard at `https://portaly.cc/admin/creator-subscription`.
- Ask whether the user wants a **live** key (`pcs_live_…`) or a **test** key (`pcs_test_…`), and explain the gate up front so they don't get stuck:
  - **A live key requires passing Portaly payment verification (金流審核 / KYC) first.** Until the merchant completes verification, the dashboard's "正式 API Key (Live)" option is **disabled** — the dashboard explicitly states: 「未通過 Portaly 金流審核前，僅能建立測試用 (Test) API Key；完成認證後即可建立正式 (Live) API Key。」 The merchant starts verification via the "金流審核" entry on that page.
  - **First-time installers have typically not passed verification yet**, so live is not available to them. Tell them this is expected, not an error.
  - **Recommend starting with a test key** (`pcs_test_…`) — it lets them build and exercise the entire integration (config, plans, checkout, callbacks) against TapPay sandbox immediately, with no real charges. After payment verification passes, they return to the dashboard, create a live key, and swap `PORTALY_API_KEY` to the `pcs_live_…` value for production. No code changes are needed — the mode is derived from the key.
- Be explicit that this step is performed by a human operator in Portaly Payment Dashboard, not by the third-party integration code.
- Tell the human user to store the issued secret material safely, or store it on the user's behalf only in an appropriate secret manager or secure environment store.
- Explain that the API key is used for bearer authentication in API calls and the `callbackSecret` is used for verifying the authenticity of callbacks from Portaly If user asking.
- **Never ask the user to paste the API key or `callbackSecret` into chat.** Chat transcripts can be logged, cached, or echoed back by the model in summaries, diffs, or tool call arguments. Treat secrets as values the agent never needs to see in plaintext.
- Instead, instruct the human user to place the secrets into `.env` **themselves** (via their editor or shell), using this template:

  ```
  PORTALY_API_KEY=pcs_live_xxx        # or pcs_test_xxx for test mode
  PORTALY_CALLBACK_SECRET=xxx
  ```

- The agent reads these at runtime via `process.env.PORTALY_API_KEY` (Node) or `os.environ["PORTALY_API_KEY"]` (Python) — it never needs the literal secret value in-context.
- If the project uses a secret manager (1Password CLI, Doppler, AWS/GCP Secrets Manager, Vault, etc.), prefer that over `.env`.
- **Before proceeding, verify that `.gitignore` includes `.env`.** If `.gitignore` does not exist or does not include `.env`, create or update it immediately. Never allow credentials to be committed to version control.
- If the user does paste a secret into chat by mistake, advise them to **rotate the key** in the Portaly Payment Dashboard before using it — assume the pasted value is compromised.

### 1.5 Report the installed skill version

Report this skill's version to Portaly so the merchant's dashboard can flag when their installed skill is out of date. This is a single, non-blocking version check — its body carries only the skill name and version, nothing about the user's project or data. **Mention it to the user once** (e.g. "Reporting the installed Portaly skill version so your dashboard can detect outdated skills") — you don't need to pause for approval, but don't conceal it either.

**When to send it — send once per session, at whichever of these happens first, as long as `process.env.PORTALY_API_KEY` is set:**

1. **Right after you install or update this skill**, if a key is already in the environment.
2. **Otherwise, the first time you make any Portaly API call** (configuring the merchant, listing plans, creating a checkout session, etc.) — the version report rides along with that first real API usage.

- If `PORTALY_API_KEY` is not in the environment yet, skip the report for now (case 2 will cover it later). Never prompt the user for a key just to send this.
- The request:
  ```
  POST https://portaly.ai/api/creator-subscription/skill-version
  Authorization: Bearer {PORTALY_API_KEY}
  Content-Type: application/json

  { "skillName": "portaly-payment", "version": "0.5.5" }
  ```
- `version` is this skill's `version` from the frontmatter at the top of THIS file — use the literal value of the SKILL.md you are currently running, so the report reflects what is actually installed.
- The request body carries only `skillName` and `version`. If the call fails, ignore it and continue — it never blocks anything.

### 2. Configure merchant settings

- Agent should perform these setup actions directly by API call with the Portaly Payment API key.
- Use the Config APIs when the human user needs to set merchant branding before any product goes live.
- AI Agent should ask the human user to provide a `merchantLogo` image asset, use the config image upload API to upload image to Portaly. The merchant logo is optional — if the user does not have one ready, skip this step and proceed with plan creation.
- Use `PUT /api/creator-subscription/config` and `POST /api/creator-subscription/config/images` to set up merchant branding with the Portaly Payment API key.

### 3. Create a valid subscription plan

- Agent should perform plan creation, plan updates, and plan image uploads directly by API call with the Portaly Payment API key.
- **Before creating a new plan, always query existing plans** with `GET /api/creator-subscription/plans` using the current API key. Plans are shared across live and test modes; if a suitable plan already exists, reuse it instead of creating a duplicate.
- Require at least one active plan in Portaly before creating a checkout session. Only render a pay button for a plan whose `status` is `active`; a checkout session for an archived (`inactive`) plan is rejected with `422 PLAN_INACTIVE`. Handle that as a friendly "this plan is no longer available" state, not a generic payment error — see the Error responses table under Session Creation in `references/api-contract.md`.
- Use the Plan APIs to create or update the product basics that the human user wants to list on Portaly.
- Confirm the plan name, description, amount, currency, billing period (`monthly`, `yearly`, or `one-time`), pricing type (`fixed` or `dynamic`), and status match the intended product.
- **Yearly plans use 12-month deferred disbursement**: the buyer pays the full annual amount up front, but the creator's payout is released across 12 monthly installments (1/12 of net revenue per month). Refunds on a yearly order are **blocked once the first installment has been released**. Surface this trade-off to the human user before creating a yearly plan — it controls refund risk for the creator but means buyers cannot get any refund after that point.
- For dynamic pricing plans: set `pricingType` to `dynamic` and `billingPeriod` to `one-time`. The amount is not set on the plan; instead, the caller passes `amount` when creating each checkout session.
- If the third party has its own product catalog, persist the Portaly `planId` together with the merchant's internal product or entitlement identifier.
- AI Agent should ask the human user to provide a plan image, use the plan image upload API to upload the image to Portaly.
- Treat the `checkoutUrl` returned by Portaly as authoritative. Do not reconstruct it from guessed domains.
- After creating or updating a plan, check the response `name` and `description` for garbled text (mojibake). If corrupted, fix shell encoding and use `PUT /api/creator-subscription/plans/{planId}` to correct it. See the Windows encoding note in Guardrails.

### 3.5 Create discount codes (optional)

- Use the Discount Code APIs after at least one plan exists.
- A code carries an array of **rules**; each rule can target a different set of plans with its own discount and duration. Example: code `EARLYBIRD` with two rules — 50% off for 3 cycles (= 3 months) on the monthly plan, and NT$200 off for 1 cycle on the one-time plan. For a yearly code, see `ANNUAL20`: 20% off for 1 cycle (= 1 year) on the yearly plan.
- Per rule, confirm with the human user:
  - **Discount type**: `fixed` (TWD off) / `percent` (% off) / `free` (100% off).
  - **Duration**: `repeating N cycles` (default 1) or `forever` (typically with `fixed`). One cycle equals one billing period — a month for a monthly plan, a year for a yearly plan.
  - **appliesTo**: `all` (fallback for any plan not covered by a specific rule) or `specific` planIds (e.g. the yearly plan only). At most one `all` rule per code; planIds may not appear in more than one rule.
- Code-level params:
  - **Custom code**: 3-40 chars, `[A-Z0-9_-]`. Stored and displayed in **UPPERCASE**; lookup is case-insensitive on input. Unique per profile. Immutable post-create.
  - **Redemption window**: `redeemFrom` / `redeemBy`.
  - **Caps**: `maxRedemptions` (total) / `maxRedemptionsPerCustomer` (per email).
- Codes are shared across **live and test** modes (same as plans).
- Codes also serve as **ref codes**: record the code as `signupRefCode` at user registration. When a buyer with a recorded `signupRefCode` later checks out and verifies their email, Portaly auto-applies the matching rule, provided the code is still within its `redeemBy` window.
- See `references/discount-code-examples.md` for example prompts and the parameter cheatsheet.
- **Money-moving guard**: live-mode discount creation requires explicit user confirmation (same rule as live-mode plan creation).

### 4. Create the checkout session

- Create a checkout session before the buyer initiates payment.
- Call `POST /api/creator-subscription/checkout-sessions` with `Authorization: Bearer {api_key}`.
- Send `planId` and optional `successRedirectUrl`, `cancelRedirectUrl`, `callbackUrl`, `subscriptionCallbackUrl`, `merchantOrderNumber`, and string-keyed `metadata`.
- `callbackUrl` receives the `checkout.completed` callback and — unless `subscriptionCallbackUrl` is set — also the recurring renewal (`payment.succeeded` / `payment.failed`) and lifecycle callbacks. Set `subscriptionCallbackUrl` to route renewal/lifecycle events to a dedicated endpoint instead.
- **Optional `discountCode`**: when provided, Portaly validates and applies the discount up-front. Invalid codes return `400 INVALID_DISCOUNT_CODE`. When omitted, Portaly attempts to auto-apply a discount via the buyer's `signupRefCode` after their email is verified inside hosted checkout (no extra call needed from the merchant).
- Persist `sessionId`, `checkoutToken`, `checkoutUrl`, and `expiresAt` on the third-party side.
- The session response includes `appliedDiscount` when a discount was applied at session creation; `session.amount` is always the **post-discount** amount the buyer will be charged.
- Redirect the buyer to `checkoutUrl`.

### 5. Let Portaly run hosted checkout

- Treat Portaly hosted checkout as a black box from the third-party perspective.
- Do not ask the third party to collect card tokens or implement Portaly-owned payment steps.

### 6. Consume the result

- The primary external confirmation is the signed callback to `callbackUrl`.
- **The checkout callback (`creator_subscription.checkout.completed`) is only dispatched when checkout status is `completed`.** Non-completed outcomes (failed, canceled, expired) do not trigger a checkout callback.
- For non-completed outcomes, poll `GET /api/creator-subscription/checkout-sessions/{sessionId}` as a fallback.
- **Recurring renewals also emit signed callbacks** (same signing/verification as the checkout callback): `creator_subscription.payment.succeeded` on each successful renewal and `creator_subscription.payment.failed` on each failed renewal. They are delivered to the subscription's `subscriptionCallbackUrl` if set, otherwise to the same `callbackUrl`. Lifecycle events (`creator_subscription.active` / `.cancel_requested` / `.canceled`) are delivered the same way. Switch on the `x-portaly-event` header. See `references/api-contract.md` → Signed Callback for the full event table and payloads, and `references/checkout-and-renewal.md` for renewal behavior.
- Use manual `POST /api/creator-subscription/checkout-sessions/{sessionId}/complete` only as an exception flow when the user is building a non-hosted or recovery flow.
- **Current implementation contract:** `subscriptionId === checkoutSessionId === sessionId`.
- When a recurring checkout succeeds, human user's system may use the callback's `sessionId` directly as the `subscriptionId` for later cancel or resume API calls.
- Make it explicit to the human user that this is the current Portaly implementation contract and should be persisted on their side after checkout completion.

### 7. Verify and persist

- Verify `x-portaly-signature` with the API key's `callbackSecret`.
- Use the exact timestamp from `x-portaly-timestamp`.
- **Reject callbacks where `x-portaly-timestamp` is older than 5 minutes** to prevent replay attacks. Note: `x-portaly-timestamp` is an ISO datetime string, not Unix seconds.
- Serialize the callback payload with stable key ordering before HMAC.
- Reference implementations live in `scripts/sign_callback.py` and `scripts/sign_callback.mjs`.
- After verification, persist `sessionId`, `subscriptionId` if present, `merchantOrderNumber`, `paymentReference`, `paymentMethod`, `status`, and the raw callback body for auditing.
- If the callback payload does not include `subscriptionId`, persist `sessionId` as the recurring subscription identifier because the current implementation uses `sessionId` as `subscriptionId`.
- **Use `sessionId` as an idempotency key** — if a callback with the same `sessionId` has already been processed, skip duplicate handling to avoid double fulfillment.
- **`callbackUrl` must use HTTPS.** Serving over plain HTTP exposes the `callbackSecret` signature and payload in transit.

### 8. Manage recurring subscriptions

- Only recurring plans with `billingPeriod = monthly | yearly` support cancel or resume.
- Cancellation means stopping the next recurring charge. It is not a refund. In your system, the rights or content associated should remain active until the end of the current paid period, which is indicated by `cancelEffectiveAt` in the subscription record.
- For yearly subscriptions, cancellation does **not** trigger a refund of the unreleased deferred portion — the creator continues to receive remaining monthly installments through the original 12-month schedule, and the buyer retains access until `cancelEffectiveAt` (i.e. the next yearly renewal date that will no longer be charged).
- Portaly currently supports merchant-system initiated subscription lifecycle actions through API key authenticated endpoints.
- Use the same Portaly Payment API key for these calls.

Recurring management APIs:

- `GET /api/creator-subscription/subscriptions` — list all subscriptions with pagination and filtering
- `GET /api/creator-subscription/subscriptions/{subscriptionId}`
- `POST /api/creator-subscription/subscriptions/{subscriptionId}/cancel`
- `POST /api/creator-subscription/subscriptions/{subscriptionId}/resume`

Order query API:

- `GET /api/creator-subscription/orders` — list payment/order records with pagination

Recurring management rules:

- These APIs only accept `Authorization: Bearer {api_key}`
- Do not use Firebase auth for merchant-system integrations
- `billingPeriod = one-time` does not support cancel or resume
- `cancel` marks the subscription as `cancelAtPeriodEnd = true`
- `resume` only works before the subscription has become fully `canceled`

Cancel request body:

```json
{
  "reason": "customer_requested",
  "reasonNote": "optional note"
}
```

Resume request body:

```json
{}
```

What to persist for recurring lifecycle:

- `subscriptionId`
- `sessionId`
- `planId`
- `billingPeriod`
- `status`
- `cancelAtPeriodEnd`
- `cancelEffectiveAt`

### 9. Enable subscriber self-service portal (optional)

- Use this when the merchant wants subscribers to manage their own subscriptions directly.
- The merchant backend creates a portal session via `POST /api/creator-subscription/portal-sessions` on `https://portaly.ai`, then redirects the subscriber to the returned `portalUrl`.
- This is a **server-to-server** call — the API key must never be exposed to the client.
- The subscriber lands on Portaly's hosted portal page, already authenticated via the session token. No additional login is required.
- In the portal, subscribers can view subscriptions, cancel, resume, and view payment history.
- Portal sessions expire after 30 minutes.
- The merchant must provide a `returnUrl` so the subscriber can navigate back after managing their subscriptions.
- See `Portal Session (Subscriber Self-Service)` in `references/api-contract.md` for full endpoint details and code examples.

## Preferred Response Shape

When answering with this skill, prefer this order:

1. Goal summary
2. Human setup steps
3. API list
4. Request fields
5. Response fields
6. Callback handling steps
7. Example code
8. Troubleshooting notes

## Guardrails

- **Default to test mode for development.** If the loaded key starts with `pcs_live_`, confirm with the human user that live mode is intended before making any API call. Never silently run against production billing.
- **Money-moving actions require explicit user confirmation.** Before calling any of the following, state the exact action, target (`subscriptionId` / `sessionId`), and mode (live/test), then wait for the user's "yes":
  - `POST /subscriptions/{id}/cancel`
  - `POST /subscriptions/{id}/resume`
  - `POST /checkout-sessions/{id}/complete` (manual completion)
  - Any plan creation/update in **live** mode
- Do **not** batch or loop these actions across multiple subscriptions without per-action confirmation.
- Prefer the hosted checkout flow whenever possible. It already handles email verification, payment-method persistence, callback dispatch, subscription creation, payment creation, invoice task creation, and order bridge writes.
- Distinguish clearly between:
  - setup APIs that the Agent can call directly with the Portaly Payment API key
- Do not invent provider behavior. TapPay and 91APP differ materially.
- Do not assume callback delivery means success without checking the `status` and verified signature.
- Do not derive subscription state from redirect success pages alone. Redirects are UX only; callback or status query is the source of truth.
- Treat `references/checkout-and-renewal.md` as non-API background material. Load it only if the task explicitly touches recurring billing, payout, invoice follow-up, or bridge-order behavior.
- **Windows encoding:** On Windows, run `chcp 65001` (cmd) or `$OutputEncoding = [System.Text.Encoding]::UTF8` (PowerShell) before API calls containing non-ASCII text. If a plan's `name` or `description` comes back garbled, fix encoding and `PUT` the correct values.
- **Rate limiting:** All creator-subscription API endpoints (except `POST /checkout-sessions`) are rate limited. Read endpoints allow 120 requests/min, write endpoints allow 20 requests/min. If a `429` response is received, use the `Retry-After` header to schedule retries. When paginating through large result sets, be mindful of the rate limit budget.

## Deliverables

When using this skill, aim to return one or more of:

- a minimal step-by-step integration plan for the human user
- a flat list of relevant APIs
- request and response field breakdowns
- callback verification code in the user's stack
- sample `curl`, `fetch`, or TypeScript snippets
- a troubleshooting list keyed by session status

## Resources

- `references/api-contract.md`
  Use for bearer auth, endpoint contract, callback headers, payload fields, and third-party implementation shape.
- `references/checkout-and-renewal.md`
  Use only as optional background for the high-level checkout lifecycle and renewal behavior.
- `references/discount-code-examples.md`
  Example prompts, parameter cheatsheet, and ref-code usage for the Discount Code APIs.
- `scripts/sign_callback.py`
  Use when you need a deterministic example of Portaly callback signing and verification.
- `scripts/sign_callback.mjs`
  Prefer this for Node.js, JavaScript, TypeScript, Express, or Next.js integrations.
- `scripts/sign_callback.webcrypto.mjs`
  Use on edge / WebCrypto runtimes that can't import `node:crypto` (Cloudflare/Vercel Edge, Deno, InsForge edge functions). Same scheme + byte-identical `stableJson`; verifies via the global `crypto.subtle`.
