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
// Put your own order id on the URL when you create the session. Portaly appends
// parameters of its own, but which ones appear varies by payment path — do not
// depend on them being there.
gtag('event', 'purchase', {
  transaction_id: orderNumber, // your merchantOrderNumber -- required, and never ''
  value: amount,
  currency: 'TWD',
  items: [{ item_id: planId, item_name: planName, price: amount, quantity: 1 }],
})
```

GA4 attaches the session's campaign automatically — do not try to set the source by hand.

For Meta, the standard `fbq('track', 'Purchase', …)` on the same page, with `eventID` set to
the Portaly `sessionId`, so it deduplicates against the server-side checkout event below.

### Two rules for this page

**Look the order up by an id the merchant put on the URL itself, and take every other value from
that record.** Portaly does append parameters of its own to the return URL, but which ones appear
varies by payment path, so none of them is a contract — including `sessionId`. Put your own order
id on `successRedirectUrl` when you create the session, read that back here, and get `sessionId`,
the amount and everything else from the record it identifies. Never read the amount off the URL
in any case — it is buyer-editable.

**Treat this page as the accurate path, not the complete one.** Reaching it requires the buyer to
click through from Portaly after paying; it is not an automatic redirect, so anyone who closes
the tab never fires the event. Always pair it with the callback below, and never derive
entitlement or payment state from it — the signed callback is the source of truth.

## Backstop: Fire From The Signed Callback

A success page only fires for buyers who actually come back to it. The signed callback fires
regardless, and is the **only** source for renewals and refunds.

Send server-side on `creator_subscription.checkout.completed`, and on
`creator_subscription.payment.succeeded` / `.refunded` for the recurring lifecycle:

- **Meta Conversions API** — the callback carries `customerEmail`, so no extra plumbing is
  needed to get a match key. **Hash it first:** Meta's `em` field takes a SHA-256 of the
  trimmed, lowercased address — never send the plaintext email
  ([customer information parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)). This is the higher-value half
  of the work, because renewals and refunds are invisible to the pixel.
- **GA4 Measurement Protocol** — an MP hit only joins the buyer's existing session if it carries
  that session's identifiers and arrives inside Google's ingestion window. Both are Google's
  contract, not Portaly's, and the window differs by use case — **read Google's current
  Measurement Protocol docs rather than hardcoding a number from memory.** A hit that misses
  still returns 2xx (MP never reports errors), so the failure is silent: it simply lands as
  `(not set) / (not set)`. Validate payloads against
  `https://www.google-analytics.com/debug/mp/collect`, which returns structured
  `validationMessages` — but note it does **not** check `api_secret` or `measurement_id`, so a
  green result there is not proof the hit landed.
  **Renewals cannot join a session at all** — a charge a month later is outside any ingestion
  window and there is no session to rejoin. Send those as standalone `purchase` events and
  expect direct attribution. That is correct, not a bug: recurring revenue has no new campaign
  touch.

### Use the right key for the right event — they are not interchangeable

Two different mechanisms, and conflating them silently drops data.

**Your own idempotency** is `event` **plus** a value that is unique per *occurrence* and stays
byte-identical when the same event is redelivered (a retry replays the stored payload and only
re-signs the transport headers, so never build the key from `x-portaly-timestamp`):

| Event | Key |
|---|---|
| `checkout.completed` / `.failed` | `event + sessionId` |
| `payment.succeeded` | `event + subscriptionId + chargedAt` |
| `payment.failed` | `event + subscriptionId + failedAt` |
| `payment.refunded` / `.refund_failed` | `event + orderId` |

The `event` prefix is not optional — `checkout.completed` and `checkout.failed` share a
`sessionId`, and `payment.refunded` and `.refund_failed` share an `orderId`, so dropping it makes
each pair cancel the other out.

⚠️ **Do not key renewals on `paymentId` or `paymentReference`.** `payment.succeeded` does carry
a usable `paymentId`, but `payment.failed` carries none at all, and `paymentReference` is an
**empty string** on effectively every 91APP failure — the provider payload is absent on the failure paths, and the serializer falls back to
`''`. Either choice collapses every failed renewal, across every subscriber, onto a single key,
so only the first is ever processed and dunning silently stops. `chargedAt` / `failedAt` are
per-attempt timestamps and do not have this problem. Do **not** substitute `failureCount`: it
resets to zero on a successful charge, so a later failure collides with an earlier cycle.

**Meta's `event_id`** is a different thing: it lets Meta recognise the server event and the
*browser* event as one purchase. That browser event exists only for the initial checkout, so use
`sessionId` there, matching the `eventID` on the pixel. It is not a substitute for your own
idempotency — keep the receiver idempotent as above.

