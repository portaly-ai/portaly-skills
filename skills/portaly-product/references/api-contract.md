# Portaly Digital Products API Contract

This document is the canonical contract for the Portaly **Digital Products** API. It is used by:
- Third-party systems (your code) integrating against `portaly.ai`
- Portaly-vibe backend implementing the routes
- Reviewers verifying request/response shapes

## Use This Reference For

- Listing a creator's digital products
- Building a checkout that supports single-item or bundle (multi-item) purchases
- Verifying webhook signatures
- Reading order data after purchase
- Understanding which fields you must persist on your side

---

## Bearer Auth

All endpoints accept `Authorization: Bearer {api_key}` where `{api_key}` is a Portaly Payment API key (`pcs_live_...` or `pcs_test_...`).

- The key is the **same** key used for the `portaly-payment` (creator-subscription) skill. One key per creator profile, two modes (live/test).
- The key identifies one `profileId` (one creator). You can only see and operate on that creator's resources.
- Test keys run the full flow without charging real money. All other behavior is identical.

---

## Base URL

```
https://portaly.ai
```

Overridable via `PORTALY_API_HOST`.

---

## Endpoints

### GET `/api/digital-products`

List the calling creator's digital products. Returns a compact view — enough to build a product list / card grid. For detailed display (custom title styling, sale/countdown info, etc.), call `GET /api/digital-products/{productId}`.

**Query params**:
- `limit` (optional, default 50, max 200)
- `startAfter` (optional, cursor — a `productId` from a previous response)
- `category` (optional, `default` | `live`)
- `includeInactive` (optional, default `false`) — set `true` to also see `isActive: false` products (useful for admin UIs; they cannot be checked out)

**Response (compact view)**:
```json
{
  "data": [
    {
      "id": "prod_xxx",
      "name": "Course: Advanced Photography",
      "description": "...",
      "image": "https://...",
      "category": "default",
      "price": 1500,
      "sale": 990,
      "effectivePrice": 990,
      "priceStatus": "isSale",
      "productMode": "normal",
      "currency": "TWD",
      "isActive": true,
      "isStock": false,
      "stock": null,
      "customLocale": "zh",
      "updatedAt": "2026-05-10T10:00:00Z"
    }
  ],
  "pagination": { "hasMore": false, "startAfter": null }
}
```

- `effectivePrice` is the **current selling price** the buyer should see — already accounts for `priceStatus`, `productMode`, and countdown settings. **Use this for any "current price" UI; do not roll your own `sale ?? price` logic.** Reason: `sale` is only the active price when `priceStatus === 'isSale'`; when `priceStatus === 'isCountdown'`, the real price lives in `countdownSetting[0].countdownPrice`, and when `productMode === 'free'`, the price is 0 regardless of `price`/`sale`.
- `price` is the creator's listed (a.k.a. "original") price. Use it for the strike-through "list price" next to `effectivePrice` when `effectivePrice < price`. Bundle allocation is computed from `effectivePrice`, not `price` — see Bundle Pricing.
- `sale` is the raw "sale price" field the creator entered; `null` if not set. Do **not** display this directly — show `effectivePrice` instead, which encodes whether the sale price is actually in effect.
- `priceStatus` is `'isOriginal' | 'isSale' | 'isCountdown'` — encodes which pricing mode the creator chose. Surface it only if you want to render a "Sale!" or "Countdown!" badge; otherwise rely on `effectivePrice`.
- `productMode` is `'normal' | 'free'`. Free products still go through checkout (for delivery + email), but `effectivePrice` will be `0`.
- `stock` is `null` when `isStock: false`. When `isStock: true`, `stock` is the current remaining count. Out-of-stock products still appear in the list (with `stock: 0`) but cannot be checked out.
- `customLocale` is the product's display language (`zh` | `en` | `undefined`); use it to drive language-specific UI on your site.
- Fields like `productContents` (the deliverable: download links, video URLs, forms) and `thanks.*` are **never** exposed via this API. The buyer sees them only on the order success page after purchase.

### GET `/api/digital-products/{productId}`

Single-product detailed view — all fields safe for pre-purchase display. Use this to render a full product card matching Portaly's main-site styling, or when you need fields not in the list view (e.g., title color, sale-price banner, countdown timer).

