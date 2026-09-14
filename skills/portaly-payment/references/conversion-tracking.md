# Conversion Tracking (GA4 / Meta)

## Use This Reference For

- a merchant asking "can I put my GA4 on the payment page?"
- `purchase` / `Purchase` conversion events for a Portaly Payment checkout
- UTM and campaign attribution surviving the redirect to hosted checkout and back
- Meta Pixel and the Meta Conversions API

## The Payment Page Carries No Merchant Tag

Hosted checkout runs on `https://portaly.ai`, a different origin from the merchant's site, and
Portaly does not inject merchant-supplied GA4, GTM, or Meta Pixel tags into it. That is worth a
sentence of explanation rather than a flat "not supported", because a tag there would not give
the merchant what they are asking for anyway:

- **The UTM is not on the payment page.** The campaign was recorded when the buyer first
  landed on the *merchant's* site. By the time they reach `portaly.ai` the `utm_*` parameters
  are long gone, so a tag firing there attributes the purchase to `referral / merchant.example`
  — or to a fresh direct session — never to the campaign the merchant is trying to measure.
- **Meta's `_fbc` cookie is first-party to the merchant's domain.** A pixel on `portaly.ai`
  cannot read the ad click id, so match rates collapse for exactly the traffic the merchant
  paid for.
- **Renewals, refunds and failed charges never happen in a browser at all**, so no
  client-side tag can ever report them. For a subscription product that is most of the revenue.

Everything the merchant actually wants is available on their own side. Route them there.

## What The Merchant Already Has

Merchants usually ask for four data points. Three of them never needed Portaly's page:

| Data point | Where it comes from |
|---|---|
| Order number | `merchantOrderNumber` — the merchant set it when creating the session |
| Plan / product id | `planId` — the merchant chose it |
| Amount paid | callback `amount` + `currency` (post-discount) |
| Campaign / UTM | the merchant's own GA4 session — no Portaly involvement |

## Does The GA4 Session Survive The Redirect?

Yes, under three conditions.

### 1. Add `portaly.ai` to GA4's unwanted referrals — required

GA4 → Admin → Data streams → Web → (the stream) → Configure tag settings → Settings →
Show all → List unwanted referrals → add `portaly.ai`.

