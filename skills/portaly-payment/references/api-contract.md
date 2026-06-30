# API Contract

## Use This Reference For

- merchant config setup
- subscription plan setup
- image upload for merchant logo or plan artwork
- third-party checkout session creation
- session query and reconciliation
- recurring subscription query, cancel, and resume
- subscription list query with pagination
- order and payment record query with pagination
- invoice record query (invoice number, issue status, e-invoice result)
- signed callback verification
- fallback manual completion flows
- rate limiting behavior and retry handling

## Bearer Auth

Use this when the human user asks how to authenticate third-party requests.

- Header:
  - `Authorization: Bearer {portaly_payment_api_key}`
- Notes:
  - the API key is tied to one `profileId`
  - each key has a fixed `mode`: `live` or `test`
  - live keys start with `pcs_live_`, test keys start with `pcs_test_`
  - mode is derived from the key; it is not passed per-request
  - do not send `profileId` in write requests that derive it from the key

## API Key Creation

Use this when the human user is creating a new API key from the Portaly Payment Dashboard.

- Endpoint:
  - `POST /api/creator-subscription/api-keys`
- Required auth:
  - Firebase auth (Portaly Payment Dashboard only — not a third-party API)
- Request fields:
  - `profileId`: required
  - `mode`: optional, `live` (default) or `test`
- Response fields:
  - `data.apiKey.id`
  - `data.apiKey.profileId`
  - `data.apiKey.status`
  - `data.apiKey.mode`
  - `data.apiKey.keyPrefix`
  - `data.apiKey.callbackSecret` (masked)
  - `data.secret` (full API key — shown only once at creation)

Mode behavior:

- `live` keys use prefix `pcs_live_` and connect to production payment providers
- `test` keys use prefix `pcs_test_` and connect to sandbox payment providers (e.g., TapPay sandbox)
- Test mode orders are stored in a separate `sandboxOrders` collection
- A single `profileId` can have both a live and a test key active simultaneously
- Mode is fixed at creation time and cannot be changed

## Merchant Config

Use this when the human user needs to set or update merchant branding for Portaly Payment.

- Read endpoint:
  - `GET /api/creator-subscription/config`
- Setup endpoints:
  - `PUT /api/creator-subscription/config`
  - `POST /api/creator-subscription/config/images`
- Setup headers:
  - `Authorization: Bearer {portaly_payment_api_key}`

`PUT /api/creator-subscription/config`

- Update endpoint for merchant profile config. All fields are optional — only the keys present in the body are updated; omitted keys keep their current value. Image upload goes through `/api/creator-subscription/config/images` (returns the storage URL to set on `merchantLogo`).

- Request fields:
  - `merchantName`: optional string
  - `merchantLogo`: optional string (URL returned by the images endpoint, or `""` to clear)
  - `appBaseUrl`: optional, must start with `https://` (max 255 chars; trailing slash stripped). Pass `""` to clear.
  - `inviteRedirectPath`: optional path-only override (max 200 chars; must start with `/`, only letters/digits/`-`/`_`/`/`; trailing slash stripped). When set together with `appBaseUrl`, invitation redirects land on `${appBaseUrl}${inviteRedirectPath}` (skipping the default `/waitlist/{slug}` segment). Pass `""` to clear.
  - `brandDescription`: optional, free-form text for AI context (max 4000 chars). Pass `""` to clear.

- Request body:
```json
{
  "merchantName": "Example Merchant",
  "appBaseUrl": "https://example.com",
  "brandDescription": "Subscription box for indie ceramics."
}
```

- Response fields:
  - `data.profileId`
  - `data.merchantName`
  - `data.merchantLogo`
  - `data.appBaseUrl`
  - `data.inviteRedirectPath`
  - `data.brandDescription`
  - `data.updatedAt`
  - `data.updatedBy`

`POST /api/creator-subscription/config/images`

- Content type:
  - `multipart/form-data`
- Form fields:
  - `file`: required image file
  - `filename`: optional override filename
