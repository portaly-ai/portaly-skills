# Discount Code Examples & Cheatsheet

Reach for this when the human user asks the agent to "make a coupon", "build a discount code", "set up a promo", or describes a campaign in prose. The agent should turn the prose into a `POST /api/creator-subscription/discount-codes` payload and confirm before calling in **live** mode.

## Example prompts the agent should handle

| Prompt | Translates into |
|---|---|
| 「建立 BLACKFRIDAY 8 折碼，2026 年底前可用，限 100 次、每人 1 次，限月費 plan」 | code `BLACKFRIDAY`, single rule on monthly plan, percent 20, repeating cycles 3, redeemBy 2026-12-31, maxRedemptions 100, maxRedemptionsPerCustomer 1 |
| 「建立活動碼 EARLYBIRD：月費前 3 期半價、單次購買折 200 元」 | code `EARLYBIRD`, two rules — monthly plan (percent 50, cycles 3) and one-time plan (fixed 200 TWD, cycles 1) |
| 「FOUNDER100 永久折 100 元，限定 plan_pro_monthly」 | code `FOUNDER100`, single rule on `plan_pro_monthly`, fixed 100 TWD, forever |
| 「年費首年 8 折 ANNUAL20，限 yearly plan」 | code `ANNUAL20`, single rule on yearly plan, percent 20, repeating cycles 1 (= first year) |
| 「FREEMONTH 首期免費，所有 plan 通用，無使用上限」 | code `FREEMONTH`, single rule appliesTo `all`, free, repeating cycles 1, no caps |
| "Make a 30% off code WELCOME for the first month for any plan, max 1 per customer." | code `WELCOME`, appliesTo `all`, percent 30, repeating cycles 1, maxRedemptionsPerCustomer 1 |
| "Set up a referral perk REFER10 — anyone using this code gets 10% off every charge for as long as they stay subscribed." | code `REFER10`, appliesTo `all`, percent 10, forever (note: `forever` is unusual with `percent`; most often paired with `fixed`) |

## Parameter cheatsheet

| Field | Type | Meaning | Constraints / notes |
|---|---|---|---|
| `code` | string | Custom code string | 3-40 chars, `[A-Z0-9_-]`, **stored UPPERCASE**, unique per profile, **immutable post-create** |
| `rules[].appliesTo` | object | Which plan(s) this rule applies to | `{ type: 'all' }` (≤1 per code) or `{ type: 'specific', planIds: [...] }`. planIds can't repeat across rules |
| `rules[].discount.type` | enum | Discount kind | `fixed` / `percent` / `free` |
| `rules[].discount.value` | number | Discount magnitude | `fixed`: positive integer TWD; `percent`: 1-100; not used for `free` |
| `rules[].discount.currency` | enum | Currency for `fixed` | Currently only `TWD` |
| `rules[].duration.type` | enum | Discount period kind | `repeating` or `forever` |
| `rules[].duration.cycles` | number | # of billing periods to apply (for `repeating`) | 1-60. **Monthly plan: 1 cycle = 1 month. Yearly plan: 1 cycle = 1 year.** |
| `redeemFrom` | ISO datetime | Start of the redemption window | Optional; null = immediately |
| `redeemBy` | ISO datetime | End of the redemption window | Optional; null = no end. Must be after `redeemFrom` |
| `maxRedemptions` | integer | Total cap | Optional; null = unlimited |
| `maxRedemptionsPerCustomer` | integer | Per-email cap | Optional; null = unlimited |
| `status` | enum | `active` (default) or `disabled` | Disabled codes can't be redeemed |

## Two-dimension matrix (discount type × duration)

|  | `repeating { cycles: N }` | `forever` |
|---|---|---|
| `fixed` | First N cycles get `value` TWD off (e.g. 100 TWD off first 3 months). | Permanent low-price tier — every renewal gets `value` TWD off. |
| `percent` | First N cycles get the percentage off (e.g. 50% off first 3 months). | Every renewal gets the percentage off. Less common than `fixed forever` but valid. |
| `free` | First N cycles cost 0 (e.g. free first month). | Permanent free — generally not what merchants want; prefer changing the plan price. |

The most common combinations:

- **percent + repeating** → introductory discount ("first 3 months 50% off")
- **free + repeating(1)** → trial-style first-period freebie
- **fixed + forever** → loyalty / founder pricing

## Ref-code usage

Discount codes can double as registration ref codes:

1. Vibe coder creates a code (e.g. `EARLYBIRD`) via this skill.
2. The third-party app's signup flow accepts a `?ref=EARLYBIRD` URL parameter.
3. When the same buyer later starts a checkout, Portaly auto-applies the matching rule for the chosen plan once the buyer's email is verified — no need to pass `discountCode` on the session.

Things to check before recommending the ref-code path:

- The code must already exist in Portaly **before** any user registers with it; otherwise sync silently drops the field with `errors: [{ reason: 'unknown_signup_ref_code' }]`.
- `signup_ref_code` is **first-write-wins** per (profileId, email) — the first sync that records a code wins; later syncs that pass a different code are dropped with `errors: [{ reason: 'signup_ref_code_already_recorded' }]`.
- The code must still be within `redeemBy` at checkout time. Expired codes silently no-op (no error shown to the buyer).
- Per-customer caps still apply.

## Live-mode confirmation

Before calling `POST .../discount-codes` with a `pcs_live_*` API key, confirm the action explicitly with the human user:

> "I'm about to create discount code `EARLYBIRD` in **live** mode for profile `<profileId>`. It will give 50% off for 3 months on the monthly plan and NT$200 off the one-time plan, with a per-customer limit of 1. Should I proceed?"

Only call after a clear "yes". Same rule applies to `PUT` updates and `DELETE` (status flip) in live mode.
