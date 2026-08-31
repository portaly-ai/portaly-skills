# Promotion API contract

Two endpoints, plus one extra field on checkout-session creation. Everything else about buyer promotion is owned by Portaly.

Host: `https://portaly.ai` (overridable via `PORTALY_API_HOST` for self-hosted backends). Auth: `Authorization: Bearer {PORTALY_API_KEY}`.

---

## GET /api/creator-subscription/plans/{planId}/promotion

Read the current promotion settings and the limits that apply. Safe to call at any time; changes nothing.

Response:

```json
{
  "data": {
    "planId": "plan_123",
    "enabled": false,
    "commissionRate": null,
    "promotionUrl": null,
    "serviceFeeRate": 1,
    "minCommissionRate": 10,
    "maxCommissionRate": 100,
    "defaultCommissionRate": 15
  }
}
```

- `commissionRate` / `promotionUrl` are `null` until promotion has been configured once.
- `serviceFeeRate` is the platform fee taken from the creator's side, as a percentage.
- **Read `minCommissionRate` / `maxCommissionRate` / `defaultCommissionRate` from here rather than hardcoding them.** They are shared with the rest of Portaly's profit-sharing rules and can change.

`404` when the plan does not exist or belongs to another merchant — the two are deliberately indistinguishable.

---

## PUT /api/creator-subscription/plans/{planId}/promotion

Turn promotion on or off and set the rate. Requires a **full-scope** key; integration-scope keys are refused.

Request:

```json
{
  "enabled": true,
  "commissionRate": 20,
  "promotionUrl": "https://merchant.example/products/course"
}
```

- `enabled` (required): `false` always succeeds, even for a plan that no longer qualifies — a creator must never be stuck unable to switch it off.
- `commissionRate` (optional): whole-number percentage. Omit to keep the current rate, or to accept `defaultCommissionRate` on the first enable.
- `promotionUrl` (optional after the first time): the page on the creator's own site that referral links open. Required the first time promotion is enabled, because a referral link with nowhere to go is not a link.

Response: the same shape as `GET`.

### Errors

| Status | `code` | Meaning | What to do |
|---|---|---|---|
| 400 | `PROMOTION_INVALID_REQUEST` | `enabled` missing, or `commissionRate` not a whole number inside the allowed range | Fix the payload; read the range from `GET` |
| 400 | `PROMOTION_URL_REQUIRED` | First enable without a `promotionUrl` | Ask the creator which page referral links should open |
| 403 | `KEY_SCOPE_FORBIDDEN` | Integration-scope key | Use the merchant's own full-access key |
| 403 | `PROMOTION_LOCALE_UNSUPPORTED` | Not a Taiwan-based Portaly account | **Stop.** Not fixable in code — promoters are paid into Taiwanese bank accounts and need a Taiwanese ID for tax. Point them at Portaly support |
| 404 | — | Plan not found, or not this merchant's | Check the plan id |
| 422 | `PROMOTION_BILLING_PERIOD_UNSUPPORTED` | Subscription plan | Offer to create a one-time plan instead |
| 422 | `PROMOTION_PRICING_TYPE_UNSUPPORTED` | Dynamic-pricing plan | Offer to split it into fixed-price one-time plans |
| 422 | `PROMOTION_FREE_PLAN_UNSUPPORTED` | Plan charges nothing | A free plan earns a promoter nothing |
| 422 | `PROMOTION_PLAN_INACTIVE` | Plan is not active | Activate the plan first |

Every message is written for a non-technical creator; it is safe to show verbatim. The `code` is for your branching, not for them.

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

- **Issuing a promoter's link.** Portaly does it on its own purchase-complete page, keyed to the buyer's order. There is no endpoint for a creator to mint one.
- **Promoter earnings.** They live at `https://rewards.portaly.cc`, which is also where withdrawals happen.

If you find yourself wanting to build either, that is the signal to stop and check `https://portaly.ai/openapi.json` rather than to invent a path.
