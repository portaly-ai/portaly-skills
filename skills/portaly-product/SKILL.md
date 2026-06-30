---
name: portaly-product
version: 0.3.2
description: Help users integrate Portaly digital products checkout — list a creator's digital products and let buyers purchase one item or a custom bundle via Portaly's hosted checkout, with signed webhook callbacks. Trigger when the user mentions Portaly digital products, selling courses/downloads/templates via their own site backed by Portaly, building a "powered by Portaly" storefront, or bundle pricing of Portaly products.
---

# Portaly Digital Products Integration

Use this skill to help a human user wire their own website (typically vibe-coded with Cursor / v0 / Lovable / etc.) to sell a creator's Portaly digital products. The user owns the product display UI; Portaly owns the checkout, payment, email, and order success page.

Pattern is the same as Stripe Checkout:

1. User's site fetches the creator's products via API and displays them however they want.
2. When a buyer is ready to pay, user's site creates a checkout session via API and redirects the buyer to the returned `checkoutUrl`.
3. Portaly handles payment, sends the buyer a confirmation email, and serves the post-purchase deliverables page.
4. Portaly POSTs a signed webhook to the user's callback URL when the purchase completes (and when a creator later refunds).

## Portaly Digital Products Environments

API host (overridable via `PORTALY_API_HOST`):

```
https://portaly.ai
```

| Aspect | Live mode | Test mode |
|---|---|---|
| API key prefix | `pcs_live_` | `pcs_test_` |
| Real charges | Yes | No — test transactions only |

The API key is shared with the `portaly-payment` skill (creator subscriptions). One key, two products. Test keys run the full flow without charging real money; develop against a test key and swap to a live key for production.

Payment is handled entirely on Portaly's hosted checkout page — you never see or choose how the buyer is charged. Your integration is the same regardless: list products, create a session, redirect, and consume webhooks.

## Quick Start

> **Precondition — a Portaly Payment account is required.** Every step below needs a Portaly Payment API key. **Before doing anything else, check for a key** (`PORTALY_API_KEY` in `.env` / `process.env`). If there is no key and the user has no Portaly Payment account yet, **stop and get them registered first at https://portaly.cc/payment** — offer to open the page for them, and open it once they say yes:
>
> ```bash
> # Open the Portaly Payment registration page — pick the line for the user's OS
> Start-Process "https://portaly.cc/payment"   # Windows (PowerShell)
> open "https://portaly.cc/payment"            # macOS
> xdg-open "https://portaly.cc/payment"        # Linux
> ```
>
> After registering, they create the key at https://portaly.cc/admin/creator-subscription. Do not continue with the steps below until a key exists.

1. Ensure the human user has a Portaly Payment API key (see the precondition above). Recommend a test key for development.
2. Have them place secrets in `.env` themselves (never via chat — see Guardrails):
   ```
   PORTALY_API_KEY=pcs_test_xxx
   PORTALY_CALLBACK_SECRET=xxx
   ```
3. Fetch products: `GET /api/digital-products` with `Authorization: Bearer ${PORTALY_API_KEY}`.
4. Build their product display UI in their own site using those product fields.
5. On "checkout" click, call `POST /api/digital-products/checkout-sessions` with `items[]`, `totalAmount`, `callbackUrl`, `merchantOrderNumber`.
6. Redirect buyer to the response's `checkoutUrl`.
7. Implement a webhook receiver that verifies `x-portaly-signature` (see `scripts/sign_callback.mjs`) and persists `orderIds[]` from the `digital_product.checkout.completed` payload.

Full API details live in `references/api-contract.md`. Load it whenever generating code that hits these endpoints.

## Workflow

### 1. Apply for the API key

- Same key flow as the `portaly-payment` skill. If the user has already done that flow, reuse the same key — do not create a second one.
- Never ask the user to paste secrets in chat. Tell them to put `PORTALY_API_KEY` and `PORTALY_CALLBACK_SECRET` directly into `.env` themselves.
- Verify `.gitignore` contains `.env` before proceeding.
- If a secret is pasted by mistake, advise rotating it in the dashboard.

### 1.5 Report the installed skill version

Report this skill's version to Portaly so the merchant's dashboard can flag when their installed skill is out of date. This is a single, non-blocking version check — its body carries only the skill name and version, nothing about the user's project or data. **Mention it to the user once** (e.g. "Reporting the installed Portaly skill version so your dashboard can detect outdated skills") — you don't need to pause for approval, but don't conceal it either.

**When to send it — send once per session, at whichever of these happens first, as long as `process.env.PORTALY_API_KEY` is set:**

1. **Right after you install or update this skill**, if a key is already in the environment.
2. **Otherwise, the first time you make any Portaly API call** (listing products, creating a checkout session, etc.) — the version report rides along with that first real API usage.

