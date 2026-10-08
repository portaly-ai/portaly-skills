---
name: portaly-email
# Top-level `version` is what Portaly's skill-versions endpoint parses (its regex
# is anchored to the start of a line, so it cannot read the indented
# metadata.version). Keep the two in sync until that parser reads YAML.
version: 0.1.2
metadata:
  version: "0.1.2"
description: "Help users send email (order receipts, sign-in codes, notifications, newsletters, promotions) from their own domain through Portaly's email API — API key setup, sending-domain verification, the sandbox, sending single, batch and scheduled emails, delivery status, quota, and testing bounces safely with the mailbox simulator. Trigger when the user wants their app to send email through Portaly, mentions Portaly Email, a pem_ key, sandbox.portaly.tw, or is troubleshooting a Portaly email that bounced, was rejected, or never arrived. Portaly Email is in an invite-only beta: only accounts Portaly has invited can use it."
---

# Portaly Email (Beta)

Use this skill to help a human user (a creator, usually not an engineer) wire their app's own
email — receipts, verification codes, password resets, notifications, newsletters — to Portaly's
email API.
Keep answers operational: next steps first, then copy-ready code in the project's own stack.

> **Beta — invite only.** Portaly Email is in beta and only accounts Portaly has invited can use it.
> Any other account gets `403 FORBIDDEN` on every call, and there is nothing the agent can do about
> it except tell the user to contact Portaly. Creating an email API key or binding a domain also needs
> the Premium plan, which carries the monthly quota. Say this before any setup work if the user has
> not mentioned being invited.

## API Host

```ts
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'
```

Leave `PORTALY_API_HOST` unset unless the user is deliberately pointing at a non-production
Portaly. The full, authoritative contract is `https://portaly.ai/docs` (Email section) and
`https://portaly.ai/openapi.json`; `references/api-contract.md` here is the working copy. When they
disagree, the docs win.

## Quick Start

1. **Ask first** — the sandbox (test mail to the user's own inbox, no DNS) or their own domain (mail
   to real customers)? The answer decides which key to create. (Workflow step 1.)
2. **Set up** — the human creates the key from a clickable admin link and puts it in `.env` as
   `PORTALY_EMAIL_API_KEY`. For their own domain, the agent binds it through the API, walks them
   through the DNS records, and confirms verification. (Workflow step 2.)
3. **Send** from server-side code with an `Idempotency-Key`. (Workflow step 3.)
4. **Handle the response and track delivery** — retry what is retryable, alert on quota, and record
   bounced and complained addresses. (Workflow steps 4–5.)

## Admin Pages

The human's setup steps happen on these pages. Each link opens the right tab directly; a
signed-out user is sent through sign-in and back to the same page.

| Page | Link | What the human does there |
|---|---|---|
| API 管理 (API keys) | https://portaly.cc/admin/email/api-keys | 「建立 API Key」, copy the key (shown once), 「撤銷」 a leaked one |
| 寄件網域 (sending domains) | https://portaly.cc/admin/email/domains | 「新增網域」, 「查看」 its DNS records, 「重新檢查」 after adding them |
| 寄信紀錄 (send log) | https://portaly.cc/admin/email/messages | What was sent and each recipient's status |
| 訂閱管理 (plan) | https://portaly.cc/admin/subscription | Upgrade to Premium |

- **Hand over the link itself, clickable.** Put the URL on its own line as plain text or a Markdown
  link — never in backticks or a code block, which most chat panes and terminals show as dead text.
  Then list the buttons to press, using the admin's own labels as above. Never make the human
  navigate menus to find a page.
- If a link lands on the dashboard home instead of 信件管理, the account is not in the email beta:
  stop and tell them to contact Portaly.

## Workflow

### 1. Ask where the mail comes from — before any setup

A key's sending domains are fixed when it is created, so settle this before the human makes one.
Ask, in the user's own language:

> Do you want to test with Portaly's sandbox first, or send from your own domain to real customers?

- **Sandbox** — no DNS, ready in minutes. Mail comes from `<name>@sandbox.portaly.tw` and reaches
  only the account owner's verified sign-in email, up to 50 a day. Right for proving the code works.
- **Own domain** — needed to email anyone else. The human must be able to edit the domain's DNS, and
  verification takes minutes to hours; the sandbox covers the wait.
