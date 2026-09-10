# Checkout And Renewal

This reference is supplemental background for third-party integrators. It explains the hosted checkout lifecycle at a high level.

## Use This Reference For

- understanding the overall checkout flow
- explaining what happens after the buyer pays
- clarifying how renewal works
- clarifying how recurring subscriptions are canceled or resumed

## Checkout Flow

1. The merchant backend creates a checkout session with the Portaly Payment API.
2. Portaly returns a `checkoutUrl` and `sessionId`.
3. The merchant redirects the buyer to `checkoutUrl`.
4. The buyer completes Portaly hosted checkout.
5. After payment is finalized, Portaly sends the signed callback if `callbackUrl` was provided.
6. The merchant verifies the callback signature and updates its own order or subscription state.

Current identifier contract:

- `subscriptionId === checkoutSessionId === sessionId`
- after a recurring checkout succeeds, the merchant can persist `sessionId` as the recurring subscription identifier

## Important Integration Rules

- Treat `checkoutUrl` as the only buyer entry point for hosted checkout.
- Do not treat the browser redirect alone as the source of truth.
- Use the signed callback or session query result as the final payment status.
- Use `GET /api/creator-subscription/checkout-sessions/{sessionId}` for reconciliation if needed.

## What Portaly Handles

In the hosted flow, Portaly handles:

- buyer checkout experience
- required payment steps such as email verification
- payment completion
- subscription activation after the first successful payment
- recurring charge setup for future renewals

## Renewal Behavior

- If the first checkout succeeds, Portaly keeps the payment method needed for future recurring charges.
- Later renewals are charged by Portaly (internal auto-billing) without requiring the buyer to repeat the full checkout flow. Renewals run on an hourly schedule once `nextBillingAt` is due.
- On renewal, Portaly updates its own subscription and payment records internally **and dispatches a signed callback for each renewal outcome**:
  - `creator_subscription.payment.succeeded` on a successful renewal charge (carries `nextBillingAt`, `paymentReference`, `amount`).
  - `creator_subscription.payment.failed` on a failed renewal charge (carries `failureCount`, `failureReason`, `nextRetryAt`, `willCancel`). Sent on every failed attempt; after 3 consecutive failures the subscription is canceled and `creator_subscription.canceled` is also sent.
- These renewal callbacks go to the subscription's `subscriptionCallbackUrl` if set, otherwise to the checkout `callbackUrl`. See `api-contract.md` → Signed Callback for payloads.
- Merchants that prefer pull-based reconciliation can instead poll `GET /api/creator-subscription/subscriptions/{id}` and watch `status`, `nextBillingAt`, `lastChargedAt`, and `failureCount`.
- **Dynamic pricing plans** (`pricingType: 'dynamic'`) are always `one-time` and do not auto-renew. Each payment requires a new checkout session with an explicit `amount`.

## Cancel And Resume Behavior

- canceling a recurring subscription means stopping the next recurring charge
- canceling is not a refund flow
- the current paid period remains active until the subscription reaches `cancelEffectiveAt`
- resuming a subscription clears the pending end-of-period cancellation before the subscription becomes fully `canceled`
- `one-time` plans do not support cancel or resume
- merchant systems should call:
  - `POST /api/creator-subscription/subscriptions/{subscriptionId}/cancel`
  - `POST /api/creator-subscription/subscriptions/{subscriptionId}/resume`

## Test Mode (Sandbox)

- Each API key is created with a fixed mode: `live` or `test`
- Test mode (`pcs_test_` keys) uses TapPay sandbox and stores orders in a separate `sandboxOrders` collection
- Checkout sessions, subscriptions, and callbacks created with a test key carry `mode: "test"`
- Merchants should use test keys during integration development and switch to live keys for production
- The API you call is identical: same endpoints, same request bodies, same callback signature scheme and verification. What happens behind them is not, in two separate ways.
- **The buyer's checkout differs, because the provider is chosen by mode.** A test session charges through TapPay on the checkout page itself; a live session hands the buyer off to 91APP and finalizes on its callback. Two consequences:
  - The live redirect-and-return path is never exercised by a test run, however thorough that run was.
  - `paymentMethod` in the callback is `tappay` in test and `91app` in live. It is a field you are told to persist, so branch on it defensively rather than pinning the value you saw while testing.
- **Everything after the first charge is skipped in test mode:**
  - **No renewal.** The recurring job skips test subscriptions, so the second billing cycle never happens and no second `creator_subscription.payment.succeeded` is ever dispatched. Test a renewal handler by replaying a payload, not by waiting.
  - **No invoice.** Test payments queue no invoice task — including the first charge, so a test purchase never produces one at all.
  - **No money movement.** `sandboxOrders` is off the settlement chain: nothing reaches revenue, balance or payouts, and no affiliate or promotion commission is generated.
  - **No review invite.** Test orders are deliberately unreviewable.
- Test orders are not invisible, though: `https://portaly.cc/admin/creator-subscription` lists them and can refund them once the orders table's **Live/Test** toggle is set to **Test**. Point the merchant there rather than at their revenue view — and not at a "test tab", which does not exist; the page's tabs are Subscriptions and Orders, and the mode toggle sits in the table's toolbar.

## Recommended Third-Party Responsibility

- create the checkout session
- redirect the buyer to Portaly checkout
- verify the signed callback
- persist `sessionId`, `subscriptionId` if present, merchant order reference, payment status, and callback payload
- use reconciliation queries when callback delivery or buyer state is uncertain

## Subscriber Self-Service Portal

- Merchants can let subscribers manage their own subscriptions without building custom UI.
- The merchant backend creates a **portal session** by calling `POST /api/creator-subscription/portal-sessions` on `https://portaly.ai` with the API key.
- Portaly returns a `portalUrl` containing a short-lived token (30-minute TTL).
- The merchant redirects the subscriber (who is already authenticated on the merchant's site) to `portalUrl`.
- The subscriber can view, cancel, and resume subscriptions, and view payment history.
- No additional login is required — the portal session token serves as the credential.
- After the subscriber finishes, they click "Back" to return to the merchant's `returnUrl`.
- For full API details, see `Portal Session (Subscriber Self-Service)` in `references/api-contract.md`.

## Scope Note

This document intentionally omits provider-specific payment steps and Portaly internal write details. For the external integration contract, use `references/api-contract.md`.
