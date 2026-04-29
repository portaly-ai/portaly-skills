---
name: portaly-email
version: 0.1.0
description: Help vibe coders integrate Portaly Vibe invitation emails — choose between a Portaly-hosted waitlist CTA (zero setup) or a self-hosted waitlist landing page (full UX control). Trigger when the user mentions Portaly invitation email, waitlist signup landing page, app base URL, embedding a Portaly waitlist CTA, or asks how the registration email link works / where it lands.
---

# Portaly Vibe Invitation Email Integration

Use this skill to help a human user wire up the registration link from Portaly Vibe invitation emails to the right landing page.

## Concept

When a creator's follower clicks the CTA in a Portaly invitation email, the request always hits Portaly first at `https://portaly.ai/r/{referralCode}` — that endpoint is the **central click tracker** (rate limit, click-event log, attribution). Portaly then **302-redirects** the user to a waitlist landing page.

Two modes decide where that redirect lands:

| Mode | Where the user lands | Setup |
|---|---|---|
| **A. Hosted (default)** | `https://portaly.ai/waitlist/{creatorSlug}` — Portaly-hosted page | None |
| **B. Self-hosted** | `https://{vibe-coder-app}/waitlist/{creatorSlug}` — your app | Set `appBaseUrl` + implement the page |

Mode is per-merchant, decided by whether `creatorSubscriptionConfig.appBaseUrl` is set. Toggling mode takes effect within ~60 seconds (Portaly's edge cache TTL) and applies to every email already in flight.

## Email Types Reference

Portaly Vibe sends five email types on the merchant's behalf. Only the bottom two contain a registration link and use the Mode A/B redirect logic above — the rest are pure transactional notifications.

| Template type | Triggered by | Contains a link? | Common reason to disable |
|---|---|---|---|
| `welcome_free` | `POST /admin/users/sync` upserts a user with no active subscription | No | The vibe coder's app already sends its own welcome email |
| `welcome_paid` | Payment callback (status `completed`), or sync that adds an active subscription | No | The vibe coder customizes the upgrade email in their own product |
| `subscription_canceled` | `POST /subscriptions/{id}/cancel`, or self-service portal cancel | No | The vibe coder wants control over cancellation timing/copy |
| `follower_invitation` | `POST /api/creator-email/campaigns/{id}/send` | **Yes** (Mode A/B) | Rarely disabled — this is the campaign feature itself |
| `waitlist_onboarding` | `POST /api/waitlist/{slug}` | **Yes** (Mode A/B) | Rarely disabled — confirms the signup |

### Disabling a template

Per merchant, per type:

```bash
curl -X PUT https://portaly.ai/api/creator-email/templates/welcome_free \
  -H "Authorization: Bearer ${PORTALY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": false }'
```

Re-enable by sending `{ "enabled": true }`. Disabling takes effect immediately for new triggers — already-enqueued outbox rows still send.

> **Avoiding double emails.** If the vibe coder has their own welcome / upgrade / cancellation flow, **disable the matching template before** wiring `syncToPortaly` (see `portaly-user`) or the payment callback handler (see `portaly-payment`). Otherwise every existing user the first bulk sync touches gets one Portaly `welcome_free`, and every successful checkout gets one Portaly `welcome_paid` on top of the vibe coder's own message.

## API Host

`https://portaly.ai`

## Authentication

Same Creator Subscription API Key (`pcs_live_*` / `pcs_test_*`) used by `portaly-payment`.

## Workflow

### Step 1 — Choose Mode

Before writing any code, **ask the human user which mode they want** and wait for an explicit answer:

> Portaly Vibe sends invitation emails on behalf of creators. The CTA in those emails goes through Portaly for click tracking, then redirects to a waitlist landing page. You have two options:
>
> - **A. Hosted (recommended for fastest launch)** — Use Portaly's hosted waitlist page. No server-side work. The page is generic but functional. Best when you don't have a brand reason to host it yourself.
> - **B. Self-hosted (recommended for brand consistency)** — Host `/waitlist/[creatorSlug]` on your own domain. Full control over UI, copy, and post-signup flow. Requires implementing the page and registering your `appBaseUrl` with Portaly.
>
> Which would you like? You can switch later.

If the user picks **A**, jump to *Mode A — Hosted CTA*. If **B**, jump to *Mode B — Self-hosted Waitlist*.

---

### Mode A — Hosted CTA

See `references/hosted-cta.md` for full snippets.

What to do:

1. **Confirm `appBaseUrl` is empty** (it is by default). If the merchant previously enabled Mode B, clear it via `PUT /api/creator-subscription/config` with `{ "appBaseUrl": "" }`.
2. **Find the creator's slug** — `GET /api/creator-subscription/config` returns the merchant config. The slug also appears in the Portaly Vibe Dashboard.
3. **Embed the CTA URL** in the vibe coder's app, email signature, social bio, etc.:
   ```
   https://portaly.ai/waitlist/{creatorSlug}
   ```
4. **No server-side implementation needed.** Portaly serves the page, accepts the signup form, and stores the waitlist row.

That's it for Mode A. The creator can start sending invitation emails immediately — every click lands on Portaly's hosted page.

---

### Mode B — Self-hosted Waitlist

See `references/self-hosted-waitlist.md` for complete code templates (Next.js, React SPA, plain HTML).

#### Step B1 — Register `appBaseUrl`

```bash
curl -X PUT https://portaly.ai/api/creator-subscription/admin/config \
  -H "Authorization: Bearer ${PORTALY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "appBaseUrl": "https://your-app.example.com" }'
```

Constraints (enforced by Portaly):
- Must be HTTPS
- Max 255 characters
- Trailing slashes are stripped automatically
- Empty string clears the field (= switches back to Mode A)

#### Step B2 — Implement `/waitlist/[creatorSlug]`

The path **must** be `/waitlist/{creatorSlug}` — Portaly's redirect target is hard-coded. Anything else and the user hits a 404.

The page receives query params from Portaly's redirect — preserve them when posting back:

| Param | Purpose |
|---|---|
| `ref` | Referral code, must be passed back to attribute the signup |
| `utm_source` | Always `invitation` |
| `utm_campaign` | Campaign id (optional) |
| `utm_content` | Outbox id, identifies the specific recipient (optional) |

The page must call two Portaly endpoints:

- `GET https://portaly.ai/api/waitlist/{creatorSlug}` — returns `{ data: { creator: { slug, merchantName }, count } }`. Use it to render the headline (`Join {merchantName}'s waitlist`) and signup count.
- `POST https://portaly.ai/api/waitlist/{creatorSlug}` — body `{ email, name?, source?, ref? }`. Returns `{ data: { joined, alreadyOnList, creator } }`.

Both endpoints are public (no API key needed). The POST is rate-limited per IP (5/hour per creator) and per creator (200/hour total) — show the user a "try again shortly" message on `429`.

#### Step B3 — Wire to user sync (optional but recommended)

The signup is a new user from your perspective. After the POST succeeds, fire-and-forget a `syncToPortaly([{ email, name, status: 'active' }])` call so the creator can see the new follower in the Portaly Dashboard. See [portaly-user/SKILL.md Step 5](../portaly-user/SKILL.md) for the helper.

```ts
// after POST /api/waitlist succeeds
syncToPortaly([{ email, name }]).catch((err) =>
  console.error('[Portaly Sync]', err)
)
```

#### Step B4 — Verify

1. From the creator's dashboard, send a test invitation email to your own inbox.
2. Click the CTA link in the email.
3. The browser should redirect through `portaly.ai/r/...` and land on `https://your-app.example.com/waitlist/{slug}?ref=...&utm_source=invitation&...`.
4. Submit the form; check the Portaly Dashboard's waitlist tab to confirm the row.
5. If `syncToPortaly` is wired, the user should also appear in the Dashboard's user list.

---

## Switching Modes

| From | To | Action |
|---|---|---|
| Mode A → Mode B | Set `appBaseUrl` via `PUT /admin/config` |
| Mode B → Mode A | Set `appBaseUrl` to `""` via `PUT /admin/config` |

Switch propagates within ~60 seconds (Portaly's per-process cache TTL). In-flight emails immediately pick up the new mode on the next click — Portaly resolves the redirect target at click time, not at send time.

## Guardrails

- **HTTPS only** for `appBaseUrl`. `http://` is rejected by Portaly. `localhost` cannot be used in production — for local dev use ngrok / Cloudflare Tunnel.
- **Path is fixed**: `/waitlist/{creatorSlug}` exactly. Do not alias to `/signup`, `/join`, etc. — Portaly redirects to the literal `/waitlist/{slug}` path.
- **Click tracking always runs through Portaly.** Do not try to point the email CTA directly at your own domain to "skip" `/r/{code}` — you'll lose click analytics and rate limiting.
- **Preserve UTM and `ref` query params** on the POST body in Mode B. Dropping them breaks campaign attribution on Portaly's side.
- **Do not skip user sync.** A signup that's only stored on Portaly's waitlist row but missing from the creator's user list creates support pain when the creator wonders why a known follower doesn't show up in their dashboard.

## Output Preferences

- Always confirm Mode A vs Mode B with the human user before doing setup work.
- For Mode A, prefer one short paragraph + the CTA URL. No code templates needed.
- For Mode B, lean on `references/self-hosted-waitlist.md` instead of inlining all the code.
- Keep secrets (API keys) out of chat — write `.env` instructions instead.

## Reference Documents

- `references/hosted-cta.md` — Mode A snippets and CTA placement examples.
- `references/self-hosted-waitlist.md` — Mode B implementation templates for Next.js, React SPA, and plain HTML.
