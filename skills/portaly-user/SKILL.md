---
name: portaly-user
version: 0.2.0
description: Help users sync and manage their application users in Portaly Vibe, including initial migration, incremental sync, and dashboard viewing. Trigger when the user mentions Portaly user sync, user management, user synchronization, member sync, or wants to push user data to Portaly.
---

# Portaly User Management Integration

Use this skill to help a human user integrate Portaly Vibe's User Management API. This lets creators see their users — and who is paying — in the Portaly Vibe Dashboard.

## Key Concepts

- **Source of truth**: The user's data lives in the vibe coder's system. Portaly Vibe is a read-only mirror + subscription status overlay.
- **Sync API**: Push-based. The vibe coder calls `POST /api/creator-subscription/admin/users/sync` to send user data to Portaly Vibe.
- **Dashboard**: Creators view users at `https://portaly.ai/dashboard/users`. It is **read-only** — all changes come from the Sync API.
- **Subscription enrichment**: Each user's row shows their Portaly subscription status (if any) as an attribute. No subscription = "Free".

## API Host

`https://portaly.ai`

## Authentication

Uses the same Creator Subscription API Key (`pcs_live_*` / `pcs_test_*`).

- The Sync API (`POST .../users/sync`) **only accepts API Key auth** (needs `apiKeyId` to identify data ownership).
- GET endpoints accept both API Key and Firebase JWT.

## Workflow

### Step 1 — Consent

Before doing anything, the AI agent **must ask the human user** for explicit consent to proceed. Present the following and **wait for the user's response** before moving to Step 2:

