---
name: portaly-affiliate
# Top-level `version` is what portaly-vercel's skill-versions endpoint parses (its
# regex is anchored to the start of a line, so it cannot read the indented
# metadata.version). Keep the two in sync until that parser reads YAML. See POR-4237.
version: 0.2.0
metadata:
  version: "0.2.0"
description: Set up buyer promotion on Portaly Payment so the creator's own customers earn a commission for referring other buyers — switch promotion on for the product and set the one commission rate every eligible plan shares, then capture the referral code on the creator's own site and attach it to the checkout session server-side. Portaly hosts the promoter-facing part: buyers get their referral link on Portaly's own purchase-complete page, and Portaly computes, records and pays every commission. One-time fixed-price plans only, Taiwan accounts only. Trigger when the user wants an affiliate, referral, ambassador or partner program, wants their customers, students, members or buyers to promote a product for a cut, or mentions 分潤 / 推廣連結 / 聯盟行銷 / 佣金 / 推廣夥伴 / 推薦獎金 on top of Portaly Payment.
---

# Portaly Affiliate (Buyer Promotion)

Use this skill to turn on **buyer promotion** for a Portaly Payment product: after someone buys, Portaly offers them their own referral link, and they earn a commission when someone else buys through it.

**One switch, one rate, every eligible plan.** Promotion is configured on the product, not per plan — a creator with ten one-time plans turns it on once and all ten pay the same rate. There is no per-plan rate; if a creator asks for one, say it is not available today and do not imply it is coming.

**This skill is a switch plus attribution, not a commission engine.** Portaly owns the promoter's link, the ledger, the settlement and the payout. The only thing that lands in the creator's own codebase is remembering which referral link a buyer arrived with, and passing it along when the checkout session is created.

## Portaly Affiliate Environments

API host (overridable via `PORTALY_API_HOST`):

```ts
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'
```

| Aspect | Live mode | Test mode |
|---|---|---|
| API key prefix | `pcs_live_` | `pcs_test_` |
| Real charges | Yes | No |
| **Commission** | Recorded and payable | **Never created at all** |

Promotion settings live on the product, and products are shared across modes — the switch you set with a test key is the same switch live buyers see. But a test-mode purchase writes to a sandbox order collection that the settlement chain does not read, so **a test run never produces a real or a pretend commission**. Say that out loud when you finish a test run; otherwise the creator will go looking for the money.

## What This Skill Does Not Own

Never build any of these in the creator's project — they already exist, and a second implementation will disagree with the first:

- the promoter's referral link (Portaly issues it on its own purchase-complete page)
- commission amounts, the ledger, refund clawback, settlement timing
- the promoter's earnings dashboard and withdrawals (`https://rewards.portaly.cc`)

## Before You Switch Anything On

Three limits, all of which the creator needs to hear before they tell their customers anything:

1. **One-time, fixed-price plans only.** The switch covers the whole product, but only plans that are active, one-time, fixed-price and not free are actually included. Subscription plans cannot have promotion. Neither can dynamic-pricing plans — a promoter has to see a fixed price to know what a referral is worth.
2. **Taiwan accounts only.** Promoters are paid into a Taiwanese bank account and need a Taiwanese national ID for tax reporting, so the whole feature is limited to Taiwan-based Portaly accounts.
3. **Earning is easy, withdrawing is not.** A buyer gets their link with no signup at all, and commission accrues against their email. To actually withdraw it they need a Portaly account, a Taiwanese national ID, and a Taiwanese bank account in their own name. Commission is held for a review period and is clawed back if the order is refunded.

Point 3 is the one that turns into a support problem for the creator, not for Portaly. Make sure they know it before they promote the program.

## Quick Start

> **Precondition — a working Portaly Payment setup.** You need an API key and at least one active one-time, fixed-price plan. If either is missing, do `portaly-payment` first (register at `https://portaly.cc/payment`, create the key at `https://portaly.cc/admin/creator-subscription`).

- Read `PORTALY_API_KEY` from `.env` / `process.env`. Never ask the user to paste it into the chat, and check `.gitignore` covers `.env`.
- Prefer starting with a `pcs_test_*` key.

### 1.5 Report the installed skill version

