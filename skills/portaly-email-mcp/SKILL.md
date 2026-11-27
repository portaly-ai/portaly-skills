---
name: portaly-email-mcp
# Top-level `version` is what Portaly's skill-versions endpoint parses (its regex
# is anchored to the start of a line, so it cannot read the indented
# metadata.version). Keep the two in sync until that parser reads YAML.
version: 0.3.0
metadata:
  version: "0.3.0"
description: "Act as a Portaly creator's newsletter assistant through Portaly's Email MCP tools — connect the Portaly MCP server, draft newsletters to the creator's own mailing lists, send a test copy to the creator, hand over the confirmation link, send or schedule once the creator approves, and report open and click results. Trigger when the user wants their AI assistant to write or send a Portaly newsletter / 電子報 / 發信, mentions Portaly Email MCP or 發信 MCP, asks how their last Portaly newsletter performed, or pastes a Portaly 發信 MCP install prompt. Email MCP is in beta: Portaly turns it on per account, and the account must be on the Premium Plus plan (頂級+)."
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

**Nothing reaches a mailing list until that exact version is approved.** There are two ways:

- **The creator approves it (default).** `submitForConfirmation` returns `messageForCreator` — give it to
  the creator word for word, link included. Creators often assume they should look for it in the admin
  themselves; the message tells them to open the link (the admin's email page also marks the campaign
  「待你確認」 with a 「預覽並確認」 button). They sign in, look at the preview and recipient count, and press
  「確認上線」. Only the profile's manager can do this; Portaly staff cannot.
- **You approve it, if the creator allowed it.** On the 發信 MCP page the creator can turn on
  「允許 AI 助理直接核准」. Only they can, in the admin; there is no tool for it. With it on, call
  `approveEmailCampaign` **only after the creator tells you in the conversation to send this one** —
  never because you judged the content fine. See step 6.

Either way:

- You can draft, edit, and send test copies to the creator as often as needed.
- Any change after approval (subject, preview text, content, signature, lists, sending domain) cancels the
  approval — including the creator editing it in the admin. Changing it back to exactly the approved
  version restores the approval. While it is cancelled, `sendEmailCampaign` answers `approval_required`
  and sends nothing (or schedules nothing).
- Never tell the creator a newsletter was sent or scheduled until `sendEmailCampaign` returned `ok: true`.

## Tools at a glance

| Tool | What it does |
|---|---|
| `listMailingProjects` | The creator's lists (`id`, `name`, `subscriberCount`) and sending domains |
| `getSendQuota` | Email quota left, today's sending limit, and test copies left today |
| `listEmailCampaigns` / `getEmailCampaign` | Campaigns, approval progress, stored content, and results |
| `previewEmailCampaign` | The content as it will actually be sent, and its `revision` |
| `previewAudience` | How many people a campaign would reach right now |
| `createEmailCampaign` / `updateEmailCampaign` | Write a draft |
| `deleteEmailCampaign` | Delete a draft |
| `sendTestEmail` | Test copy of a draft to the creator's own addresses |
| `submitForConfirmation` | Get the confirmation link and a message to hand to the creator |
| `approveEmailCampaign` | Approve a draft for the creator — only if they allowed it in the admin |
| `sendEmailCampaign` | Send an approved draft now, or schedule it |
| `reportSkillVersion` | Tell the admin which version of this skill is installed |

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

**Your own client may ask before sending.** Many AI clients treat sending a newsletter as an outbound
action and stop to ask the creator first — or, in an automatic mode, block it outright. When that happens
the request never reached Portaly and nothing was sent or scheduled. Tell the creator it is their AI
tool's permission setting, not a Portaly error, and let them allow it in the client's prompt or settings.
Do not look for another way around it.

**Connected but no email tools?** The server lists the email tools only for accounts that Portaly has
turned Email MCP on for and that are on Premium Plus. Ask the creator to open 發信 MCP in the Portaly admin
(`https://portaly.cc/admin/email/mcp`): if the page is missing or says 「發信 MCP 尚未開通」, Portaly has
not turned it on yet and the creator needs to contact Portaly; if it says the current plan can't use it,
they need to upgrade to Premium Plus. Once it is on and the plan qualifies, the creator reconnects Portaly
in their app (or refreshes the connector, or you start a new session) — most clients keep the tool list
from when they first connected. Do not try to send email through other tools.

