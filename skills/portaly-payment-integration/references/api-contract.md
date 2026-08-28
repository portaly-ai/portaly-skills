# API Contract (Integration-Scope Subset)

This is the contract subset available to an **integration-scope** Portaly Payment API key (`pcs_test_itg_…` / `pcs_live_itg_…`). It covers only what these keys can do: read plans and orders, create checkout sessions, verify payment/refund callbacks, and optionally drive subscriber self-service. Refund initiation plus plan, merchant config, and discount code **write** endpoints are out of scope and called out below so you do not waste time debugging a 403.

## Use This Reference For

- reading active subscription plans at runtime
- third-party checkout session creation
- session query and reconciliation
- signed callback verification
- subscriber self-service subscription actions (cancel, resume, portal)
- order query and refund-outcome reconciliation
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
  - **integration-scope keys are checkout-only.** They can read plans, create checkout sessions, query sessions/subscriptions/orders, and drive cancel/resume/portal-session. Calls to refund, plan, merchant config, or discount-code **write** endpoints return `403 KEY_SCOPE_FORBIDDEN` — see "Out of Scope" below.

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
  - `customerEmail`: optional pre-known buyer email, pre-filled on the hosted checkout page. On its own it is informational only — the buyer still confirms it with an emailed verification code, and that confirmed email is the one used to look up the buyer's `signupRefCode` and to enforce a discount code's per-customer redemption cap. Send `emailVerified: true` alongside it to skip that code.
  - `customerName`: optional. The buyer's name from your own system, pre-filled on the hosted checkout page so they need not retype it. Still editable by the buyer; the name they submit is what lands on the order and invoice. Max 100 chars; control and formatting characters are stripped.
  - `emailVerified`: optional boolean. Set to `true` to declare that **you** have already verified `customerEmail` in your own product — the buyer then skips the emailed verification code entirely. Ignored unless `customerEmail` is also present and non-blank. Only accepted on this API-key-authenticated create call; every request the buyer's browser can make silently drops the field (no error is returned, so there is nothing to handle — it simply has no effect). Never pass it from front-end code. The email field is rendered read-only at checkout, because a buyer editing it would invalidate your declaration. Portaly verifies that the declaration came from you, not that the mailbox is real — accuracy is your responsibility.

If your users already sign in to your product, send all three (`customerEmail`, `customerName`, `emailVerified: true`) — the buyer then lands on checkout with nothing to fill in but payment details.

Request body (fixed pricing plan):

```json
{
  "planId": "plan_123",
  "callbackUrl": "https://merchant.example/api/portaly/callback",
  "successRedirectUrl": "https://merchant.example/success",
  "cancelRedirectUrl": "https://merchant.example/cancel",
  "merchantOrderNumber": "order_001",
  "customerEmail": "buyer@example.com",
  "customerName": "Mary Smith-Jones",
  "emailVerified": true,
  "metadata": { "source": "web" }
}
```

- Response fields:
  - `data.sessionId`: Portaly checkout session id
  - `data.status`: initial status, usually `checkout_ready`
  - `data.checkoutUrl`: URL to redirect the buyer to — treat as authoritative, never reconstruct it
  - `data.checkoutToken`: server-side token for manual completion (rare)
  - `data.expiresAt`: session expiry timestamp
  - `data.amount`: the amount the buyer will be charged — the **post-discount** total (`appliedDiscount.finalAmount`) when a discount applied, otherwise the plan's `amount`
  - `data.appliedDiscount?`: present when a discount applied at session creation. Shape: `{ codeId, code, rule, originalAmount, discountedAmount, finalAmount, source: 'manual' | 'ref_code' }`. When present, `data.amount` is the **post-discount** amount. Either the `discountCode` you passed (`source: 'manual'`), or — **new with `emailVerified: true`** — the buyer's `signupRefCode` resolved right away because their email is already known and trusted (`source: 'ref_code'`). **So adopting `emailVerified` can change `data.amount` for sessions where you send no `discountCode` at all**; without it, that same lookup just happens later, after the buyer verifies their email inside hosted checkout.

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
  - `POST /checkout-sessions` is **not** subject to rate limiting (nor is `POST /portal-sessions`)

