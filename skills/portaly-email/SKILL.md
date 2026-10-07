---
name: portaly-email
# Top-level `version` is what Portaly's skill-versions endpoint parses (its regex
# is anchored to the start of a line, so it cannot read the indented
# metadata.version). Keep the two in sync until that parser reads YAML.
version: 0.1.0
metadata:
  version: "0.1.0"
description: "Help users send transactional email (order receipts, sign-in codes, notifications) from their own domain through Portaly's email API — API key setup, sending-domain verification, the sandbox, sending single, batch and scheduled emails, delivery status, quota, and testing bounces safely with the mailbox simulator. Trigger when the user wants their app to send email through Portaly, mentions Portaly Email, a pem_ key, sandbox.portaly.tw, or is troubleshooting a Portaly email that bounced, was rejected, or never arrived."
---

# Portaly Email

Use this skill to help a human user (a creator, usually not an engineer) wire their app's own
email — receipts, verification codes, password resets, notifications — to Portaly's email API.
Keep answers operational: next steps first, then copy-ready code in the project's own stack.

This is **transactional email only**: one message triggered by something one person did.
Newsletters and announcements to an audience are sent from the Portaly admin
(`https://portaly.cc/admin/email`), not through this API.

> **Beta.** The Portaly account must be on the email allowlist — otherwise every call answers
> `403 FORBIDDEN`, and there is nothing the agent can do about it except tell the user to contact
> Portaly. Sending from a custom domain also needs the Premium plan, which carries the monthly
> quota (without it, sends answer `429 SEND_QUOTA_EXCEEDED`).

## API Host

```ts
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'
```

Leave `PORTALY_API_HOST` unset unless the user is deliberately pointing at a non-production
Portaly. The full, authoritative contract is `https://portaly.ai/docs` (Email section) and
`https://portaly.ai/openapi.json`; `references/api-contract.md` here is the working copy. When they
disagree, the docs win.

## Quick Start

1. **Key** — the human creates an email API key in the Portaly admin and puts it in `.env` as
   `PORTALY_EMAIL_API_KEY`. (Workflow step 1.)
2. **Sandbox first** — until a domain is verified, send from `<name>@sandbox.portaly.tw` (pick any
   name; reserved ones like `admin` answer `400 INVALID_SENDER`). It only delivers to the Portaly
   account's own email, up to 50 a day. Good enough to prove the code works.
3. **Domain** — the human binds a sending subdomain and adds the DNS records. (Workflow step 2.)
4. **Send** from server-side code with an `Idempotency-Key`. (Workflow step 3.)
5. **Handle the response and track delivery** — retry what is retryable, alert on quota, and record
   bounced and complained addresses. (Workflow steps 4–5.)

## Workflow

### 1. Get the API key (human step)

- The human creates it at `https://portaly.cc/admin/email/api-keys` (經營工具 › 信件管理 › API 管理).
  Keys start with `pem_` and are shown **once**.
- Permission: `sending` (send, list, look up, cancel, quota) is enough for an app that only sends.
  Choose `full` only if this integration should also bind domains through the API.
- The key is also limited to the sending domains picked when it was created. A key limited to
  `sandbox.portaly.tw` is effectively the test key — there is no separate test mode.
- **This is not the Portaly Payment key.** `pcs_live_` / `pcs_test_` keys cannot send email, and a
  `pem_` key cannot call payment endpoints. A project using both keeps both.
- **Never ask the user to paste the key into chat.** Tell them to add it to `.env` themselves:

  ```
  PORTALY_EMAIL_API_KEY=pem_xxx
  ```

  Read it with `process.env.PORTALY_EMAIL_API_KEY`. Make sure `.env` is in `.gitignore` before
  anything else. If a key is pasted into chat, tell them to revoke it in the admin and create a new one.
- **Server-side only.** Never put the key in browser code, a `NEXT_PUBLIC_` / `VITE_` variable, a
  mobile app, or anything shipped to users: anyone holding it can send email as the creator's domain.