- Supported image types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/gif`
- Size limit:
  - 8 MB
- Response fields:
  - `data.merchantLogo`
  - `data.file.id`
  - `data.file.publicURL`
  - `data.creatorSubscriptionConfig`

## Subscription Plans

Use this when the human user wants the Agent to create or maintain the product basics that will be listed on Portaly.

- **Plans belong to the `profileId` and are shared across live and test modes.** Always query existing plans before creating a new one to avoid duplicates.
- **Plan images are read-only on the plan object.** `GET` / `POST` / `PUT` responses return a resolved `imageUrl` (a public URL, or `null`) — never the internal storage ref. There is no writable `image` field on create or update; to set a plan's image, create the plan first, then upload via `POST /api/creator-subscription/plans/{planId}/images`.
- Read endpoints:
  - `GET /api/creator-subscription/plans`
  - `GET /api/creator-subscription/plans/{planId}`
- Setup endpoints:
  - `POST /api/creator-subscription/plans`
  - `PUT /api/creator-subscription/plans/{planId}`
  - `POST /api/creator-subscription/plans/{planId}/images`
- Setup headers:
  - `Authorization: Bearer {portaly_payment_api_key}`

`POST /api/creator-subscription/plans`

- Request fields:
  - `name`: required
  - `description`: optional
  - `amount`: required positive number for fixed pricing; omit or set to `0` for dynamic pricing
  - `currency`: optional, defaults to `TWD`
  - `billingPeriod`: required, `monthly`, `yearly`, or `one-time` (`one-time` is a single-payment plan that does not auto-renew; `yearly` is billed once a year and **payout to the creator is released across 12 monthly installments** — refunds are blocked once the first installment has been released)
  - `pricingType`: optional, `fixed` (default) or `dynamic`. Dynamic pricing plans must use `one-time` billing period; the actual amount is set per checkout session
  - `status`: optional, `active` or `inactive`
  - `merchantPlanId`: optional merchant-side product id
  - `externalInformationUrl`: optional object with `url` and `text` (both required when present)
- Request body (fixed pricing):

```json
{
  "name": "Pro Monthly",
  "description": "Monthly subscription plan",
  "amount": 299,
  "currency": "TWD",
  "billingPeriod": "monthly",
  "status": "active",
  "merchantPlanId": "merchant_plan_monthly_001",
  "externalInformationUrl": {
    "url": "https://example.com/plan-details",
    "text": "Learn more"
  }
}
```

- Request body (dynamic pricing):

```json
{
  "name": "Custom Payment",
  "description": "Pay any amount",
  "pricingType": "dynamic",
  "billingPeriod": "one-time",
  "status": "active",
  "merchantPlanId": "merchant_plan_dynamic_001"
}
```

- Response fields:
  - `data.id`
  - `data.profileId`
  - `data.name`
  - `data.description`
  - `data.amount`
  - `data.currency`
  - `data.billingPeriod`
  - `data.pricingType`
  - `data.status`
  - `data.merchantPlanId`
  - `data.imageUrl` (resolved public image URL, or `null`)
  - `data.externalInformationUrl`
  - `data.createdAt`
  - `data.updatedAt`
- **Encoding note:** On Windows, if `data.name` or `data.description` contains garbled text, fix the shell encoding and use `PUT /api/creator-subscription/plans/{planId}` to correct it.

`PUT /api/creator-subscription/plans/{planId}`

- Request fields:
  - `name`: optional
  - `description`: optional
  - `amount`: optional positive number (must be non-negative for dynamic pricing plans)
  - `currency`: optional
  - `billingPeriod`: optional, `monthly`, `yearly`, or `one-time` (`one-time` is a single-payment plan that does not auto-renew; `yearly` payouts are released across 12 monthly installments — refunds are blocked once the first installment has been released)
  - `pricingType`: optional, `fixed` or `dynamic`
  - `status`: optional, `active` or `inactive`
  - `merchantPlanId`: optional
  - `externalInformationUrl`: optional object with `url` and `text` (both required when present); previously settable only at create time

`POST /api/creator-subscription/plans/{planId}/images`

- Content type:
  - `multipart/form-data`
- Form fields:
  - `file`: required image file
  - `filename`: optional override filename
- Supported image types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/gif`
- Size limit:
  - 8 MB
- Response fields:
  - `data.image`
  - `data.file.id`
  - `data.file.publicURL`
  - `data.plan`

## Discount Codes

Use this when the human user wants to issue promotional codes for the plans on Portaly. Codes are owned by a profile, shared across live/test, and immutable post-create on the `code` string. Each code carries one or more **rules**; each rule maps a discount + duration to a set of plans.

- Endpoints:
  - `POST /api/creator-subscription/discount-codes` — create
  - `GET /api/creator-subscription/discount-codes` — list (`?status=active|disabled&limit=&startAfter=`)
  - `GET /api/creator-subscription/discount-codes/{codeId}` — single
  - `GET /api/creator-subscription/discount-codes/lookup?code=X` — case-insensitive string lookup
  - `PUT /api/creator-subscription/discount-codes/{codeId}` — update (rejects `code` field with 400 `CODE_IMMUTABLE`)
  - `DELETE /api/creator-subscription/discount-codes/{codeId}` — soft delete (`status: disabled`)
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
  - `Content-Type: application/json`

### Rule shape

A **rule** is a discriminated union over three fields. The pipes below denote alternative variants — only one variant per field is sent on the wire.

```jsonc
{
  "appliesTo":
    | { "type": "all" }
    | { "type": "specific", "planIds": ["plan_..."] },          // planIds: at least 1
  "discount":
    | { "type": "fixed",   "value": 100, "currency": "TWD" }    // value: positive integer
    | { "type": "percent", "value": 20 }                         // value: 1..100
    | { "type": "free" },                                         // equivalent to 100% off
  "duration":
    | { "type": "repeating", "cycles": 3 }                       // cycles: 1..60
    | { "type": "forever" }
}
```

Rule semantics:

- `cycles` is **billing-period count**. Monthly plan + cycles 3 → discount applies to first 3 monthly charges. Yearly plan + cycles 1 → discount applies to the first yearly charge.
- `forever` is typically used with `fixed` (permanent low-price tier). It is also valid with `percent` or `free`, though those combinations are rarely what merchants want.
- For a given checkout, the rule that targets the plan via `specific.planIds` wins; otherwise the `all` fallback applies (at most one per code).

### `POST /api/creator-subscription/discount-codes`

Request fields:

- `code`: required, 3-40 chars, `[A-Z0-9_-]`. Stored and displayed in UPPERCASE; lookup is case-insensitive on input. Unique per profile.
- `rules`: required array, ≥ 1. Validation: at most one `all` rule; planIds may not appear in more than one rule.
- `redeemFrom`, `redeemBy`: optional ISO datetime; `redeemBy` must be after `redeemFrom`.
- `maxRedemptions`: optional positive integer (total cap).
- `maxRedemptionsPerCustomer`: optional positive integer (per-email cap).
- `status`: optional, `active` (default) | `disabled`.

Response 201:

```json
{
  "data": {
    "id": "dc_abc123",
    "profileId": "profile_xyz",
    "code": "EARLYBIRD",
    "status": "active",
    "rules": [
      {
        "appliesTo": { "type": "specific", "planIds": ["plan_monthly_pro"] },
        "discount": { "type": "percent", "value": 50 },
        "duration": { "type": "repeating", "cycles": 3 }
      },
      {
        "appliesTo": { "type": "specific", "planIds": ["plan_lifetime_pro"] },
        "discount": { "type": "fixed", "value": 200, "currency": "TWD" },
        "duration": { "type": "repeating", "cycles": 1 }
      }
    ],
    "redeemFrom": null,
    "redeemBy": "2026-12-31T23:59:59.000Z",
    "maxRedemptions": null,
    "maxRedemptionsPerCustomer": 1,
    "timesRedeemed": 0,
    "createdAt": "2026-04-25T03:00:00.000Z",
    "updatedAt": "2026-04-25T03:00:00.000Z"
  }
}
```

Error codes:

- `400 Validation failed` — Zod failure (rules conflict, percent out of range, redeem window inverted, etc.).
- `403 UPGRADE_REQUIRED` — profile lacks the entitlement to create discount codes (parity with plan creation).
- `409 DUPLICATE_CODE` — same code already exists for this profile.

### Single-rule examples

Percent + repeating, scoped to the monthly plan:

```json
{
  "code": "BLACKFRIDAY",
  "rules": [
    {
      "appliesTo": { "type": "specific", "planIds": ["plan_monthly_pro"] },
      "discount": { "type": "percent", "value": 20 },
      "duration": { "type": "repeating", "cycles": 3 }
    }
  ],
  "redeemBy": "2026-12-31T23:59:59.000Z",
  "maxRedemptions": 100,
  "maxRedemptionsPerCustomer": 1
}
```

Free first cycle, all plans:

```json
{
  "code": "FREEMONTH",
  "rules": [
    {
      "appliesTo": { "type": "all" },
      "discount": { "type": "free" },
      "duration": { "type": "repeating", "cycles": 1 }
    }
  ]
}
```

Founder pricing (fixed forever, single plan):

```json
{
  "code": "FOUNDER100",
  "rules": [
    {
      "appliesTo": { "type": "specific", "planIds": ["plan_pro_monthly"] },
      "discount": { "type": "fixed", "value": 100, "currency": "TWD" },
      "duration": { "type": "forever" }
    }
  ]
}
```

### Update / Disable

`PUT /api/creator-subscription/discount-codes/{codeId}` accepts any subset of `rules`, `redeemFrom`, `redeemBy`, `maxRedemptions`, `maxRedemptionsPerCustomer`, `status`. **Sending `code` returns 400 `CODE_IMMUTABLE`.** Rule changes do not retroactively affect already-redeemed subscriptions; their snapshot stays put.

`DELETE /api/creator-subscription/discount-codes/{codeId}` soft-deletes by flipping `status` to `disabled`. Disabled codes are excluded from default `GET` listings; pass `?status=disabled` to inspect them.

### Ref-code Usage

A discount code can also serve as a registration ref code. The vibe coder records the code as the user's `signupRefCode` at registration; once that buyer triggers a checkout and verifies their email, Portaly auto-applies the matching rule for the chosen plan.

### Rate limit

Discount-code endpoints fall in the **write** group (20 requests/min); read endpoints share the 120/min budget.

## Session Creation

Use this when the human user needs to send the buyer into Portaly hosted checkout.

- Endpoint:
  - `POST /api/creator-subscription/checkout-sessions`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
  - `Content-Type: application/json`
- Request fields:
  - `planId`: Portaly plan id
  - `amount`: optional positive number. **Required** for dynamic pricing plans; ignored for fixed pricing plans
  - `successRedirectUrl`: optional merchant success page
  - `cancelRedirectUrl`: optional merchant cancel page
  - `callbackUrl`: optional merchant callback endpoint. Receives `creator_subscription.checkout.completed`, and — unless `subscriptionCallbackUrl` is set — the recurring renewal (`payment.succeeded` / `payment.failed`) and lifecycle (`active` / `cancel_requested` / `canceled`) callbacks too.
  - `subscriptionCallbackUrl`: optional. When set, recurring renewal and lifecycle callbacks are delivered here instead of `callbackUrl` (the checkout-completion callback still goes to `callbackUrl`). Falls back to `callbackUrl` when empty.
  - `merchantOrderNumber`: optional merchant-side order id
  - `metadata`: optional string-keyed extra context
  - `discountCode`: optional. When provided, Portaly validates and applies the discount up-front. Invalid codes return `400 INVALID_DISCOUNT_CODE` (`reason` describes the failure: not found / not applicable to this plan / out of redemption window / per-customer cap reached). When omitted, a discount may still be auto-applied later via the buyer's `signupRefCode` once their email is verified inside hosted checkout.
  - `customerEmail`: optional pre-known buyer email. Currently informational only — the buyer-confirmed email captured during hosted checkout is the one used to look up the buyer's `signupRefCode` and to enforce the per-customer cap.

