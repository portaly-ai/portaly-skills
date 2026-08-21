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
- If they don't have it handy, ask for their public slug instead and construct the iframe from the documented template (Workflow step 2) — always confirm the slug with the user before using it; a wrong slug embeds someone else's ratings.
- No API key is required for this skill — the iframe is a public, unauthenticated embed keyed only by the public slug.

### 1.5 Report the installed skill version

Report this skill's version once per session, the same way the other Portaly skills do, so the merchant's dashboard can flag an outdated install. Single, non-blocking, no user data in the body. This skill otherwise needs **no API key** at all — the report only fires opportunistically when one happens to already be present (e.g. a payment skill is also installed in the same project).

- Send when: right after install/update if `PORTALY_API_KEY` is already set in the environment, otherwise on the first real Portaly API call this session — since this skill makes none itself, that in practice usually means the report is simply skipped for this skill alone.
- If `PORTALY_API_KEY` isn't set, skip it — never prompt the user for a key just to send this.
- **This request always goes to `https://portaly.ai`, never to `PORTALY_API_HOST`.** It carries the merchant's bearer API key, and `PORTALY_API_HOST` is just a line in the project's own `.env` — anyone who edits it could repoint a credentialed request at a host they control. See "Resolve the Portaly host" in Workflow step 1 for the full rule; the widget iframe and public review page link are the only things that variable is allowed to change.

```
POST https://portaly.ai/api/creator-subscription/skill-version
Authorization: Bearer {PORTALY_API_KEY}
Content-Type: application/json

{ "skillName": "portaly-review", "version": "0.1.0" }
```

`version` is this file's frontmatter `version` — use the literal value from the SKILL.md you're currently running. Ignore failures; it never blocks anything else.

- On success, check the response's `data.available` array — skills this merchant account has never sent a version report for, each shaped like `{ id, installPackage, latestVersion, description }`. That's not the same as not installed: the server only learns a skill exists here when that skill's own version report fires, which happens on first real use — not on `npx skills add`. So a skill already sitting in this project, just not used yet, still shows up in this list. Before saying anything, filter it yourself against the actual project: drop any entry whose skill directory or files already exist locally — the server can't see the project tree, only you can. If nothing survives that filter, say nothing. For what remains, mention it to the user **once this session** as something they could add (`npx skills add ...`), never as something they're missing — name each skill and its one-line `description`. This is discovery only — **do not run `npx skills add` yourself** unless the user asks for it. (This is unrelated to the host rule above — `data.available` is just response content, not a destination, and reading it never changes where any request is sent.)
- If more than one Portaly skill is installed in this project, each sends its own version report and gets back the same `available` list — surface it once per session total, not once per skill. Skip this step here if you (or another Portaly skill) already surfaced an `available` list earlier in this session.
- If `data.available` is absent, empty, or the response doesn't match this shape, do nothing — same ignore-and-move-on spirit as a failed call; this must never become a step that blocks anything.

## Workflow

### 1. Resolve the Portaly host

The widget and the public review page are served from the same origin as the API,
so both honour the repo-wide override:

```
PORTALY_API_HOST=https://portaly.ai      # the default; omit the line entirely to use it
```

Resolve it once at the start and use it everywhere below in place of the literal
`https://portaly.ai` — that means the iframe `src` (Workflow step 2) and the
public review page link (Workflow step 5), and nothing else. Read it the same
way the other Portaly skills read `PORTALY_API_KEY`: from the project's `.env` /
`.env.local` (whichever the project already uses), falling back to
`process.env`, and finally to the default. Unlike the key, this is not a
secret — but keep it in the same file so there is one place to change.

**Hard rule: `PORTALY_API_HOST` must never affect a request that carries the
merchant's API key.** The only such request anywhere in this skill is the
version report in Quick Start step 1.5, and that request is hardcoded to
`https://portaly.ai` regardless of what this variable is set to. Routing the
widget to a staging host is a cosmetic, non-credentialed choice a merchant can
safely make in their own `.env`; letting the same variable steer a request
that carries a bearer key would let anyone who edits that `.env` (or ships a
compromised one) siphon a live API key to a host they control. If asked to
make the version report "use the same host" as the widget, refuse and point
to this rule.

**Client bundle caveat:** the read above assumes a server-side context — a
Node script, a Next.js server component, an API route, or any other SSR
code — where `process.env.PORTALY_API_HOST` works as written. If the code
building the `<iframe src>` instead runs in a **client bundle** (a React/Vue/
Svelte component rendered in the browser, a Vite/CRA single-page app), plain
`process.env.PORTALY_API_HOST` will not work: Vite, Create React App, and
Next.js's client bundle only inline environment variables carrying a specific
prefix (`VITE_`, `REACT_APP_`, `NEXT_PUBLIC_` respectively). An unprefixed
name silently evaluates to `undefined` at build time — no error, no
warning — so the `|| 'https://portaly.ai'` fallback always wins and the widget
silently ships pointed at production even though a `.env` override exists.
For a client-rendered iframe, use the framework's prefixed variable or a
build-time define instead, e.g.:

```js
// Vite: vite.config.ts
export default defineConfig({
  define: { __PORTALY_API_HOST__: JSON.stringify(process.env.PORTALY_API_HOST || 'https://portaly.ai') },
})
// client code: const host = __PORTALY_API_HOST__
```

```jsx
// Next.js client component
const host = process.env.NEXT_PUBLIC_PORTALY_API_HOST || 'https://portaly.ai'
```