**Some tools from this file missing?** The client cached an older tool list. Ask the creator to reconnect
Portaly (or start a new session); until then, do not promise what the missing tool does.

**Every call answers HTTP 403 with `"code": "plan_required"`?** That gate is in front of all Portaly MCP
tools: the profile is below Premium (頂級). Tell the creator Email MCP needs Premium Plus (頂級+), and
stop.

### 1.5 Report the installed skill version

Call `reportSkillVersion` the first time you have the email tools in a session — right after
installing or updating, and again at the start of any later session that uses them. Most clients only
get the email tools after a reconnect or a new session, so the session that installed the skill often
cannot report; reporting again later is harmless and is what makes the admin show 「已安裝」. Arguments:

```json
{"skillName": "portaly-email-mcp", "version": "0.3.0"}
```

`version` is this file's frontmatter `version` — use the literal value from the SKILL.md you are running.
It only lets the creator's admin show 「已安裝」 or flag an update; ignore a failure and carry on.

### 2. Understand what to send

Ask what the newsletter is for (launch, monthly update, event, promotion), the key facts (dates, prices,
links), and when it should go out. **Do not invent facts** — prices, dates, discount codes, and links come
from the creator. If you write a placeholder like 「[商品連結]」, ask for it before submitting. Drafts,
test copies, and `submitForConfirmation` list every `[…]` in the subject, preview text, and content in
`unfilledPlaceholders`. Portaly's own templates leave placeholders such as 「[商品名稱]」 even at the start
of the subject, so a bracket there is listed too; if the creator wrote it on purpose as a tag (「[活動]
新品開賣」), confirm once and carry on.

Portaly does not review newsletter content: apart from a short word list (step 4), nothing checks what
you write. Whether a claim is true, lawful, and fair to the readers is up to you and the creator — if the
creator asks for something deceptive, such as a guaranteed-profit claim or a fake deadline, say why it is
a problem before writing it.

### 3. Pick the lists

Call `listMailingProjects`. It returns the creator's lists (`id`, `name`, `subscriberCount`) and sending
domains. It never returns addresses, and you cannot add or import recipients — lists are collected or
imported by the creator in the admin.

- If it returns `senderNote`, the account has no sending address yet: the creator must press 「立即開始」
  in the Portaly admin's email page first.
- If there is more than one list, confirm with the creator which ones. Do not default to "all".
- Use the list `id`, not its name. An id that does not exist is refused with `list_not_found` and nothing
  is written.
- Leave `domainId` out to send from the Portaly domain; pass a custom domain's `id` only if the creator asks.

### 4. Draft

Call `createEmailCampaign` with `subject`, optional `preheader` (the preview text shown in the inbox),
`html`, and `listIds`. It returns a draft; nothing is sent. The response also tells you what is not ready
yet — read all three:

- `missing`: what must be added before a test copy or confirmation (subject, content, lists).
- `unfilledPlaceholders`: `[…]` brackets that may still need real content (see step 2).
- `contentWarnings`: what will be stripped, changed, or come out wrong when sending — unsupported tags,
  colors and other styles, links or images it cannot use, `http://` links, unsupported `{{…}}` variables
  (in the subject and preview text too), tags left open, line breaks that will not show, and an
  unsubscribe link you wrote yourself. If it is not empty, rewrite the content, or tell the creator
  plainly which effects will not appear in the email. Never report a button, table, or color as done when
  `contentWarnings` says it will be removed.
- `signatureWarnings`: the same, for the creator's signature. You cannot edit the signature — tell the
  creator to fix it in the admin if it matters.

Content rules (enforced by Portaly):

- Allowed tags: `p`, `h2`, `h3`, `ul`/`ol`/`li`, `strong`/`b`, `em`/`i`, `u`, `br`, `a` (`https://` or
  `mailto:`; `http://` links are kept but warned about), `img` (public `https://` URL). Other tags are
  removed and only their text is kept, each removed block as its own paragraph; styles are dropped except
  text alignment. Write simple, single-column content.