- Not sure → sandbox. Moving to a domain later is a new key and a config change, not new code.

Skip the question if the user has already answered it. If `PORTALY_EMAIL_API_KEY` is already set,
don't have them create another key — ask which domains it covers (the 網域 column on the API 管理
page) and only create a new one if it lacks the domain they want.

### 2. Set up the sender (human steps)

**Sandbox:**

1. Send them to https://portaly.cc/admin/email/api-keys → 「建立 API Key」 → name it → 權限
   「僅寄信」 → 網域 `sandbox.portaly.tw` (already ticked while no domain is verified) → 「建立」.
2. They copy the key — it is shown once — into `.env` (see "The key" below).
3. Sender: `<name>@sandbox.portaly.tw`. `<name>` is 3–32 letters, digits, `.`, `_` or `-`, must not
   contain `portaly`, and must not be a reserved name such as `noreply`, `no-reply`, `support`,
   `info` or `admin` (`400 INVALID_SENDER`) — e.g. `orders` or `hello`. Recipient: the account
   owner's verified sign-in email. If the owner signs in without a verified email (e.g. by phone or
   LINE), the sandbox cannot deliver at all (`403 RECIPIENT_NOT_ALLOWED`) — use the own-domain path.

This key is the test key — there is no separate test mode — and it cannot send from a domain bound
later (`403 DOMAIN_NOT_ALLOWED`). When they move to their own domain, they follow the own-domain path
with a new key.

**Own domain** — the human creates the key and adds the DNS records; the agent binds the domain
and checks verification through the API:

1. Ask which address mail should come from (`orders@…`). Recommend a **subdomain that does not
   receive mail**, e.g. `mail.example.com`, so a bounce problem never touches their main inbox. If the
   app sends both marketing mail (newsletters, promotions) and account mail (receipts, codes),
   suggest one subdomain for each, e.g. `news.example.com` and `notify.example.com`: bounces and
   complaints count per domain, so a complaint spike on a newsletter never blocks sign-in codes.
2. Send them to https://portaly.cc/admin/email/api-keys → 「建立 API Key」 → name it → 權限
   「完整權限」 → 「建立」 → copy it into `.env`. A full key covers every domain — the sandbox now,
   the new domain once it verifies — and is the only kind that can bind and verify domains.
3. Bind it: `POST {PORTALY_API_HOST}/api/email/domains` with `{ "host": "mail.example.com" }`, from a
   shell or script that reads the key from `.env` — never print it. Keep `data.id` for step 6. `409 HOST_ALREADY_BOUND` means it is already theirs — find it with
   `GET /api/email/domains`. `403 PREMIUM_REQUIRED` → send them to
   https://portaly.cc/admin/subscription. `409 HOST_TAKEN` → another Portaly account holds it;
   pick another subdomain or contact Portaly.
4. Hand over the DNS records from `data.dnsRecords`: three DKIM `CNAME`s, then an `MX` and a `TXT`
   for the MAIL FROM subdomain (SPF), then the optional DMARC `TXT` (`optional: true`).
   - Find their DNS provider first (`dig +short NS example.com` — the nameservers name it) and give
     that provider's steps. Show the records as a table of type, name, value and, for the `MX`,
     priority. `name` is the full hostname; most providers want only the part before their domain
     (`bounce.mail` for `bounce.mail.example.com`), so write what to type.
   - On Cloudflare, every new record is **DNS only** (grey cloud), not proxied.
   - Leave the existing records for the main domain (its `MX`, SPF, DKIM) alone.
   - DMARC: recommend it — Gmail requires DMARC from senders of more than 5,000 emails a day —
     **unless the domain already has DMARC** (`dig +short TXT _dmarc.example.com`): a stricter
     existing policy would be loosened for this subdomain.
5. When they say the records are in, check them yourself: `dig +short <TYPE> <name>` for each, or
   `https://dns.google/resolve?name=<name>&type=<TYPE>` without `dig`. Point out a missing or
   mistyped record before asking Portaly.