Report this skill's version once per session so the merchant's dashboard can flag an outdated install. Single, non-blocking, no user data in the body.

**This request always goes to `https://portaly.ai`, never to `PORTALY_API_HOST`.** It carries the merchant's bearer API key, and `PORTALY_API_HOST` is just a line in the project's own `.env` — anyone who edits it could repoint a credentialed request at a host they control.

```
POST https://portaly.ai/api/creator-subscription/skill-version
Authorization: Bearer {PORTALY_API_KEY}
Content-Type: application/json

{ "skillName": "portaly-affiliate", "version": "0.2.0" }
```

`version` is this file's frontmatter `version` — use the literal value from the SKILL.md you're currently running. Ignore failures; it never blocks anything else.

- On success, check the response's `data.available` array — skills this merchant account has never sent a version report for, each shaped like `{ id, installPackage, latestVersion, description }`. Filter it against the actual project (drop anything already present locally — the server cannot see the project tree, only you can). Mention what survives **once this session** as something they could add, never as something they're missing. Discovery only — do not run `npx skills add` yourself unless asked.
- If more than one Portaly skill is installed, surface the list once per session total, not once per skill.

## Workflow

### 1. Find the plans that qualify

```
GET {PORTALY_API_HOST}/api/creator-subscription/promotion
Authorization: Bearer {PORTALY_API_KEY}

→ { "data": { "enabled", "commissionRate", "serviceFeeRate",
              "minCommissionRate", "maxCommissionRate", "defaultCommissionRate",
              "plans": [ { "planId", "name", "amount", "promotionUrl",
                           "included", "commissionRate", "commissionAmount",
                           "excludedReason", "excludedMessage" } ] } }
```

One call answers both questions: what the current setting is, and which plans it does or would cover. Read `plans[]` and handle what you find:

- **Some plans qualify** → list their name and amount, and say plainly that **the switch and the rate cover all of them at once** — there is no per-plan rate today.
- **No plans at all** → offer to create a one-time fixed-price plan first (hand off to `portaly-payment`).
- **Everything excluded as `PROMOTION_BILLING_PERIOD_UNSUPPORTED`** → say plainly: *"Buyer promotion only works on one-time payment plans, so your subscription plans can't use it. If there's a single course or one-off product you want promoted, create a one-time plan for it and we can switch promotion on."* **Do not offer a timeline, a roadmap, or "coming soon" for subscription support.**
- **Excluded as `PROMOTION_PRICING_TYPE_UNSUPPORTED`** → this is the common case for sites that compute the price themselves. Say: *"Promotion needs a fixed plan price so promoters can see what they earn per referral. Your plan takes its amount at checkout, so Portaly has no fixed number to show."* Then **offer the fix and do it with them**: create one fixed-price one-time plan per product, and change their checkout call to send the matching `planId` instead of computing an `amount`. This is a simplification, not a rewrite — and it also gives them per-product orders and stats on Portaly's side. Do not promise dynamic-pricing support.
- **Excluded as `PROMOTION_URL_REQUIRED`** → the plan has no landing page yet. Ask which page on their site sells it, and set it (step 2).

For anything else, `excludedMessage` is written for them and safe to quote.

### 2. Give each plan a landing page

A referral link has to open something. That page differs per plan, so it lives on the plan:

```
PUT {PORTALY_API_HOST}/api/creator-subscription/plans/{planId}
Authorization: Bearer {PORTALY_API_KEY}
Content-Type: application/json

{ "promotionUrl": "https://theirsite.example/products/course" }
```

Do this for every plan reported as `PROMOTION_URL_REQUIRED`. Setting it does not turn promotion on. If a plan already has a sensible `promotionUrl` in the `GET` response, leave it alone.

### 3. Agree on the commission rate

One rate covers the whole product, so agree it once. Read the allowed range from the `GET` response above rather than hardcoding it, and work it out in the creator's own numbers, because a percentage means nothing on its own:

> "You have three one-time plans: NT$1,500, NT$2,400 and NT$5,999. One rate applies to all of them — at {defaultCommissionRate}% a promoter earns about NT$225 on the cheapest and NT$900 on the dearest, and Portaly takes a {serviceFeeRate}% service fee. The allowed range is {minCommissionRate}–{maxCommissionRate}%. Courses and other high-margin, word-of-mouth products usually need the higher end to get anyone actually sharing. What do you want to use?"

