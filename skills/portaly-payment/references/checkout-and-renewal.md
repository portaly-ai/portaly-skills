# Checkout And Renewal

This reference is supplemental background for third-party integrators. It explains the hosted checkout lifecycle at a high level.

## Use This Reference For

- understanding the overall checkout flow
- explaining what happens after the buyer pays
- clarifying how renewal works
- clarifying how recurring subscriptions are canceled or resumed

## Checkout Flow

1. The merchant backend creates a checkout session with the Portaly Vibe Payment API.
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
- Later renewals are charged by Portaly without requiring the buyer to repeat the full checkout flow.
- On renewal, Portaly updates its own subscription and payment records internally.
- If the merchant needs to reflect renewal results, use Portaly callbacks and/or session or payment reconciliation flows defined by the integration.
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
- The test mode flow is identical to live — same endpoints, same hosted checkout, same callback verification — only the payment provider and order storage differ

## Recommended Third-Party Responsibility

- create the checkout session
- redirect the buyer to Portaly Vibe checkout
- verify the signed callback
- persist `sessionId`, `subscriptionId` if present, merchant order reference, payment status, and callback payload
- use reconciliation queries when callback delivery or buyer state is uncertain

## Subscriber Self-Service Portal

- Merchants can let subscribers manage their own subscriptions without building custom UI.
- The merchant backend creates a **portal session** by calling `POST /api/creator-subscription/portal-sessions` on `https://payment.portaly.cc` with the API key.
- Portaly returns a `portalUrl` containing a short-lived token (30-minute TTL).
- The merchant redirects the subscriber (who is already authenticated on the merchant's site) to `portalUrl`.
- The subscriber can view, cancel, and resume subscriptions, and view payment history.
- No additional login is required — the portal session token serves as the credential.
- After the subscriber finishes, they click "Back" to return to the merchant's `returnUrl`.
- For full API details, see `Portal Session (Subscriber Self-Service)` in `references/api-contract.md`.

## Scope Note

This document intentionally omits provider-specific payment steps and Portaly internal write details. For the external integration contract, use `references/api-contract.md`.