Request body (fixed pricing plan):

```json
{
  "planId": "plan_123",
  "successRedirectUrl": "https://merchant.example/success",
  "cancelRedirectUrl": "https://merchant.example/cancel",
  "callbackUrl": "https://merchant.example/api/portaly/callback",
  "merchantOrderNumber": "order_001",
  "metadata": {
    "source": "web",
    "cartId": "cart_123"
  }
}
```

Request body (dynamic pricing plan):

```json
{
  "planId": "plan_dynamic_456",
  "amount": 500,
  "successRedirectUrl": "https://merchant.example/success",
  "cancelRedirectUrl": "https://merchant.example/cancel",
  "callbackUrl": "https://merchant.example/api/portaly/callback",
  "merchantOrderNumber": "order_002",
  "metadata": {
    "source": "web"
  }
}
```

- Response fields:
  - `data.sessionId`: Portaly checkout session id
  - `data.status`: initial status, usually `checkout_ready`
  - `data.checkoutUrl`: URL the buyer should visit
  - `data.checkoutToken`: server-side token for provider routes or manual completion
  - `data.expiresAt`: session expiry timestamp
  - `data.appliedDiscount?`: present when a manual `discountCode` was validated and applied at session creation. Shape: `{ codeId, code, rule, originalAmount, discountedAmount, finalAmount, source: 'manual' | 'ref_code' }`. When the field is present, `session.amount` is the **post-discount** total (`finalAmount`).
  - `data.pendingRefCodeLookup?`: `true` whenever no manual `discountCode` was passed. Portaly will attempt the `signupRefCode` lookup once the buyer's email is verified inside hosted checkout; on a hit the session is updated with `appliedDiscount` and `amount` becomes the post-discount total.

```json
{
  "data": {
    "sessionId": "session_123",
    "status": "checkout_ready",
    "checkoutUrl": "https://payment-host/checkout/subscription/session_123",
    "checkoutToken": "hex_token",
    "expiresAt": "2026-03-20T12:30:00.000Z"
  }
}
```

- Integration notes:
  - persist `checkoutUrl`, `sessionId`, `checkoutToken`, and `expiresAt`
  - redirect the buyer to `checkoutUrl`
  - `callbackSecret` is not passed in the request; Portaly derives it from the authorized API key
  - the session inherits `mode` from the API key used to create it (`live` or `test`)
  - current implementation contract: `subscriptionId === checkoutSessionId === sessionId`
  - for recurring subscriptions, persist `sessionId` as the subscription identifier used by cancel or resume APIs
  - for dynamic pricing plans, include `amount` in the request body; omitting it returns a 400 error

Node.js example:

```js
const response = await fetch(
  "https://portaly.example/api/creator-subscription/checkout-sessions",
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.PORTALY_VIBE_PAYMENT_API_KEY}`,
    },
    body: JSON.stringify({
      planId: "plan_123",
      successRedirectUrl: "https://merchant.example/success",
      cancelRedirectUrl: "https://merchant.example/cancel",
      callbackUrl: "https://merchant.example/api/portaly/callback",
      merchantOrderNumber: "order_001",
      metadata: {
        source: "web",
        cartId: "cart_123",
      },
    }),
  }
);

const result = await response.json();

if (!response.ok) {
  // result.error is a human-readable message; result.code (when present) is
  // the stable identifier to branch on. Map it to your own localized copy
  // instead of showing result.error to buyers verbatim.
  throw new Error(result.code || result.error || "checkout session failed");
}

const { sessionId, checkoutUrl, checkoutToken, expiresAt } = result.data;
```

### Error responses

Every failure returns `{ "error": string }`. Business-rule failures also include a
stable `{ "code": string }` you should branch on — do **not** match on `error`
text, it is copy and may change. Always check `response.ok` before reading
`result.data`; a failed call has no `checkoutUrl`, so redirecting blindly leaves
the buyer on a dead page.

| HTTP | `code` | When | Surface to buyer as |
| --- | --- | --- | --- |
| 422 | `PLAN_INACTIVE` | The plan was archived / deactivated by the creator. | "This plan is no longer available." Do not retry. |
| 404 | `PLAN_NOT_FOUND` | `planId` does not exist for this merchant. | Misconfiguration — log it; don't show the buyer a payment error. |
| 422 | `YEARLY_TEMPORARILY_UNSUPPORTED` | Yearly billing period is temporarily disabled. | "Yearly billing is temporarily unavailable." Offer monthly if you have it. |
| 400 | `INVALID_DISCOUNT_CODE` | Manual `discountCode` is invalid (see `reason`). | "That discount code can't be applied." Let them retry without it. |
| 400 | _(none)_ | Dynamic-pricing plan called without a positive `amount`, or malformed body. | Misconfiguration — log it; fix the request. |
| 401 | _(none)_ | Missing/invalid bearer token. | Never surface — this is a server-side key problem. |
| 403 | _(none)_ | API key not authorized for this plan's profile, or missing callback secret. | Never surface — server-side key problem. |

A best-practice plan-selection UI never shows a pay button for a plan that isn't
`status: "active"` (query `GET …/plans` first), so `PLAN_INACTIVE` should only
ever fire on a race — a plan archived between page load and checkout. Treat it as
the friendly "no longer available" state above, not a generic payment failure.

## Session Query

Use this when the human user needs reconciliation or a status page.

- Endpoint:
  - `GET /api/creator-subscription/checkout-sessions/{sessionId}`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
- Useful response fields:
  - `status`
  - `merchantOrderNumber`
  - `customerEmail`
  - `metadata`
  - `expiresAt`
  - `completedAt`
- Common uses:
  - merchant status pages
  - reconciliation jobs
  - callback retry fallback

## Subscription Query And Lifecycle

Use this when the human user needs to look up a recurring subscription or stop or resume future renewals.

- Endpoints:
  - `GET /api/creator-subscription/subscriptions/{subscriptionId}`
  - `POST /api/creator-subscription/subscriptions/{subscriptionId}/cancel`
  - `POST /api/creator-subscription/subscriptions/{subscriptionId}/resume`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`