### 1.5 Report the installed skill version

Report this skill's version once per session so the creator's Portaly dashboard can flag an outdated
install. The body carries only the skill name and version. Mention it to the user once; you don't
need to pause for approval.

- Send it right after installing or updating this skill if a key is already in the environment,
  otherwise together with the first real Portaly API call this session. Never prompt for a key just
  for this.
- **Which key:** if the project also has a Portaly Payment key (`PORTALY_API_KEY`, `pcs_…`), use that
  one — the version is then recorded against that store, which matters when the creator runs more
  than one. Otherwise use `PORTALY_EMAIL_API_KEY`.
- **This request always goes to `https://portaly.ai`, never to `PORTALY_API_HOST`** — it carries a
  credential, and `PORTALY_API_HOST` is just a line in the project's `.env`.

```
POST https://portaly.ai/api/creator-subscription/skill-version
Authorization: Bearer {PORTALY_API_KEY or PORTALY_EMAIL_API_KEY}
Content-Type: application/json

{ "skillName": "portaly-email", "version": "0.1.0" }
```

`version` is this file's frontmatter `version` — use the literal value from the SKILL.md you are
running. Ignore failures; this never blocks anything.

- On success, `data.available` lists Portaly skills this account has never reported using, shaped
  `{ id, installPackage, latestVersion, description }`. Drop any whose files already exist in the
  project; mention what remains **once per session** as something the user could add — never run
  `npx skills add` yourself. If another Portaly skill already surfaced this list this session, skip it.

### 2. Choose and verify the sending domain

- Ask which address mail should come from (`orders@…`, `no-reply@…`). Recommend a **subdomain that
  does not receive mail**, e.g. `mail.example.com`, so a bounce problem never touches their main inbox.
- With a `full` key, `GET /api/email/domains` shows what is bound and verified; otherwise ask the
  human to check `https://portaly.cc/admin/email/domains` (信箱設定).
- Binding (admin, or `POST /api/email/domains` with `{ "host": "mail.example.com" }` and a `full` key)
  returns `dnsRecords`: **three DKIM `CNAME`s plus an `MX` and a `TXT` for the MAIL FROM subdomain.**
  The human adds every one at their DNS provider, then presses 「重新檢查」 in the admin. DNS can take
  minutes to hours; `identityStatus: "verified"` and `mailFromStatus: "success"` mean it is ready.
- Until then, build and test against the sandbox: `sender.email` on `sandbox.portaly.tw`, recipient
  = the Portaly account's own email. Swapping to the real domain later is a config change, not code.
- Never try to send from `mail.portaly.tw` or any other Portaly domain — it answers `403 DOMAIN_NOT_ALLOWED`.

### 3. Send

`POST {PORTALY_API_HOST}/api/email/emails`, from server-side code only.

