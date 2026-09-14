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

GA4 → Admin → Data collection and modification → Data streams → Web → (the stream) →
Configure tag settings → Show all → List unwanted referrals → add `portaly.ai`.

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
on `portaly.ai`, so the `client_id` is preserved for free. GA4's default `cookie_domain: 'auto'`
writes it at the registrable domain, so subdomains normally share it — what does break the
session is returning to a *different* registrable domain than the one the buyer started on.

**No cross-domain linker is needed.** `_gl` exists to share one `client_id` between two domains
that *both* run GA4. Since the payment page runs no merchant tag, there is no second domain to
link — which is one more reason not to put one there.

## Fire `purchase` On The Merchant's Own Success Page

Correct attribution, and no Portaly-side work — but read the coverage caveat below before
treating it as the whole solution.

```js
// merchant.example/success?order=order_001
// Put your own order id on the URL when you create the session. Portaly does append
// sessionId / paymentProvider / paymentStatus on the 91APP return path, but not on
// every path (see below), so do not depend on them being there.
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
the Portaly `sessionId`, so it deduplicates against the server-side checkout event below. Read
that `sessionId` from the merchant's **own order record** (it is persisted at checkout), not from
the query string — the TapPay path appends nothing, so a query-string read yields `undefined` in
test while appearing to work in live.

### The success page does not always get reached

On the subscription checkout this is weaker than it looks, and the two payment paths differ:

- **91APP (live)** returns the buyer to a Portaly page that renders the merchant link as
  something the buyer has to **click** — it is not an automatic redirect. Anyone who closes the
  tab there never reaches the success page. That return URL does carry `sessionId`,
  `paymentProvider` and `paymentStatus` appended by Portaly, plus the query parameters 91APP
  sent back.
- **TapPay (test, and same-page completion)** shows a success card linking to the merchant's
  unmodified `successRedirectUrl` — also a click, and with nothing appended.

So treat the success page as the accurate-attribution path, not the complete one, and always
pair it with the callback below. Never derive entitlement or payment state from it: the signed
callback is the source of truth.

## Backstop: Fire From The Signed Callback

A success page only fires for buyers who actually come back to it. The signed callback fires
regardless, and is the **only** source for renewals and refunds.

Send server-side on `creator_subscription.checkout.completed`, and on
`creator_subscription.payment.succeeded` / `.refunded` for the recurring lifecycle:

- **Meta Conversions API** — the callback carries `customerEmail`, so no extra plumbing is
  needed to get a match key. **Hash it first:** Meta's `em` field takes a SHA-256 of the
  trimmed, lowercased address — never send the plaintext email. This is the higher-value half
  of the work, because renewals and refunds are invisible to the pixel.
- **GA4 Measurement Protocol** — joining an MP hit to the buyer's existing session needs
  **both** `client_id` (from the `_ga` cookie) **and** `session_id` (from the
  `_ga_<MEASUREMENT_ID>` cookie), delivered within **48 hours** of the original event. Miss
  either and the hit still returns 2xx — MP never reports errors, so use the `debug/mp/collect`
  endpoint to check — but lands as `(not set) / (not set)` and adds nothing to attribution.
  **Renewals can never satisfy this**: a charge a month later is far outside the 48-hour window
  and there is no session to rejoin, so send those as standalone `purchase` events and expect
  them to be attributed as direct. That is correct, not a bug — recurring revenue has no new
  campaign touch.

### Use the right key for the right event — they are not interchangeable

Two different mechanisms, and conflating them silently drops data.

**Your own idempotency**, per the callback contract, is always `event` **plus** an event-specific
id: `event + sessionId` for checkout, `event + paymentId` **or `paymentReference`** for renewals,
`event + orderId` for refunds. The `event` prefix is not optional — `checkout.completed` and
`checkout.failed` share a `sessionId`, and `payment.refunded` and `.refund_failed` share an
`orderId`, so dropping it makes each pair cancel the other out.

⚠️ **`payment.failed` carries no `paymentId`** — only `payment.succeeded` does, and even there it
can be an empty string. Fall back to `paymentReference`, which both carry. Keying failures on a
missing `paymentId` collapses every failed renewal across every subscriber onto one key
(`…payment.failed:undefined`), so only the first is ever processed and dunning silently stops.

**Meta's `event_id`** is a different thing: it deduplicates a server event against the *browser*
event for the same purchase (a 48-hour window), which exists only for the initial checkout. Use
`sessionId` there, matching the `eventID` on the browser pixel. Note this is a guarantee about
browser-versus-server, not about two server deliveries — so the receiver still needs its own
idempotency, as above.

⚠️ **Do not reuse `sessionId` as the `event_id` for renewals.** This contract holds
`subscriptionId === checkoutSessionId === sessionId`, so every renewal on a subscription carries
the *same* value — Meta would treat the second month onward as duplicates and discard them, and
renewals are exactly the revenue this section exists to capture. Use `paymentId` for renewal
events and `orderId` for refunds. Renewal payloads also carry **no `sessionId` key at all** (they
carry `subscriptionId`), so reading `sessionId` off one yields `undefined`.

⚠️ **Do not use `merchantOrderNumber` as the GA4 `transaction_id` on renewals.** The field *is*
present on renewal payloads — that is the trap. It is the value frozen at checkout, so every
renewal repeats it, and GA4 deduplicates `purchase` events by `transaction_id`: month two onward
would be discarded. Build a per-charge id instead (`paymentId` / `paymentReference`, or your own
id keyed off them). Refund payloads additionally carry `orderMerchantOrderNumber` for the order,
alongside the subscription-level `merchantOrderNumber` — the two can differ.

## Carrying Ad Identifiers To The Callback: Use Your Own Store

The server-side events above need identifiers that live in the buyer's browser — `client_id`,
`session_id`, `_fbp`, `_fbc` — plus whatever campaign data the merchant wants to reconcile
against (`utm_*`, `gclid`, `fbclid`).

**Do not route these through Portaly.** Keep them on the merchant's own side:

1. On **first landing**, capture `utm_*` / `gclid` / `fbclid` into the merchant's own cookie or
   database — this is where campaign data actually originates.
2. When creating the checkout session, read the ad cookies from the **incoming request's
   `Cookie` header in the merchant's backend** (never `document.cookie` — the checkout-session
   call carries the API key and must not run in the browser) and store them against the
   merchant's own order record, keyed by the `merchantOrderNumber` they are about to send.
3. When the signed callback arrives, look the record up by `merchantOrderNumber` (present on
   every event) or by the `sessionId` persisted at checkout, and fire the server-side events
   with the identifiers from the merchant's own database.

```js
// merchant's backend, handling the request that starts checkout
const cookie = req.headers.cookie ?? ''
const pick = (re) => re.exec(cookie)?.[1] ?? ''
await db.adContext.put(merchantOrderNumber, {
  clientId: pick(/(?:^|;\s*)_ga=GA\d\.\d\.(\d+\.\d+)/),
  sessionId: pick(/(?:^|;\s*)_ga_G-XXXXXXX=GS\d\.\d\.(\d+)/), // your measurement id
  fbp: pick(/(?:^|;\s*)_fbp=(fb\.\d\.\d+\.\d+)/),
  fbc: pick(/(?:^|;\s*)_fbc=(fb\.\d\.\d+\.[\w-]+)/), // an fbclid can contain '-'
  utm: capturedOnFirstLanding,
})
// → POST /api/creator-subscription/checkout-sessions with that same merchantOrderNumber
```

This works on **every runtime**, survives renewals and refunds (the record outlives the
checkout), and keeps ad identifiers out of a payment provider's system.

### Why not `metadata`?

`metadata` *is* echoed back in the signed callback, so it looks like the natural carrier — but
the v1 signature sorts keys with JavaScript `localeCompare`, which the Python and Go adapters
cannot reproduce for arbitrary keys. They therefore accept only keys whose ordering is committed
in the golden vectors (`_SUPPORTED_KEY_ORDER` in `scripts/sign_callback.py`, `supportedKeyOrder`
in `scripts/verify_callback.go`) and raise on anything else.

None of `clientId`, `fbp`, `fbc`, `session_id`, `utm_source`, `gclid` or `fbclid` is on that
list. Put one in `metadata` and a previously working Python or Go receiver starts **401-ing the
entire `checkout.completed` callback** — order reconciliation stops, not just the tracking.

The list is not the same as the callback schema, and it is wider than it looks: `campaign`,
`source`, `cart_id`, `productId`, `productName` and `code` are all on it, so a merchant who only
wants a coarse campaign tag can safely send `metadata: { campaign, source }`. Check the constant
before assuming a key is safe, and prefer the merchant's own store for anything else.

## Recommend Both Layers

GA4's session stitching for reporting — good enough and zero cost. The merchant's own captured
source, joined on the callback, for revenue attribution they can audit. When the two disagree,
they know which one to trust.