Analytics then appends `ignore_referrer` to matching traffic, which per Google "indicates to
Analytics that the referrer should not be displayed as a traffic source"
([List unwanted referrals](https://support.google.com/analytics/answer/10327750)). Without it,
a session that *did* restart is attributed to `portaly.ai / referral` and the campaign is lost.

Merchants do not think of this on their own — say it first, every time.

### 2. The buyer must return within the session timeout (30 minutes by default)

Two documented GA4 behaviors combine here:

- **"By default, a session ends or times out after 30 minutes of user inactivity."**
  ([About sessions](https://support.google.com/analytics/answer/9191807) — the timeout is
  adjustable per data stream:
  [Adjust session timeout](https://support.google.com/analytics/answer/12131703))
- **"In Universal Analytics, a new campaign will start a new session regardless of activity.
  In Google Analytics 4, a new campaign does not begin a new session."**
  ([Comparing metrics: GA4 vs UA](https://support.google.com/analytics/answer/9964640))

The second one is what people get wrong, because Universal Analytics behaved the opposite way —
there, "every time a user's campaign source changes, Analytics opens a new session"
([UA session definition](https://support.google.com/analytics/answer/2731565)). GA4 dropped that
trigger, so returning from `portaly.ai` mid-session does not by itself reset anything: the
session keeps its original `session_source` / `session_campaign`, and only inactivity ends it.

It does break when:

- 3DS / OTP stalls, or the buyer wanders off mid-checkout
- the buyer switches device (order on desktop, OTP on phone, finish on phone) — a different
  browser is a different `client_id`, and nothing recovers this

### 3. `successRedirectUrl` must return to the same cookie domain

The `_ga` cookie is first-party to the merchant's site and is never touched while the buyer is
on `portaly.ai`, so the `client_id` is preserved for free. But a success page on a subdomain
outside that cookie's scope reads as a brand-new visitor.

**No cross-domain linker is needed.** `_gl` exists to share one `client_id` between two domains
that *both* run GA4. Since the payment page runs no merchant tag, there is no second domain to
link — which is one more reason not to put one there.

## Recommended: Fire `purchase` On The Merchant's Own Success Page

Correct attribution, no Portaly work, ships today.

```js
// merchant.example/success?order=order_001
// The merchant controls this URL, so put your own order id on it when creating the
// session — Portaly redirects to successRedirectUrl verbatim and appends nothing.
gtag('event', 'purchase', {
  transaction_id: orderNumber, // your merchantOrderNumber
  value: amount,
  currency: 'TWD',
  items: [{ item_id: planId, item_name: planName, price: amount, quantity: 1 }],
})
```

GA4 attaches the session's campaign automatically — do not try to set the source by hand.

Read `amount` from your own record of the order, never from the query string: anything on the
URL is buyer-editable.

For Meta, the standard `fbq('track', 'Purchase', …)` on the same page, with `eventID` set to
the Portaly `sessionId` so it deduplicates against the server-side event below.

## Backstop: Fire From The Signed Callback

A success page only fires for buyers who actually come back to it. The signed callback fires
regardless, and is the **only** source for renewals and refunds.

Send server-side on `creator_subscription.checkout.completed`, and on
`creator_subscription.payment.succeeded` / `.refunded` for the recurring lifecycle:

- **Meta Conversions API** — the callback carries `customerEmail`, so a hashed-email match key
  is available with no extra plumbing. Use `event_id: sessionId` to deduplicate against the
  browser pixel. This is the higher-value half of the work: renewals and refunds are invisible
  to the pixel, and email is a strong match key.
- **GA4 Measurement Protocol** — needs a `client_id` to join the buyer's existing session.
  Without one the hit lands as `(not set)` and contributes nothing to attribution, so this is
  only worth wiring together with the next section.

Deduplicate with the idempotency keys the callback contract already specifies: `sessionId` for
checkout, `paymentId` for renewals, `orderId` for refunds.

## Carrying `client_id` / `_fbp` / `_fbc` Through Checkout

Only needed for the GA4 Measurement Protocol path, or for Meta matching stronger than email
alone.

Read them server-side *before* redirecting and pass them in `metadata` on the checkout session.
Portaly echoes `metadata` back in the signed callback:

```js
// merchant side, before creating the checkout session
const clientId = /_ga=GA\d\.\d\.(\d+\.\d+)/.exec(document.cookie)?.[1] ?? ''
const fbp = /_fbp=(fb\.\d\.\d+\.\d+)/.exec(document.cookie)?.[1] ?? ''
const fbc = /_fbc=(fb\.\d\.\d+\.\w+)/.exec(document.cookie)?.[1] ?? ''

// → POST /api/creator-subscription/checkout-sessions
//   { planId, metadata: { clientId, fbp, fbc } }
```

⚠️ **Runtime limitation.** Custom `metadata` keys outside the committed callback schema are
only verifiable by the Node and WebCrypto adapters — the Python and Go v1 adapters fail closed
on them (see `callback-signature-v1.md`). A Python or Go receiver cannot use this route today:
send those merchants down the success-page route, or have them verify on a Node endpoint.

## For Attribution The Merchant Can Reconcile, Skip GA4's Session Entirely

Session stitching is best-effort, and the breakages above are not fixable from Portaly's side.
For a number the merchant can audit, have them capture `utm_*` / `gclid` / `fbclid` into their
own cookie or database on **first landing**, then carry it through `metadata` to the callback.
That figure is independent of how GA4 decides to slice sessions — and when the two disagree,
they know which one to trust.

In practice, recommend both: GA4's session stitching for reporting (good enough, zero cost),
and the merchant's own captured source for revenue attribution.
