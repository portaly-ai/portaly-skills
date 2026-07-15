# API Contract (Integration-Scope Subset)

This is the contract subset available to an **integration-scope** Portaly Payment API key (`pcs_test_itg_…` / `pcs_live_itg_…`). It covers only what these keys can do: read plans, create checkout sessions, verify callbacks, and (optionally) drive subscriber self-service. Plan, merchant config, and discount code **write** endpoints are out of scope for this key and are called out explicitly below so you don't waste time debugging a 403.

## Use This Reference For

- reading active subscription plans at runtime
- third-party checkout session creation
- session query and reconciliation
- signed callback verification
- subscriber self-service subscription actions (cancel, resume, portal)
- order query
- rate limiting behavior and retry handling
- skill version reporting

For anything about creating/editing plans, merchant branding, or discount codes, stop — that's the merchant's job in the Portaly dashboard, not this key's job (see Guardrails in `SKILL.md`).

## Bearer Auth

- Header:
  - `Authorization: Bearer {pcs_test_itg_… or pcs_live_itg_… key}`
- Host:
  - `https://portaly.ai` (default), overridable via the `PORTALY_API_HOST` environment variable
  - `const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'`
- Notes:
  - the key is tied to one `profileId` (the merchant's Portaly account)
  - each key has a fixed `mode` (`live` or `test`) — live keys start with `pcs_live_itg_`, test keys start with `pcs_test_itg_`
  - each key has a fixed **scope** — this contract assumes `integration` scope. The authoritative scope is stored server-side against the key, not just the prefix.
  - mode is derived from the key; it is not passed per-request
  - **integration-scope keys are checkout-only.** They can read plans, create checkout sessions, query sessions/subscriptions/orders, and drive cancel/resume/portal-session. Calls to plan, merchant config, or discount-code **write** endpoints return `403 KEY_SCOPE_FORBIDDEN` — see "Out of Scope" below.

## Read Subscription Plans

Use this at **runtime**, every time you need to render a plan list or a pay button. Never cache plan data into your build output — the merchant can add, reprice, or archive plans at any time in the Portaly dashboard, and your app must reflect that on the next load.

- Endpoint:
  - `GET /api/creator-subscription/plans`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
- Query parameters:
  - `status`: optional, `active` | `inactive` | `all`. Defaults to `all` when omitted. An invalid value returns `400 INVALID_STATUS_FILTER`.
  - Pass `?status=active` when rendering a plan-selection UI — only an `active` plan should ever get a pay button. A checkout session for an `inactive` plan is rejected with `422 PLAN_INACTIVE` (see Session Creation below).
- Response fields (per plan):
  - `data[].id`
  - `data[].profileId`
  - `data[].name`
  - `data[].description`
  - `data[].amount` — the actual chargeable amount; always use this for checkout math
  - `data[].currency`
  - `data[].billingPeriod` (`monthly` | `yearly` | `one-time`)
  - `data[].pricingType` (`fixed` | `dynamic`)
  - `data[].status` (`active` | `inactive`)
  - `data[].merchantPlanId`
  - `data[].imageUrl` — resolved public image URL, or `null`
  - `data[].listPrice` — optional display-only reference ("原價"). Show it struck-through next to `amount` **only when `listPrice > amount`**. It is never charged — `amount` is the sole source of truth for checkout.
  - `data[].externalInformationUrl`
  - `data[].createdAt`
  - `data[].updatedAt`

```js
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || "https://portaly.ai";

const res = await fetch(
  `${PORTALY_API_HOST}/api/creator-subscription/plans?status=active`,
  { headers: { authorization: `Bearer ${process.env.PORTALY_API_KEY}` } }
);
const { data: plans } = await res.json();

// Render: name, amount (+ struck-through listPrice if higher), imageUrl, billingPeriod.
// Only show a pay button when plan.status === 'active'.
```

## Session Creation

Use this when the buyer is ready to go to Portaly hosted checkout.

- Endpoint:
  - `POST /api/creator-subscription/checkout-sessions`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
  - `Content-Type: application/json`
- Request fields:
  - `planId`: required, Portaly plan id
  - `amount`: optional positive number. **Required** for dynamic pricing plans; ignored for fixed pricing plans
  - `callbackUrl`: merchant callback endpoint, **must use HTTPS**. Receives `creator_subscription.checkout.completed`, and — unless `subscriptionCallbackUrl` is set — the recurring renewal and lifecycle callbacks too
  - `subscriptionCallbackUrl`: optional. When set, recurring renewal/lifecycle callbacks go here instead; falls back to `callbackUrl` when empty
  - `successRedirectUrl`: optional merchant success page
  - `cancelRedirectUrl`: optional merchant cancel page
  - `merchantOrderNumber`: optional merchant-side order id
  - `metadata`: optional string-keyed extra context
  - `discountCode`: optional. When provided, Portaly validates and applies the discount up front. **Do not create or manage discount codes yourself** — the merchant issues codes in the Portaly dashboard; you only ever pass a code a buyer typed in, verbatim, to this field.

Request body (fixed pricing plan):

```json
{
  "planId": "plan_123",
  "callbackUrl": "https://merchant.example/api/portaly/callback",
  "successRedirectUrl": "https://merchant.example/success",
  "cancelRedirectUrl": "https://merchant.example/cancel",
  "merchantOrderNumber": "order_001",
  "metadata": { "source": "web" }
}
```

- Response fields:
  - `data.sessionId`: Portaly checkout session id
  - `data.status`: initial status, usually `checkout_ready`
  - `data.checkoutUrl`: URL to redirect the buyer to — treat as authoritative, never reconstruct it
  - `data.checkoutToken`: server-side token for manual completion (rare)
  - `data.expiresAt`: session expiry timestamp
  - `data.appliedDiscount?`: present when a `discountCode` was validated and applied. Shape: `{ codeId, code, rule, originalAmount, discountedAmount, finalAmount, source: 'manual' | 'ref_code' }`. When present, `session.amount` is the **post-discount** amount.

```json
{
  "data": {
    "sessionId": "session_123",
    "status": "checkout_ready",
    "checkoutUrl": "https://portaly.ai/checkout/subscription/session_123",
    "checkoutToken": "hex_token",
    "expiresAt": "2026-03-20T12:30:00.000Z"
  }
}
```

- Integration notes:
  - current implementation contract: `subscriptionId === checkoutSessionId === sessionId`
  - for recurring subscriptions, persist `sessionId` as the subscription identifier used by cancel/resume/portal APIs
  - `POST /checkout-sessions` is the one endpoint **not** subject to rate limiting

### Error responses

Every failure returns `{ "error": string }`; business-rule failures also include a stable `{ "code": string }` — branch on `code`, not the `error` text (copy may change). Always check `response.ok` before reading `result.data`.

| HTTP | `code` | When | Handle as |
| --- | --- | --- | --- |
| 422 | `PLAN_INACTIVE` | The plan was archived by the merchant between page load and checkout. | Friendly "this plan is no longer available" message. Re-fetch `GET /plans?status=active` and re-render. Do not retry the same call. |
| 404 | `PLAN_NOT_FOUND` | `planId` does not exist for this merchant. | Misconfiguration on your side — log it, don't show the buyer a payment error. |
| 400 | `INVALID_DISCOUNT_CODE` | The buyer-entered `discountCode` is invalid (see `reason`). | "That discount code can't be applied." Let them retry without it. |
| 403 | `KEY_SCOPE_FORBIDDEN` | You called a plan/config/discount **write** endpoint with this key. | This should not happen from a correctly-scoped integration — see "Out of Scope" below. Do not retry; do not attempt a workaround. Tell the merchant to make the change in the Portaly dashboard. |
| 401 | _(none)_ | Missing/invalid bearer token. | Server-side key problem — never surface to the buyer. |

A best-practice plan-selection UI never shows a pay button for a plan that isn't `status: "active"` (query `GET …/plans?status=active` first), so `PLAN_INACTIVE` should only ever fire on a race.

## Session Query

- Endpoint:
  - `GET /api/creator-subscription/checkout-sessions/{sessionId}`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
- Useful response fields: `status`, `merchantOrderNumber`, `customerEmail`, `metadata`, `expiresAt`, `completedAt`
- Common uses: status pages, reconciliation jobs, callback retry fallback (for non-`completed` outcomes, since the checkout callback only fires on `completed`)

## Signed Callback

- Headers: `x-portaly-event`, `x-portaly-timestamp`, `x-portaly-signature`
- Verification rule:
  - base string: `{timestamp}.{stable_json(payload)}`
  - algorithm: `HMAC-SHA256`
  - secret: the key's `callbackSecret`
- **Reject callbacks where `x-portaly-timestamp` is older than 5 minutes** (replay protection). `x-portaly-timestamp` is an ISO datetime string, not Unix seconds.
- **Use `sessionId` (or `subscriptionId`, which currently equals `sessionId`) as an idempotency key** — skip duplicate handling if you've already processed this id.
- Payload fields to persist: `sessionId`, `subscriptionId` (falls back to `sessionId` if absent), `mode`, `merchantOrderNumber`, `status`, `paymentReference`, `paymentMethod`, `customerEmail`, `completedAt`, `appliedDiscount?`.

Payload example (`creator_subscription.checkout.completed`):

```json
{
  "event": "creator_subscription.checkout.completed",
  "sessionId": "session_123",
  "subscriptionId": "session_123",
  "profileId": "profile_123",
  "planId": "plan_123",
  "mode": "live",
  "status": "completed",
  "merchantOrderNumber": "order_001",
  "amount": 299,
  "currency": "TWD",
  "customerEmail": "buyer@example.com",
  "customerName": "Buyer",
  "completedAt": "2026-03-12T10:05:00.000Z",
  "metadata": { "source": "web" },
  "paymentReference": "txn_123456",
  "paymentMethod": "tappay"
}
```

### Callback events

| `x-portaly-event` | When | Notes |
|---|---|---|
| `creator_subscription.checkout.completed` | Initial hosted checkout completes | The only checkout-time callback. |
| `creator_subscription.payment.succeeded` | A recurring **renewal** charge succeeds | Not sent for the first checkout charge. |
| `creator_subscription.payment.failed` | A recurring **renewal** charge fails | Sent on every failed attempt; `willCancel: true` + `status: canceled` on the 3rd consecutive failure. |
| `creator_subscription.active` | Subscription transitions into active | Not re-sent for an already-active renewal. |
| `creator_subscription.cancel_requested` | `cancelAtPeriodEnd` set true | — |
| `creator_subscription.canceled` | Subscription becomes `canceled` | Includes the 3rd-failure auto-cancel. |

All events are signed and delivered the same way. Use `scripts/sign_callback.mjs` (Node/TypeScript), `scripts/sign_callback.py` (reference/other stacks), or `scripts/sign_callback.webcrypto.mjs` (edge / WebCrypto runtimes — Cloudflare/Vercel Edge, Deno, InsForge edge functions, no `node:crypto`). Do not hand-roll the key ordering: `stableJson` sorts with `localeCompare`; a naive `.sort()` is UTF-16 order and silently rejects real callbacks. Note `sign_callback.py` sorts by Unicode code point, which can diverge from the `.mjs` scripts for mixed-case/non-ASCII keys — keep merchant-supplied `metadata` keys lowercase ASCII, or use a JS script for those payloads.

## Subscription Query And Lifecycle (Optional)

Use when the integration needs to let subscribers cancel/resume, or needs to reconcile subscription state. Current identifier contract: `subscriptionId === checkoutSessionId === sessionId`.

- `GET /api/creator-subscription/subscriptions` — list, with `status`, `customerEmail`, `limit`, `startAfter` (pagination)
- `GET /api/creator-subscription/subscriptions/{subscriptionId}` — single subscription (`status`, `cancelAtPeriodEnd`, `nextBillingAt`, `cancelEffectiveAt`, `canceledAt`, `failureCount`, …)
- `POST /api/creator-subscription/subscriptions/{subscriptionId}/cancel` — body `{ "reason": "customer_requested", "reasonNote": "optional" }`. Stops the next recurring charge; not a refund; current period stays active until `cancelEffectiveAt`. Only for `billingPeriod = monthly | yearly`.
- `POST /api/creator-subscription/subscriptions/{subscriptionId}/resume` — body `{}`. Only works before the subscription is fully `canceled`.

These are unaffected by the integration scope — cancel/resume are explicitly allowed for this key.

## Portal Session (Subscriber Self-Service, Optional)

Lets a subscriber manage their own subscription without you building cancel/resume UI.

- Endpoint: `POST /api/creator-subscription/portal-sessions`
- Required headers: `Authorization: Bearer {portaly_payment_api_key}`, `Content-Type: application/json`
- Request fields: `customerEmail` or `subscriptionId` (at least one required), `returnUrl` (required)
- Response: `data.portalUrl` (redirect the subscriber here), `data.portalSessionId`, `data.expiresAt` (30 minutes)
- This is a **server-to-server** call — never expose the API key client-side.

```json
{ "customerEmail": "subscriber@example.com", "returnUrl": "https://merchant.example/account" }
```

## Order Query (Optional)

- Endpoint: `GET /api/creator-subscription/orders`
- Required headers: `Authorization: Bearer {portaly_payment_api_key}`
- Query parameters: `status`, `limit` (default 20, max 100), `startAfter` (cursor)
- Response fields per order: `id`, `amount`, `netTotal`, `currency`, `status`, `name`, `email`, `paymentMethod`, `merchantOrderNumber`, `creatorSubscriptionId`, `creatorSubscriptionPlanId`, `createdAt`, `paidAt`, plus `pagination.hasMore` / `pagination.nextCursor` / `pagination.count`

## Skill Version Report

- Endpoint: `POST /api/creator-subscription/skill-version`
- Required headers: `Authorization: Bearer {portaly_payment_api_key}`, `Content-Type: application/json`
- Body: `{ "skillName": "portaly-payment-integration", "version": "<this file's frontmatter version>" }`
- Fire-and-forget: send once per session per `SKILL.md` §1.5; ignore failures.

## Out Of Scope For This Key (403 `KEY_SCOPE_FORBIDDEN`)

The following endpoints manage the merchant's product catalog, branding, and promotions. They belong to the merchant, who manages them directly in the Portaly dashboard — **do not call these with an integration-scope key**, and do not attempt to work around a `403`:

- `POST /api/creator-subscription/plans` / `PUT /api/creator-subscription/plans/{planId}` — plan create/update
- `POST /api/creator-subscription/plans/{planId}/images` — plan image upload
- `PUT /api/creator-subscription/config` / `POST /api/creator-subscription/config/images` — merchant branding and logo
- `POST /api/creator-subscription/discount-codes` / `PUT /api/creator-subscription/discount-codes/{codeId}` / `DELETE /api/creator-subscription/discount-codes/{codeId}` — discount code create/update/delete

If the merchant needs a new plan, a price change, updated branding, or a new discount code, ask them to do it in the Portaly dashboard — then re-fetch `GET /plans` at runtime; no redeploy needed on your side.

## Rate Limiting

All creator-subscription endpoints are rate limited **except** `POST /checkout-sessions`.

| Group | Window | Max requests | Applies to |
|---|---|---|---|
| read | 1 minute | 120 | GET plans, GET checkout-sessions/{id}, GET subscriptions(-/{id}), GET orders |
| write | 1 minute | 20 | POST subscriptions/{id}/cancel, POST subscriptions/{id}/resume |

Response headers on every rate-limited call: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix seconds). On `429`, use the `Retry-After` header to schedule a retry.