- Wrap every paragraph in `<p>` and use `<br>` for a line break inside one. Newline characters do not show
  in an email. If the whole `html` has no paragraph tags at all, Portaly turns its newlines into
  paragraphs and says so in `note`.
- Close every tag. A tag left open inside a paragraph is closed at the end of that paragraph; one left open
  outside a paragraph runs to the end of the email.
- There are no buttons or tables. For a call to action, use a centered bold link:
  `<p style="text-align:center"><a href="https://…"><strong>立即購買</strong></a></p>`.
- There is no image upload through these tools. Use image URLs the creator gives you (or that they own and
  have published); otherwise ask them to add the image in the admin's email editor. Do not take images from
  other sites.
- `{{名稱}}` (or `{{name}}`) inserts each recipient's name; it is the only variable. Anything else in
  `{{…}}`, such as `{{email}}`, is sent as typed. Some recipients have no name; Portaly then drops the
  placeholder with its surrounding space and a following comma, so 「嗨 {{名稱}}，」 reads 「嗨」. Still
  write sentences that read naturally without the name.
- Subject and preview text: up to 200 characters each. Content: up to 900 KB.
- Portaly appends each recipient's own unsubscribe link to every email. Do not add your own — it would
  not unsubscribe anyone, and `contentWarnings` flags it.
- A fixed word list is refused (`banned_copy_terms`): some mainland-Chinese phrasing, AI filler, a few
  guarantee words such as 「保證錄取」, and unfilled 【請填】-style placeholders. It is a word list, not a
  content check — wording that is not on it is not thereby approved. Rewrite as the error message
  describes; if the text came from the creator, offer them your rewrite.

To revise, call `updateEmailCampaign` with only the fields that change; it returns the same `missing`,
`unfilledPlaceholders`, `contentWarnings`, and `signatureWarnings`, plus `reviewStatus` and a `note`
that says whether an earlier approval still holds. `html` replaces the whole body. Before rewriting `html` from
`getEmailCampaign`, check `htmlTruncated` — if it is `true`, the returned `html` is incomplete and writing
it back would cut the email.

`getEmailCampaign` returns the content as stored. When the creator asks how it will look, call
`previewEmailCampaign`: it returns the body as it will be sent — the same one the confirmation page shows
(cleaned up, image widths set, signature attached, `{{名稱}}` filled in as for a recipient without a name;
for a scheduled campaign the creator edited in the admin, the edited version). The frame, sender, and unsubscribe
footer are added by Portaly and are not in it. Real mail apps still differ — the test copy is the final check.

To remove drafts the creator no longer wants, call `deleteEmailCampaign`. It deletes drafts only and
cannot be undone: list the subjects you are about to delete and get the creator's go-ahead first.

### 5. Test copy

Call `sendTestEmail` on a draft (a scheduled or sent campaign answers `campaign_not_draft`; use
`previewEmailCampaign` to show those). The subject gets 「[試寄]」 in front.

- Which addresses are allowed: the creator's Portaly sign-in email, and any test addresses they saved
  under 「寄測試信」 in the admin. Both kinds are always allowed, together or alone.
- Without `emails`: it sends to the saved test addresses, or to the sign-in email if none are saved.
- With `emails` (up to 5): only allowed addresses. Any other address answers `test_recipient_not_allowed`
  and nothing is sent; the creator must first save it as a test address in the admin.

The response has one entry per address in `results` (masked address, `sent`, and an `error` code if that
one failed), `testSendsRemainingToday`, and `unfilledPlaceholders`. Ask the creator to check layout and
links on their phone. Limit: 20 test emails a day, counted per address (one call to 3 addresses uses 3).
If the limit runs out partway through a call, the earlier addresses are sent and the rest come back with
`sent: false` and `test_send_limit_reached`. Each test email also uses email quota; `getSendQuota` shows
both.

If it answers `owner_email_unverified`, skip the test copy — the confirmation page shows the same preview.

### 6. Get approval