6. Verify: `POST {PORTALY_API_HOST}/api/email/domains/{id}/verify`. Ready when `identityStatus` is
   `"verified"` and `mailFromStatus` is `"success"`; DMARC does not affect either.
   - Still `pending`: Portaly does not see the records yet. Wait a minute or more between calls —
     DNS can take minutes to hours, and the human does not have to stay in the session for it.
   - `failed`: compare every record with `dnsRecords` again. If `identityStatus` stays `failed`, or
     the call answers `409 IDENTITY_NOT_FOUND`, they unbind the domain at
     https://portaly.cc/admin/email/domains and you bind it again.
7. Build and test against the sandbox meanwhile (sender and recipient as in the sandbox path).
   Switching to the domain is a change to `EMAIL_FROM`, not code.
8. The sending subdomain does not receive mail, so set `replyTo` to an address that does (e.g.
   `support@example.com`); otherwise customers' replies go nowhere.

If the human would rather click through it, the admin does the same: https://portaly.cc/admin/email/domains
→ 「新增網域」 → the DNS records appear right away → after adding them, 「重新檢查」.

**The key, either path:**

- Keys start with `pem_`. 「僅寄信」 (`sending`) can send, list, look up, cancel and check quota;
  「完整權限」 (`full`) can also bind, list and verify domains, and covers every domain. If they
  would rather the deployed app hold a send-only key, they create a 「僅寄信」 key for the verified
  domain afterwards and keep the full one out of production.
- **This is not the Portaly Payment key.** `pcs_live_` / `pcs_test_` keys cannot send email, and a
  `pem_` key cannot call payment endpoints. A project using both keeps both.
- **Never ask the user to paste the key into chat.** Tell them to add it to `.env` themselves:

  ```
  PORTALY_EMAIL_API_KEY=pem_xxx
  ```

  Read it with `process.env.PORTALY_EMAIL_API_KEY`. Make sure `.env` is in `.gitignore` before
  anything else. If a key is pasted into chat, tell them to revoke it on the API 管理 page and create
  a new one.
- **Server-side only.** Never put the key in browser code, a `NEXT_PUBLIC_` / `VITE_` variable, a
  mobile app, or anything shipped to users: anyone holding it can send email as the creator's domain.
- Never try to send from `mail.portaly.tw` or any other Portaly domain — it answers `403 DOMAIN_NOT_ALLOWED`.

### 3. Send

`POST {PORTALY_API_HOST}/api/email/emails`, from server-side code only.