**Response (detailed view)**:
```json
{
  "data": {
    "id": "prod_xxx",
    "name": "Course: Advanced Photography",
    "description": "...",
    "image": "https://...",
    "category": "default",
    "title": {
      "text": "Course: Advanced Photography",
      "color": "#ff5500",
      "align": "center"
    },
    "price": 1500,
    "sale": 990,
    "effectivePrice": 990,
    "priceStatus": "isSale",
    "productMode": "normal",
    "currency": "TWD",
    "countdownSetting": [
      {
        "countdownPrice": 1290,
        "deadlinePrice": 1500,
        "countdownTime": "2026-06-30T23:59:59+08:00"
      }
    ],
    "isActive": true,
    "isStock": true,
    "stock": 12,
    "isShowStock": true,
    "stockButtonName": "Sold Out",
    "isRepurchasable": false,
    "isRating": true,
    "isSoldQuantity": true,
    "buttonName": "Buy Now",
    "productDescription": "<p>HTML content...</p>",
    "productSpec": true,
    "specItems": [{ "label": "Format", "label1": "PDF + Video" }],
    "productImageMode": "product-image",
    "productImages": ["https://...", "https://..."],
    "videoUrl": "https://...",
    "videoImage": "https://...",
    "videoText": "Preview",
    "enableCoupon": true,
    "customLocale": "zh",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-05-10T10:00:00Z"
  }
}
```

**Errors**:
- `404 PRODUCT_NOT_FOUND` — productId does not exist under this creator
- `404 PRODUCT_NOT_ACTIVE` — product exists but is `isActive: false` (use `includeInactive=true` if you specifically need to fetch inactive products)

### POST `/api/digital-products/checkout-sessions`

Create a hosted checkout session for one or more products.

**Request body**:
```json
{
  "items": [
    { "productId": "prod_abc" },
    { "productId": "prod_def" }
  ],
  "totalAmount": 999,
  "currency": "TWD",
  "customerEmail": "buyer@example.com",
  "successRedirectUrl": "https://your-site.com/thank-you",
  "cancelRedirectUrl": "https://your-site.com/cart",
  "callbackUrl": "https://your-site.com/webhooks/portaly",
  "merchantOrderNumber": "ORDER-12345",
  "metadata": { "your_field": "value" }
}
```

There is **no payment-provider request field** — how the buyer is charged is handled entirely by Portaly's hosted checkout page and is not something you configure.

Field rules:
- `items[]`: 1..20 items. Each `productId` must belong to the calling creator and be `isActive`. If any item is stock-tracked, its `stock` must be >= 1.
- `totalAmount`: the **buyer-paid total** in `currency` minor unit (TWD = whole dollars, no cents). For a single item, it is typically equal to the product price. For a bundle, this is the discounted bundle price set by you.
- `customerEmail`: optional. If omitted, the buyer enters it on the hosted checkout page. If supplied, the field is pre-filled.
- `successRedirectUrl` / `cancelRedirectUrl`: optional. Used after the hosted checkout page completes / cancels.
- `callbackUrl`: optional. Where Portaly sends signed webhooks for this session and its resulting orders. If omitted, you must poll the `GET /api/digital-products/checkout-sessions/{sessionId}` endpoint.
- `merchantOrderNumber`: your internal reference. Echoed back in webhooks. Max 50 chars.
- `metadata`: free-form string keys, max 20 keys, each value <= 500 chars. Echoed back. Do not put secrets here.

**Response 200**:
```json
{
  "data": {
    "sessionId": "dps_xxx",
    "status": "checkout_ready",
    "checkoutUrl": "https://portaly.ai/checkout/digital-product/dps_xxx",
    "checkoutToken": "<hex token>",
    "expiresAt": "2026-05-19T13:00:00Z",
    "totalAmount": 999,
    "currency": "TWD",
    "items": [
      { "productId": "prod_abc", "originalPrice": 500, "listedPrice": 400, "allocatedAmount": 363 },
      { "productId": "prod_def", "originalPrice": 700, "listedPrice": 700, "allocatedAmount": 636 }
    ]
  }
}
```

- `originalPrice` is the product's listed (full) price at session creation time — the same value the list/detail view exposes as `price`. Use it as the strike-through price when displaying a discount.
- `listedPrice` is the effective price in use at session creation time — the same value the list/detail view exposes as `effectivePrice` (accounts for `priceStatus`, `productMode`, countdown settings). Equal to `originalPrice` when no discount is active. When `listedPrice < originalPrice`, the hosted checkout page automatically renders a strike-through original price and a discounted price.
- `allocatedAmount` is the share of `totalAmount` that will end up on each resulting order, computed by **proportional split** of `listedPrice` values (see Bundle Pricing). Sum equals `totalAmount`. This is a financial field used for order records, invoicing, and refunds — not for display.
- `expiresAt` is 30 minutes from creation. After expiry, attempts to pay will fail; create a new session.