Call `submitForConfirmation`. Give the creator `messageForCreator` word for word — it has the subject,
the recipient count, and the link, and tells them the admin's email page marks the campaign 「待你確認」.
Make sure the link is clickable; do not reword it into "go confirm it in the admin".

Then wait for the creator to tell you they approved. To check later, call `listEmailCampaigns` or
`getEmailCampaign`:

| `reviewStatus` | `confirmationSentAt` | Meaning |
|---|---|---|
| `approved` | — | Approved this exact version; you can send it |
| `pendingReview` | a time | `submitForConfirmation` was called for this version and the creator has not pressed 「確認上線」 yet. It does not tell you whether the link reached them — if in doubt, give it again |
| `pendingReview` | `null` | `submitForConfirmation` not called for this version yet, or the campaign changed since (`approvalOutdated: true` means it was approved and then changed) |

**Approving it yourself.** `submitForConfirmation` also returns `agentApprovalEnabled`. If it is `true`
and the creator tells you to send without opening the link (「不用預覽，直接寄」), you can approve it:

1. Call `previewEmailCampaign` and keep its `revision`. Tell the creator the subject and the recipient
   count (`previewAudience`) and get a clear yes for this campaign.
2. Call `approveEmailCampaign` with `campaignId` and that `revision`. If the campaign changed after you
   read the revision, it answers `revision_mismatch` and approves nothing — show the creator the new
   version and ask again.
3. Then send or schedule as in step 7.

If it answers `agent_approval_disabled`, the creator has not allowed it: hand over `messageForCreator` as
usual, and mention they can turn on 「允許 AI 助理直接核准」 on the 發信 MCP page if they want to skip the
link next time. Campaigns you approve are marked 「AI 核准」 in the admin.

### 7. Send or schedule

Confirm the timing with the creator, then call `sendEmailCampaign`. A send cannot be recalled.

- Without `scheduledAt` it starts sending now.
- With `scheduledAt` it schedules the send. Give an ISO 8601 time **with a time zone**, e.g.
  `2026-12-01T09:00:00+08:00` for 9 a.m. Taipei time; a time without a zone is refused. It must be at least
  a minute ahead and at most 30 days minus 10 minutes ahead. Once scheduled you cannot change the time or cancel it through these
  tools — the creator does that in the admin. Tell them the time in Taipei time as the response gives it.
- Recipients are fixed when sending starts; anyone who unsubscribed before then does not get it.
- Before sending a large list, call `previewAudience`. `recipientCount` already leaves out
  `duplicateCount` (the same address on two lists gets one copy), `suppressedCount` (unsubscribed,
  bounced, or complained), and `notAllowlistedCount` (test environments only; always 0 on Portaly). `multiDay` (with `firstDay` and `finishDay`) means today's sending limit spreads
  it over several days; tell the creator — it continues automatically.
- Check `getSendQuota` when the list is large: `sendQuota.availableForNewCampaign` must cover the whole
  list, or the send is refused with `send_quota_insufficient`. `platformDaily` is today's limit on the
  Portaly domain; when it is `null`, `hasPlatformDailyCap: false` means no daily limit, while `true` means
  the sending address is not set up yet and the first day will allow `platformDailyStart` emails.

### 8. Results

`getEmailCampaign` returns cumulative `stats` (`delivered`, `opened`, `clicked`, `bounced` with
`bouncedHard` for addresses that do not exist, `complained`, `failed`) and `unsubscribedCount`. Opens and
clicks keep arriving for days; say "so far". Summarise in plain words (e.g. 「目前送達 980 封，開信 410
人（約 42%），點擊 63 人」).

Other fields:

- `recipientCount` is the number of recipients fixed when sending started; it is `null` for drafts and
  scheduled campaigns — use `previewAudience` for those.
- `lists` gives each list's `id` and `name`; `found: false` means that list no longer exists. If the lists
  could not be read just then, `lists` is left out and only `listIds` is there.
- `scheduledAt`, `sentAt`, `approvedAt`, `confirmationSentAt` are Taipei times.
- `signatureEnabled`: the creator's signature is attached when sending.
- `pauseReason` not `null`: sending stopped (for example too many bounces or complaints, quota ran out, or
  the sending domain cannot send). Tell the creator to check the admin; only they can resume it.

