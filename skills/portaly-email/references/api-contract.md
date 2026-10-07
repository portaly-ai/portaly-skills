# Portaly Email API Contract

Working copy of the contract for Portaly's transactional email API. The authoritative version is
`https://portaly.ai/docs` (Email section) and `https://portaly.ai/openapi.json`; when they disagree,
those win.

**Beta — invite only.** Only accounts Portaly has invited can use this API; every call from any other
account answers `403 FORBIDDEN`. Creating a key needs the Premium plan.

## Use This Reference For

- Exact request fields and limits for sending, batching and scheduling
- Every error code and what to do about it
- Delivery statuses, the list filters, domains and quota

---

## Auth and conventions

- `Authorization: Bearer pem_…` — an email API key from `https://portaly.cc/admin/email/api-keys`.
  Not interchangeable with Portaly Payment keys (`pcs_…`).
- Permissions: `sending` — everything below except the two domain endpoints; `full` — also domains.
- Each key sends only from the domains chosen when it was created, or from all domains (「全部網域」,
  which also covers the sandbox and domains bound later; `full` keys always have it). Before any
  domain is verified the admin's default is `sandbox.portaly.tw` alone. No test/live split: a key
  limited to `sandbox.portaly.tw` is the test key.
- Base URL `https://portaly.ai` (overridable via `PORTALY_API_HOST`). Fields are camelCase; unknown
  fields are ignored.
- Success: `{ "data": … }`. Errors: `{ "error": { "code": "…", "message": "…" } }`.
- Errors any endpoint can return:

| Status | `code` | Meaning |
|---|---|---|
| 401 | `INVALID_API_KEY` | Missing, malformed, unknown or revoked key |
| 403 | `FORBIDDEN` | Invite-only beta and this account has not been invited |
| 403 | `PERMISSION_DENIED` | Needs a `full` key (only the domain endpoints) |
| 429 | `RATE_LIMITED` | Per-key rate limit; `Retry-After` header says how many seconds to wait |
| 503 | `RATE_LIMIT_UNAVAILABLE` | Rate limiting briefly unavailable, request refused; retry after `Retry-After` |
| 500 | `INTERNAL_ERROR` | Portaly-side failure; nothing was sent. Retry; for a send, with the same `Idempotency-Key` |

- Rate limits, per key per minute: `POST /emails` 60 **recipients** (an email to 50 people uses 50),
  `POST /batches` 10 requests, reads (`GET /emails`, `GET /emails/{id}`, `GET /domains`, `GET /quota`)
  120, `POST /emails/{id}/cancel` and `POST /domains` 20. A batch counts once toward its own 10;
  its recipients do not use the 60. Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset` (Unix seconds); `Retry-After` is always in seconds.

---

## POST `/api/email/emails` — send one email

Header `Idempotency-Key` (optional, 1–256 chars, strongly recommended). The body field
`idempotencyKey` is an alias; if both are sent they must be equal.

- A repeated key never sends twice. Keys never expire and the body is not compared: a reused key
  returns the first email's id and sends nothing. Use one key per email you mean to send, never one
  per user; if the content changes, use a new key.
- Scoped to the account and the sending domain (a batch key: the account).
- Requests refused by a check (quota, suppression, limits, domain) are not remembered — a retry is
  checked again. A send that answered `502` holds its key: retries answer `409` until delivery
  events show the mail service accepted it, then `200` with the original id. If it was never
  accepted, the key stays `409` for good.
- List results do not include the key. Tag each email with it (`{ "name": "ref", "value": "<key>" }`)
  to find it again with `GET /emails?tag=ref:<key>`; build keys from letters, digits, `_` and `-` so
  they fit a tag value.

```json
{
  "sender": { "email": "orders@mail.example.com", "name": "Example Shop" },
  "recipients": [
    { "email": "buyer@example.com" },
    { "email": "ops@example.com", "type": "bcc" }
  ],
  "replyTo": "support@example.com",
  "subject": "Your order #1024",
  "html": "<p>Thanks for your order!</p>",
  "text": "Thanks for your order!",
  "tags": [{ "name": "category", "value": "order_confirmation" }],
  "headers": { "X-Entity-Ref-ID": "order-1024" },
  "attachments": [{ "filename": "invoice.pdf", "url": "https://example.com/files/invoice-1024.pdf" }],
  "scheduledAt": "2026-10-10T09:00:00+08:00"
}
```

| Field | Rules |
|---|---|
| `sender` | Required. `email` (≤ 320, ASCII) must be on a verified custom domain this key may use, or `sandbox.portaly.tw` — there the local part is 3–32 of `a–z 0–9 . _ -` (case-insensitive), must not contain `portaly`, and must not be reserved (`noreply`, `no-reply`, `support`, `info`, `admin`, …), and it only delivers to the account owner's verified sign-in email. `name` optional, ≤ 100 chars, no line breaks, non-ASCII fine. |
| `recipients` | Required, 1–50 `{ email, type? }`, `type` = `to` (default) / `cc` / `bcc`, at least one `to`. One message: cc recipients see each other. A repeated address is sent once. |
| `replyTo` | Optional. One address or an array of up to 10. Set it when the sending subdomain does not receive mail, or replies go nowhere. |
| `subject` | Required, 1–998 chars, no line breaks. |
| `html` / `text` | At least one; each ≤ 900,000 bytes. `text` is derived from `html` when omitted. |
| `tags` | Optional, ≤ 10 `{ name, value }`, each 1–256 of `A–Z a–z 0–9 _ -`, unique names, no `portaly-` prefix. |
| `headers` | Optional, ≤ 15. Names start with `X-` (not `X-SES-`), or `List-Unsubscribe` (`<https://…>` / `<mailto:…>`, comma-separated) or `List-Unsubscribe-Post` (only `List-Unsubscribe=One-Click`, needs an https `List-Unsubscribe`). Values: 1–995 printable ASCII. |
| `attachments` | Optional, ≤ 10 `{ filename, content \| url, contentType?, contentId? }`. `content` is base64 (≈ 3 MB max, the request is capped at 4.5 MB); `url` is public https, downloaded when the request arrives (all URLs together within 20 s, ≤ 3 redirects). `contentId` embeds it inline for `<img src="cid:…">`. Email + attachments ≤ 10 MB. Executable extensions are refused. |
| `scheduledAt` | Optional ISO 8601 with time zone, ≥ 1 minute and at most 30 days minus 10 minutes ahead. |

