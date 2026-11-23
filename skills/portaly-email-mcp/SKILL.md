---
name: portaly-email-mcp
# Top-level `version` is what Portaly's skill-versions endpoint parses (its regex
# is anchored to the start of a line, so it cannot read the indented
# metadata.version). Keep the two in sync until that parser reads YAML.
version: 0.1.4
metadata:
  version: "0.1.4"
description: "Act as a Portaly creator's newsletter assistant through Portaly's Email MCP tools — connect the Portaly MCP server, draft newsletters to the creator's own mailing lists, send a test copy to the creator, hand over the confirmation link, send once the creator approves, and report open and click results. Trigger when the user wants their AI assistant to write or send a Portaly newsletter / 電子報 / 發信, mentions Portaly Email MCP or 發信 MCP, asks how their last Portaly newsletter performed, or pastes a Portaly 發信 MCP install prompt. Email MCP is in beta: Portaly turns it on per account, and the account must be on the Premium Plus plan (頂級+)."
---

# Portaly Email MCP (Beta)

Use this skill when **you** are the one doing the work: the creator (a Portaly user, usually not an
engineer) asks you, in conversation, to write and send a newsletter to the lists they collected on
Portaly. You do it through Portaly's MCP tools — there is no code to write and no API key to manage.

This is not the skill for wiring an app's own email (receipts, sign-in codes) — that is
`portaly-email`, with a `pem_` key.

Reply to the creator in their language (usually 正體中文), in plain words. Do not show them tool names,
error codes, or JSON.

> **Beta — turned on by Portaly, Premium Plus.** Email MCP is in beta: Portaly turns it on for each
> account (the creator cannot turn it on themselves), and the account must be on Premium Plus (頂級+).
> Once it is on, the 發信 MCP page appears in the admin at `https://portaly.cc/admin/email/mcp`. Until
> both hold the email tools do not appear at all, or every call answers `email_mcp_activation_required` /
> `email_mcp_plan_required`. Say this before setup if the creator has not mentioned Email MCP being
> turned on for them.

## How approval works — read this first

**Nothing reaches a mailing list until the creator approves that exact version in the Portaly admin.**

- You can draft, edit, and send test copies to the creator as often as needed.
- `submitForConfirmation` returns a `confirmUrl`. Give it to the creator unchanged. They open it signed
  in to Portaly, look at the preview and recipient count, and press 「確認上線」.
- Only the profile's manager can approve. You cannot, and Portaly staff cannot.
- Any change after approval (subject, preview text, content, signature, lists, sending domain) cancels the
  approval — including the creator editing it in the admin.
  `sendEmailCampaign` then answers `approval_required` and sends nothing, until the creator confirms the
  new version.
- Never tell the creator a newsletter was sent until `sendEmailCampaign` returned `ok: true`.

## Workflow

### 1. Connect the Portaly MCP server

If the Portaly email tools (`listMailingProjects`, `createEmailCampaign`, …) are already available to
you, skip to step 1.5.

The server is a remote MCP server with OAuth sign-in:

```
https://portaly.cc/mcp
```

Add it in whatever client you are running in:

- **Claude Code:** `claude mcp add --transport http portaly https://portaly.cc/mcp`, then have the creator
  run `/mcp` and pick `portaly` to sign in.
- **Cursor:** add to `.cursor/mcp.json` (or the global `~/.cursor/mcp.json`):
  ```json
  { "mcpServers": { "portaly": { "url": "https://portaly.cc/mcp" } } }
  ```
- **Claude (web / desktop), ChatGPT, and other chat apps:** the creator adds a custom connector (remote
  MCP server) with the URL above in the app's settings. You cannot do this for them — walk them through it.

The creator signs in with their Portaly account in the browser and approves access. Most accounts have
one profile and are connected to it directly; only an account that manages several profiles is asked which
one to connect, and one connection covers one profile. Do not tell the creator to pick a profile unless
the sign-in page asks. Most clients need a restart or a new session before the new tools show up.