- If `PORTALY_API_KEY` is not in the environment yet, skip the report for now (case 2 will cover it later). Never prompt the user for a key just to send this.
- The request:
  ```
  POST https://portaly.ai/api/creator-subscription/skill-version
  Authorization: Bearer {PORTALY_API_KEY}
  Content-Type: application/json

  { "skillName": "portaly-product", "version": "0.3.2" }
  ```
- `version` is this skill's `version` from the frontmatter at the top of THIS file — use the literal value of the SKILL.md you are currently running, so the report reflects what is actually installed.
- The request body carries only `skillName` and `version`. If the call fails, ignore it and continue — it never blocks anything.

### 2. Browse products

Use `GET /api/digital-products` to see what the creator has on sale. This is a read-only call, so the agent can make it directly with the user-provided API key. Confirm with the user which products they want to sell on their site.

The compact list response is enough to build a product grid (image, name, `effectivePrice`, `price`, stock). For detailed display — title color/alignment, countdown timer, multi-image gallery, sale-price banner, etc. — call `GET /api/digital-products/{productId}` for the full detailed view.

**Always render the current price from `effectivePrice`, not from `sale ?? price`.** `sale` is just a raw input field — it is only the active price when `priceStatus === 'isSale'`. When `priceStatus === 'isCountdown'`, the real price lives in `countdownSetting[0].countdownPrice`; when `productMode === 'free'`, the price is 0. `effectivePrice` is computed server-side and already handles all of these cases.

A product is considered **free** whenever `effectivePrice <= 0` — that covers `productMode === 'free'`, `priceStatus === 'isSale'` with `sale === 0`, `priceStatus === 'isCountdown'` with `countdownPrice === 0`, and a base `price` of 0. Free items participate in bundles but contribute `0` to `totalAmount` and never receive an invoice (see §3).

### 2a. Rendering product cards

The detailed view returns most of the fields the creator configured in Portaly's admin UI. If the user wants their site to look similar to Portaly's main product card, use these fields:

- `image` → cover image
- `title.text` (fallback to `name`) → headline. `title.color` and `title.align` are creator-configured styling.
- Price:
  - **Primary price → always `effectivePrice`** (already accounts for sale / countdown / free).
  - If `effectivePrice < price` → show `price` struck-through next to it as the "list price".
  - For badges (optional UX): `priceStatus === 'isSale'` → "Sale" badge; `priceStatus === 'isCountdown'` → countdown banner driven by `countdownSetting[]`; `productMode === 'free'` → "Free" label.
  - Do **not** roll your own `sale ?? price` — that misreads countdown / free products. Same for `totalAmount` when building a checkout session: sum `effectivePrice` (then apply any bundle discount), not `sale ?? price`.
- `stock` + `isStock` + `isShowStock`:
  - if `!isStock` → don't show stock
  - if `isStock && stock === 0` → out of stock; use `stockButtonName` as the CTA label
  - if `isStock && isShowStock` → show remaining count
- `buttonName` → CTA button label (defaults to "Buy" / "立即購買" if missing)
- `productImages` → additional gallery images for detail pages
- `videoUrl` / `videoImage` / `videoText` → optional preview video

What the buyer sees on the user's site (product display, cart UI, "checkout" button) is entirely the user's responsibility — design it as they like.

### 3. Create a checkout session

When the buyer is about to pay, the user's backend calls `POST /api/digital-products/checkout-sessions`.

Two rules for `totalAmount`:
- Bundle contains at least one paid item (`effectivePrice > 0`) → `totalAmount` must be `> 0`.
- Bundle is entirely free items (all `effectivePrice <= 0`) → `totalAmount` must be exactly `0`. The buyer skips card entry and goes straight through checkout; no charge, no invoice. Email verification still applies.

Mismatch returns `400 TOTAL_AMOUNT_INVALID`.


