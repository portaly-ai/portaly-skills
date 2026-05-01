---
name: portaly-email
version: 0.2.0
description: Help Portaly creators run follower-email campaigns end-to-end — create a draft, send it via Vibe MCP, read post-send analytics — and wire up where the invitation email's CTA redirects (Portaly-hosted waitlist, or a self-hosted /waitlist/[slug] page). Trigger when the user mentions invitation emails, follower outreach campaigns, sending an email blast to followers, drafting an email campaign, waitlist signup landing page, app base URL, embedding a waitlist CTA, or asks how the registration email link works / where it lands.
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

1. **Confirm `appBaseUrl` is empty** (it is by default). If the merchant previously enabled Mode B, clear it:
   - **Vibe MCP (preferred):** call `vibe_update_brand` with `{ "appBaseUrl": "" }` — no API key needed.
   - **REST fallback:** `PUT /api/creator-subscription/config` with `{ "appBaseUrl": "" }`.
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

**Vibe MCP (preferred):** call `vibe_update_brand` with `{ "appBaseUrl": "https://your-app.example.com" }` — no `PORTALY_API_KEY` needed.

**REST fallback:**
```bash
curl -X PUT https://portaly.ai/api/creator-subscription/config \
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

## Sending a Campaign (Vibe MCP)

Independent of Mode A/B above. This workflow drives **outgoing follower-email campaigns** — drafting an invitation, queueing it to a recipient list, and reading back analytics. Available only when the agent is connected to the creator's Vibe MCP server (the install instructions for that are in the Vibe dashboard's onboarding flow). Authentication is the MCP Bearer token; no `PORTALY_API_KEY` involved.

See `references/sending-campaigns.md` for a copy-pastable end-to-end run.

### Tools

| Tool | Purpose |
|---|---|
| `vibe_list_campaigns` | Inventory: drafts to act on, in-flight sends, completed history. Filter by `status`. |
| `vibe_create_campaign` | Create a new campaign in `draft` status. Takes `name` (required, creator-facing only) plus optional `description` and `aiContext` (drafting hints). |
| `vibe_send_campaign` | Persist `subject` + `bodyHtml` onto a draft, enqueue to all imported recipients, return one of four outcomes (see below). |
| `vibe_get_campaign_analytics` | Funnel + event totals + 30-day timeseries for one campaign. |

### Workflow

1. **Confirm intent with the creator** — what's the campaign for? Is there an existing draft, or starting fresh? Call `vibe_list_campaigns` to check.
2. **Create the draft** with `vibe_create_campaign`. Pass any context the creator gives (campaign angle, tone, must-mention deadline) into `aiContext`. The campaign starts empty — no subject, no body, no recipients.
3. **Hand recipient import to the dashboard.** Tell the creator:
   > Recipient import is in the Vibe dashboard's **Email → Outreach** tab. Open your campaign there, upload a CSV / Google Sheet / paste addresses, then come back and tell me when you're done.
   Recipient management is intentionally not exposed via MCP — column-mapping a CSV in chat is fragile and the dashboard already has a preview UI.
4. **Draft `subject` + `bodyHtml`** with the creator. Constraints:
   - Subject ≤ 255 chars.
   - Body is HTML, ≤ 100,000 chars.
   - **Must include `{inviteUrl}`** somewhere in the body — that's the tracked invitation link the recipient clicks. Without it, you've shipped a CTA-less email.
   - Always-available placeholders: `{customerName}`, `{merchantName}`, `{inviteUrl}`. Any extra column the creator imported is exposed as `{slug}` — confirm those slugs with the creator before referencing them.
5. **Confirm with the creator before sending.** Sending is irreversible and burns from their monthly quota + purchased credits. Show the subject, the rendered body (or a preview link), the recipient count.
6. **Call `vibe_send_campaign`** with `campaignId`, `subject`, `bodyHtml`. Switch on the `outcome`:

| Outcome | Meaning | What to do |
|---|---|---|
| `enqueued` | Send is in flight | Tell the creator: enqueued N emails, M quota remaining. Optionally schedule a follow-up to call `vibe_get_campaign_analytics` after a few minutes. |
| `campaign_not_found` | id is wrong / belongs to another merchant | Recheck `vibe_list_campaigns`. |
| `no_recipients` | Imports are empty | Step 3 wasn't completed. Send the creator back to **Email → Outreach** to import their list. |
| `quota_exceeded` | Recipients > remaining quota | Response includes `remainingQuota` and `needed`. Tell the creator how short they are and that they can top up email credits in **Email → Credits** in the dashboard. Do NOT retry without the creator topping up. |

7. **Read analytics** with `vibe_get_campaign_analytics(campaignId)` once delivery has had time to register (a few minutes). The funnel goes `imported → enqueued → delivered → opened → clicked → bounced → complained → signedUp → converted`. `signedUp` only populates if the recipient hits the waitlist landing page (Mode A or B above); `converted` only fills if they later subscribe via `portaly-payment`.

### Guardrails for sending

- **Always include `{inviteUrl}`.** The whole point of the campaign is the click — without the placeholder, recipients see a wall of text with no CTA.
- **Confirm the recipient count before sending.** A misplaced 0 in a CSV column or a stale draft can lead to mass-emailing the wrong list. Read it back to the creator: "About to send to N people imported on <date>. Proceed?"
- **Do not call `vibe_send_campaign` repeatedly to "retry" a `quota_exceeded`.** That's a soft fail — the creator must top up first. Retrying without action just churns calls.
- **Subject lines for follower outreach matter more than for transactional email.** Push back if the creator gives a generic "Update from {merchantName}" — suggest something tied to the campaign's angle.

---

## Switching Modes

| From | To | Action |
|---|---|---|
| Mode A → Mode B | Set `appBaseUrl` via `PUT /api/creator-subscription/config` |
| Mode B → Mode A | Set `appBaseUrl` to `""` via `PUT /api/creator-subscription/config` |

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
- `references/sending-campaigns.md` — End-to-end campaign send via Vibe MCP, with body templates and outcome handling.
