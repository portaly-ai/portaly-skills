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
- signed callback verification
- fallback manual completion flows
- rate limiting behavior and retry handling

## Bearer Auth

Use this when the human user asks how to authenticate third-party requests.

- Header:
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`
- Notes:
  - the API key is tied to one `profileId`
  - each key has a fixed `mode`: `live` or `test`
  - live keys start with `pcs_live_`, test keys start with `pcs_test_`
  - mode is derived from the key; it is not passed per-request
  - do not send `profileId` in write requests that derive it from the key

## API Key Creation

Use this when the human user is creating a new API key from the Portaly admin panel.

- Endpoint:
  - `POST /api/creator-subscription/api-keys`
- Required auth:
  - Firebase auth (Portaly admin panel only — not a third-party API)
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

Use this when the human user needs to set or update merchant branding for Portaly Vibe Payment.

- Read endpoint:
  - `GET /api/creator-subscription/config?profileId={profileId}`
- Setup endpoints:
  - `PUT /api/creator-subscription/config`
  - `POST /api/creator-subscription/config/images`
- Setup headers:
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`

`PUT /api/creator-subscription/config`

- Update endpoint for merchant profile config, currently only supports `merchantName`. Image should upload via `/api/creator-subscription/config/images`.

- Request fields:
  - `merchantName`: optional string value

- Request body:
```json
{
  "merchantName": "Example Merchant",
}
```

- Response fields:
  - `data.profileId`
  - `data.merchantName`
  - `data.merchantLogo`
  - `data.updatedAt`

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
- Read endpoints:
  - `GET /api/creator-subscription/plans?profileId={profileId}`
  - `GET /api/creator-subscription/plans/{planId}`
- Setup endpoints:
  - `POST /api/creator-subscription/plans`
  - `PUT /api/creator-subscription/plans/{planId}`
  - `POST /api/creator-subscription/plans/{planId}/images`
- Setup headers:
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`

`POST /api/creator-subscription/plans`

- Request fields:
  - `name`: required
  - `description`: optional
  - `amount`: required positive number for fixed pricing; omit or set to `0` for dynamic pricing
  - `currency`: optional, defaults to `TWD`
  - `billingPeriod`: required, `monthly` or `yearly`, `one-time` is a single-payment plan that does not auto-renew
  - `pricingType`: optional, `fixed` (default) or `dynamic`. Dynamic pricing plans must use `one-time` billing period; the actual amount is set per checkout session
  - `status`: optional, `active` or `inactive`
  - `merchantPlanId`: optional merchant-side product id
  - `externalInformationUrl`: optional object with `url` and `text`
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
  - `data.amount`
  - `data.currency`
  - `data.billingPeriod`
  - `data.pricingType`
  - `data.status`
  - `data.image`
  - `data.createdAt`
  - `data.updatedAt`
- **Encoding note:** On Windows, if `data.name` or `data.description` contains garbled text, fix the shell encoding and use `PUT /api/creator-subscription/plans/{planId}` to correct it.

`PUT /api/creator-subscription/plans/{planId}`

- Request fields:
  - `profileId`: required and must match the plan owner
  - `name`: optional
  - `description`: optional
  - `amount`: optional positive number (must be non-negative for dynamic pricing plans)
  - `currency`: optional
  - `billingPeriod`: optional, `monthly` or `yearly`, `one-time` is a single-payment plan that does not auto-renew
  - `pricingType`: optional, `fixed` or `dynamic`
  - `status`: optional, `active` or `inactive`
  - `merchantPlanId`: optional

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

## Session Creation

Use this when the human user needs to send the buyer into Portaly hosted checkout.

- Endpoint:
  - `POST /api/creator-subscription/checkout-sessions`
- Required headers:
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`
  - `Content-Type: application/json`
- Request fields:
  - `planId`: Portaly plan id
  - `amount`: optional positive number. **Required** for dynamic pricing plans; ignored for fixed pricing plans
  - `successRedirectUrl`: optional merchant success page
  - `cancelRedirectUrl`: optional merchant cancel page
  - `callbackUrl`: optional merchant callback endpoint
  - `merchantOrderNumber`: optional merchant-side order id
  - `metadata`: optional string-keyed extra context

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
const { sessionId, checkoutUrl, checkoutToken, expiresAt } = result.data;
```

## Session Query

Use this when the human user needs reconciliation or a status page.

- Endpoint:
  - `GET /api/creator-subscription/checkout-sessions/{sessionId}`
- Required headers:
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`
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
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`

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
  - `status`
  - `cancelAtPeriodEnd`
  - `nextBillingAt`
  - `cancelRequestedAt`
  - `cancelEffectiveAt`
  - `canceledAt`

`POST /api/creator-subscription/subscriptions/{subscriptionId}/cancel`

- Supported only for recurring subscriptions:
  - `billingPeriod = monthly`
  - `billingPeriod = yearly`
- Behavior:
  - stops the next recurring charge
  - does not issue a refund
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
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`
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

Verification rule:

- base string: `{timestamp}.{stable_json(payload)}`
- algorithm: `HMAC-SHA256`
- secret: the API key's `callbackSecret`

Callback notes:

- current implementation contract: `subscriptionId === sessionId`
- if the callback payload consumed by the merchant side does not explicitly expose `subscriptionId`, the merchant may safely persist `sessionId` as the recurring subscription identifier
- use `sessionId` as the idempotency key for callback processing
- the `mode` field indicates whether this callback originated from a live or test checkout; merchants should use it to route test callbacks to sandbox order handling

Use `scripts/sign_callback.mjs` for Node.js/TypeScript-oriented work and `scripts/sign_callback.py` for a language-agnostic reference.

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
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`
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
// First page
const page1 = await fetch(
  "https://portaly.cc/api/creator-subscription/subscriptions?limit=20",
  { headers: { authorization: `Bearer ${apiKey}` } }
).then(r => r.json());

// Next page (if hasMore)
if (page1.pagination.hasMore) {
  const page2 = await fetch(
    `https://portaly.cc/api/creator-subscription/subscriptions?limit=20&startAfter=${page1.pagination.nextCursor}`,
    { headers: { authorization: `Bearer ${apiKey}` } }
  ).then(r => r.json());
}
```

## Order Query

Use this when the human user needs to query payment/order records for a profile.

- Endpoint:
  - `GET /api/creator-subscription/orders`
- Required headers:
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`
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

## Rate Limiting

All creator-subscription API endpoints are rate limited **except** checkout session creation (`POST /api/creator-subscription/checkout-sessions`).

### Rate limit tiers

| Group | Window | Max requests | Applies to |
|---|---|---|---|
| read | 1 minute | 120 | GET sessions/{id}, GET subscriptions, GET subscriptions/{id}, GET plans, GET config, GET orders |
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
  - `https://payment.portaly.cc`
- Required headers:
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`
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
    "portalUrl": "https://payment.portaly.cc/portal/portal_abc123?token=hex_token",
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
// Server-side: create portal session and redirect subscriber
const response = await fetch(
  "https://payment.portaly.cc/api/creator-subscription/portal-sessions",
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
app.get("/manage-subscription", async (req, res) => {
  // req.user is the authenticated subscriber on the merchant's side
  const response = await fetch(
    "https://payment.portaly.cc/api/creator-subscription/portal-sessions",
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