```ts
const res = await fetch(`${HOST}/api/digital-products/checkout-sessions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.PORTALY_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    items: cart.map(p => ({ productId: p.id })),
    totalAmount: cart.totalPrice,         // for bundle, your discounted price
    currency: 'TWD',
    customerEmail: form.email,             // optional, pre-fill on hosted page
    callbackUrl: 'https://your-site.com/webhooks/portaly',
    successRedirectUrl: 'https://your-site.com/thanks',
    cancelRedirectUrl: 'https://your-site.com/cart',
    merchantOrderNumber: yourInternalId,
    metadata: { userId: '...', cartId: '...' },
  }),
})
const { data } = await res.json()
// Redirect the buyer:
return Response.redirect(data.checkoutUrl, 303)
```

Validation is up-front: if a `productId` is invalid, inactive, or out of stock, you'll get a `400` with a specific `error.code`. Real payment failures only surface after the buyer attempts to pay on the hosted page (and they retry there or you start a new session).

### 4. Let Portaly run hosted checkout

Treat the hosted page as a black box. Do not attempt to collect card tokens client-side.

The hosted page is creator-branded (creator's name, avatar, colors) with a small "powered by Portaly" mark. It shows each item's `listedPrice`; when `listedPrice < originalPrice`, the original price is shown struck-through. When `totalAmount` is less than the sum of all `listedPrice` values (e.g. you applied a bundle discount), the page shows a subtotal, discount line, and final total.

### 5. Consume the webhook

```
POST https://your-site.com/webhooks/portaly
Content-Type: application/json
x-portaly-event: digital_product.checkout.completed
x-portaly-timestamp: 2026-05-19T12:50:00.000Z
x-portaly-signature: <hex>
```

Verify with HMAC-SHA256 over `${timestamp}.${stableJson(body)}` using `PORTALY_CALLBACK_SECRET`. See `scripts/sign_callback.mjs` for a copy-pasteable reference implementation.

Persist:
- `sessionId` (idempotency key)
- `orders[]` (each has `orderId`, `productId`, `allocatedAmount`, `orderSuccessPageUrl`)
- `merchantOrderNumber`
- `metadata`

**Reject callbacks where `x-portaly-timestamp` is older than 5 minutes.**

The buyer is automatically emailed by Portaly — **one purchase confirmation email per ordered product**, each containing the order-success-page link for that product's deliverable. For a 3-item bundle, expect 3 separate emails (free items do not generate an email). You do not need to send any email yourself, and you do not own the deliverables.

### 6. Handle refunds (webhook)

When the creator refunds an order in the Portaly admin, you'll receive:

```
x-portaly-event: digital_product.order.refunded
```

The payload contains `orderId`, `sessionId`, `amount`. **Refund events are per-order** — if a bundle of 5 is fully refunded, you'll receive 5 separate `order.refunded` events.

Use this to revoke any entitlement you granted in your system (e.g., remove user access, decrement license counts).

### 7. Optional: list orders

`GET /api/digital-products/orders` returns orders created via this API key. Useful for reconciliation / a "my purchases" panel in the user's admin.

## Preferred Response Shape

When implementing for the user, return:
1. The exact `.env` keys they need
2. Backend endpoint(s) they need to add (with copy-pasteable code)
3. Webhook handler code (with signature verification)
4. The minimum schema for whatever they persist on their side (orders table)
5. A short test plan: "create a test session with one item, then with two items, then trigger refund in Portaly admin"

## Guardrails

- **Default to test mode for development.** A `pcs_live_` key creates real, chargeable checkout sessions. If the loaded key starts with `pcs_live_`, confirm with the user that live mode is intended before creating a live checkout session. Never silently move a buyer through production billing.
- **Never echo secrets in chat.** Have the user place `PORTALY_API_KEY` and `PORTALY_CALLBACK_SECRET` in `.env` themselves.
- **Always verify `.gitignore` includes `.env`** before suggesting any commit.
- **Always verify webhook signatures** before acting on a webhook payload. Untrusted POSTs to `/webhooks/portaly` could trigger entitlement grants.
- **Always check `x-portaly-timestamp` freshness** (reject if > 5 minutes old).
- **Always serve `callbackUrl` over HTTPS.**
- **Use `sessionId` and `orderId` as idempotency keys** when processing webhooks — they can be re-delivered.
- **Don't trust the buyer-side `successRedirectUrl` as proof of payment.** Only the webhook (or polling the session) confirms a real `completed` state.
- **Do not put secrets in `metadata`.** Echoed back in webhooks and logs.
- **Bundle pricing is your choice**, but discounting heavily below the creator's listed total may cannibalize the creator's main store. Discuss with the creator before going live.

## Deliverables

For each integration session, leave the user with:
- Working `GET /api/digital-products` call returning their inventory
- Backend endpoint that creates checkout sessions
- Webhook receiver with verified signature handling
- Confirmation they tested end-to-end in test mode (one single-item purchase + one bundle)

## Resources

- `references/api-contract.md` — Full endpoint contract: request/response shapes, error codes, webhook payloads, order doc fields. **Load this whenever generating code that calls the API.**
- `references/bundle-pricing.md` — Proportional split algorithm with examples.
- `scripts/sign_callback.mjs` — Node.js HMAC verification reference (copy into the user's project).
- `scripts/sign_callback.webcrypto.mjs` — WebCrypto HMAC verification reference for edge runtimes that can't import `node:crypto` (Cloudflare/Vercel Edge, Deno, InsForge edge functions). Same scheme + byte-identical `stableJson`, verifies via `crypto.subtle`.
- `scripts/sign_callback.py` — Python HMAC verification reference.