Current identifier contract:

- `subscriptionId === checkoutSessionId === sessionId`
- If the merchant only has the checkout completed callback payload, it may use `sessionId` directly as `subscriptionId`

`GET /api/creator-subscription/subscriptions/{subscriptionId}`

- Useful response fields:
  - `id`
  - `profileId`
  - `planId`
  - `mode` (`live` or `test`)
  - `billingPeriod`
  - `status` (`active` | `past_due` | `canceled`)
  - `cancelAtPeriodEnd`
  - `nextBillingAt`
  - `lastChargedAt` — timestamp of the last successful charge
  - `lastPaymentReference` — provider reference of the last successful charge
  - `failureCount` — consecutive renewal-charge failures (reset to 0 on success; subscription is auto-canceled at 3)
  - `lastFailureReason` — provider message for the most recent failed charge
  - `lastFailureAt` — timestamp of the most recent failed charge
  - `cancelRequestedAt`
  - `cancelEffectiveAt`
  - `canceledAt`
- Renewal reconciliation by polling: a successful renewal advances `nextBillingAt` and updates `lastChargedAt`; a failed renewal increments `failureCount` and sets `status: past_due` (or `canceled` on the 3rd failure). Prefer the renewal callbacks below over polling when possible.

`POST /api/creator-subscription/subscriptions/{subscriptionId}/cancel`

- Supported only for recurring subscriptions:
  - `billingPeriod = monthly`
  - `billingPeriod = yearly`
- Behavior:
  - stops the next recurring charge
  - does not issue a refund (yearly: any unreleased deferred installments continue to settle through the original 12-month schedule)
  - keeps the current paid period active until `cancelEffectiveAt`
- Request fields:
  - `reason`: optional, one of `customer_requested | payment_failures | manual | other`
  - `reasonNote`: optional string

```json
{
  "reason": "customer_requested",
  "reasonNote": "Customer asked to stop renewal"
}
```

- Useful response fields:
  - `id`
  - `status`
  - `cancelAtPeriodEnd`
  - `cancelRequestedAt`
  - `cancelEffectiveAt`
  - `nextBillingAt`

`POST /api/creator-subscription/subscriptions/{subscriptionId}/resume`

- Supported only when the recurring subscription is pending end-of-period cancellation
- Behavior:
  - clears the pending cancellation
  - allows future recurring renewal to continue

```json
{}
```

- Useful response fields:
  - `id`
  - `status`
  - `cancelAtPeriodEnd`
  - `nextBillingAt`

Common validation notes:

- `one-time` plans do not support cancel or resume
- a fully `canceled` subscription cannot be resumed
- these lifecycle APIs are merchant-system APIs and do not use Firebase auth

## Manual Completion

Use this only for controlled recovery or non-hosted payment flows.

- Endpoint:
  - `POST /api/creator-subscription/checkout-sessions/{sessionId}/complete`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
  - `Content-Type: application/json`
- Request fields:
  - `checkoutToken`
  - `customerName`
  - `customerEmail`
  - `paymentReference`
  - `paymentMethod`
  - `paidAmount`
  - `status`
  - `failureReason`: optional when status is `failed`

Request body:

```json
{
  "checkoutToken": "hex_token",
  "customerName": "David",
  "customerEmail": "david@example.com",
  "paymentReference": "txn_123",
  "paymentMethod": "custom-provider",
  "paidAmount": 299,
  "status": "completed"
}
```

Allowed `status` values:

- `completed`
- `failed`
- `canceled`

## Signed Callback

Use this when the human user needs to verify Portaly callback requests.

- Headers:
  - `x-portaly-event`
  - `x-portaly-timestamp`
  - `x-portaly-signature`
- Payload fields to persist:
  - `sessionId`
  - `subscriptionId` if present
  - `mode` (`live` or `test`)
  - `merchantOrderNumber`
  - `status`
  - `paymentReference`
  - `paymentMethod`
  - `customerEmail`
  - `completedAt`
  - `appliedDiscount?` — present when a discount was applied to this checkout. Shape: `{ codeId, code, rule, originalAmount, discountedAmount, finalAmount, source: 'manual' | 'ref_code' }`. The payload's `amount` is the actually-charged (post-discount) amount.