Responses:

- `200 { "data": { "id": "emsg_…" } }` — handed to the mail service.
- `202 { "data": { "id": "emsg_…" } }` — scheduled. Quota, suppressions and the bounce limit are
  checked when it comes due; if it is blocked then, the email's `status` becomes `failed`.
  `recipients[].status` shows `quota_exceeded` / `domain_limited` / `suppressed` for those reasons;
  anything else (the domain or key could no longer send, or it came due more than 6 hours late) is
  plain `failed`.
- Sending rules: quota is charged per recipient it is sent to; if it does not cover everyone nothing
  is sent. Suppressed recipients are dropped (`suppressed`, not charged) and the rest are sent; if
  every `to` is suppressed, nothing is sent.

| Status | `code` | What to do |
|---|---|---|
| 400 | `INVALID_BODY` | Message starts with the field (`recipients.1.email: …`). Fix the request. |
| 400 | `INVALID_SENDER` | Malformed or non-ASCII address, `name` over 100 chars or with a line break, or a sandbox local part that breaks the rules above. |
| 400 | `SCHEDULE_IN_PAST` / `SCHEDULE_TOO_FAR` | `scheduledAt` under 1 minute away / more than 30 days minus 10 minutes away. |
| 400 | `ATTACHMENT_URL_NOT_ALLOWED` / `ATTACHMENTS_TOO_LARGE` | Attachment URL not public https / over 10 MB in total. |
| 403 | `DOMAIN_NOT_ALLOWED` | Domain not bound to this account, a Portaly domain, or outside this key's domains. |
| 403 | `DOMAIN_NOT_VERIFIED` / `DOMAIN_MAIL_FROM_NOT_READY` | DNS not verified yet. |
| 403 | `DOMAIN_NOT_ACTIVE` | Domain suspended — contact Portaly support. |
| 403 | `RECIPIENT_NOT_ALLOWED` | Sandbox sending to someone other than the account owner. |
| 403 | `HARD_BOUNCE_LIMIT_REACHED` | The domain hit today's hard-bounce limit; usually suspended at the next check. |
| 409 | `IDEMPOTENCY_KEY_IN_USE` | First attempt still in flight, or it answered `502` and the outcome is not known yet. Retry with the same key for up to about 10 minutes, never forever; still `409` means it most likely never went out — find it with `GET /emails?status=unknown&tag=ref:<key>`, then alert or resend with a new key (small duplicate risk). |
| 422 | `RECIPIENT_SUPPRESSED` | Every `to` is on Portaly's suppression list (hard bounce, or spam complaints to several Portaly senders); nothing sent. |
| 422 | `MESSAGE_REJECTED` | Rejected by the mail service. The same key keeps answering this — fix the message and use a new key. |
| 422 | `ATTACHMENT_DOWNLOAD_FAILED` | An attachment URL did not answer 200 in time. |
| 429 | `SEND_QUOTA_EXCEEDED` | Quota does not cover every recipient. Not transient — alert, check `GET /quota`. |
| 429 | `SANDBOX_DAILY_LIMIT_REACHED` | 50 sandbox emails a day, resets midnight Asia/Taipei. |
| 502 | `SEND_OUTCOME_UNKNOWN` | May have been sent. Retry with the same `Idempotency-Key` — no double send; until the outcome is known the retry answers `409`. |
| 503 | `SEND_RATE_LIMITED` | Platform sending rate; `Retry-After: 1`. Retry with the same key. |
| 503 | `DOMAIN_TENANT_NOT_READY` | Domain still being set up; retry shortly. |