```ts
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'

export class PortalyEmailError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string | undefined,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message ?? `Portaly email API answered ${status}`)
  }
}

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  idempotencyKey: string // derive from your own event, e.g. `order-${orderId}-receipt`
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
      recipients: [{ email: input.to }],
      subject: input.subject,
      html: input.html,
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
  attempt. A retry with the same key returns the original result and never sends twice; that is what
  makes retrying a timeout safe.
- Keep `EMAIL_FROM` in config so moving from the sandbox to the verified domain is one variable.
- Store the returned `id` with the order/user it belongs to — it is how you look up delivery later.
- Recipients: up to 50 per email as `{ email, type }` with `type` `to` / `cc` / `bcc` (default `to`).
  It is **one message** — cc recipients see each other. For separate messages to many people, use
  `POST /api/email/batches` (up to 100 emails, sent in the background).
- `scheduledAt` (ISO 8601 with time zone, 1 minute to 30 days ahead) schedules it and answers `202`;
  `POST /api/email/emails/{id}/cancel` cancels before it goes out.
- Attachments: `content` (base64, files up to ~3 MB — requests are capped at 4.5 MB) or `url` (a public
  https URL Portaly downloads). 10 MB per email in total.
- Field-level rules and the batch shape are in `references/api-contract.md`.

### 4. Handle the response

Every error is `{ "error": { "code", "message" } }`. Branch on `code`, never on `message`.

| Response | What the code should do |
|---|---|
| `200` / `202` | Store `data.id`. |
| `429 RATE_LIMITED` | Per-key rate limit. Wait `Retry-After` seconds, retry with the same key. |
| `502 SEND_OUTCOME_UNKNOWN`, any `503` | Retry with the same `Idempotency-Key` (backoff); it will not double-send. |
| `409 IDEMPOTENCY_KEY_IN_USE` | The first attempt is still in flight — retry later with the same key. |
| `429 SEND_QUOTA_EXCEEDED` | **Not transient. Do not retry in a loop.** Alert a human (log at error level, notify); the creator buys more quota or waits for the monthly reset. |
| `429 SANDBOX_DAILY_LIMIT_REACHED` | 50 sandbox emails a day; resets at midnight Asia/Taipei. |
| `422 RECIPIENT_SUPPRESSED` | Every `to` address previously hard-bounced or complained. Mark them invalid in your DB and ask the user for a new address. |
| `403 DOMAIN_*` | Setup problem — see step 2. Surface it to the creator, don't retry. |
| `403 RECIPIENT_NOT_ALLOWED` | Sandbox sending to someone other than the account owner. |
| other `4xx` | Fix the request; `INVALID_BODY` messages start with the bad field (`recipients.0.email: …`). |

- To avoid hitting the quota wall, check `GET /api/email/quota` (`data.remaining`) before large sends
  or on a schedule, and warn the creator when it runs low. Quota is per recipient and shared with the
  broadcasts they send from the admin; sandbox email does not use it.

### 5. Track delivery

Webhooks are **not available yet**. `GET /api/email/emails/{id}` returns each recipient's status;
poll it a few times after sending (e.g. after 1, 5 and 30 minutes) or from a periodic job, or list
recent problems with `GET /api/email/emails?recipientStatus=bounced,complained`.

- `bounced` — the address does not exist. Mark it invalid in your DB and stop sending to it; ask the
  user to update their email.
- `complained` — the recipient marked it as spam. Stop sending them anything optional.
- `suppressed` — Portaly skipped this address because of an earlier bounce or complaint.
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

- **No marketing or bulk mail through this API** — newsletters, promotions, cold outreach and imported
  lists belong in the Portaly admin's broadcast tool, which handles consent and unsubscribes. Sending
  them here drives complaints that get the creator's domain suspended — which stops their receipts
  and their broadcasts alike.
- **Only mail people who expect it** — the user's own customers, triggered by something they did.
- **Never expose the key client-side**, never log it, never commit it.
- **Never retry `SEND_QUOTA_EXCEEDED` or other `4xx` in a loop**; respect `Retry-After`; always retry
  with the same `Idempotency-Key`.
- **Never use fake recipient addresses for testing** — use the sandbox or the simulator.
- **Confirm before real sends to real people** during development (anything not to the account owner
  or the simulator): state who will receive what, and wait for the user's yes.
- Do not invent fields, statuses or limits. If something here and `https://portaly.ai/docs` disagree,
  the docs win.
- Rate limits per key per minute: 60 recipients on `POST /emails`, 10 batches, 120 reads, 20 cancels
  or domain binds. Spread bulk work out instead of bursting.

## Deliverables

- a short setup checklist for the human (key, domain, DNS, `.env`)
- a server-side `sendEmail` helper in the project's stack, with idempotency and the error handling above
- a delivery-tracking job that records `bounced` / `complained` addresses
- test steps using the sandbox and the mailbox simulator

## Resources

- `references/api-contract.md` — every endpoint, field, status and error code.
- `https://portaly.ai/docs` (Email section) and `https://portaly.ai/openapi.json` — authoritative contract.
- `../portaly-overview/SKILL.md` — what else Portaly can do, e.g. payments for the same app.