⚠️ **Give each charge its own `event_id`.** Meta's guidance is a unique `event_id` per event
*instance*; two purchases sent under one id are reported as one. This contract holds
`subscriptionId === checkoutSessionId === sessionId`, so reusing `sessionId` would hand every
renewal on a subscription the same value. Use `paymentId` on `payment.succeeded`.

⚠️ **Do not use `merchantOrderNumber` as the GA4 `transaction_id` on renewals.** The field *is*
present on renewal payloads — that is the trap. It is the value frozen at checkout, so every
renewal repeats it, and "Google Analytics deduplicates purchase events with the same transaction
ID" ([GA4: minimize duplicate key events](https://support.google.com/analytics/answer/12313109)),
so month two onward would be discarded. Build a per-charge id instead. For the same reason **never send an empty
`transaction_id`** — Google's own warning is that it "will deduplicate all purchase events that
have `transaction_id=""`" (same page).
Refund payloads additionally carry `orderMerchantOrderNumber` for the order, alongside the
subscription-level `merchantOrderNumber`; the two can differ.

## Carrying Ad Identifiers To The Callback: Use Your Own Store

The server-side events above need identifiers that live in the buyer's browser — GA4's
`client_id` and `session_id`, Meta's `_fbp` and `_fbc` — plus whatever campaign data the merchant
wants to reconcile against (`utm_*`, `gclid`, `fbclid`).

**Do not route these through Portaly, and do not parse GA4's cookies by hand.** Keep them on the
merchant's own side:

1. On **first landing**, capture `utm_*` / `gclid` / `fbclid` into the merchant's own cookie or
   database — this is where campaign data actually originates.
2. When creating the checkout session, collect the analytics identifiers in the browser and post
   them to the merchant's **own** backend, then store them against the merchant's own order
   record keyed by the **`sessionId` returned by the create-session call**. For GA4, read them
   through the official accessor rather than the cookie:
   `gtag('get', '<measurement id>', 'client_id', cb)` and the same for `'session_id'`.
   Meta's `_fbp` / `_fbc` are ordinary first-party cookies and can be read directly.
3. When the signed callback arrives, look the record up by `sessionId` and fire the server-side
   events with the identifiers from the merchant's own database.

**Why `sessionId` and not `merchantOrderNumber`:** `sessionId` is returned when the session is
created and is present on `checkout.completed` **and** `checkout.failed`; on renewal, refund and
lifecycle events the same value arrives as `subscriptionId` / `checkoutSessionId`, because
`subscriptionId === checkoutSessionId === sessionId`. `merchantOrderNumber` is optional, is
**absent entirely from `checkout.failed`**, and is frozen at checkout — keying on it silently
collapses every order from a merchant who does not send one.

⚠️ **Never parse `_ga_<container-id>` with a hand-written regex.** Google does not document that
cookie's value format and changed it without notice in 2025; the container id is also the
measurement id *minus* its `G-` prefix, which is easy to get wrong. A regex that stops matching
fails silently — empty identifier, 2xx response, `(not set)` attribution — which is the exact
failure this section exists to prevent. Use `gtag('get', …)`.

### Why not `metadata`?

`metadata` *is* echoed back in the signed callback, so it looks like the natural carrier — but
the v1 signature sorts keys with JavaScript `localeCompare`, which the Python and Go adapters
cannot reproduce for arbitrary keys. They therefore accept only keys whose ordering is committed
in the golden vectors (`_SUPPORTED_KEY_ORDER` in `scripts/sign_callback.py`, `supportedKeyOrder`
in `scripts/verify_callback.go` — the two lists are identical) and raise on anything else.

None of `clientId`, `client_id`, `fbp`, `fbc`, `session_id`, `utm_source`, `gclid` or `fbclid` is
on that list. Put one in `metadata` and a Python or Go receiver starts **401-ing that
subscription's callbacks** — and not only at checkout: `metadata` is copied onto the subscription
at first charge and replayed on every renewal, refund and lifecycle event, so order
reconciliation stops for the life of the subscription.

The list is wider than the callback schema, though: `campaign`, `source`, `cart_id`, `productId`,
`productName` and `code` are all on it, so a merchant who only wants a coarse campaign tag can
safely send `metadata: { campaign, source }`. Two caveats: check the constant before assuming any
other key is safe, and note the whitelist governs **keys, not values** — a float value is
rejected even under an accepted key, so keep metadata values as strings.

⚠️ And independently of `metadata`: those two adapters cannot verify `checkout.failed` or either
refund event at all, because those payloads carry fields that are not on the list and the bundled
vectors do not cover them. The conformance run passes and production breaks later. See
`callback-signature-v1.md` before choosing Python or Go.

## Recommend Both Layers

GA4's session stitching for reporting — good enough and zero cost. The merchant's own captured
source, joined on the callback, for revenue attribution they can audit. When the two disagree,
they know which one to trust.
