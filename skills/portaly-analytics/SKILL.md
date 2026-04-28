---
name: portaly-analytics
version: 0.1.0
description: Help Portaly creators install Google Analytics 4 (GA4) on their websites, set up Portaly event tracking, and connect their GA4 account to Portaly for viewing analytics dashboards. Trigger when the user mentions Google Analytics, GA4, tracking, analytics, website traffic, event tracking, or wants to connect analytics to Portaly.
---

# Portaly Analytics Integration

Use this skill to help a Portaly creator install Google Analytics 4 on their website and connect it to Portaly. Keep answers operational: prefer step lists, code snippets, and copy-ready examples over long architecture explanations.

## Quick Start

- First, ask the human user what they want to accomplish:
  - **Install GA4 on my website** → Part A (steps 1–5)
  - **Connect GA to Portaly dashboard** → Part B (step 6)
  - **Both** → Part A + Part B (steps 1–6)

1. Confirm what the human user is trying to build.
   Ask about their tech stack (Next.js / React / vanilla HTML) and whether they have an existing GA4 Property.
2. Guide through GA4 setup and event tracking installation.
3. If the user wants to see analytics in Portaly, guide through the Portaly authorization flow.
4. Start with `references/ga4-setup-guide.md` for installation instructions.
5. Return implementation-ready output.
   Prefer numbered steps, code samples, and copy-ready configuration.

## Output Style

- Write for an AI agent that is helping a human user complete integration work.
- Lead with the next concrete steps the human should take.
- Use lists for:
  - setup steps
  - environment variables
  - event definitions
  - configuration options
- Prefer concise code samples in JavaScript or TypeScript when the user does not ask for another stack.
- Always include `.env` configuration and `.gitignore` verification steps.

## Part A — GA4 Installation & Event Tracking

### 1. Create GA4 Property

- If the user does not have a GA4 Property, guide them to create one:
  1. Go to [Google Analytics](https://analytics.google.com/)
  2. Click "Admin" → "Create Property"
  3. Enter property name, select timezone and currency
  4. Set up a Web data stream with the site URL
  5. Copy the Measurement ID (`G-XXXXXXX`)
- Ask the user to provide their Measurement ID.
- Save it to `.env`:

```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXX
```

- **Verify that `.gitignore` includes `.env`** before proceeding.

### 2. Install gtag.js

- Refer to `references/ga4-setup-guide.md` for framework-specific installation instructions.
- Choose the correct approach based on the user's tech stack:
  - **Next.js App Router** → `layout.tsx` with `next/script`
  - **Next.js Pages Router** → `_app.js` with `next/script`
  - **React SPA** → `index.html` script tags
  - **Vanilla HTML** → `<head>` script tags
- Reference implementation: `scripts/gtag-nextjs-example.mjs`

### 3. Set up Portaly event tracking

- Refer to `references/event-tracking-contract.md` for standard Portaly event definitions.
- Install standard Portaly events based on what the user's app does:
  - `portaly_checkout_start` — when a checkout session is created
  - `portaly_checkout_complete` — when a payment callback confirms completion
  - `portaly_subscription_cancel` — when a subscription is cancelled
  - `portaly_page_view` — when a Portaly-embedded page is viewed
  - `portaly_product_view` — when a product page is viewed
- Map to GA4 recommended ecommerce events where applicable (`begin_checkout`, `purchase`).
- Reference implementation: `scripts/track-portaly-events.mjs`

### 4. Verify installation

- Guide the user to verify in GA4 Realtime report:
  1. Open the website in a browser
  2. Go to Google Analytics → Reports → Realtime
  3. Confirm page views and events appear
- If events don't appear, check:
  - Measurement ID is correct
  - gtag.js script is loaded (check browser Network tab)
  - No ad blockers interfering
  - Consent mode is not blocking (if applicable)

### 5. Optional: Enhanced ecommerce tracking

- For users with Portaly payment integration, set up enhanced ecommerce events:
  - `view_item` → when a plan or product page is viewed
  - `begin_checkout` → mapped from `portaly_checkout_start`
  - `purchase` → mapped from `portaly_checkout_complete`
- These enable GA4's built-in ecommerce reports.

## Part B — Connect Google Analytics to Portaly

### 6. Authorize Portaly to access GA data

Once GA4 is installed and collecting data, guide the user to connect it to Portaly:

1. Go to Portaly Vibe Dashboard: `https://portaly.ai/dashboard/analytics`
2. Navigate to **數據分析** (Analytics) settings
3. Click **連結 Google Analytics**
4. Sign in with the Google account that owns the GA4 Property
5. Grant Portaly read-only access to Google Analytics data
6. Select the GA4 Property to connect
7. Done — analytics dashboard will appear in Portaly Vibe Dashboard

**Key points to communicate to the user:**
- Portaly only requests **read-only** access (`analytics.readonly` scope). Portaly cannot modify your GA4 settings or data.
- You can revoke access at any time from your [Google Account permissions](https://myaccount.google.com/permissions).
- The dashboard in Portaly will show data from your connected GA4 Property, including sessions, page views, traffic sources, and Portaly-specific events.
- GA4 data has a **24–48 hour processing delay**. Newly installed tracking may take 1–2 days to show historical data in Portaly.

## Guardrails

- **Measurement ID format**: Always `G-XXXXXXX`. If the user provides a different format (e.g., `UA-XXXXX`), that is a Universal Analytics ID — guide them to create a GA4 Property instead.
- **Credentials security**: The Measurement ID (`G-XXXXXXX`) is not a secret — it's visible in page source. However, always store it in `.env` for easy configuration management and verify `.gitignore` includes `.env`.
- **Cross-domain tracking**: If the user's app redirects to `portaly.ai` for checkout and back, recommend setting up cross-domain tracking in GA4 to maintain session continuity:
  1. Go to GA4 Admin → Data Streams → Web → Configure tag settings → Configure your domains
  2. Add both domains
- **Ad blockers**: Some visitors use ad blockers that block gtag.js. GA4 numbers will always undercount. Do not promise 100% tracking accuracy.
- **Consent mode**: If the user's site needs cookie consent (GDPR, etc.), guide them to implement GA4 consent mode.
- **Data freshness**: GA4 data has a 24–48 hour processing delay. Realtime data is available in GA4's own Realtime report but Portaly dashboards rely on the processed data.
- **Portaly authorization**: The Portaly OAuth connection is handled entirely by Portaly's hosted flow. The user does not need to create any Google Cloud projects, OAuth clients, or manage API keys. They simply click "Connect" and authorize.

## Preferred Response Shape

When answering with this skill, prefer this order:

1. Goal summary
2. Prerequisites check
3. Step-by-step setup instructions
4. Environment variable configuration
5. Code implementation
6. Verification steps
7. Troubleshooting notes

## Resources

- `references/ga4-setup-guide.md`
  Use for framework-specific gtag.js installation instructions and pageview/event tracking setup.
- `references/event-tracking-contract.md`
  Use for standard Portaly event names, parameters, and GA4 ecommerce event mappings.
- `scripts/gtag-nextjs-example.mjs`
  Reference implementation for installing gtag.js in a Next.js application.
- `scripts/track-portaly-events.mjs`
  Reference implementation for tracking Portaly-specific events.