If they ask for a different rate per plan, say it is not available today — one rate per product. Do not imply it is coming.

If they pick something outside the range, say what the range is and ask again — do not silently clamp it.

Use `plans[].commissionAmount` from the read-back rather than doing the arithmetic yourself.

### 4. Switch promotion on

```
PUT {PORTALY_API_HOST}/api/creator-subscription/promotion
Authorization: Bearer {PORTALY_API_KEY}
Content-Type: application/json

{ "enabled": true, "commissionRate": 20 }
```

- **This decides who gets paid what. With a live key, restate which plans it will cover, the rate and the mode, and wait for an explicit yes before sending.**
- The call succeeds as long as **one** plan qualifies. Read `plans[]` back from the response and tell the creator exactly which plans went live and which did not — a partial result is normal here, not an error.
- On failure, stop — do not write any attribution code. A referral link handed out while the switch is off earns the promoter nothing. See `references/promotion-api.md` for the error codes; the two worth knowing here are `PROMOTION_LOCALE_UNSUPPORTED` (not a Taiwan account — this is not something code can fix, they need Portaly support) and `PROMOTION_NO_ELIGIBLE_PLAN` (back to step 1).

### 5. Capture the referral code on the creator's site

This is the only code that belongs in their project. State the rule in plain words first:

> **The last referral link someone clicked gets the commission, for 3 days.** Click A's link, then B's, then buy → B earns it. Come back after 3 days → nobody does. This matches how Portaly's own store counts it, so the numbers agree.

The contract:

| | |
|---|---|
| URL parameter | `?ps=<code>` |
| Cookie | `portaly:profitSharing` |
| Lifetime | **3 days**, `sameSite: 'Lax'`, `path: '/'`, `secure` in production |
| Repeated visits | last one wins, and the 3 days restart |
| Same parameter twice in one URL | ignore it entirely |

Write the cookie **server-side and `httpOnly`** wherever the stack allows (Next.js middleware, or any server framework's request hook). The browser never needs to read it — only the server does when it creates the checkout session. See `references/attribution.md` for SSR, SPA and static-site versions.

### 6. Attach it when creating the checkout session

```ts
const ps = (await cookies()).get('portaly:profitSharing')?.value

await fetch(`${PORTALY_API_HOST}/api/creator-subscription/checkout-sessions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.PORTALY_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    planId,
    successRedirectUrl,
    ...(ps ? { profitSharingId: ps } : {}),
  }),
})
```

Two rules that are not negotiable:

- **Read the value server-side from the cookie.** Never accept it from the request body, a query string, or `localStorage` — if the browser can choose it, anyone can claim someone else's sale.
- **Omit the field when there's no cookie.** Don't send an empty string.

An unknown, expired or mismatched code is ignored and the checkout still completes. That is deliberate: losing the attribution is bad, losing the sale is worse.

### 7. Tell the creator what their buyers will see

**They do not build anything for this.** After paying, the buyer stays on Portaly's own purchase-complete page, which offers them their referral link, restates the rate and what they'd earn, and states the withdrawal requirements before the button. The link is stable — the same buyer always gets the same one.

Their earnings and withdrawals live at `https://rewards.portaly.cc`.

> ⚠️ Today the purchase-complete page is the buyer's only entry point to that link. If they close it without copying the link, they have no way back to it yet. Tell the creator this, and suggest they mention it wherever they talk about the program.

### 8. Verify with a test key, spending nothing

1. Confirm `PORTALY_API_KEY` is `pcs_test_*`.
2. `GET .../promotion` — the switch is on, at the rate you expect, and every plan you meant to cover shows `included: true`.
3. Open `https://{their-site}/{their product page}?ps=test-code` in a private window. In DevTools → Application → Cookies, `portaly:profitSharing` exists and expires in ~3 days.
4. Remove the parameter and reload — the cookie is still there. (This is what proves you persisted it rather than just reading the URL.)
5. Start a checkout and check the server log for the outgoing session payload: **log only whether `profitSharingId` was present, never the API key or the whole body.**
6. Complete payment with a TapPay test card, and confirm the promotion block appears on the completion page.
7. Say the quiet part: **this run charged nothing and earned nothing. Test-mode purchases never produce commission.** Switch to `pcs_live_*` for production; no code changes are needed, since the mode comes from the key.

