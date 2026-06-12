# Bundle Pricing

## Use This Reference For

Understanding how Portaly splits the buyer-paid `totalAmount` across multiple products in a bundle.

## Definitions

For each item in the bundle, Portaly looks at the product's `effectivePrice` (the server-computed current selling price — see api-contract.md for derivation rules). An item is treated as **free** when `effectivePrice <= 0`, otherwise as **paid**.

> The checkout-session response surfaces this same value per item as `listedPrice` (alongside `originalPrice`, the strike-through list price). `effectivePrice` and `listedPrice` are the same number — the former is the field name in the product list/detail view, the latter is the field name on a checkout-session item.

- A free item is always allocated `0`. It does not consume any of `totalAmount`.
- `totalAmount` is split across paid items only, proportionally to each paid item's `effectivePrice`.
- The last paid item absorbs rounding so `sum(allocations) === totalAmount` exactly.

## Algorithm

```ts
function splitBundle(effectivePrices, totalAmount) {
  const allocations = effectivePrices.map(() => 0)
  const paidIndexes = effectivePrices
    .map((p, i) => (p > 0 ? i : -1))
    .filter((i) => i >= 0)

  if (paidIndexes.length === 0) return allocations  // all-free bundle

  const paidSum = paidIndexes.reduce((s, i) => s + effectivePrices[i], 0)
  let running = 0
  for (let k = 0; k < paidIndexes.length - 1; k++) {
    const i = paidIndexes[k]
    const share = Math.round((totalAmount * effectivePrices[i]) / paidSum)
    allocations[i] = share
    running += share
  }
  allocations[paidIndexes[paidIndexes.length - 1]] = totalAmount - running
  return allocations
}
```

## `totalAmount` Rules

| Bundle composition | `totalAmount` must be |
|---|---|
| Contains at least one paid item | `> 0` |
| Entirely free items | exactly `0` |

Mismatches return `400 TOTAL_AMOUNT_INVALID` at session creation.

## Examples

### Example A — 5 paid items, discounted bundle

`effectivePrice = [100, 200, 150, 50, 100]`, sum 600. `totalAmount = 999`.

| Item | Effective | Calc | Allocated |
|---|---|---|---|
| 1 | 100 | round(999 × 100/600) | 167 |
| 2 | 200 | round(999 × 200/600) | 333 |
| 3 | 150 | round(999 × 150/600) | 250 |
| 4 | 50  | round(999 × 50/600)  | 83 |
| 5 | 100 | 999 − (167+333+250+83) | 166 |

Sum: **999** ✓. Item 5 absorbed the rounding (would have been 167 by pure proportion → became 166).

### Example B — single item

`effectivePrice = [1500]`, `totalAmount = 1500` → `[1500]`. No split needed.

### Example C — equal-priced bundle

`effectivePrice = [100, 100, 100]`, `totalAmount = 250`.

- Item 1: round(250 × 100/300) = 83
- Item 2: round(250 × 100/300) = 83
- Item 3: 250 − (83 + 83) = 84

Sum: 250 ✓

### Example D — premium price (`totalAmount` > sum of paid)

Allowed; vibe does not enforce `totalAmount <= sumPaid`. `effectivePrice = [100, 200]`, `totalAmount = 600`.

- Item 1: round(600 × 100/300) = 200
- Item 2: 600 − 200 = 400

Sum: 600 ✓

### Example E — bundle with a free item

`effectivePrice = [100, 0, 300]`, `totalAmount = 400`.

- Item 1 (paid 100): round(400 × 100/400) = 100
- Item 2 (free): 0
- Item 3 (paid 300): 400 − 100 = 300

Sum: 400 ✓. The free item is allocated `0` and `totalAmount` is split across items 1 and 3 only.

### Example F — entirely-free bundle

`effectivePrice = [0, 0, 0]`, `totalAmount = 0` → `[0, 0, 0]`.

The hosted checkout page still runs (email verification, buyer confirms identity), but no card entry, no charge, no invoice.

## Refunds

Refunds are per-order. If you refund order #3 of a 5-order bundle, the buyer is refunded that order's `amount` (e.g., 250 from Example A). Refunding a partial bundle does NOT recalculate the others. Free orders (`amount === 0`) have no refund flow.

## Why Proportional?

For accounting integrity inside Portaly. Each paid product needs an order with a price so the existing creator-side stats, fees, taxes, and refund flows all work per-product. Proportional split is the least surprising mapping from `totalAmount` to per-product prices.

## Display on the Hosted Checkout Page

The hosted checkout page shows:
- Each product's name, image, and `listedPrice`
- When `listedPrice < originalPrice`, the original price is shown struck-through next to the discounted price
- When `totalAmount` is less than the sum of all `listedPrice` values (i.e. you applied a bundle discount), the page shows a subtotal, discount line, and final total

It does **not** show the per-item `allocatedAmount` — that is a financial/accounting field, not a display field.