### Error responses

Every failure returns `{ "error": string }`; business-rule failures also include a stable `{ "code": string }` — branch on `code`, not the `error` text (copy may change). Always check `response.ok` before reading `result.data`.

| HTTP | `code` | When | Handle as |
| --- | --- | --- | --- |
| 422 | `PLAN_INACTIVE` | The plan was archived by the merchant between page load and checkout. | Friendly "this plan is no longer available" message. Re-fetch `GET /plans?status=active` and re-render. Do not retry the same call. |
| 404 | `PLAN_NOT_FOUND` | `planId` does not exist for this merchant. | Misconfiguration (or the plan was removed) — log it. Recover like `PLAN_INACTIVE`: re-fetch `GET /plans?status=active`, re-render, and prompt the user to pick an available plan. Don't show the buyer a raw payment error; don't retry the same `planId`. |
| 400 | `INVALID_DISCOUNT_CODE` | The buyer-entered `discountCode` is invalid (see `reason`). | "That discount code can't be applied." Let them retry without it. |
| 400 | `PER_CUSTOMER_LIMIT_REACHED` | The buyer-entered `discountCode` has hit its per-customer redemption cap for this buyer. | "That discount code can't be applied." Let them proceed without it — don't retry the same code for the same buyer. |
| 403 | `KEY_SCOPE_FORBIDDEN` | You called refund or a plan/config/discount **write** endpoint with this key. | This should not happen from a correctly-scoped integration — see "Out of Scope" below. Do not retry or attempt a workaround; ask the merchant to use the authorized path. |
| 401 | _(none)_ | Missing/invalid bearer token. | Server-side key problem — never surface to the buyer. |

A best-practice plan-selection UI never shows a pay button for a plan that isn't `status: "active"` (query `GET …/plans?status=active` first), so `PLAN_INACTIVE` should only ever fire on a race.

## Session Query

- Endpoint:
  - `GET /api/creator-subscription/checkout-sessions/{sessionId}`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
- Useful response fields (this endpoint returns the **nested** checkout-session object, not the flat callback payload): `status`, `merchantOrderNumber`, `amount`, `billingPeriod`, `appliedDiscount`, `customer.name`, `customer.email`, `plan.{id, name, amount, currency, status}`, `expiresAt`, `createdAt`, `updatedAt`
- There is **no** flat `customerEmail`, no `metadata`, and no `completedAt` on this response — the buyer email is `customer.email`, and completion time is only carried by the checkout callback's `completedAt`, not by this query. Read the buyer email as `data.customer.email`.
- Common uses: status pages, reconciliation jobs, callback retry fallback (for non-`completed` outcomes, since the checkout callback only fires on `completed`)

## Signed Callback

- Headers: `x-portaly-event`, `x-portaly-timestamp`, `x-portaly-signature`
- Verification rule:
  - base string: `{timestamp}.{stable_json(payload)}`
  - algorithm: `HMAC-SHA256`
  - secret: the key's `callbackSecret`