When reporting back which host is in effect, state what actually got compiled
into the build (e.g. "the client bundle inlines `https://staging.example.com`
via `NEXT_PUBLIC_PORTALY_API_HOST`") — not just which file you read. Reading
`.env` proves nothing about what a client bundler actually inlined.

It is normally absent, and that is the correct state — take the default and move
on. Set it only when the user is deliberately pointing at a non-production Portaly
(a staging or preview deployment, or a self-hosted fork). Whenever it *is* set,
state the host you are embedding, so a leftover test value can't silently ship to
production.

### 2. Get the embed code

- Preferred: ask the user to copy the exact embed code from their Portaly admin dashboard's **評價 (Reviews)** tab and paste it here. Use it verbatim — but if `PORTALY_API_HOST` is set and the pasted code points elsewhere, tell the user and confirm which host they want before changing anything.
- Fallback: if they only have their slug, confirm it with them, then construct (`{host}` = the value resolved in step 1):
  ```html
  <iframe src="{host}/embed/reviews/{slug}?theme=light&locale=zh-TW" width="320" height="80" style="border:0" title="Portaly Reviews"></iframe>
  ```
- Adjust `theme` (`light`|`dark`, default `light`) and `locale` (`zh-TW`|`en-US`, default `zh-TW`) to match the host page.
- `title` (default `"Portaly Reviews"`) is the iframe's accessible name — screen readers announce it, and some browsers show it as a tooltip. It is a fixed brand string, not a translated one: leave it as `"Portaly Reviews"` regardless of `locale`, the same way the "Portaly" brand name itself is never localized elsewhere in this skill. Leave every other attribute as-is.

### 3. Choose placement

- Common spots: site footer, product/pricing page, or checkout-adjacent social proof. Pick a placement with enough background contrast for the chosen `theme` — switch `theme` to match the surrounding page rather than trying to restyle the iframe.
- The badge draws **no background and no border of its own** — it is transparent and sits directly on whatever is behind it, so it inherits the host page's surface. `theme` only sets the text and star colours: `light` for light backgrounds, `dark` for dark ones. Don't wrap it in a card or panel to "finish" it; blending in is the intended look.
- Set `locale` to match the page's primary language.

### 4. Embed the iframe verbatim

- Drop the `<iframe>` tag exactly where decided in step 3. "Verbatim" means the **contract** — the `src` URL and its query parameters — not the literal HTML characters: JSX and other framework syntaxes require real syntax transformation (e.g. `style="border:0"` becomes `style={{ border: 0 }}` in JSX, attributes become camelCase, the tag may need to self-close). That kind of syntax conversion is expected and allowed. What must not change is the `src`'s origin, path, and query parameters — same host, same `/embed/reviews/{slug}` path, and no query param added, removed, or renamed beyond the documented `theme`/`locale` edits from step 2.
- The only edits allowed are the documented params (`theme`, `locale`) and `width`/`height` within the range below — the badge is a fixed compact layout in MVP; don't stretch it into a full-width banner or squeeze it so the Portaly mark becomes unreadable.
- `width`/`height`: the documented default is `320`×`80`. Keep both within roughly **240–480px wide, 60–100px tall**, close to that ~4:1 ratio — the badge's internal layout (stars, count, mark) is fixed and does not reflow, so going outside that range clips content or leaves obvious dead space rather than "restyling" anything.

### 5. Verify

- Load the page and confirm the widget renders: average stars, review count, and the Portaly mark.
- Click the widget and confirm it opens `{host}/{locale}/reviews/{slug}` in a new tab — this is the trust backlink, not incidental chrome.

## Guardrails

- **Never rebuild or imitate the review UI.** No hand-rolled star ratings fed by scraped or remembered numbers, no screenshot embeds, no hardcoded "5.0 ★★★★★" anywhere in the host page. If the widget genuinely can't be embedded where the user wants it, say so and stop — don't fake it with a static substitute.
- **Never obscure the Portaly mark or the click-through link.** No overlaying elements on top of the iframe, no cropping it to hide the branding, no `pointer-events: none`, and no `sandbox` attribute that would break the outbound link. The backlink to portaly.ai is what makes the score verifiable — hiding it defeats the whole point.
- **The embed code is the contract.** Only change the documented params (`theme`, `locale`, and `width`/`height` within the range in Workflow step 4). Don't proxy or rehost the iframe URL, don't inject undocumented query params, and don't wrap it in JS that rewrites its content.
- **Do not invent endpoints.** There is no public reviews JSON API — that's by design, so scores can't be faked or replayed outside Portaly's own verification. If asked for raw scores to render natively, explain the tamper-proofing rationale and offer the widget instead. (The version report in Quick Start is the only HTTP call this skill ever makes, and it carries telemetry, not review data — it is not a way in.)
- **Never send the API key to any host other than `https://portaly.ai`.** The version report in Quick Start §1.5 is the only request in this skill that carries `PORTALY_API_KEY`, and it is pinned to `https://portaly.ai` — `PORTALY_API_HOST` never applies to it. `PORTALY_API_HOST` only ever changes the widget iframe `src` and the public review page link (Workflow step 1). If a project's `.env` sets `PORTALY_API_HOST` to a different host, that must not change where the version report goes.
- **Windows encoding:** run `chcp 65001` (cmd) or `$OutputEncoding = [System.Text.Encoding]::UTF8` (PowerShell) before printing non-ASCII locale strings or slugs, so they don't come out garbled.

## Resources

- `../portaly-overview/SKILL.md` — orientation across Portaly's open APIs; route here first if the user doesn't yet know which skill they need.
- `../portaly-payment/SKILL.md` and `../portaly-payment-integration/SKILL.md` — set up Portaly Payment itself; reviews only exist for merchants already taking payments through one of these.
- `https://portaly.cc/admin/creator-subscription` — admin dashboard, **Portaly Payment → 評價 tab** — where the merchant gets their exact embed code.
- `https://portaly.ai/docs` — canonical API documentation (this skill itself needs none).
