# Promotion API contract

Two promotion endpoints, one field on the plan, and one extra field on checkout-session creation. Everything else about buyer promotion is owned by Portaly.

Host: `https://portaly.ai` (overridable via `PORTALY_API_HOST` for self-hosted backends). Auth: `Authorization: Bearer {PORTALY_API_KEY}`.

---

## GET /api/creator-subscription/promotion

Read the product's current promotion settings, the limits that apply, and which of its plans are covered. Safe to call at any time; changes nothing.

Promotion is configured **per product, not per plan**: one switch and one commission rate cover every eligible plan the merchant has. A creator with ten plans pays the same rate on all ten.

Response:

```json
{
  "data": {
    "enabled": false,
    "commissionRate": null,
    "serviceFeeRate": 1,
    "minCommissionRate": 10,
    "maxCommissionRate": 100,
    "defaultCommissionRate": 15,
    "plans": [
      {
        "planId": "plan_123",
        "name": "AgentSkill 入門",
        "amount": 1500,
        "currency": "TWD",
        "promotionUrl": "https://merchant.example/products/agentskill",
        "included": true,
        "commissionRate": 15,
        "commissionAmount": 225,
        "excludedReason": null,
        "excludedMessage": null
      },
      {
        "planId": "plan_456",
        "name": "月費會員",
        "amount": 300,
        "currency": "TWD",
        "promotionUrl": null,
        "included": false,
        "commissionRate": 15,
        "commissionAmount": 45,
        "excludedReason": "PROMOTION_BILLING_PERIOD_UNSUPPORTED",
        "excludedMessage": "Buyer promotion only works on one-time payment plans. …"
      }
    ]
  }
}
```

- `commissionRate` at the top level is `null` until promotion has been configured once.
- `plans[].included` is the answer to "will promoters actually see this plan" — the switch **and** the plan qualifying. A plan can be excluded while the switch is on.
- `plans[].excludedMessage` is written for a non-technical creator and is safe to show verbatim; the `excludedReason` code is for your branching.
- `plans[].commissionAmount` is what a promoter earns per sale of that plan, already worked out — use it instead of doing the arithmetic yourself.
- `serviceFeeRate` is the platform fee taken from the creator's side, as a percentage.
- **Read `minCommissionRate` / `maxCommissionRate` / `defaultCommissionRate` from here rather than hardcoding them.** They are shared with the rest of Portaly's profit-sharing rules and can change.

---

## PUT /api/creator-subscription/promotion

Turn promotion on or off for the whole product and set the one rate. Requires a **full-scope** key; integration-scope keys are refused.

Request:

```json
{
  "enabled": true,
  "commissionRate": 20
}
```

- `enabled` (required): `false` always succeeds, even when nothing qualifies any more — a creator must never be stuck unable to switch it off.
- `commissionRate` (optional): whole-number percentage, applied to every plan. Omit to keep the current rate, or to accept `defaultCommissionRate` on the first enable.

Response: the same shape as `GET`. **Read `plans[]` back and tell the creator which plans were included and which were not** — enabling succeeds as long as *one* plan qualifies, so a silent partial result is the normal case, not an edge case.

There is no per-plan rate. If a creator asks for one, say it is not available today rather than implying it is coming.

### Errors

| Status | `code` | Meaning | What to do |
|---|---|---|---|
| 400 | `PROMOTION_INVALID_REQUEST` | `enabled` missing, or `commissionRate` not a whole number inside the allowed range | Fix the payload; read the range from `GET` |
| 403 | `KEY_SCOPE_FORBIDDEN` | Integration-scope key | Use the merchant's own full-access key |
| 403 | `PROMOTION_LOCALE_UNSUPPORTED` | Not a Taiwan-based Portaly account | **Stop.** Not fixable in code — promoters are paid into Taiwanese bank accounts and need a Taiwanese ID for tax. Point them at Portaly support |
| 422 | `PROMOTION_NO_ELIGIBLE_PLAN` | No plan under this product qualifies | Create an active, one-time, fixed-price plan that charges money, then try again |
| 422 | `PROMOTION_BILLING_PERIOD_UNSUPPORTED` | The only plan is a subscription | Offer to create a one-time plan instead |
| 422 | `PROMOTION_PRICING_TYPE_UNSUPPORTED` | The only plan uses dynamic pricing | Offer to split it into fixed-price one-time plans |
| 422 | `PROMOTION_FREE_PLAN_UNSUPPORTED` | The only plan charges nothing | A free plan earns a promoter nothing |
| 422 | `PROMOTION_PLAN_INACTIVE` | The only plan is not active | Activate the plan first |

The four plan-specific 422s are returned when the merchant has exactly one plan, so the message can name the actual blocker. With several plans and none eligible you get `PROMOTION_NO_ELIGIBLE_PLAN`; call `GET` and read `plans[].excludedMessage` to explain each one.

Every message is written for a non-technical creator; it is safe to show verbatim. The `code` is for your branching, not for them.

---

## PUT /api/creator-subscription/plans/{planId} — `promotionUrl`

The landing page differs per plan, so it lives on the plan rather than in the promotion settings:

```json
{ "promotionUrl": "https://merchant.example/products/agentskill" }
```

- Must be a valid absolute URL. This is where a referral link lands, so it should be the page on the creator's own site that sells **this** plan.
- Accepted on plan create as well — set it there and you save a round trip per plan.
- One call per plan. With several plans, derive the whole plan → page mapping from the creator's project (their checkout code already picks a `planId` per product, so it already knows which page each plan belongs to), confirm the table once, then send the calls. Do not ask about them one at a time.
- If it is unset, Portaly falls back to the plan's `externalInformationUrl`, then to the merchant's configured site URL. A plan with no usable landing page anywhere is reported as `PROMOTION_URL_REQUIRED` in `GET .../promotion` and stays excluded.
- Setting it does **not** turn promotion on. The switch is `PUT /promotion`.

---

## POST /api/creator-subscription/checkout-sessions — `profitSharingId`

One optional extra field on the existing create-session call:

```json
{
  "planId": "plan_123",
  "successRedirectUrl": "https://merchant.example/thanks",
  "profitSharingId": "a1b2c3d4"
}
```

- The value is the `ps` query parameter from the referral link, which **your server** reads from its own cookie.
- Only accepted on this API-key-authenticated call. Any request the buyer's browser can make must never carry it, or anyone could claim someone else's sale.
- Max 64 characters.
- An unknown, disabled or mismatched value is **silently ignored** and the session is still created. There is no error to handle: the buyer came to buy, and losing the attribution is better than losing the sale.

Portaly validates that the link belongs to this exact plan and merchant, and freezes the commission rate onto the session at that moment — a rate change afterwards does not rewrite an already-quoted sale.

---

## What has no API

Deliberately, for now:

- **A different commission rate per plan.** One rate covers the whole product. Do not build a workaround.
- **Issuing a promoter's link.** Portaly does it on its own purchase-complete page, keyed to the buyer's order. There is no endpoint for a creator to mint one.
- **Promoter earnings.** They live at `https://rewards.portaly.cc`, which is also where withdrawals happen.

If you find yourself wanting to build either, that is the signal to stop and check `https://portaly.ai/openapi.json` rather than to invent a path.