Payload example:

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
  "invoice": {
    "type": "b2c",
    "carrierType": "phone",
    "carrierNumber": "/ABCDE12"
  },
  "completedAt": "2026-03-12T10:05:00.000Z",
  "metadata": {
    "source": "web"
  },
  "paymentReference": "txn_123456",
  "paymentMethod": "tappay"
}
```

### Callback events

| `x-portaly-event` | When | Notes |
|---|---|---|
| `creator_subscription.checkout.completed` | Initial hosted checkout completes | The only checkout-time callback. |
| `creator_subscription.payment.succeeded` | A recurring **renewal** charge succeeds (monthly/yearly) | Not sent for the first checkout charge — that is `checkout.completed`. |
| `creator_subscription.payment.failed` | A recurring **renewal** charge fails | Sent on **every** failed attempt. On the 3rd consecutive failure the subscription is canceled and `creator_subscription.canceled` is also sent. |
| `creator_subscription.active` | Subscription transitions **into** active | Not re-sent for an already-active renewal. |
| `creator_subscription.cancel_requested` | `cancelAtPeriodEnd` set true | — |
| `creator_subscription.canceled` | Subscription becomes `canceled` | Fired for any cancellation, including the 3rd-failure auto-cancel. |

All events are signed and delivered the same way as `checkout.completed`. They are POSTed to the subscription's `subscriptionCallbackUrl` when set, otherwise to the checkout `callbackUrl`. Differentiate by the `x-portaly-event` header / payload `event` field, and use `subscriptionId` as the idempotency key.

Renewal-success payload (`creator_subscription.payment.succeeded`):

```json
{
  "event": "creator_subscription.payment.succeeded",
  "subscriptionId": "session_123",
  "profileId": "profile_123",
  "planId": "plan_123",
  "mode": "live",
  "status": "active",
  "billingPeriod": "monthly",
  "amount": 299,
  "currency": "TWD",
  "paymentReference": "txn_renewal_001",
  "paymentId": "pay_456",
  "chargedAt": "2026-07-15T10:00:00.000Z",
  "nextBillingAt": "2026-08-15T10:00:00.000Z",
  "customerEmail": "buyer@example.com"
}
```

Renewal-failure payload (`creator_subscription.payment.failed`):

```json
{
  "event": "creator_subscription.payment.failed",
  "subscriptionId": "session_123",
  "profileId": "profile_123",
  "planId": "plan_123",
  "mode": "live",
  "status": "past_due",
  "billingPeriod": "monthly",
  "amount": 299,
  "currency": "TWD",
  "paymentReference": "txn_renewal_002",
  "failureReason": "card declined",
  "failureCount": 1,
  "failedAt": "2026-08-15T10:00:00.000Z",
  "nextRetryAt": "2026-08-16T10:00:00.000Z",
  "willCancel": false,
  "customerEmail": "buyer@example.com"
}
```

- `willCancel` is `true` and `nextRetryAt` is `null` on the final (3rd) failure; `status` is then `canceled`.

Verification rule:

- base string: `{timestamp}.{stable_json(payload)}`
- algorithm: `HMAC-SHA256`
- secret: the API key's `callbackSecret`

Callback notes:

- current implementation contract: `subscriptionId === sessionId`
- if the callback payload consumed by the merchant side does not explicitly expose `subscriptionId`, the merchant may safely persist `sessionId` as the recurring subscription identifier
- use `sessionId` as the idempotency key for callback processing
- the `mode` field indicates whether this callback originated from a live or test checkout; merchants should use it to route test callbacks to sandbox order handling

Use `scripts/sign_callback.mjs` for Node.js/TypeScript-oriented work and `scripts/sign_callback.py` for a language-agnostic reference. **On an edge / WebCrypto runtime that can't import `node:crypto`** (Cloudflare/Vercel Edge, Deno, or an InsForge edge function), use `scripts/sign_callback.webcrypto.mjs` instead — identical signing scheme and a byte-identical `stableJson`, but it verifies with the global `crypto.subtle` (no Node-only APIs). Do NOT hand-roll the key ordering: `stableJson` sorts with `localeCompare`, and a naive `.sort()` (UTF-16 order) silently rejects real callbacks. Note: `scripts/sign_callback.py` sorts keys by Unicode code point (not `localeCompare`), so for **mixed-case or non-ASCII object keys** it can diverge from the `.mjs`/`.webcrypto.mjs` scripts and the signing server — keep any merchant-supplied keys (e.g. a `metadata` map) lowercase ASCII, or use the JS scripts for those payloads.

Express-style callback example:

```js
import express from "express";
import { verifyPortalyCallback } from "../portaly/sign_callback.mjs";

const app = express();
app.use(express.json());

