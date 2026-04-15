---
name: portaly-vibe-payment-integration
description: Help users integrate Portaly Vibe hosted payment checkout, including merchant setup, subscription plans, checkout sessions, and callback verification. Trigger when the user mentions Portaly Vibe payment, creator subscription, or wants to add subscription-based checkout to their application.
---

# Portaly Vibe Payment Integration

Use this skill to help a human user finish a Portaly Vibe API integration quickly. Keep answers operational: prefer step lists, API request and response bullets, and copy-ready examples over long architecture explanations.

## Portaly Vibe Payment Environments

Portaly Vibe Payment supports two modes per API key: **live** and **test**.

### API Host

Use the following API host for both modes:

- `https://portaly.cc`

### Payment site

Payment site URLs to which buyers are redirected for checkout:

- `https://payment.portaly.cc`

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
- **Plans and merchant config are shared across modes.** They belong to the `profileId`, not to the API key mode. A plan created with a live key is visible and usable with a test key, and vice versa. Do **not** create duplicate plans when switching between live and test keys — query existing plans first with `GET /api/creator-subscription/plans?profileId={profileId}` and reuse them.

## Quick Start

- Before starting, AI agent should ask the human user to claim or create a Portaly Vibe Payment API key/CallbackSecret in the Portaly admin at `https://portaly.cc/admin/creator-subscription` and store the issued secret material safely.
- Ask the human user whether they want a **live** or **test** key. Recommend starting with a test key for integration development.

1. Confirm what the human user is trying to build.
   Prepare for payment integration tasks such as:
   1. create merchant config
   2. create subscription plans
   3. upload merchant or plan images (Agent should ask human user to provide image assets if needed)
2. After setup, integrate the checkout session creation and callback handling into current system:
   1. create checkout session before buyer initiates payment
   2. redirect buyer to Portaly vibe checkout
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
- Be explicit when an API can be called directly by the Agent with the Portaly Vibe Payment API key.
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

- Require a Portaly Vibe Payment API key and CallbackSecret for this integration.
- Instruct the human user to apply for or create the Portaly Vibe Payment API key in the Portaly admin at `https://portaly.cc/admin/creator-subscription`.
- Ask whether the user wants a **live** key (`pcs_live_…`) or a **test** key (`pcs_test_…`). Recommend starting with a test key for development and switching to live for production.
- Be explicit that this step is performed by a human operator in Portaly admin panel, not by the third-party integration code.
- Tell the human user to store the issued secret material safely, or store it on the user's behalf only in an appropriate secret manager or secure environment store.
- Explain that the API key is used for bearer authentication in API calls and the `callbackSecret` is used for verifying the authenticity of callbacks from Portaly If user asking.
- Do not leave the API key or `callbackSecret` in chat transcripts, source files, client-side code, screenshots, or plaintext docs.
- Asking the human user to paste the API key to chat and directly saving to `.env` file as possible.
- Then, Agent should asking for `callbackSecret` and save it to `.env` file as well.
- create a `.env` file if not exist and save the following content:

```
PORTALY_API_KEY=pcs_live_xxx
PORTALY_CALLBACK_SECRET=xxx
```

- If the user chose a **test** key, the API key will start with `pcs_test_` instead. The `.env` format is the same; only the key value differs.
- **Verify that `.gitignore` includes `.env`** before proceeding. If `.gitignore` does not exist or does not include `.env`, create or update it immediately. Never allow credentials to be committed to version control.

### 2. Configure merchant settings

- Agent should perform these setup actions directly by API call with the Portaly Vibe Payment API key.
- Use the Config APIs when the human user needs to set merchant branding before any product goes live.
- AI Agent should ask the human user to provide a `merchantLogo` image asset, use the config image upload API to upload image to Portaly. The merchant logo is optional — if the user does not have one ready, skip this step and proceed with plan creation.
- Use `PUT /api/creator-subscription/config` and `POST /api/creator-subscription/config/images` to set up merchant branding with the Portaly Vibe Payment API key.

### 3. Create a valid subscription plan

- Agent should perform plan creation, plan updates, and plan image uploads directly by API call with the Portaly Vibe Payment API key.
- **Before creating a new plan, always query existing plans** with `GET /api/creator-subscription/plans?profileId={profileId}` using the current API key. Plans are shared across live and test modes — if a suitable plan already exists, reuse it instead of creating a duplicate.
- Require at least one active plan in Portaly before creating a checkout session.
- Use the Plan APIs to create or update the product basics that the human user wants to list on Portaly.
- Confirm the plan name, description, amount, currency, billing period (`monthly`, `yearly`, or `one-time`), pricing type (`fixed` or `dynamic`), and status match the intended product.
- For dynamic pricing plans: set `pricingType` to `dynamic` and `billingPeriod` to `one-time`. The amount is not set on the plan; instead, the caller passes `amount` when creating each checkout session.
- If the third party has its own product catalog, persist the Portaly `planId` together with the merchant's internal product or entitlement identifier.
- AI Agent should ask the human user to provide a plan image, use the plan image upload API to upload the image to Portaly.
- Treat the `checkoutUrl` returned by Portaly as authoritative. Do not reconstruct it from guessed domains.
- After creating or updating a plan, check the response `name` and `description` for garbled text (mojibake). If corrupted, fix shell encoding and use `PUT /api/creator-subscription/plans/{planId}` to correct it. See the Windows encoding note in Guardrails.

### 4. Create the checkout session

- Create a checkout session before the buyer initiates payment.
- Call `POST /api/creator-subscription/checkout-sessions` with `Authorization: Bearer {api_key}`.
- Send `planId` and optional `successRedirectUrl`, `cancelRedirectUrl`, `callbackUrl`, `merchantOrderNumber`, and string-keyed `metadata`.
- Persist `sessionId`, `checkoutToken`, `checkoutUrl`, and `expiresAt` on the third-party side.
- Redirect the buyer to `checkoutUrl`.

### 5. Let Portaly run hosted checkout

- Treat Portaly hosted checkout as a black box from the third-party perspective.
- Do not ask the third party to collect card tokens or implement Portaly-owned payment steps.

### 6. Consume the result

- The primary external confirmation is the signed callback to `callbackUrl`.
- **Callback is only dispatched when checkout status is `completed`.** Non-completed outcomes (failed, canceled, expired) do not trigger a callback.
- For non-completed outcomes, poll `GET /api/creator-subscription/checkout-sessions/{sessionId}` as a fallback.
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
- Portaly currently supports merchant-system initiated subscription lifecycle actions through API key authenticated endpoints.
- Use the same Portaly Vibe Payment API key for these calls.

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
- The merchant backend creates a portal session via `POST /api/creator-subscription/portal-sessions` on `https://payment.portaly.cc`, then redirects the subscriber to the returned `portalUrl`.
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

- Prefer the hosted checkout flow whenever possible. It already handles email verification, payment-method persistence, callback dispatch, subscription creation, payment creation, invoice task creation, and order bridge writes.
- Distinguish clearly between:
  - setup APIs that the Agent can call directly with the Portaly Vibe Payment API key
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
- `scripts/sign_callback.py`
  Use when you need a deterministic example of Portaly callback signing and verification.
- `scripts/sign_callback.mjs`
  Prefer this for Node.js, JavaScript, TypeScript, Express, or Next.js integrations.