If the client cannot do OAuth sign-in, the creator can create a token under 「建立 token」 at
`https://portaly.cc/admin/product/mcp` and configure the same URL with the header
`Authorization: Bearer mcp_ptly_…`. The token is shown once; it goes in the client's config, never in a
chat message or a committed file.

**Connected but no email tools?** The server lists the email tools only for accounts that Portaly has
turned Email MCP on for and that are on Premium Plus. Ask the creator to open 發信 MCP in the Portaly admin
(`https://portaly.cc/admin/email/mcp`): if the page is missing or says 「發信 MCP 尚未開通」, Portaly has
not turned it on yet and the creator needs to contact Portaly; if it says the current plan can't use it,
they need to upgrade to Premium Plus. Once it is on and the plan qualifies, the creator reconnects Portaly
in their app (or refreshes the connector, or you start a new session) — most clients keep the tool list
from when they first connected. Do not try to send email through other tools.

**Every call answers HTTP 403 with `"code": "plan_required"`?** That gate is in front of all Portaly MCP
tools: the profile is below Premium (頂級). Tell the creator Email MCP needs Premium Plus (頂級+), and
stop.

### 1.5 Report the installed skill version

Call `reportSkillVersion` the first time you have the email tools in a session — right after
installing or updating, and again at the start of any later session that uses them. Most clients only
get the email tools after a reconnect or a new session, so the session that installed the skill often
cannot report; reporting again later is harmless and is what makes the admin show 「已安裝」. Arguments:

```json
{"skillName": "portaly-email-mcp", "version": "0.1.4"}
```

`version` is this file's frontmatter `version` — use the literal value from the SKILL.md you are running.
It only lets the creator's admin show 「已安裝」 or flag an update; ignore a failure and carry on.

### 2. Understand what to send

Ask what the newsletter is for (launch, monthly update, event, promotion), the key facts (dates, prices,
links), and when it should go out. **Do not invent facts** — prices, dates, discount codes, and links come
from the creator. If you write a placeholder like 「[商品連結]」, ask for it before submitting;
`submitForConfirmation` lists any left in `unfilledPlaceholders`.

### 3. Pick the lists

Call `listMailingProjects`. It returns the creator's lists (`id`, `name`, `subscriberCount`) and sending
domains. It never returns addresses, and you cannot add or import recipients — lists are collected or
imported by the creator in the admin.

- If it returns `senderNote`, the account has no sending address yet: the creator must press 「立即開始」
  in the Portaly admin's email page first.
- If there is more than one list, confirm with the creator which ones. Do not default to "all".
- Leave `domainId` out to send from the Portaly domain; pass a custom domain's `id` only if the creator asks.

### 4. Draft

Call `createEmailCampaign` with `subject`, optional `preheader` (the preview text shown in the inbox),
`html`, and `listIds`. It returns a draft; nothing is sent.

Content rules (enforced by Portaly):

- Allowed tags: `p`, `h2`, `h3`, `ul`/`ol`/`li`, `strong`/`b`, `em`/`i`, `u`, `br`, `a` (`https://` or
  `mailto:` only), `img` (`https://` only). Other tags are removed and only their text is kept; styles are
  dropped except text alignment. Write simple, single-column content.
- `{{名稱}}` inserts each recipient's name. Some recipients have no name; Portaly then drops the
  placeholder with its surrounding space and a following comma, so 「嗨 {{名稱}}，」 reads 「嗨」. Still
  write sentences that read naturally without the name.
- Subject and preview text: up to 200 characters each. Content: up to 900 KB.
- Portaly appends the unsubscribe link to every email. Do not add your own.
- Some wording is refused (`banned_copy_terms`): mainland-Chinese phrasing, AI filler, guarantee or
  exaggeration terms that carry legal risk in Taiwan, and unfilled 【請填】-style placeholders. Rewrite as
  the error message describes; if the text came from the creator, offer them your rewrite.

To revise, call `updateEmailCampaign` with only the fields that change. `html` replaces the whole body.
Before rewriting `html` from `getEmailCampaign`, check `htmlTruncated` — if it is `true`, the returned
`html` is incomplete and writing it back would cut the email.

### 5. Test copy