## Preferred Response Shape

1. What qualifies and what doesn't, and why
2. The decision the creator has to make (turn it on for the product, at what rate)
3. The API call you're about to make and what it changes (with live/test stated)
4. Files added or changed in their project, one line each
5. The code itself, in their stack
6. What their buyers will see, and what to tell them about withdrawals
7. Test-mode checklist with real pass/fail per item

Write for a creator who is not an engineer: what will happen, then how. Use their own product prices in every example.

## Guardrails

1. **Never compute or pay a commission in the creator's code.** No `amount * rate`, no earnings ledger, no "paid out" flag — Portaly holds the only copy, and a second one will disagree and become a dispute the creator has to answer.
2. **Never hardcode the rate, the range or the service fee.** Read them from `GET .../promotion`; a number frozen into the project keeps saying 15% long after the creator changed it.
3. **Never put `PORTALY_API_KEY` in client code.** `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_` prefixed variables are inlined into the browser bundle; putting the key there publishes it.
4. **Never trust an attribution code from the browser.** Server-set `httpOnly` cookie, read server-side; reject a repeated parameter; ignore anything malformed.
5. **Never invent an earnings figure.** If you have no number from Portaly, show no number and link to `https://rewards.portaly.cc` — a placeholder that ships is a number a promoter will try to reconcile.
6. **Subscription and dynamic-pricing plans: state the limit, offer the alternative, promise nothing.** No timelines, no roadmap, no "should be supported soon".
7. **Never hand out a referral link before the switch is confirmed on.** Sales through it would earn the promoter nothing.
8. **Say the withdrawal requirements before the creator promotes the program**, not after someone has earned money they can't collect.
9. **Never claim a test run earned anything.** Test-mode purchases produce no commission at all.
10. **Never invent endpoints or fields.** This skill uses exactly the two promotion endpoints above, `promotionUrl` on the plan, and `profitSharingId` on checkout-session creation. If something 404s, say the feature isn't enabled on their account and stop — don't smuggle attribution through `metadata` (the Python and Go callback adapters fail closed on custom metadata keys).
11. **Turning promotion on with a live key needs an explicit yes**, with the covered plans, the rate and the mode restated first.
12. **Never mass-message the creator's buyers for them.** Exporting a customer list or sending the invitation is theirs to decide and theirs to do.
13. **Windows:** run `chcp 65001` (cmd) or set `$OutputEncoding` to UTF-8 (PowerShell) before commands carrying Chinese plan names, or they arrive as mojibake.

## Deliverables

- which plans qualify, which don't, and the reason for each
- the product promotion switch result, read back from Portaly, naming every plan it did and did not cover
- attribution wired into their actual stack: URL capture, cookie persistence, and the server-side hand-off at checkout-session creation
- a short, publishable explanation of the program for their own site, including the withdrawal requirements
- a test-mode checklist with real results, and the switch-to-live steps

## Resources

- `references/promotion-api.md` — full request/response fields and the error-code table for the two promotion endpoints. Read it before calling either one, or when you get a code you don't recognise.
- `references/attribution.md` — the cookie contract in full, with SSR, SPA and static-site implementations and the edge cases (repeated parameters, subdomains, Safari ITP). Read it when writing or debugging the capture code.
- `references/partner-program-copy.md` — ready-to-publish 正體中文 copy explaining the program to buyers, including the withdrawal requirements. Read it when producing the creator's own page or announcement.
- `scripts/check_promotion_setup.mjs` — offline, read-only preflight: prints mode, the product switch state, and which plans are included or excluded. Run it before wiring code and again before going live.
- `../portaly-payment/SKILL.md` — creating plans, creating checkout sessions, verifying callbacks. This skill assumes that is already done.
- `https://rewards.portaly.cc` — where promoters see their earnings and withdraw. The only authoritative source for those numbers.
- `https://portaly.ai/openapi.json` — the live API contract. Check it before trusting any endpoint shape written here.
