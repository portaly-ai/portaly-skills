---
name: portaly-email
version: 0.3.0
description: Help Portaly creators run follower-email campaigns end-to-end — create a draft, save and iterate on subject + HTML body, send it via Vibe MCP, read post-send analytics — and wire up where the invitation email's CTA redirects (Portaly-hosted waitlist, self-hosted /waitlist/[slug], or directly into the creator's existing register flow). Trigger when the user mentions invitation emails, follower outreach campaigns, sending an email blast to followers, drafting an email campaign, waitlist signup landing page, app base URL, embedding a waitlist CTA, skipping the waitlist when a member system already exists, or asks how the registration email link works / where it lands.
---

# Portaly Vibe Invitation Email Integration

Use this skill to help a human user wire up the registration link from Portaly Vibe invitation emails to the right landing page.

## Concept

When a follower clicks the CTA in a Portaly invitation email, the request always hits `https://portaly.ai/r/{referralCode}` first — that endpoint is the central click tracker (rate limit, click-event log, attribution). Portaly then 302-redirects to a landing page; three modes pick where:

| Mode | Landing URL | `creatorSubscriptionConfig` |
|---|---|---|
| **A. Hosted waitlist** (default) | `https://portaly.ai/waitlist/{creatorSlug}` | `appBaseUrl` empty |
| **B. Self-hosted waitlist** | `https://{appBaseUrl}/waitlist/{creatorSlug}` | `appBaseUrl` set, `inviteRedirectPath` empty |
| **C. Direct register** | `https://{appBaseUrl}{inviteRedirectPath}` | both set (e.g. `inviteRedirectPath: "/signup"`) |