**Errors**:
- `400 INVALID_REQUEST` — schema validation failed
- `400 PRODUCT_NOT_FOUND` — one of the `items[].productId` does not exist
- `400 PRODUCT_NOT_ACTIVE` — product is inactive
- `400 OUT_OF_STOCK` — stock-tracked product has 0 remaining
- `400 TOTAL_AMOUNT_INVALID` — `totalAmount < 0`; or bundle contains paid items but `totalAmount <= 0`; or bundle is entirely free items but `totalAmount !== 0`
- `401 UNAUTHORIZED` — bad API key
- `429 RATE_LIMITED` — too many requests

All `400` responses include `error.code` (one of above) and `error.details` with the offending field/value.

### POST `/api/digital-products/checkout-sessions/{sessionId}/charge`

This endpoint is called by Portaly's **hosted checkout page**, not by your integration — it is documented here for completeness only. The hosted page collects the buyer's payment details and finalizes the charge. **You do not call this endpoint directly**, so you don't construct its request body.

After the charge resolves, Portaly completes the session and dispatches `digital_product.checkout.completed` to your webhook (and sends the buyer to `successRedirectUrl` if you set one). Treat the webhook — not this endpoint's response — as the source of truth for a completed purchase.

### GET `/api/digital-products/checkout-sessions/{sessionId}`

Polling fallback for session status. Same fields as the create response, plus:

```json
{
  "data": {
    "sessionId": "...",
    "status": "checkout_ready" | "completed" | "failed" | "expired",
    "completedAt": "2026-05-19T12:50:00Z",
    "orderIds": ["order_x", "order_y"],
    "buyerEmail": "buyer@example.com"
  }
}
```

`orderIds` populated when `status === "completed"`.

### GET `/api/digital-products/orders`

List orders created via this API key (i.e., orders whose `metadata.vibeApiKeyId` matches).

**Query params**: `limit`, `startAfter`, `status` (`paid` | `liquid` | `refund`)

**Response**:
```json
{
  "data": [
    {
      "id": "order_xxx",
      "sessionId": "dps_xxx",
      "bundleId": "dps_xxx",
      "productId": "prod_abc",
      "amount": 333,
      "currency": "TWD",
      "status": "paid",
      "buyerEmail": "...",
      "buyerName": "...",
      "merchantOrderNumber": "ORDER-12345",
      "createdAt": "2026-05-19T12:50:00Z",
      "metadata": { "your_field": "value" }
    }
  ],
  "pagination": { "hasMore": false, "startAfter": null }
}
```

`bundleId` equals `sessionId` and is shared across all orders from the same bundle.

---

## Webhooks

When you provide `callbackUrl`, Portaly POSTs signed events to it.

### Headers

```
Content-Type: application/json
x-portaly-event: digital_product.checkout.completed
x-portaly-timestamp: 2026-05-19T12:50:00.000Z
x-portaly-signature: <hex string>
```

### Events

| Event | When |
|---|---|
| `digital_product.checkout.completed` | All orders in the bundle are `paid`. Fired once per session. |
| `digital_product.order.refunded` | An individual order is refunded. Fired once **per order** (so a bundle of 5 can fire 5 times if all refunded). |
| `digital_product.order.canceled` | Reserved. Currently not emitted. |

### Payload — `checkout.completed`

```json
{
  "event": "digital_product.checkout.completed",
  "sessionId": "dps_xxx",
  "bundleId": "dps_xxx",
  "profileId": "creator-profile-id",
  "mode": "live",
  "status": "completed",
  "totalAmount": 999,
  "currency": "TWD",
  "buyerEmail": "buyer@example.com",
  "buyerName": "...",
  "merchantOrderNumber": "ORDER-12345",
  "paymentReference": "...",
  "completedAt": "2026-05-19T12:50:00Z",
  "orders": [
    {
      "orderId": "order_x",
      "productId": "prod_abc",
      "productName": "...",
      "allocatedAmount": 333,
      "orderSuccessPageUrl": "https://portaly.cc/{slug}/product/order/order_x"
    }
  ],
  "metadata": { "your_field": "value" }
}
```

