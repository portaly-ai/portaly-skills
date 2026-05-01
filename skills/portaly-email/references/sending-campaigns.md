# Sending a Campaign via Vibe MCP

Companion to the **Sending a Campaign (Vibe MCP)** section in SKILL.md. End-to-end run with body templates and concrete outcome handling.

## Prerequisites

- Agent is connected to the creator's Portaly Vibe MCP server (the dashboard onboarding flow installs this).
- The `email` skill is installed for that connection — without it, the campaign tools are not registered for this MCP session.
- The creator has a working sender domain. If not, point them at **Email → Domain** in the Vibe dashboard first; that's where they verify DKIM / CNAME. Sending before the domain is verified results in delivery failures the creator will have to chase.

## Flow

```
vibe_list_campaigns                          # find or confirm a draft
  ↓
vibe_create_campaign  (only if starting new)
  ↓
[creator imports recipients in dashboard]    # not via MCP
  ↓
draft subject + bodyHtml with creator
  ↓
read back to creator + confirm
  ↓
vibe_send_campaign
  ↓
switch on outcome
  ↓
vibe_get_campaign_analytics  (a few min later)
```

## Drafting the body

The body is HTML. Keep it simple — most email clients strip aggressive CSS and break on layout-heavy markup. A reliable starting point:

```html
<p>Hi {customerName},</p>

<p>{merchantName} here. <!-- one-paragraph hook tied to the campaign angle --></p>

<p>
  <a href="{inviteUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:6px;">
    <!-- CTA text -->
  </a>
</p>

<p>— {merchantName}</p>
```

Rules:

- **`{inviteUrl}` is mandatory.** It's the tracked invitation link. Drop it and the email has no CTA.
- `{customerName}` falls back to a generic greeting if the imported row didn't include a name. Still safe to use.
- Custom column slugs (whatever the creator imported beyond name + email) are referenced the same way: `{discount_code}`, `{cohort}`, etc. Confirm slugs with the creator — they're shown in the dashboard's import preview.
- Inline styles only. External stylesheets and `<style>` blocks are stripped or ignored by Gmail / Outlook / Apple Mail.
- Images: use absolute HTTPS URLs. No `data:` URIs (some clients block them). If the creator wants a hosted image, point them at the dashboard's image upload in **Email → Templates**.

## Outcome handling

`vibe_send_campaign` returns a discriminated `outcome`. Pseudocode for the agent:

```
result = vibe_send_campaign({ campaignId, subject, bodyHtml })

switch result.outcome:
  case "enqueued":
    say "Sent to {result.enqueuedCount} people. {result.remainingQuota} email credits left this month."
    optionally: schedule a follow-up to call vibe_get_campaign_analytics

  case "campaign_not_found":
    re-list with vibe_list_campaigns and confirm the id with the creator

  case "no_recipients":
    say "There are no recipients on this campaign yet. Open Email → Outreach in the dashboard, find this campaign, and import your list (CSV, Google Sheet, or paste addresses). Tell me when you're done and I'll send."
    do NOT auto-retry

  case "quota_exceeded":
    say "You're {result.needed - result.remainingQuota} credits short of sending to everyone. You can top up in Email → Credits in the dashboard, then I'll send. Or, you can split the list and send a smaller batch first."
    do NOT auto-retry
```

## Confirmation pattern

Before calling `vibe_send_campaign`, read the plan back to the creator and wait for explicit confirmation:

> About to send campaign **"{name}"** to **N recipients** imported on {date}.
>
> **Subject:** {subject}
>
> **Preview:**
> ```
> {first 200 chars of bodyHtml stripped to text}
> ```
>
> Sending costs {N} email credits ({remainingQuota} available). Proceed?

If the creator hesitates on subject / body / list, loop back — don't push to send.

## Reading analytics

A few minutes after `enqueued`:

```
analytics = vibe_get_campaign_analytics({ campaignId })
```

The funnel is cumulative left-to-right. Typical narrative for the creator:

- `imported` = list size
- `enqueued` = how many actually reached the SES queue (= `imported` if no validation rejects)
- `delivered` = SES confirmed delivery (subtract for hard bounces)
- `opened`, `clicked` = engagement signals (open tracking via tracking pixel; click via redirect through `portaly.ai/r/{code}`)
- `signedUp` = recipient hit the waitlist landing page and submitted (Mode A or B)
- `converted` = recipient later became a paying member via `portaly-payment`

Report 3–4 numbers, not all 9. Most creators want: delivered, opened, clicked, signedUp.

## Common follow-ups

- "Why is the open rate low?" — Subject line, sender reputation, time of day. Suggest A/B testing in a follow-up campaign.
- "Why did N people bounce?" — Bad addresses in the imported list. Tell them to clean the list before the next send (the dashboard's import preview flags invalid emails).
- "Can I edit the subject/body and resend?" — No, a sent campaign is immutable. Create a new campaign with the same recipient logic for a follow-up.
- "Can I cancel a send mid-flight?" — There's no MCP tool for that, and at the time of writing the dashboard does not expose an in-flight stop either. Once `vibe_send_campaign` returns `enqueued`, the send is committed; the SES outbox processes it through. Plan accordingly: confirm the recipient list and copy carefully before calling.
