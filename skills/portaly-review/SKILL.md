---
name: portaly-review
version: 0.1.0
description: Embeds Portaly's hosted, verified-buyer review widget — a Trustpilot-style rating badge served from a Portaly iframe — onto a merchant's own site so the score and backlink stay Portaly-hosted and tamper-proof; trigger when the user wants to embed Portaly reviews, add a review widget, show my ratings, a Trustpilot-style badge, or social proof from Portaly.
---

# Portaly Review

Use this skill to help a human user (or their agent) embed Portaly's hosted review widget — a verified-buyer rating badge — on their own site. This is an embed-and-verify skill, not a review system: Portaly generates review links for buyers automatically after checkout (success page, confirmation email, or subscriber portal) and hosts the scoring, storage, and public review page itself. This skill never creates review links, never collects a rating, and never renders a score outside the Portaly-hosted iframe.

## Quick Start

> **Precondition — the merchant needs a Portaly account with Portaly Payment enabled and a public slug.** Reviews only exist for merchants already taking payments through Portaly Payment (verified buyers get review links automatically post-checkout) and who have a claimed `portaly.cc/{slug}` handle. If the user doesn't have that yet, point them at `portaly-payment` or `portaly-payment-integration` to get set up first — this skill only embeds the widget, it doesn't create the underlying review program.

- Ask the user to open their Portaly admin dashboard (`https://portaly.cc/admin/creator-subscription`) → **Portaly Payment** → **評價** (Reviews) tab, and paste the exact embed code shown there.
- If they don't have it handy, ask for their public slug instead and construct the iframe from the documented template (Workflow step 1) — always confirm the slug with the user before using it; a wrong slug embeds someone else's ratings.
- No API key is required for this skill — the iframe is a public, unauthenticated embed keyed only by the public slug.

### 1.5 Report the installed skill version

Report this skill's version once per session, the same way the other Portaly skills do, so the merchant's dashboard can flag an outdated install. Single, non-blocking, no user data in the body. This skill otherwise needs **no API key** at all — the report only fires opportunistically when one happens to already be present (e.g. a payment skill is also installed in the same project).

- Send when: right after install/update if `PORTALY_API_KEY` is already set in the environment, otherwise on the first real Portaly API call this session — since this skill makes none itself, that in practice usually means the report is simply skipped for this skill alone.
- If `PORTALY_API_KEY` isn't set, skip it — never prompt the user for a key just to send this.

```
POST https://portaly.ai/api/creator-subscription/skill-version
Authorization: Bearer {PORTALY_API_KEY}
Content-Type: application/json

{ "skillName": "portaly-review", "version": "0.1.0" }
```

`version` is this file's frontmatter `version` — use the literal value from the SKILL.md you're currently running. Ignore failures; it never blocks anything else.

## Workflow

### 1. Get the embed code

- Preferred: ask the user to copy the exact embed code from their Portaly admin dashboard's **評價 (Reviews)** tab and paste it here. Use it verbatim.
- Fallback: if they only have their slug, confirm it with them, then construct:
  ```html
  <iframe src="https://portaly.ai/embed/reviews/{slug}?theme=light&locale=zh-TW" width="320" height="80" style="border:0" title="Portaly Reviews"></iframe>
  ```
- Adjust `theme` (`light`|`dark`, default `light`) and `locale` (`zh-TW`|`en-US`, default `zh-TW`) to match the host page. Leave everything else as-is.

### 2. Choose placement

- Common spots: site footer, product/pricing page, or checkout-adjacent social proof. Pick a placement with enough background contrast for the chosen `theme` — switch `theme` to match the surrounding page rather than trying to restyle the iframe.
- Set `locale` to match the page's primary language.

### 3. Embed the iframe verbatim

- Drop the `<iframe>` tag exactly where decided in step 2. The only edits allowed are the documented params (`theme`, `locale`) and `width`/`height` within reason — the badge is a fixed compact layout in MVP; don't stretch it into a full-width banner or squeeze it so the Portaly mark becomes unreadable.

### 4. Verify

- Load the page and confirm the widget renders: average stars, review count, and the Portaly mark.
- Click the widget and confirm it opens `https://portaly.ai/{locale}/reviews/{slug}` in a new tab — this is the trust backlink, not incidental chrome.

## Guardrails

- **Never rebuild or imitate the review UI.** No hand-rolled star ratings fed by scraped or remembered numbers, no screenshot embeds, no hardcoded "5.0 ★★★★★" anywhere in the host page. If the widget genuinely can't be embedded where the user wants it, say so and stop — don't fake it with a static substitute.
- **Never obscure the Portaly mark or the click-through link.** No overlaying elements on top of the iframe, no cropping it to hide the branding, no `pointer-events: none`, and no `sandbox` attribute that would break the outbound link. The backlink to portaly.ai is what makes the score verifiable — hiding it defeats the whole point.
- **The embed code is the contract.** Only change the documented params (`theme`, `locale`, and `width`/`height` within reason). Don't proxy or rehost the iframe URL, don't inject undocumented query params, and don't wrap it in JS that rewrites its content.
- **Do not invent endpoints.** There is no public reviews JSON API — that's by design, so scores can't be faked or replayed outside Portaly's own verification. If asked for raw scores to render natively, explain the tamper-proofing rationale and offer the widget instead.
- **Windows encoding:** run `chcp 65001` (cmd) or `$OutputEncoding = [System.Text.Encoding]::UTF8` (PowerShell) before printing non-ASCII locale strings or slugs, so they don't come out garbled.

## Resources

- `../portaly-overview/SKILL.md` — orientation across Portaly's open APIs; route here first if the user doesn't yet know which skill they need.
- `../portaly-payment/SKILL.md` and `../portaly-payment-integration/SKILL.md` — set up Portaly Payment itself; reviews only exist for merchants already taking payments through one of these.
- `https://portaly.cc/admin/creator-subscription` — admin dashboard, **Portaly Payment → 評價 tab** — where the merchant gets their exact embed code.
- `https://portaly.ai/docs` — canonical API documentation (this skill itself needs none).