---

## POST `/api/email/batches` — send up to 100 emails

```json
{ "emails": [ { …same shape as POST /emails, without idempotencyKey… } ], "idempotencyKey": "optional, one for the whole batch" }
```

- Up to 100 emails and 1,000 recipients in total. One `Idempotency-Key` covers the whole batch;
  `idempotencyKey` inside an email is a `400`.
- `202 { "data": { "batchId": "ebat_…", "emails": [{ "id": "emsg_…" }] } }` in request order. Nothing
  has been sent yet — follow up with `GET /api/email/emails?batchId=ebat_…`.
- The whole batch is refused when any email is invalid (`INVALID_BODY`, message `emails.3.recipients.0.email: …`),
  fails a domain/sender/recipient check (that email's code, message prefixed `emails.3: `), or when the
  emails sent now (not scheduled ones) need more quota or sandbox allowance than is left
  (`429 SEND_QUOTA_EXCEEDED` / `SANDBOX_DAILY_LIMIT_REACHED`).
- Suppressions, the bounce limit and quota are then checked per email as each one is sent; a blocked
  email becomes `failed` without stopping the others.

---

## GET `/api/email/emails/{id}` — one email and its recipients

```json
{
  "data": {
    "id": "emsg_…",
    "status": "sent",
    "sender": { "email": "orders@mail.example.com", "name": "Example Shop" },
    "subject": "Your order #1024",
    "replyTo": ["support@example.com"],
    "tags": [{ "name": "category", "value": "order_confirmation" }],
    "sandbox": false,
    "recipientCount": 2,
    "batchId": null,
    "scheduledAt": null,
    "createdAt": "2026-10-07T03:00:00.000Z",
    "sentAt": "2026-10-07T03:00:01.000Z",
    "openedAt": null,
    "clickedAt": null,
    "recipients": [
      { "email": "bu***@example.com", "type": "to", "status": "delivered", "deliveredAt": "…", "bouncedAt": null, "complainedAt": null },
      { "email": "op***@example.com", "type": "bcc", "status": "bounced", "deliveredAt": null, "bouncedAt": "…", "complainedAt": null }
    ]
  }
}
```

`404 EMAIL_NOT_FOUND` for an unknown id or another account's email.

Email `status` — whether it was handed to the mail service:

| `status` | Meaning |
|---|---|
| `scheduled` | Waiting for `scheduledAt` |
| `queued` | Waiting in a batch |
| `canceled` | Canceled before sending |
| `unknown` | A send answered 502, or the request is still in flight |
| `sent` | Handed to the mail service |
| `failed` | Rejected, or blocked when a scheduled/batched email came due |

`recipients[].status` — the delivery result:

| `status` | Meaning |
|---|---|
| `queued` | Not sent yet (scheduled or batched) |
| `unknown` | Not known whether it was sent; later events still fill in |
| `sent` | Accepted by the mail service, no result yet |
| `delivered` | Accepted by the receiving server (inbox vs spam not visible) |
| `bounced` | Hard bounce — the address does not exist. Stop mailing it. |
| `soft_bounced` | Still failing after retries (mailbox full, server down) |
| `suppressed` | Skipped: the address is on Portaly's suppression list (hard bounce, or spam complaints to several Portaly senders). Not charged |
| `complained` | Marked as spam. Portaly does not stop your later API email to this address — stop it yourself |
| `failed` | Rejected (content), or the email was blocked when it came due |
| `quota_exceeded` | A scheduled/batched email came due with no quota left |
| `domain_limited` | A scheduled/batched email came due after the domain hit today's bounce limit |

- Addresses are masked. Recipients are returned in the order you sent them — match by position.
- `openedAt` / `clickedAt` are per email: everyone gets the same tracking pixel and links.
- `recipientCount` counts distinct recipients including suppressed ones; quota is charged only for
  the ones it was sent to.

---

## GET `/api/email/emails` — list

Only emails sent through the API (not admin broadcasts), newest first. Each item has the same shape
as `GET /emails/{id}`.

| Query | |
|---|---|
| `startDate` / `endDate` | ISO 8601 with time zone, compared with `createdAt`. Default: the last 30 days. |
| `status` | Email status, comma-separated. Not combinable with `recipientStatus` / `recipient`. |
| `recipientStatus` | Recipient status, comma-separated; matches when any recipient does. |
| `recipient` | Full address, exact match. |
| `batchId` / `tag` | `ebat_…` / `name:value`. Not combinable with each other. |
| `limit` | 1–100, default 20 |
| `startAfter` | The previous page's `pagination.nextCursor` |

Response: `{ "data": [ …emails ], "pagination": { "hasMore", "nextCursor", "count" } }`. Bad
parameters answer `400 INVALID_QUERY` (message starts with the parameter).

---

## POST `/api/email/emails/{id}/cancel`

Cancels a scheduled email, or a batched one still `queued`. `200 { "data": { "id", "status": "canceled" } }`;
canceling twice is fine. `404 EMAIL_NOT_FOUND`; `409 EMAIL_NOT_CANCELABLE` once sending started.

---

## GET / POST `/api/email/domains` (`full` key)

- `GET` → `{ "data": [domain…] }`. `POST { "host": "mail.example.com" }` (Premium plan) →
  `{ "data": domain }`.
- Domain: `{ id, host, purpose, isPlatform, identityStatus, mailFromStatus, status, verifiedAt, dnsRecords }`.
  - `identityStatus`: `pending` / `verified` / `failed` (DKIM). `mailFromStatus`: `pending` / `success` /
    `temporaryFailure` / `failed` / `null`. Sending needs `verified` + `success`.
  - `status`: `active` / `suspended` (too many bounces or complaints — contact support) / `closed`.
  - `isPlatform: true` is Portaly's shared broadcast domain; the API cannot send from it.
  - `dnsRecords`: `{ type, name, value, priority? }` — three DKIM `CNAME`s plus `MX` and `TXT` for
    the MAIL FROM subdomain. Add them all.
- Statuses are as of the last check; after adding DNS records the human presses 「重新檢查」 at
  `https://portaly.cc/admin/email/domains`.
- `POST` errors: `400 INVALID_BODY` / `INVALID_HOST` / `RESERVED_HOST`; `403 PREMIUM_REQUIRED` /
  `DOMAIN_LIMIT_REACHED`; `409 HOST_ALREADY_BOUND` (already yours) / `HOST_TAKEN` (another account's).

---

## GET `/api/email/quota`

```json
{
  "data": {
    "remaining": 1950,
    "monthlyAllowance": 2000,
    "monthlyRemaining": 1950,
    "packRemaining": 0,
    "sandboxDailyLimit": 50,
    "sandboxRemainingToday": 48
  }
}
```

- `remaining` = `monthlyRemaining` + `packRemaining`: recipients you can still send to from custom
  domains. The monthly allowance resets on the 1st (Asia/Taipei) and is used before packs; packs are
  bought in the Portaly admin and do not reset.
- Charged per recipient when the email is handed to the mail service — bounces still count,
  suppressed recipients do not. Shared with broadcasts sent from the admin. Sandbox email only counts
  against `sandboxRemainingToday`.

---

## Mailbox simulator

From a verified custom domain (the sandbox only delivers to the account owner):

| Address | Result |
|---|---|
| `success@simulator.amazonses.com` | `delivered` |
| `bounce@simulator.amazonses.com` | `bounced` |
| `complaint@simulator.amazonses.com` | `delivered`, then `complained` |

They do not count toward the domain's bounce or complaint rate but do use quota.

---

## Not available yet

- Delivery webhooks — poll the list with `recipientStatus=bounced,complained` from a periodic job
  (reads share 120 per minute per key, so per-email polling does not scale).
- Re-checking domain verification through the API — use the admin.