app.post("/api/portaly/callback", (req, res) => {
  const timestamp = req.header("x-portaly-timestamp") || "";
  const signature = req.header("x-portaly-signature") || "";

  const verified = verifyPortalyCallback({
    secret: process.env.PORTALY_CALLBACK_SECRET,
    timestamp,
    payload: req.body,
    signature,
  });

  if (!verified) {
    return res.status(401).json({ error: "invalid signature" });
  }

  const {
    sessionId,
    subscriptionId = sessionId,
    merchantOrderNumber,
    status,
    paymentReference,
  } = req.body;

  // Persist the verified callback and reconcile your local order state here.
  console.log({
    sessionId,
    subscriptionId,
    merchantOrderNumber,
    status,
    paymentReference,
  });

  return res.status(200).json({ ok: true });
});
```

## Subscription List

Use this when the human user needs to list all subscriptions for a profile, with optional filtering and pagination.

- Endpoint:
  - `GET /api/creator-subscription/subscriptions`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
- Query parameters:
  - `profileId`: optional for API key auth (derived from key), required for Firebase auth
  - `status`: optional, `active` | `past_due` | `canceled`
  - `customerEmail`: optional, filter by subscriber email
  - `limit`: optional, number of results per page (default 20, max 100)
  - `startAfter`: optional, cursor from previous page's `pagination.nextCursor`
- Response fields:
  - `data[]`: array of subscription objects
  - `data[].id`
  - `data[].profileId`
  - `data[].planId`
  - `data[].planName`
  - `data[].amount`
  - `data[].currency`
  - `data[].billingPeriod`
  - `data[].status`
  - `data[].mode`
  - `data[].cancelAtPeriodEnd`
  - `data[].nextBillingAt`
  - `data[].customerName`
  - `data[].customerEmail`
  - `data[].createdAt`
  - `pagination.hasMore`: boolean
  - `pagination.nextCursor`: string or null
  - `pagination.count`: number of items in current page
- Notes:
  - API key auth automatically filters subscriptions by the key's mode (live or test)
  - Supports cursor-based pagination — pass `nextCursor` as `startAfter` for the next page

Pagination example:

```js
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || "https://portaly.ai";

// First page
const page1 = await fetch(
  `${PORTALY_API_HOST}/api/creator-subscription/subscriptions?limit=20`,
  { headers: { authorization: `Bearer ${apiKey}` } }
).then(r => r.json());

// Next page (if hasMore)
if (page1.pagination.hasMore) {
  const page2 = await fetch(
    `${PORTALY_API_HOST}/api/creator-subscription/subscriptions?limit=20&startAfter=${page1.pagination.nextCursor}`,
    { headers: { authorization: `Bearer ${apiKey}` } }
  ).then(r => r.json());
}
```

## Order Query

Use this when the human user needs to query payment/order records for a profile.

- Endpoint:
  - `GET /api/creator-subscription/orders`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
- Query parameters:
  - `profileId`: optional for API key auth (derived from key), required for Firebase auth
  - `mode`: optional, `live` (default) or `test` — only used with Firebase auth; API key auth derives mode from the key
  - `status`: optional, filter by order status (e.g., `paid`)
  - `limit`: optional, number of results per page (default 20, max 100)
  - `startAfter`: optional, cursor from previous page's `pagination.nextCursor`
- Response fields:
  - `data[]`: array of order objects
  - `data[].id`
  - `data[].profileId`
  - `data[].amount`
  - `data[].netTotal`
  - `data[].fee`
  - `data[].feeAmount`
  - `data[].taxFee`
  - `data[].taxFeeAmount`
  - `data[].currency`
  - `data[].status`
  - `data[].name`: customer name
  - `data[].email`: customer email
  - `data[].paymentMethod`
  - `data[].merchantOrderNumber`
  - `data[].creatorSubscriptionId`
  - `data[].creatorSubscriptionPlanId`
  - `data[].createdAt`
  - `data[].paidAt`
  - `pagination.hasMore`: boolean
  - `pagination.nextCursor`: string or null
  - `pagination.count`: number of items in current page
- Notes:
  - API key auth automatically routes to the correct order collection based on the key's mode (live → `orders`, test → `sandboxOrders`)
  - Only returns orders with `projectId = 'creatorSubscription'`
  - Supports cursor-based pagination

## Invoice Query

Use this when the human user needs the invoice records for a profile — invoice number, issue status, and e-invoice (ECPay) result. `GET /api/creator-subscription/orders` returns the transaction/payment side; this endpoint returns the invoice side of the same payments.

- Endpoint:
  - `GET /api/creator-subscription/invoices`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
- Query parameters:
  - `profileId`: optional for API key auth (derived from key), required for Firebase auth
  - `mode`: optional, `live` or `test` — only honored for Firebase auth (omit to list all modes). API key callers are pinned to the key's own mode and cannot read the other mode's invoices
- Response fields:
  - `data[]`: array of invoice records, newest first
  - `data[].id`
  - `data[].creatorSubscriptionId`
  - `data[].checkoutSessionId`
  - `data[].profileId`
  - `data[].mode`
  - `data[].planId`
  - `data[].planName`
  - `data[].amount`
  - `data[].currency`
  - `data[].status`: `SUCCESS` or `FAILED` (the payment result)
  - `data[].customerName`
  - `data[].customerEmail`
  - `data[].invoice`: the requested carrier info (`{ type, carrierType, carrierNumber, company, companyId }`) or `null`
  - `data[].invoiceStatus`: `pending` | `processing` | `issued` | `not_applicable`
  - `data[].invoiceTaskId`
  - `data[].invoiceLastError`
  - `data[].invoiceIssuedAt`
  - `data[].timestamp`
  - `data[].createdAt`
  - `data[].updatedAt`
  - `data[].ecpayInvoice`: the issued e-invoice result (`InvoiceNo`, `InvoiceDate`, …) or `null`
  - `data[].appliedDiscount`: present when a discount applied to this charge (`{ codeId, code, rule, source }`); otherwise `null`
- Notes:
  - API key auth scopes results to the key's mode (a live key never sees test invoices and vice versa)
  - Returns all matching records (no pagination); use `GET /api/creator-subscription/orders` for cursor-paginated transaction records

## Rate Limiting

All creator-subscription API endpoints are rate limited **except** checkout session creation (`POST /api/creator-subscription/checkout-sessions`).

### Rate limit tiers

| Group | Window | Max requests | Applies to |
|---|---|---|---|
| read | 1 minute | 120 | GET checkout-sessions/{id}, GET subscriptions, GET subscriptions/{id}, GET plans, GET config, GET orders, GET invoices |
| write | 1 minute | 20 | POST cancel, POST resume, PUT plans/{id}, PUT config, POST plans |
| api-keys | 1 minute | 10 | POST/GET/DELETE api-keys |

### Rate limit scope

- API key auth: rate limit is per API key
- Firebase auth: rate limit is per user UID

### Response headers

All rate-limited endpoints return these headers on every response:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 119
X-RateLimit-Reset: 1711612860
```