- **Reject callbacks whose `x-portaly-timestamp` is more than 5 minutes from now in either direction** — too old (stale/replay) or too far in the future (forged/badly-skewed). The symmetric ±5-minute window tolerates ordinary NTP drift; don't tighten the future side to "reject any future timestamp" (it 401s legitimate callbacks — see `callback-signature-v1.md`). `x-portaly-timestamp` is an ISO datetime string, not Unix seconds.
- **Dedup on an event-specific key, not `sessionId` alone.** Because `subscriptionId === checkoutSessionId === sessionId` is identical across every event on a subscription, keying idempotency on it drops each later event (`payment.succeeded`, `cancel_requested`, `canceled`) as a false duplicate. Compose the key from the event type + subscription + the event's own timestamp/id — e.g. `` `${x-portaly-event}:${subscriptionId}:${x-portaly-timestamp}` `` — and skip only when that composite has already been processed.
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
| `creator_subscription.checkout.completed` | Initial hosted checkout completes | Sent for a successful first charge. |
| `creator_subscription.checkout.failed` | Initial hosted checkout charge is declined | Payload: `sessionId`, `profileId`, `planId`, `planName`, `mode`, `amount`, `currency`, `customerEmail`, `failureReason`, `failedAt`. **No `subscriptionId`** — none was created; dedup on `sessionId`. Sent in `test` mode too. Re-deliver with `POST /api/creator-subscription/checkout-sessions/{sessionId}/retry-callback`. |
| `creator_subscription.payment.succeeded` | A recurring **renewal** charge succeeds | Not sent for the first checkout charge. |
| `creator_subscription.payment.failed` | A recurring **renewal** charge fails | Sent on every failed attempt; `willCancel: true` + `status: canceled` on the 3rd consecutive failure. |
| `creator_subscription.payment.refunded` | A merchant/admin refund succeeds | Deduplicate on `orderId`; integration-scope keys receive the event but cannot initiate the refund. |
| `creator_subscription.payment.refund_failed` | A merchant/admin refund reaches terminal failure | Deduplicate on `orderId`; no money moved and Portaly must handle it manually. |
| `creator_subscription.active` | Subscription transitions into active | Not re-sent for an already-active renewal. |
| `creator_subscription.cancel_requested` | `cancelAtPeriodEnd` set true | — |
| `creator_subscription.canceled` | Subscription becomes `canceled` | Includes the 3rd-failure auto-cancel. |

- `amount` on `payment.succeeded` / `payment.failed` is the **charged (or attempted) post-discount** amount, not the plan price. The lifecycle events (`active` / `cancel_requested` / `canceled`) carry the subscription's undiscounted base amount in that same field — they move no money, so never reconcile from them.

Refund terminal payloads share: `event`, the subscription lifecycle base fields, `orderId`, `paymentId`, `paymentReference`, `orderMerchantOrderNumber`, `amount`, `currency`, `refundedAmount`, `refundRequestedAt`, `refundRequestedBy`, `refundReason`, `refundReasonNote`, `refundProvider`, and `subscriptionCanceledByRefund`. Success adds `refundedAt` and `refundReference`; failure adds `refundFailedAt`, `refundFailureReason`, and nullable `refundFailureRetryable`. A separate `creator_subscription.canceled` event has no ordering guarantee; deduplicate it on `subscriptionId` and refund events on `orderId`.

All events are signed and delivered the same way. Use `scripts/sign_callback.mjs` (Node/TypeScript), `scripts/sign_callback.py` (reference/other stacks), or `scripts/sign_callback.webcrypto.mjs` (edge / WebCrypto runtimes — Cloudflare/Vercel Edge, Deno, InsForge edge functions, no `node:crypto`). Do not hand-roll the key ordering: `stableJson` sorts with `localeCompare`; a naive `.sort()` is UTF-16 order and silently rejects real callbacks. Note `sign_callback.py` sorts by Unicode code point, which can diverge from the `.mjs` scripts for mixed-case/non-ASCII keys — keep merchant-supplied `metadata` keys lowercase ASCII, or use a JS script for those payloads.

## Subscription Query And Lifecycle (Optional)

Use when the integration needs to let subscribers cancel/resume, or needs to reconcile subscription state. Current identifier contract: `subscriptionId === checkoutSessionId === sessionId`.

- `GET /api/creator-subscription/subscriptions` — list, with `status`, `customerEmail`, `limit`, `startAfter` (pagination)
- `GET /api/creator-subscription/subscriptions/{subscriptionId}` — single subscription (`status`, `cancelAtPeriodEnd`, `nextBillingAt`, `cancelEffectiveAt`, `canceledAt`, `failureCount`, `discount`, …)
- `POST /api/creator-subscription/subscriptions/{subscriptionId}/cancel` — body `{ "reason": "customer_requested", "reasonNote": "optional" }`. Stops the next recurring charge; not a refund; current period stays active until `cancelEffectiveAt`. Only for `billingPeriod = monthly | yearly`.
- `POST /api/creator-subscription/subscriptions/{subscriptionId}/resume` — body `{}`. Only works before the subscription is fully `canceled`.
- **`amount` on a subscription is its base price, not what the buyer pays.** It is frozen at checkout (repricing the plan later does not change it) and renewals charge off it. When the subscription carries a `discount` snapshot (`code`, `appliedRule`, `startedAt`, `endsAt` — `null` = forever, `source`) and that discount is still in effect, the real charge is lower (exception: dynamic-priced plans, always one-time, store the already-discounted session amount in `amount`). Reconcile money against the renewal callback's `amount`, or `GET /orders`, never against `subscriptions[].amount`.

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