`?ref` / `utm_source=invitation` / `utm_campaign` / `utm_content` are appended in all three modes — attribution survives. Toggling propagates within ~60 seconds (Portaly's per-process cache TTL) and applies to every email already in flight.

**Mode C trade-off:** recipients bypass the Portaly waitlist. To get the new follower into the creator's user list and stamp the `signedUp` funnel stage, the register flow must call `syncToPortaly` (see `portaly-user`) with `signupRefCode` set. Without that call, the creator never sees the user and the campaign analytics' `signedUp` and `converted` both stay at 0 — `converted` only stamps for recipients whose `signedUp` has already been recorded.

## Email Types Reference

Portaly Vibe ships two distinct email categories:

### 1. Built-in system emails (3)

Auto-fired on subscription-lifecycle events. One shared template per merchant — the creator edits subject/body or toggles `enabled` via `vibe_update_template`.

| Template type | Triggered by | Common reason to disable |
|---|---|---|
| `welcome_free` | `POST /admin/users/sync` upserts a user with no active subscription | The vibe coder's app already sends its own welcome email |
| `welcome_paid` | Payment callback (status `completed`), or sync that adds an active subscription | The vibe coder customizes the upgrade email in their own product |
| `subscription_canceled` | `POST /subscriptions/{id}/cancel`, or self-service portal cancel | The vibe coder wants control over cancellation timing/copy |

Disable from the dashboard or via REST:
```bash
curl -X PUT https://portaly.ai/api/creator-email/templates/welcome_free \
  -H "Authorization: Bearer ${PORTALY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": false }'
```
Disabling takes effect immediately for new triggers; already-enqueued outbox rows still send.

> **Avoiding double emails.** If the vibe coder has their own welcome / upgrade / cancellation flow, disable the matching template *before* wiring `syncToPortaly` (see `portaly-user`) or the payment callback handler (see `portaly-payment`). Otherwise the first bulk sync sends a Portaly `welcome_free` to every existing user, and every successful checkout sends a `welcome_paid` on top of the vibe coder's own message.

### 2. Follower-flow emails

Tied to the invitation / waitlist loop. Body source differs:

| Template type | When it sends | Where the body comes from | Mode |
|---|---|---|---|
| `follower_invitation` | When `vibe_send_campaign` dispatches a campaign | **Per-campaign** — saved on the campaign record by `vibe_create_campaign` / `vibe_update_campaign`. A `follower_invitation` template also exists in `vibe_list_templates`, but it's only used to seed the very first "Invitation" campaign at brand onboarding — editing it later has no effect on subsequent campaigns. | A / B / C |
| `waitlist_onboarding` | When a follower POSTs to `/api/waitlist/{slug}` after clicking an invitation | Per-merchant template (editable via `vibe_update_template`, like the system emails above) | A / B only — Mode C skips this endpoint |

## API Host

`https://portaly.ai`

## Authentication

Same Creator Subscription API Key (`pcs_live_*` / `pcs_test_*`) used by `portaly-payment`.

## Workflow

### Step 1 — Choose Mode

Before writing any code, **ask the human user which mode they want** and wait for an explicit answer. If the project already has a register / signup flow, surface Mode C — they almost certainly want it.

> Portaly Vibe sends invitation emails on behalf of creators. The CTA in those emails goes through Portaly for click tracking, then redirects somewhere on the recipient side. You have three options:
>
> - **A. Hosted waitlist (fastest launch)** — Use Portaly's hosted waitlist page. No server-side work. Best when you don't have a brand reason to host it yourself.
> - **B. Self-hosted waitlist (brand consistency)** — Host `/waitlist/[creatorSlug]` on your own domain. Full control over UI / copy. Requires implementing the page and registering your `appBaseUrl` with Portaly.
> - **C. Direct register (skip the waitlist)** — Recommended when your app already has a member system. Clicks land directly on your existing register / signup path (e.g. `/signup`). Requires `appBaseUrl` + `inviteRedirectPath`. You'll need to call `syncToPortaly` after signup so campaign analytics' `signedUp` count populates.
>
> Which would you like? You can switch later.

Jump to *Mode A — Hosted CTA*, *Mode B — Self-hosted Waitlist*, or *Mode C — Direct Register* based on the answer.

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

### Mode C — Direct Register

Use when the project already has its own register / signup flow.

#### Step C1 — Set `appBaseUrl` and `inviteRedirectPath`

**Vibe MCP (preferred):** call `vibe_update_brand` with both fields:
```
{ "appBaseUrl": "https://your-app.example.com", "inviteRedirectPath": "/signup" }
```

**REST fallback:**
```bash
curl -X PUT https://portaly.ai/api/creator-subscription/config \
  -H "Authorization: Bearer ${PORTALY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "appBaseUrl": "https://your-app.example.com", "inviteRedirectPath": "/signup" }'
```

`inviteRedirectPath` constraints:
- Starts with `/`. Allowed chars: letters, digits, `-`, `_`, `/` (no `?` or `#` — Portaly appends its own query string).
- Max 200 chars; trailing slashes stripped.
- Empty string clears it — the merchant falls back to Mode B (or Mode A if `appBaseUrl` is also empty).

#### Step C2 — Read attribution params on the register page

Portaly appends:

| Param | Purpose |
|---|---|
| `ref` | Referral code; pass back to `syncToPortaly` so the signup attributes to the campaign |
| `utm_source` | Always `invitation` |
| `utm_campaign` | Campaign id |
| `utm_content` | Outbox id (per-recipient identifier) |

Read these on first hit and stash them (cookie / localStorage / hidden form field) so they survive multi-step signup.

#### Step C3 — Wire `syncToPortaly` after register

After register completes, call `syncToPortaly` (see `portaly-user`) with the new user's email + name + `signupRefCode` set to the URL's `utm_content` (preferred — the per-recipient outbox UUID) or `ref` as fallback.

```ts
const signupRefCode = utm_content || ref
syncToPortaly([{ email, name, signupRefCode }]).catch((err) =>
  console.error('[Portaly Sync]', err)
)
```

`converted` stamps automatically when the recipient later subscribes via `portaly-payment` — Portaly matches the buyer's checkout email against this campaign's import list.

#### Step C4 — Verify

1. Send a test invitation email from the dashboard.
2. Click the CTA. The browser should redirect through `portaly.ai/r/...` and land on `https://your-app.example.com{inviteRedirectPath}?ref=...&utm_source=invitation&...`.
3. Complete signup. Confirm the new user appears in the Portaly Dashboard's user list (= `syncToPortaly` ran).
4. A few minutes later, call `vibe_get_campaign_analytics` and check `signedUp ≥ 1`.

---

## Sending a Campaign (Vibe MCP)

Sends an invitation campaign to a follower list and reads back analytics. Independent of Mode A/B. Requires Vibe MCP connection; auth is the MCP Bearer token. See `references/sending-campaigns.md` for an end-to-end run.

### Tools

| Tool | Purpose |
|---|---|
| `vibe_list_campaigns` | List drafts, in-flight sends, and completed history. Filter by `status`. |
| `vibe_create_campaign` | Create a draft. Takes `name` plus `subject` / `bodyHtml` / `description` / `aiContext`. |
| `vibe_update_campaign` | Edit a draft's `name`, `description`, `aiContext`, `subject`, or `bodyHtml`. |
| `vibe_send_campaign` | Dispatch the saved draft. Takes only `campaignId`. Returns one of five outcomes (see below). |
| `vibe_get_campaign_analytics` | Funnel + event totals + 30-day timeseries for one campaign. |

### Workflow

The dashboard step order is **Email content → Recipients → Send**. The MCP flow follows the same order.

1. **Check for an existing draft** with `vibe_list_campaigns`.
2. **Draft `subject` + `bodyHtml`** with the creator. Constraints:
   - Subject ≤ 255 chars; body is HTML, ≤ 100,000 chars.
   - Body must include `{inviteUrl}` — the tracked invitation link the recipient clicks.
   - Built-in placeholders: `{customerName}`, `{merchantName}`, `{inviteUrl}`. Any column the creator imported is exposed as `{slug}` — confirm slugs with the creator before referencing them.
3. **Create the draft** with `vibe_create_campaign({ name, subject, bodyHtml, aiContext? })`. Subject + body are saved on the draft so the dashboard preview matches the chat.
4. **Send the creator to import recipients** in the dashboard's **Recipients** tab (CSV / Google Sheet / paste). There is no MCP tool for import.
5. **Revise copy** by calling `vibe_update_campaign({ campaignId, subject?, bodyHtml? })`. `vibe_send_campaign` does not accept subject/body, so revisions go here.
6. **Confirm with the creator before sending** — read back the saved subject, a body excerpt, and the recipient count. Sending is irreversible and burns quota.
7. **Call `vibe_send_campaign({ campaignId })`**. Switch on the `outcome`:

| Outcome | Meaning | What to do |
|---|---|---|
| `enqueued` | Send is in flight | Report `enqueuedCount` and `remainingQuota`. Optionally call `vibe_get_campaign_analytics` after a few minutes. |
| `campaign_not_found` | Wrong id, or belongs to another merchant | Recheck `vibe_list_campaigns`. |
| `no_recipients` | Recipients tab is empty for this campaign | Send the creator back to import. |
| `missing_content` | Draft has no saved subject or body | Call `vibe_update_campaign` with the missing fields, then retry. |
| `quota_exceeded` | Recipients > remaining quota | Response includes `remainingQuota` and `needed`. Tell the creator the shortfall and point at **Email → Credits** to top up. |

8. **Read analytics** with `vibe_get_campaign_analytics(campaignId)` after a few minutes. The funnel: `imported → enqueued → delivered → opened → clicked → bounced → complained → signedUp → converted`. `signedUp` stamps when the recipient submits the waitlist form (Mode A/B) or when `syncToPortaly` runs in Mode C — both paths require the per-recipient `outboxId` (URL `utm_content`) to pin the right row; campaign-level refcodes alone don't pin. `converted` stamps when the recipient later subscribes via `portaly-payment` and the checkout email matches the imported email on a row that already has `signedUp` set.

### Guardrails for sending

- Body must include `{inviteUrl}`.
- Read the recipient count back to the creator before sending — a stale draft can mass-email the wrong list.
- `quota_exceeded` requires a top-up before retrying.

---

## Guardrails

- `appBaseUrl` must be HTTPS. `localhost` cannot be used in production — for local dev use ngrok / Cloudflare Tunnel.
- Click tracking always runs through `portaly.ai/r/{code}`. Pointing the email CTA directly at the creator's domain loses click tracking and rate limiting.
- Mode B: include the `ref` query param in the POST body to `/api/waitlist/{slug}` — the waitlist row inherits it as `referralCode`, which is how Portaly links the signup back to the original campaign. The waitlist endpoint ignores `utm_*` (they're for the creator's own analytics if they want them).
- Mode C: call `syncToPortaly` after a successful register, otherwise the new follower never appears in the creator's user list on the dashboard.

## Output Preferences

- Always confirm A vs B vs C with the user before doing setup work. If the project already has a register flow, surface C first.
- For Mode A, prefer one short paragraph + the CTA URL. No code templates needed.
- For Mode B, lean on `references/self-hosted-waitlist.md` instead of inlining all the code.
- For Mode C, no new page is needed — focus on the `inviteRedirectPath` config and the `syncToPortaly` wiring.
- Keep secrets (API keys) out of chat — write `.env` instructions instead.

## Reference Documents

- `references/hosted-cta.md` — Mode A snippets and CTA placement examples.
- `references/self-hosted-waitlist.md` — Mode B implementation templates for Next.js, React SPA, and plain HTML.
- `references/sending-campaigns.md` — End-to-end campaign send via Vibe MCP, with body templates and outcome handling.