> This skill will sync your system's users to Portaly Vibe, so creators can see their users and subscription status in the Portaly Dashboard.
>
> This involves modifying your codebase:
> 1. Reading your user model to map fields to Portaly's schema
> 2. Creating a user dashboard (if you don't have one) with a "Sync to Portaly" button
> 3. Adding automatic sync hooks to your registration, login, update, and deletion flows
>
> Would you like to proceed?

**Do NOT continue until the user explicitly agrees.** If they decline, stop here — do not proceed to any subsequent step.

### Step 2 — Map User Schema

Help the vibe coder map their user fields to the Portaly schema.

**Read the vibe coder's user model first** (DB schema, ORM model, or type definition), then build a mapping table showing: their field → Portaly field. Ask if any fields are missing.

| Portaly field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Dedup key (unique per profile + api_key) |
| `external_user_id` | string | No | Vibe coder's internal user ID |
| `display_name` | string | No | User display name |
| `status` | enum | No | `active` (default), `deleted` (removes the user) |
| `role` | string | No | User role (e.g. `admin`, `member`, `viewer`) |
| `plan_name` | string | No | Vibe coder's own plan label (not Portaly subscription) |
| `last_login_at` | ISO 8601 | No | Last login timestamp (e.g. `2026-04-15T08:30:00.000Z`) |
| `created_at` | ISO 8601 | No | User registration timestamp in the vibe coder's system (e.g. `2026-01-10T12:00:00.000Z`) |
| `metadata` | object | No | Arbitrary key-value data (max 10KB) |
| `signup_ref_code` | string | No | Discount/referral code captured at registration (e.g. from `?ref=EARLY2026`). When this user later starts a checkout, Portaly auto-applies the matching rule once their email is verified, provided the code is still active and the per-customer cap has not been reached. **First-write-wins** — once recorded, subsequent syncs cannot overwrite. The code must already be created in Portaly via the `portaly-payment` skill **before** users register with it. |

**How to map:** Read the vibe coder's user model, then match available fields to the Portaly schema. Only map fields that actually exist — skip any the system doesn't have. `email` is the only required field.

- Fields that don't fit core schema → put in `metadata`
- To delete a user: sync with `status: "deleted"` (the record is removed from Portaly)

### Step 3 — Find Existing User Dashboard

Before adding any sync functionality, **thoroughly search** for existing pages where the user can already view all users. Many frameworks ship a built-in admin UI — do NOT build a new page if one already exists.

**Where to look:**

1. **Framework built-in admin UI** — these are often auto-generated and not visible in the codebase as explicit page files:
   - Payload CMS: `/admin/collections/users` (auto-generated from the Users collection)
   - Django: `/admin/auth/user/` (Django admin)
   - Strapi: `/admin/content-manager/collection-types/plugin::users-permissions.user`
   - WordPress: `/wp-admin/users.php`
   - Directus: `/admin/content/directus_users`
2. **Custom-built admin pages** — search the codebase for routes like `/admin/users`, `/dashboard/users`, or pages that query the users table/collection
3. **Any other page that lists users** — even a simple table view counts

**Then tell the user what you found and what you will do:**

- **If an existing user page was found** → tell the user you will add the "Sync to Portaly" button to that page, then proceed to Step 4. Example:

  > I found that your app already has a user list at `/admin/collections/users` (Payload CMS built-in). I'll add the "Sync to Portaly" button there.

- **If no user page exists** → tell the user you will build a minimal one, then proceed to Step 4. Example:

  > I didn't find an existing page that lists all users. I'll create a simple user dashboard page so we have a place for the "Sync to Portaly" button.

  Build a minimal page:
  - A page (e.g. `/admin/users` or `/dashboard/users`) that lists all users from the database
  - Use the framework and UI library the vibe coder already uses
  - Show at minimum: email, display name, role, status
  - Support pagination if user count could be large

**Do NOT create a new page if one already exists.** The goal is to reuse what the framework provides.

### Step 4 — Add "Sync to Portaly" Button

Add a **"Sync to Portaly"** button to the user dashboard. When clicked, it batch-syncs **all** users to Portaly.

> **Heads up — Portaly may auto-send welcome emails on sync.** When `syncToPortaly` upserts a user, Portaly fires a `welcome_free` (or `welcome_paid` if the user has an active subscription) email by default. If the vibe coder's app already sends its own welcome flow, **disable the matching template before clicking the button**, or the first bulk sync will explode into one duplicate email per existing user. Use `PUT /api/creator-email/templates/welcome_free` with `{ "enabled": false }` — see the `portaly-email` skill for details.

**Implementation:**

1. Create an API route (e.g. `POST /api/admin/sync-to-portaly`) that:
   - Reads all users from the database using the framework's ORM/Local API
   - Maps each user to Portaly schema (using the mapping from Step 2)
   - Batches into groups of 100
   - Calls `POST /api/creator-subscription/admin/users/sync` for each batch
   - Handles 429 with exponential backoff
   - Returns a summary: `{ synced, created, updated, errors }`

2. Add the button to the user dashboard page:
   - Label: "Sync to Portaly"
   - **Helper text next to the button** (required) — render this as visible UI copy so the user understands they only need to click once. Use the vibe coder's existing typography (e.g. a small `<p>`, tooltip, or description element next to the button):

     > Click once to sync all existing users to Portaly. After that, new registrations, logins, profile updates, and deletions are synced automatically in real time. Click again only if data gets out of sync. [View members on Portaly Vibe](https://portaly.ai/dashboard/users)

     The "View members on Portaly Vibe" text must be a clickable link pointing to `https://portaly.ai/dashboard/users` (open in a new tab, e.g. `target="_blank" rel="noopener noreferrer"`). Translate the helper copy into the dashboard's primary language if the rest of the UI is not in English — but keep the link destination unchanged.
   - Show loading state while syncing
   - Show result summary (created / updated / errors) after completion
   - If there are errors, display them to the user

**Key rules:**
- Read users using the framework's Local API or ORM that directly queries the database
- **Do NOT** call the app's own HTTP/REST API (e.g. `fetch('/api/users')`)
- **Do NOT** install raw DB drivers (e.g. `pg`, `mysql2`) — use what the framework already provides
- Framework examples:
  - Payload CMS: `const payload = await getPayload({ config }); const { docs } = await payload.find({ collection: 'users', limit: 10000 })`
  - Prisma: `const users = await prisma.user.findMany()`
  - Supabase: `const { data } = await supabase.from('users').select()`
  - Mongoose: `const users = await User.find()`
  - Drizzle: `const users = await db.select().from(users)`

**Batch sync helper (used by both the button and incremental sync):**

Generate a `syncToPortaly` function based on the mapping from Step 2. Only include fields that the vibe coder's system actually has. Below is a full example — remove any fields that don't apply:

```typescript
const PORTALY_API_KEY = process.env.PORTALY_API_KEY
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'

async function syncToPortaly(users: Array<{
  email: string;
  id?: string | number;       // → external_user_id
  name?: string;              // → display_name
  role?: string;              // → role
  planName?: string;          // → plan_name
  lastLoginAt?: Date | null;  // → last_login_at (ISO 8601)
  createdAt?: Date | null;    // → created_at (ISO 8601)
  status?: string;            // → status ('active' or 'deleted')
  metadata?: Record<string, unknown>;
  signupRefCode?: string;     // → signup_ref_code (only on initial registration sync)
}>) {
  const BATCH_SIZE = 100
  const results = { synced: 0, created: 0, updated: 0, errors: [] as any[] }

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    const payload = batch.map(user => ({
      email: user.email,
      external_user_id: user.id != null ? String(user.id) : undefined,
      display_name: user.name,
      role: user.role,
      plan_name: user.planName,
      last_login_at: user.lastLoginAt?.toISOString(),
      created_at: user.createdAt?.toISOString(),
      status: user.status || 'active',
      metadata: user.metadata,
      signup_ref_code: user.signupRefCode,
    }))

    try {
      const res = await fetch(
        `${PORTALY_API_HOST}/api/creator-subscription/admin/users/sync`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PORTALY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ users: payload }),
        }
      )

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10)
        await new Promise(r => setTimeout(r, retryAfter * 1000))
        i -= BATCH_SIZE // retry this batch
        continue
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`API error ${res.status}: ${text}`)
      }

      const { data } = await res.json()
      results.synced += data.synced
      results.created += data.created
      results.updated += data.updated
      results.errors.push(...data.errors)
    } catch (err) {
      results.errors.push({ batch: i / BATCH_SIZE + 1, reason: String(err) })
    }
  }

  return results
}
```

For single-user incremental sync (used in Step 5), the same helper works — just pass an array with one user.

### Step 5 — Insert Incremental Sync Hooks

Use the framework's **hooks / event system** (e.g. Payload `afterChange`, Prisma middleware, Mongoose post-save). The sync helper only calls the **Portaly external API** — it should never call the app's own API.

**Critical: All sync calls MUST be fire-and-forget.**

```typescript
// ✅ Correct: sync failure does not block the main flow
try {
  await createUser(userData) // main business logic
} catch (err) {
  return res.status(500).json({ error: 'Registration failed' })
}
// fire-and-forget — only log errors
syncToPortaly([userData]).catch(err => console.error('[Portaly Sync]', err))

// ❌ Wrong: sync failure causes the whole request to fail
await createUser(userData)
await syncToPortaly([userData]) // if this fails, user registration fails too
```

**Where to insert sync calls — pass all mapped fields available at each hook point:**

- **User registration** — after successful signup, sync the new user with all available fields. **If the registration form or URL captured a referral / promo parameter (e.g. `?ref=EARLY2026`), pass it as `signup_ref_code`** so Portaly can auto-apply the matching discount on this user's next eligible checkout. Common URL patterns to support: `?ref=`, `?code=`, `?promo=`, `?coupon=`. The code must already exist in Portaly (created via the `portaly-payment` skill); unknown codes are dropped silently with `errors: [{ reason: 'unknown_signup_ref_code' }]` — the user is still synced. **First-write-wins** — only the first successful sync records the code; later syncs that pass a different code are dropped with `errors: [{ reason: 'signup_ref_code_already_recorded' }]`.
- **Profile update** — after successful save, sync updated fields
- **Login** — call sync in the framework's auth hook (e.g. Payload `afterLogin`, NextAuth `events.signIn`, Supabase auth webhooks, Django `user_logged_in` signal, Flask-Login `user_logged_in` signal) and pass `last_login_at` set to the current time in ISO 8601 format. No need to store this in the vibe coder's own database — just generate the timestamp at call time and send it to Portaly.
- **Account deletion** — sync with `status: "deleted"` to remove from Portaly
- **Waitlist signup** — if the merchant uses the `portaly-email` skill in self-hosted mode (Mode B), the `/waitlist/[creatorSlug]` page receives a follower's email-and-name signup. Treat that as a new user and call `syncToPortaly([{ email, name, status: 'active' }])` after the POST to `/api/waitlist` succeeds, fire-and-forget

### Step 6 — Verify & Done

After implementing all sync hooks, perform a final review of the codebase, check environment variables, and present the results to the user.

#### 6a — Endpoint Checklist

Review the codebase and present a checklist to the user. For each user lifecycle event, check whether a Portaly sync call exists:

```
## Portaly Sync Endpoint Checklist

✅ / ❌ User registration — {file path and line}
   Reason: {why}
✅ / ❌ User login (update last_login_at) — {file path and line}
   Reason: {why}
✅ / ❌ User profile update — {file path and line}
   Reason: {why}
✅ / ❌ User deletion (status: "deleted") — {file path and line}
   Reason: {why}
```

Rules:
- Use ✅ if a fire-and-forget `syncToPortaly` call exists at that hook point
- Use ❌ if no sync call exists — explain why (e.g. "system has no user deletion feature" or "this endpoint is missing sync, needs to be added")
- If a hook is missing and should exist, **add it** before continuing

#### 6b — Next Steps & Done

Tell the user the integration is complete, then present **exactly** the following action items. These are things the user must do themselves. **You MUST include all three environment variables — do NOT omit `PORTALY_CALLBACK_SECRET`.**

**Action items to present (output all of these):**

1. **Set environment variables** in your production/staging environment. Get them at `https://portaly.ai/dashboard`. All three are required:
   ```
   PORTALY_API_HOST=https://portaly.ai
   PORTALY_API_KEY=pcs_live_xxxxxxxxxxxxxxxxxxxxxxxx
   PORTALY_CALLBACK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
   `pcs_test_*` keys sync to Portaly's test environment; `pcs_live_*` keys sync to production.

2. **Deploy your application** — the sync hooks and "Sync to Portaly" button only work after deployment.

3. **Click "Sync to Portaly"** at `{user dashboard path}` to sync all existing users to Portaly.

Then explain: after the first sync, **no manual sync is needed for daily use.** When users register, log in, update their profile, or delete their account, the system automatically syncs to Portaly in real time. The user only needs to click "Sync to Portaly" again if data is out of sync (e.g. a previous sync failed, or the database was manually modified).

Finally, point the user to the Portaly Dashboard to verify: `https://portaly.ai/dashboard/users`

Replace `{user dashboard path}` with the actual path where the button was added.

## Guardrails

- **Fire-and-forget**: Sync API calls MUST be non-blocking. Never let a Portaly failure break the vibe coder's core business flow.
- **Batch limit**: Max 100 users per sync call. Split larger batches.
- **Email is the dedup key**: `UNIQUE(profile_id, api_key_id, email)`. Duplicate pushes safely upsert.
- **Metadata limit**: 10KB per user.
- **Pacing**: No rate limit in v1, but recommend 200ms delay between batches for bulk migration.
- **Mode isolation**: Test and live data are completely separate.
- **Deletion**: Sync with `status: "deleted"` to remove the user from Portaly. No separate DELETE endpoint.
- **Sync logs**: Every sync call is logged on the Portaly side. Creators can view sync history and errors in the Dashboard.

## Output Preferences

- Prefer code snippets over architecture explanations.
- Use the vibe coder's existing framework and language.
- Always wrap sync calls in fire-and-forget pattern.
- Show `.env` setup before any API call.

## Reference Documents

- `references/api-contract.md` — Full API specification (5 endpoints)