- Endpoints: `GET /api/creator-subscription/orders` and `GET /api/creator-subscription/orders/{orderId}`
- Required headers: `Authorization: Bearer {portaly_payment_api_key}`
- Query parameters: `status` (comma-separate for multiple, e.g. `paid,liquid`; allowed: `pending`, `awaiting_atm`, `paid`, `liquid`, `refund`, `failed`, `tracked` — anything else returns `400`), `startDate`/`endDate` (filters `createdAt`, which for these orders **is** the payment time — the order is only written once payment succeeds, so `createdAt === paidAt`; `YYYY-MM-DD` or a datetime with no offset is read as Taipei/UTC+8, pass `Z`/`±HH:MM` to override; `startDate` later than `endDate` returns `400`), `planId` (exact match on `creatorSubscriptionPlanId`), `limit` (default 20, max 100), `startAfter` (cursor)
- Response fields per order: `id`, `amount`, `netTotal`, `currency`, `status`, `name`, `email`, `paymentMethod`, `merchantOrderNumber`, `creatorSubscriptionId`, `creatorSubscriptionPlanId`, `refundRequestedAt`, `refundedAt`, `refundFailedAt`, `refundFailureReason`, `createdAt`, `paidAt`, plus list-only `pagination.hasMore` / `pagination.nextCursor` / `pagination.count`
- Use the single-order endpoint to reconcile a missing refund event without scanning the list. A delayed TapPay refund can remain pending through up to three daily scheduled attempts. Keep polling while both terminal timestamps are null; contact Portaly support if `refundFailedAt` appears or neither terminal outcome arrives after that retry window.

## Skill Version Report

- Endpoint: `POST /api/creator-subscription/skill-version`
- Required headers: `Authorization: Bearer {portaly_payment_api_key}`, `Content-Type: application/json`
- Body: `{ "skillName": "portaly-payment-integration", "version": "<this file's frontmatter version>" }`
- Fire-and-forget: send once per session per `SKILL.md` §1.5; ignore failures.

## Out Of Scope For This Key (403 `KEY_SCOPE_FORBIDDEN`)

The following endpoints move money or manage the merchant's product catalog, branding, and promotions. **Do not call these with an integration-scope key**, and do not attempt to work around a `403`:

- `POST /api/creator-subscription/orders/{orderId}/refund` — full refunds require a live full-scope key; ask the merchant to perform the refund. Test-mode API refunds are not available yet.
- `POST /api/creator-subscription/plans` / `PUT /api/creator-subscription/plans/{planId}` — plan create/update
- `POST /api/creator-subscription/plans/{planId}/images` — plan image upload
- `PUT /api/creator-subscription/config` / `POST /api/creator-subscription/config/images` — merchant branding and logo
- `POST /api/creator-subscription/discount-codes` / `PUT /api/creator-subscription/discount-codes/{codeId}` / `DELETE /api/creator-subscription/discount-codes/{codeId}` — discount code create/update/delete

If the merchant needs a new plan, a price change, updated branding, or a new discount code, ask them to do it in the Portaly dashboard — then re-fetch `GET /plans` at runtime; no redeploy needed on your side.

## Rate Limiting

All creator-subscription endpoints are rate limited **except** `POST /checkout-sessions` and `POST /portal-sessions` — both are unlimited.

| Group | Window | Max requests | Applies to |
|---|---|---|---|
| read | 1 minute | 120 | GET plans, GET checkout-sessions/{id}, GET subscriptions(-/{id}), GET orders, GET orders/{id} |
| write | 1 minute | 20 | POST subscriptions/{id}/cancel, POST subscriptions/{id}/resume |
| _(unlimited)_ | — | — | POST checkout-sessions, POST portal-sessions |

Response headers on every rate-limited call: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix seconds). On `429`, use the `Retry-After` header to schedule a retry.