### Payload — `order.refunded`

```json
{
  "event": "digital_product.order.refunded",
  "sessionId": "dps_xxx",
  "bundleId": "dps_xxx",
  "orderId": "order_x",
  "profileId": "creator-profile-id",
  "mode": "live",
  "productId": "prod_abc",
  "amount": 333,
  "currency": "TWD",
  "buyerEmail": "...",
  "merchantOrderNumber": "ORDER-12345",
  "refundedAt": "2026-05-20T08:00:00Z",
  "metadata": { ... }
}
```

### Signature

The signature is HMAC-SHA256 of `{x-portaly-timestamp}.{stableJson(body)}` keyed by your `callbackSecret`.

```
signature = HMAC_SHA256(
  key   = callbackSecret,
  data  = `${timestamp}.${stableJson(body)}`
)
```

`stableJson` sorts object keys recursively and drops `undefined`. See `scripts/sign_callback.mjs` (Node.js). On an edge / WebCrypto runtime that can't import `node:crypto` (Cloudflare/Vercel Edge, Deno, or an InsForge edge function), use `scripts/sign_callback.webcrypto.mjs` instead — same scheme, byte-identical `stableJson`, verifies via the global `crypto.subtle`. The Node/edge scripts sort keys with `localeCompare` (matching the signing server); `scripts/sign_callback.py` sorts by Unicode code point, so for **mixed-case or non-ASCII object keys** it can diverge — keep merchant-supplied `metadata` keys lowercase ASCII, or use the JS scripts for those payloads.

**Verification rules** (your responsibility):
1. Verify `x-portaly-timestamp` is not older than 5 minutes (prevents replay).
2. Recompute signature with your `callbackSecret` and timing-safe-compare to `x-portaly-signature`.
3. Treat `sessionId` (for `checkout.completed`) and `orderId` (for `order.refunded`) as idempotency keys.
4. Always serve `callbackUrl` over HTTPS.

---

## Bundle Pricing (Proportional Split)

When `items[]` has more than one product, Portaly splits `totalAmount` across the resulting orders by each item's `listedPrice` (the effective price captured at session creation — same value the list/detail view exposes as `effectivePrice`). Items with `listedPrice <= 0` (free) are allocated `0` and do not participate in the split — `totalAmount` is distributed across the paid items only.

Algorithm:
```
paid = items where listedPrice > 0
sumPaid = sum(paid[i].listedPrice)
for each free item: allocated = 0
for i in 0..paid.length-2:
  allocated[paid[i]] = round(totalAmount * paid[i].listedPrice / sumPaid)
allocated[paid[last]] = totalAmount - sum(allocated of earlier paid items)
```

The last paid item absorbs rounding so `sum(allocated) === totalAmount` exactly. When every item is free, every allocation is `0` and `totalAmount` must be `0`.

Example: bundle of 3 items with listed prices `100`, `0` (free), `300`; `totalAmount = 400`.
- Item 1 (100) → round(400 × 100 / 400) = 100
- Item 2 (free) → 0
- Item 3 (300) → 400 − 100 = 300
- Sum = 400 ✓

See `references/bundle-pricing.md` for more examples.

---

## What Happens Behind the Scenes (informational)

When a buyer completes payment on the hosted checkout page:

1. Portaly charges the buyer for `totalAmount`. Skipped when `totalAmount === 0` (entirely-free bundle).
2. Portaly records one order per item, each with the allocated amount.
3. Portaly runs its creator-side order pipeline automatically:
   - Sends a buyer confirmation email per paid order (see "Buyer Confirmation Emails" below).
   - Updates the creator's sales stats.
   - Issues invoices for paid items; free items (`amount === 0`) are skipped.
4. Portaly dispatches `digital_product.checkout.completed` to your `callbackUrl`.

You do not need to send the buyer their deliverables. Each per-order email carries the order-success-page link for that product; the buyer clicks through to see the deliverable (download link / video / form).

### Buyer Confirmation Emails

Each paid order in the bundle generates its own confirmation email — same template as a standalone product purchase. A 3-item paid bundle therefore produces 3 emails, each carrying the order-success-page link for that product. Free items (`amount === 0`) do not generate an email.

---

## Order Success Page

`https://portaly.cc/{creatorSlug}/product/order/{orderId}` — already exists, untouched by this API. The buyer sees the creator-defined deliverable (download link, video, form, etc.). If the order is later refunded, this page automatically hides the deliverable.

