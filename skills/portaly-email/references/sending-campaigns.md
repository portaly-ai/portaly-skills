# Sending a Campaign via Vibe MCP

Companion to the **Sending a Campaign (Vibe MCP)** section in SKILL.md. End-to-end run with body templates and concrete outcome handling.

## Prerequisites

- Agent is connected to the creator's Portaly Vibe MCP server (the dashboard onboarding flow installs this).
- The `email` skill is installed for that connection — without it, the campaign tools are not registered for this MCP session.
- The creator has a working sender domain. If not, point them at **Email → Domain** in the Vibe dashboard first; that's where they verify DKIM / CNAME. Sending before the domain is verified results in delivery failures the creator will have to chase.

## Authoring contract

The dashboard arranges the work as **Email content → Recipients → Send** — you author the email *first*, then attach recipients, then dispatch. The MCP tools enforce the same shape:

| Step | Tool | What it sets |
|---|---|---|
| Author | `vibe_create_campaign` | `name`, `subject`, `bodyHtml`, `aiContext` |
| Revise | `vibe_update_campaign` | any of the above |
| Recipients | _dashboard only_ | recipient list (CSV / Sheet / typed addresses) |
| Send | `vibe_send_campaign` | dispatches the saved draft (campaignId only) |

`vibe_send_campaign` takes only `campaignId`. If the saved draft has no subject or body, it returns `missing_content`.

## Flow

```
vibe_list_campaigns                          # find or confirm a draft
  ↓
draft subject + bodyHtml with creator
  ↓
vibe_create_campaign  ({ name, subject, bodyHtml, aiContext? })
  ↓
[creator imports recipients in dashboard]    # not via MCP
  ↓
vibe_update_campaign  (optional — only if revising copy)
  ↓
read back to creator + confirm
  ↓
vibe_send_campaign  ({ campaignId })
  ↓
switch on outcome
  ↓
vibe_get_campaign_analytics  (a few min later)
```

## Drafting the body

The body is HTML. Keep it simple — most email clients strip aggressive CSS and break on layout-heavy markup. A reliable starting point:

```html
<p>Hi {customerName},</p>

<p>{productName} here. <!-- one-paragraph hook tied to the campaign angle --></p>

<p>
  <a href="{inviteUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:6px;">
    <!-- CTA text -->
  </a>
</p>

<p>— {productName}</p>
```

Rules:

- `{inviteUrl}` is mandatory — it's the tracked invitation link.
- `{customerName}` falls back to a generic greeting when a row has no name.
- Custom column slugs (e.g. `{discount_code}`, `{cohort}`) are referenced the same way. Confirm slugs with the creator — they appear in the dashboard's import preview.
- Inline styles only. External stylesheets and `<style>` blocks are stripped or ignored by Gmail / Outlook / Apple Mail.
- Images: use absolute HTTPS URLs (no `data:` URIs). Hosted images can be uploaded in **Email → Templates**.

## Outcome handling

`vibe_send_campaign` returns a discriminated `outcome`. Pseudocode for the agent:

```
result = vibe_send_campaign({ campaignId })

switch result.outcome:
  case "enqueued":
    say "Sent to {result.enqueuedCount} people. {result.remainingQuota} email credits left this month."
    optionally: schedule a follow-up to call vibe_get_campaign_analytics

  case "campaign_not_found":
    re-list with vibe_list_campaigns and confirm the id with the creator

  case "no_recipients":
    say "There are no recipients on this campaign yet. Open the Recipients tab in the dashboard, find this campaign, and import your list (CSV, Google Sheet, or paste addresses). Tell me when you're done and I'll send."

  case "missing_content":
    call vibe_update_campaign with the agreed subject + bodyHtml, then retry
    if you no longer have the copy in chat, ask the creator to confirm it again

  case "quota_exceeded":
    say "You're {result.needed - result.remainingQuota} credits short of sending to everyone. You can top up in Email → Credits in the dashboard, then I'll send. Or split the list and send a smaller batch first."
```

## Confirmation pattern

Before calling `vibe_send_campaign`, read the saved draft back to the creator and wait for explicit confirmation:

> About to send campaign **"{name}"** to **N recipients** imported on {date}.
>
> **Subject (saved):** {subject}
>
> **Preview (saved):**
> ```
> {first 200 chars of saved bodyHtml stripped to text}
> ```
>
> Sending costs {N} email credits ({remainingQuota} available). Proceed?

If the creator wants changes, call `vibe_update_campaign` with the revisions, then re-read the saved draft.

## Reading analytics

A few minutes after `enqueued`:

```
analytics = vibe_get_campaign_analytics({ campaignId })
```

The funnel is cumulative left-to-right:

- `imported` = list size
- `enqueued` = how many reached the SES queue (= `imported` minus any validation rejects)
- `delivered` = SES confirmed delivery
- `opened`, `clicked` = engagement (tracking pixel + `/r/{code}` redirect)
- `bounced`, `complained` = SES hygiene signals
- `signedUp` = recipient submitted the waitlist form (Mode A/B) or `syncToPortaly` ran with their refcode (Mode C). Requires the per-recipient `outboxId` (URL `utm_content`) to pin — campaign-level refcodes alone don't pin and stay at 0.
- `converted` = recipient later subscribed via `portaly-payment` and the checkout email matched the imported email on a `signedUp` row.

Report 3–4 numbers, not all 9. Most creators want: delivered, opened, clicked, signedUp.

## Common follow-ups

- "Why is the open rate low?" — Subject line, sender reputation, time of day. Suggest A/B testing in a follow-up campaign.
- "Why did N people bounce?" — Bad addresses in the imported list. Tell them to clean the list before the next send (the dashboard's import preview flags invalid emails).
- "Can I edit the subject/body and resend?" — No, a sent campaign is immutable. Create a new campaign with the same recipient logic for a follow-up.
- "Can I cancel a send mid-flight?" — No. Once `vibe_send_campaign` returns `enqueued`, the send is committed and the SES outbox processes it through. There is no MCP tool or dashboard control to stop it.