## Guardrails

These are what the tools enforce; quote them as limits, with what to do instead.

- Only drafts can be edited, deleted, test-sent, approved, sent, or scheduled through these tools
  (`campaign_not_draft` otherwise). Scheduled, sending, or sent campaigns are changed in the Portaly admin; for a new version,
  create a new draft.
- A paused send is resumed only by the creator pressing 「繼續寄送」 in the admin.
- `send_quota_insufficient`: not enough email quota for the whole list; nothing was sent. Tell the creator —
  do not retry, and do not split the list to squeeze it through.
- Test copies go only to the creator's sign-in email or the test addresses they saved
  (`test_recipient_not_allowed` otherwise); there is no way to send a test to a list member.
- Rate limits per connection: 120 reads and 20 writes a minute; over it, the call answers `rate_limited`
  with how many seconds to wait. Do not loop on writes.
- `approveEmailCampaign` works only after the creator turned on 「允許 AI 助理直接核准」 in the admin
  (`agent_approval_disabled` otherwise); you cannot turn it on.
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
| `approval_required` | Not approved, or changed after approval | `submitForConfirmation` and hand over `messageForCreator` again |
| `agent_approval_disabled` | The creator has not allowed direct approval | Hand over `messageForCreator`; nothing was approved |
| `revision_mismatch` | The campaign changed after you read its `revision` | Show the creator the new version, then approve with the new `revision` |
| `rate_limited` | Too many calls this minute | Wait the seconds in `message`, then retry the same call |
| `campaign_not_found` | No such campaign on this account | Check the id with `listEmailCampaigns` |
| `campaign_not_draft` | Scheduled, sending, or sent (also for test copies) | Change it in the admin, or draft a new one |
| `list_not_found` | A `listIds` entry is not one of the creator's lists | Use ids from `listMailingProjects`; nothing was written |
| `subject_required` / `content_required` / `audience_required` | No subject / no content / no lists yet | Add it with `updateEmailCampaign` |
| `no_recipients` | Nobody left to send to after unsubscribes and bounces | Check `lists` for `found: false`; otherwise the creator picks another list |
| `subject_too_long` / `preheader_too_long` | Over 200 characters | Shorten it |
| `content_too_large` | Over 900 KB | Shorten it; link images instead of embedding them |
| `domain_not_found` / `domain_purpose_mismatch` | That sending domain cannot be used for newsletters | Use a domain from `listMailingProjects`, or leave `domainId` out |
| `sender_not_set_up` | No sending address yet | Creator sets it up in the admin's email page |
| `send_quota_insufficient` | Not enough quota for the whole list | Tell the creator; nothing was sent |
| `send_quota_reserved` | The quota left is held by campaigns still sending | Wait for them, or the creator buys more; nothing was sent |
| `schedule_in_past` / `schedule_too_far` | `scheduledAt` is under a minute ahead, or more than 30 days minus 10 minutes ahead | Fix the time (a time without a zone answers `invalid_arguments`) |
| `test_recipient_not_allowed` | Test address not the creator's own or saved | Creator saves it as a test address in the admin first |
| `test_send_limit_reached` | 20 test copies (counted per address) already today | Use the confirmation preview instead |
| `recipient_suppressed` | That test address bounced or complained before | Use another address or the confirmation preview |
| `owner_email_unverified` | No verified sign-in email and no saved test address | Skip the test copy; use the confirmation preview |
| `email_mcp_not_enabled` | Email is not enabled for this account | Tell the creator to contact Portaly; stop |
| `email_mcp_activation_required` | Email MCP not turned on for this account | Tell the creator Portaly needs to turn it on; stop. Once it is on, they reconnect and you continue |
| `email_mcp_plan_required` | Needs Premium Plus | Tell the creator about upgrading to Premium Plus; stop |
| `banned_copy_terms` | The new text uses a word on Portaly's list | Rewrite those words and call again |
| `invalid_arguments` | A parameter is missing or wrong | Fix the named parameter |

Codes not listed here come with a `message` that says what happened; follow it.

Full reference: `https://portaly.ai/docs#tag/email` (Email section, "Email MCP").