---

## Rate Limiting

- 100 requests / minute per API key for read endpoints
- 30 requests / minute per API key for `POST /checkout-sessions`
- 429 responses include `Retry-After` header

---

## Error Response Shape

All errors:
```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product prod_xxx does not exist under this creator.",
    "details": { "productId": "prod_xxx" }
  }
}
```

---

## Internal: Public Product Field Whitelist (NOT part of public contract)

This section is for portaly-vibe implementers. The product API uses a **fail-closed whitelist**: only the fields listed here are returned. If portaly-vercel adds a new product field in the future, vibe will silently drop it from API responses — preventing accidental leakage of new sensitive fields.

### Compact view fields (returned by `GET /api/digital-products`)

```
id, name, description, image, category,
price, sale, effectivePrice, priceStatus, productMode, currency,
isActive, isStock, stock, customLocale, updatedAt
```

### Detailed view fields (returned by `GET /api/digital-products/{productId}`)

All compact view fields, plus:

```
title (object: { text, color, align }),
countdownSetting,
isShowStock, stockButtonName, isRepurchasable, isRating, isSoldQuantity,
buttonName, productDescription, productSpec, specItems,
productImageMode, productImages, videoUrl, videoImage, videoText,
enableCoupon, createdAt
```

### Fields explicitly **NEVER** returned

These appear in the underlying Firestore document but must never leave the API:

- `productContents` — the deliverable (download links, video URLs, forms)
- `thanks.content` / `thanks.alert` / `thanks.image` — post-purchase thank-you content (may contain links)
- `orderForm` — buyer form fields (handled by hosted checkout, not exposed)
- `enablePayPal`, `enableProfit`, `enablePortalyAds` — internal monetization flags
- `contentTags` — internal tagging
- internal payment-routing configuration fields
- `currency` (if absent on the doc) — defaults to `TWD` and is set by the API, not by the doc
- Any field whose name starts with `_` or `internal_`
- Any timestamp besides `createdAt` / `updatedAt`

### Mapping from Firestore `ProductRecord` to API response

Source Firestore doc lives at `profiles/{profileId}/products/{productId}` (see `domain/products/types.ts:ProductRecord`).

| API field | Source | Transform |
|---|---|---|
| `id` | doc id | — |
| `name` | `name` or `title.text` if `name` missing | string |
| `description` | `description` | string |
| `image` | `image` | resolve `images/{id}` → public URL |
| `category` | `category` | `'default' \| 'live'` |
| `price` | `price` | Number(); 0 if invalid |
| `sale` | `sale` | Number() or null |
| `effectivePrice` | computed | `productMode === 'free'` → 0; `priceStatus === 'isSale'` → `sale ?? price`; `priceStatus === 'isCountdown'` → `countdownSetting[0].countdownPrice ?? price`; otherwise → `price` |
| `priceStatus` | `priceStatus` | `'isOriginal' \| 'isSale' \| 'isCountdown'` (defaults to `'isOriginal'` if doc value missing/invalid) |
| `productMode` | `productMode` | `'normal' \| 'free'` (defaults to `'normal'`) |
| `isActive` | `isActive` | `Boolean()` — `'true'` and `true` both → true; `''`, `false`, undefined → false |
| `isStock` | `isStock` | Boolean |
| `stock` | `stock` | Number; if `!isStock`, return `null` |
| `customLocale` | `customLocale` | `'zh' \| 'en' \| undefined` |
| `title` (detailed only) | `title` | object: keep `text`, `color`, `align` only |
| `countdownSetting` (detailed only) | `countdownSetting` | array, pass through |
| `productImages` (detailed only) | `productImages` | resolve each `images/{id}` |
| (all other detailed fields) | direct copy | — |

### Why fail-closed whitelist

If portaly-vercel adds a new product field (e.g., `internalPriceOverride`, `wholesalePrice`, etc.) and the vibe API blindly serializes the whole doc, that field leaks. Whitelist guarantees: new fields require explicit allowlisting in vibe before they reach third parties.

### Update process

When vercel adds a new field that **should** be public:
1. Add the field name to the whitelist constant in `services/digitalProducts/productSerializer.ts` (vibe)
2. Add it to the response sample + mapping table in this contract file
3. Bump skill version in `skills/portaly-product/SKILL.md` and note the new field in skill docs