Call `sendTestEmail`. It sends one copy to the creator's own Portaly sign-in email (never anyone else),
with 「[試寄]」 in front of the subject, and returns the masked address. Ask the creator to check layout and
links on their phone. Limit: 20 test emails a day, and they use the email quota.

If it answers `owner_email_unverified`, skip the test copy — the confirmation page shows the same preview.

### 6. Get approval

Call `submitForConfirmation`. Give the creator the `confirmUrl` as-is and say what it is: 「請點這個連結登入
Portaly，看過預覽和收件人數後按『確認上線』，按了我才能寄出。」 Also tell them the `recipientCount`.

Then wait for the creator to tell you they approved. To check, call `listEmailCampaigns` or
`getEmailCampaign`: `reviewStatus` is `approved` once they did; `pendingReview` with
`approvalOutdated: true` means it changed after approval and needs confirming again.

### 7. Send

Confirm the timing with the creator, then call `sendEmailCampaign`. There is no scheduling parameter: it
starts sending now, so if the creator wants a later time, wait and call it then (or have them schedule it
in the admin). A send cannot be recalled.

- Recipients are fixed at this moment; anyone who unsubscribed after the approval does not get it.
- Before sending a large list, `previewAudience` tells you if today's sending limit spreads it over several
  days (`multiDay` with `firstDay` and `finishDay`). Tell the creator — it continues automatically.

### 8. Results

`getEmailCampaign` returns cumulative `stats` (`delivered`, `opened`, `clicked`, `bounced`, `complained`,
`failed`) and `unsubscribedCount`. Opens and clicks keep arriving for days; say "so far". Summarise in
plain words (e.g. 「目前送達 980 封，開信 410 人（約 42%），點擊 63 人」).

## Guardrails

These are what the tools enforce; quote them as limits, with what to do instead.

- Only drafts can be edited or sent through these tools (`campaign_not_draft` otherwise). Scheduled,
  sending, or sent campaigns are changed in the Portaly admin; for a new version, create a new draft.
- A paused send is resumed only by the creator pressing 「繼續寄送」 in the admin.
- `send_quota_insufficient`: not enough email quota for the whole list; nothing was sent. Tell the creator —
  do not retry, and do not split the list to squeeze it through.
- Rate limits per connection: 120 reads and 20 writes a minute. Do not loop on writes.
- `email_mcp_not_enabled` / `email_mcp_plan_required`: the account cannot use Email MCP right now. Say so
  plainly (for the plan, that it needs Premium Plus) and stop — never work around it with other tools.
- `email_mcp_activation_required`: Email MCP is off for this account (you only see this if it was turned off
  after you got the tools). Tell the creator Portaly needs to turn it on for them, and stop; once it is on,
  they reconnect and you continue — never work around it with other tools.

## Errors

A failed call returns `{ "ok": false, "error": { "code", "message" } }`. The `message` (in Chinese) says
what to tell the creator and what to do next; follow it.

| Code | Meaning | What to do |
|---|---|---|
| `approval_required` | Not approved, or changed after approval | `submitForConfirmation` and hand over the link again |
| `campaign_not_draft` | Scheduled, sending, or sent | Change it in the admin, or draft a new one |
| `sender_not_set_up` | No sending address yet | Creator sets it up in the admin's email page |
| `send_quota_insufficient` | Not enough quota for the whole list | Tell the creator; nothing was sent |
| `owner_email_unverified` | No verified sign-in email for test copies | Skip the test copy; use the confirmation preview |
| `email_mcp_not_enabled` | Email is not enabled for this account | Tell the creator to contact Portaly; stop |
| `email_mcp_activation_required` | Email MCP not turned on for this account | Tell the creator Portaly needs to turn it on; stop. Once it is on, they reconnect and you continue |
| `email_mcp_plan_required` | Needs Premium Plus | Tell the creator about upgrading to Premium Plus; stop |
| `banned_copy_terms` | The new text uses wording Portaly refuses | Rewrite those words and call again |
| `invalid_arguments` | A parameter is missing or wrong | Fix the named parameter |

Full reference: `https://portaly.ai/docs#tag/email` (Email section, "Email MCP").