- `X-RateLimit-Limit`: maximum requests allowed in the current window
- `X-RateLimit-Remaining`: remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp (seconds) when the window resets

### 429 response

When the rate limit is exceeded:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711612860
```

```json
{
  "error": "Rate limit exceeded. Try again in 42 seconds."
}
```

Use the `Retry-After` header value to schedule retries.

## Portal Session (Subscriber Self-Service)

Use this when the human user wants to let their subscribers manage their own subscriptions (view, cancel, resume) without leaving the merchant's UX flow.

### How It Works

1. The subscriber is already logged into the merchant's website.
2. The subscriber clicks "Manage Subscription".
3. The merchant backend creates a **portal session** via server-to-server API call.
4. Portaly returns a `portalUrl` with a short-lived token.
5. The merchant redirects the subscriber to `portalUrl`.
6. The subscriber can view subscriptions, cancel, resume, and view payment history — no additional login required.
7. The subscriber clicks "Back" and returns to the merchant's `returnUrl`.

### Create Portal Session

- Endpoint:
  - `POST /api/creator-subscription/portal-sessions`
- API host:
  - `https://portaly.ai`
- Required headers:
  - `Authorization: Bearer {portaly_payment_api_key}`
  - `Content-Type: application/json`
- Request fields:
  - `customerEmail`: optional, the subscriber's email (required if `subscriptionId` is not provided)
  - `subscriptionId`: optional, scope to a single subscription (required if `customerEmail` is not provided)
  - `returnUrl`: required, URL to redirect the subscriber back to after they finish managing
- At least one of `customerEmail` or `subscriptionId` must be provided.

Request body (by email — shows all subscriptions for this email):

```json
{
  "customerEmail": "subscriber@example.com",
  "returnUrl": "https://merchant.example/account"
}
```

Request body (by subscription — scoped to one subscription):

```json
{
  "subscriptionId": "session_123",
  "returnUrl": "https://merchant.example/account"
}
```

- Response fields:
  - `data.portalSessionId`: the portal session id
  - `data.portalUrl`: URL to redirect the subscriber to
  - `data.expiresAt`: session expiry timestamp (30 minutes)

```json
{
  "data": {
    "portalSessionId": "portal_abc123",
    "portalUrl": "https://portaly.ai/portal/portal_abc123?token=hex_token",
    "expiresAt": "2026-03-29T12:30:00.000Z"
  }
}
```

- Integration notes:
  - This is a **server-to-server** call — never expose the API key in client-side code
  - The `portalUrl` contains a short-lived token; do not cache it beyond `expiresAt`
  - The portal session inherits `mode` from the API key (live or test)
  - After the session expires, the subscriber must request a new portal session from the merchant

Node.js example:

```js
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || "https://portaly.ai";

// Server-side: create portal session and redirect subscriber
const response = await fetch(
  `${PORTALY_API_HOST}/api/creator-subscription/portal-sessions`,
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.PORTALY_API_KEY}`,
    },
    body: JSON.stringify({
      customerEmail: subscriber.email,
      returnUrl: "https://merchant.example/account",
    }),
  }
);

const result = await response.json();
// Redirect the subscriber to the portal
res.redirect(result.data.portalUrl);
```

Express route example:

```js
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || "https://portaly.ai";

app.get("/manage-subscription", async (req, res) => {
  // req.user is the authenticated subscriber on the merchant's side
  const response = await fetch(
    `${PORTALY_API_HOST}/api/creator-subscription/portal-sessions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.PORTALY_API_KEY}`,
      },
      body: JSON.stringify({
        customerEmail: req.user.email,
        returnUrl: `${process.env.BASE_URL}/account`,
      }),
    }
  );

  const { data } = await response.json();
  res.redirect(data.portalUrl);
});
```

### What the Subscriber Can Do in the Portal

- View all subscriptions associated with their email under this merchant
- See plan name, amount, billing period, status, and next billing date
- **Cancel** a recurring subscription (stops next renewal, current period remains active)
- **Resume** a pending cancellation (before it becomes fully canceled)
- View payment history per subscription

### Portal Session Security

- The portal token is valid for 30 minutes
- The token is validated on every API call within the portal
- Subscription actions (cancel/resume) verify that the subscription belongs to the portal session's email and profile
- The merchant API key is only used server-to-server; it is never exposed to the subscriber's browser

## External Ownership Split

Third party usually owns:

- plan selection UI
- session creation API call
- storing merchant order context
- success/cancel pages
- callback receiver and reconciliation

Portaly owns:

- hosted checkout page
- email verification
- TapPay and 91APP payment initiation/finalization
- subscription and payment persistence
- invoice task creation
- bridge order creation