```ts
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'

export class PortalyEmailError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly retryAfterSeconds: number | null

  constructor(status: number, code: string | undefined, message: string | undefined, retryAfterSeconds: number | null) {
    super(message ?? `Portaly email API answered ${status}`)
    this.name = 'PortalyEmailError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  idempotencyKey: string // derive from your own event, e.g. `order-${orderId}-receipt`; letters, digits, `_`, `-`
}) {
  const res = await fetch(`${PORTALY_API_HOST}/api/email/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PORTALY_EMAIL_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_FROM, name: 'Example Shop' },
      replyTo: process.env.EMAIL_REPLY_TO, // the sending subdomain does not receive mail
      recipients: [{ email: input.to }],
      subject: input.subject,
      html: input.html,
      tags: [{ name: 'ref', value: input.idempotencyKey }], // to find this email again (step 4, 409)
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const retryAfter = res.headers.get('retry-after')
    throw new PortalyEmailError(res.status, body.error?.code, body.error?.message, retryAfter ? Number(retryAfter) : null)
  }
  return body.data.id as string // emsg_…, store it next to your own record
}
```

- **Always send an `Idempotency-Key`, derived from the business event** — not a random value per
  attempt. A retry with the same key never sends twice; that is what makes retrying a timeout safe.
- **One key per email you mean to send, never one per user.** Keys never expire and Portaly does not
  compare the body: a reused key returns the first email's id and sends nothing. `order-${orderId}-receipt`
  is right; `password-reset-${userId}` silently drops every reset after the first — use the reset
  request's own id. If the content changes, use a new key.
- Keys are scoped to the Portaly account and the sending domain. If staging and production send from
  the same account and domain, prefix the key with the environment (`prod-order-…`) — ids that repeat
  across environments would otherwise make production silently reuse staging's email.
- Tag every email with its key (`{ name: 'ref', value: <key> }`, as above): list results do not
  include the `Idempotency-Key`, so the tag is how you find a specific email again. Tag values allow
  only letters, digits, `_` and `-`, so build keys from those.
- Keep `EMAIL_FROM` and `EMAIL_REPLY_TO` in config, so moving from the sandbox to the verified domain
  is a config change.
- Store the returned `id` with the order/user it belongs to — it is how you look up delivery later.
- Recipients: up to 50 per email as `{ email, type }` with `type` `to` / `cc` / `bcc` (default `to`).
  It is **one message** — cc recipients see each other. For separate messages to many people, use
  `POST /api/email/batches` (up to 100 emails, sent in the background).
- `scheduledAt` (ISO 8601 with time zone, 1 minute to just under 30 days ahead — 30 days minus 10
  minutes) schedules it and answers `202`;
  `POST /api/email/emails/{id}/cancel` cancels before it goes out.
- Attachments: `content` (base64, files up to ~3 MB — requests are capped at 4.5 MB) or `url` (a public
  https URL Portaly downloads). 10 MB per email in total.
- Field-level rules and the batch shape are in `references/api-contract.md`.

### 4. Handle the response

Every error is `{ "error": { "code", "message" } }`. Branch on `code`, never on `message`.

| Response | What the code should do |
|---|---|
| `200` / `202` | Store `data.id`. |
| `429 RATE_LIMITED` | Per-key rate limit. Wait `Retry-After` seconds, retry with the same `Idempotency-Key`. |
| `500`, any `503`, network error or timeout | Retry with the same `Idempotency-Key`, with exponential backoff and a cap (e.g. 5 attempts), then queue it for a later job and alert; it will not double-send. `Retry-After` is in seconds. |
| `502 SEND_OUTCOME_UNKNOWN` | It may have gone out. Retry with the same `Idempotency-Key`; until Portaly learns the outcome that retry answers `409`. |
| `409 IDEMPOTENCY_KEY_IN_USE` | Retry with the same key for up to about 10 minutes — **cap it, never loop forever**. Still `409` after that means it most likely never went out (the key stays `409` for good): find it with `GET /api/email/emails?status=unknown&tag=ref:<key>`, then alert a human or resend with a new key, accepting a small risk of a duplicate. |
| `429 SEND_QUOTA_EXCEEDED` | **Not transient. Do not retry in a loop.** Alert a human (log at error level, notify); the creator buys more quota or waits for the monthly reset. |
| `429 SANDBOX_DAILY_LIMIT_REACHED` | 50 sandbox emails a day; resets at midnight Asia/Taipei. |
| `422 RECIPIENT_SUPPRESSED` | Every `to` address is on Portaly's suppression list (it hard-bounced, or several Portaly senders got spam complaints from it). Don't retry. Mark them invalid in your DB and ask a signed-in user for a new address; in signed-out flows (password reset) show the usual generic message so you don't reveal whether the account exists. |
| `422 MESSAGE_REJECTED` | The mail service refused this message. The same key keeps answering this — fix it and send with a new key. |
| `403 DOMAIN_NOT_ALLOWED` | The domain is not bound to this account, is a Portaly domain, or the key does not cover it (step 2; the API 管理 page lists each key's domains). Surface it to the creator, don't retry. |
| other `403 DOMAIN_*` | Setup problem — see step 2. Surface it to the creator, don't retry. |
| `403 HARD_BOUNCE_LIMIT_REACHED` | The domain hit today's hard-bounce limit and is blocked for the rest of the day, usually suspended next. Stop sending from it, alert a human, and clean up the `bounced` addresses (step 5). Don't retry today. |
| `403 RECIPIENT_NOT_ALLOWED` | Sandbox sending to someone other than the account owner. |
| other `4xx` | Fix the request; `INVALID_BODY` messages start with the bad field (`recipients.0.email: …`). |

- To avoid hitting the quota wall, check `GET /api/email/quota` (`data.remaining`) before large sends
  or on a schedule, and warn the creator when it runs low. Quota is per recipient and shared with the
  broadcasts they send from the admin; sandbox email does not use it.

### 5. Track delivery

Webhooks are **not available yet**. Run a periodic job (e.g. every 10–15 minutes) that lists recent
problems with `GET /api/email/emails?recipientStatus=bounced,complained&startDate=…`, paging with
`startAfter=<pagination.nextCursor>`. `startDate` filters on when the email was created, and
complaints can arrive days later, so look back about 7 days each run. If the app uses `scheduledAt`
or batches, also list `recipientStatus=failed,quota_exceeded,domain_limited,suppressed`: those are
checked when they come due, and a blocked one only shows up here.

`GET /api/email/emails/{id}` shows one email's recipients — fine for a handful, but reads share 120
requests per minute per key with listing and quota, so polling every email individually breaks down
once the app sends more than a few dozen a minute.

- `bounced` — the address does not exist. Mark it invalid in your DB and stop sending to it; ask the
  user to update their email.
- `complained` — the recipient marked it as spam. **Portaly does not block your later API email to
  them** — record it and stop sending them anything optional yourself.
- `suppressed` — Portaly skipped this address because it is on Portaly's suppression list (an earlier
  hard bounce, or spam complaints to several Portaly senders). Suppressed recipients do not use quota.
- `soft_bounced` — a temporary failure (mailbox full, server down) after retries. No action unless it
  keeps happening for the same address.
- `delivered` means the receiving server accepted it; whether it landed in spam is not visible.
- Addresses in responses are masked (`bu***@example.com`); recipients keep the order you sent them in,
  so map statuses back to your records by position.

Bounces and complaints count against the creator's domain. A domain that keeps bouncing is blocked
for the day (`403 HARD_BOUNCE_LIMIT_REACHED`) and then suspended — acting on `bounced` is not optional.

### 6. Test safely

- Code path: the sandbox, to the account owner's own email.
- Bounce and complaint handling: from the **verified custom domain**, send to the mailbox simulator —
  these never reach a real inbox and do not count against the domain's bounce or complaint rate
  (they do use quota):

  | Address | Result |
  |---|---|
  | `success@simulator.amazonses.com` | `delivered` |
  | `bounce@simulator.amazonses.com` | `bounced` |
  | `complaint@simulator.amazonses.com` | `delivered`, then `complained` |

  Then poll `GET /api/email/emails/{id}` and confirm the user's code marks the address the way step 5
  says.
- **Never test with made-up addresses at real providers** (`test123@gmail.com`, `asdf@example.org`):
  real hard bounces count, and a few of them can suspend the creator's domain.

## Guardrails

- **Newsletters and promotions need an unsubscribe** — a link in the body plus the `List-Unsubscribe`
  and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (`references/api-contract.md`).
  Gmail and Yahoo expect one-click unsubscribe from bulk senders. Stop mailing anyone who unsubscribes
  or shows up as `complained`.
- **Only mail people who expect it** — customers and people who signed up; never bought or scraped
  lists. Complaints count against the creator's domain and can get it suspended.
- **Rate-limit public forms that send email** (password reset, sign-up, contact) per address and per
  IP. Anyone can trigger them, and a flood burns the quota, draws complaints and gets the domain
  suspended.
- **Never expose the key client-side**, never log it, never commit it.
- **Never retry `SEND_QUOTA_EXCEEDED` or other `4xx` in a loop** — `409` only up to a cap (step 4);
  respect `Retry-After`; always retry with the same `Idempotency-Key`.
- **Never use fake recipient addresses for testing** — use the sandbox or the simulator.
- **Confirm before real sends to real people** during development (anything not to the account owner
  or the simulator): state who will receive what, and wait for the user's yes.
- Do not invent fields, statuses or limits. If something here and `https://portaly.ai/docs` disagree,
  the docs win.
- Rate limits per key per minute: 60 recipients on `POST /emails`, 10 batches, 120 reads, 20 cancels
  or domain binds. Spread bulk work out instead of bursting.

## Deliverables

- a short setup checklist for the human (key, domain, DNS, `.env`), each step with its clickable admin link
- a server-side `sendEmail` helper in the project's stack, with idempotency and the error handling above
- a delivery-tracking job that records `bounced` / `complained` addresses
- test steps using the sandbox and the mailbox simulator

## Resources

- `references/api-contract.md` — every endpoint, field, status and error code.
- `https://portaly.ai/docs` (Email section) and `https://portaly.ai/openapi.json` — authoritative contract.
- `../portaly-overview/SKILL.md` — what else Portaly can do, e.g. payments for the same app.
