---
name: portaly-user
version: 0.3.0
description: Help users sync and manage their application users in Portaly Vibe, including initial migration, incremental sync, and dashboard viewing. Trigger when the user mentions Portaly user sync, user management, user synchronization, member sync, or wants to push user data to Portaly.
---

# Portaly User Management Integration

Use this skill to help a human user integrate Portaly Vibe's User Management API. This lets creators see their users — and who is paying — in the Portaly Vibe Dashboard.

## Key Concepts

- **Source of truth**: The user's data lives in the vibe coder's system. Portaly Vibe is a read-only mirror + subscription status overlay.
- **Sync API**: Push-based. The vibe coder calls `POST /api/creator-subscription/admin/users/sync` to send user data to Portaly Vibe.
- **Dashboard**: Creators view users at `https://portaly.ai/dashboard/members`. It is **read-only** — all changes come from the Sync API.
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
> 2. Adding automatic sync hooks to your registration, login, update, and deletion flows
> 3. Running a one-time backfill of your existing users — done either by me directly or via a one-off script you run after deploy, no UI button needed
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

### Step 3 — Confirm API Key & Pick Initial Sync Approach

Before writing any code, settle two things with the human user. Do not proceed to Step 4 until both are resolved.

#### 3a — Confirm `PORTALY_API_KEY` is available

The skill needs `PORTALY_API_KEY` to call the Sync API — both the incremental hooks (Step 4) and the initial backfill (Step 5) depend on it.

1. Check the user's local env files (`.env`, `.env.local`, `.env.development`, or the framework's env config) for an existing key.
2. If found, confirm it with the user: is this the right key for the environment you want to sync to? `pcs_test_*` keys go to Portaly's test environment; `pcs_live_*` go to production.
3. If not found, ask the user to grab it from `https://portaly.ai/dashboard` and paste it. Save it to the appropriate local env file once provided.

**Stop here if the key isn't available.** The skill cannot do its job without it. Tell the user to re-run the skill once they have the key.

#### 3b — Pick the initial sync path

Ask the user where their real users live. The answer determines how the one-time backfill runs. Use this prompt verbatim (translate to the conversation's language):

> The initial sync needs to push every existing user to Portaly once. I can do this in one of two ways:
>
> - **Option A — I run it now from your local environment.** I read users from the database your local code is connected to and call the Portaly API directly. Pick this if your local DB has the users you want synced (e.g. you develop directly against production, or you've already loaded prod data locally).
> - **Option B — I generate a one-time script you run on production after deploy.** I create `scripts/sync-portaly-once.mjs` (or `.ts`). After you deploy with `PORTALY_API_KEY` set, you run the script once on the production environment. Pick this if your dev DB and prod DB are separate.
>
> Which one fits your setup?

**Wait for the user's choice before continuing.** Step 5 branches on this answer.

### Step 4 — Add Sync Helper & Incremental Hooks

Add the `syncToPortaly` helper, then wire it into the framework's user lifecycle hooks. The same helper is reused by the initial sync in Step 5.

**Batch sync helper:**

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

**Place this helper in a shared module** — e.g. `lib/portaly-user-sync.ts` (adapt to the project's conventions) — exporting `syncToPortaly`. The same module is imported by both the incremental hooks below and the initial-sync entry point in Step 5. The helper handles single-user calls (pass an array of one) and bulk batches the same way.

**Insert incremental hooks:**

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

### Step 5 — Run Initial Sync

> **Heads up — Portaly may auto-send welcome emails on this sync.** When `syncToPortaly` upserts a user, Portaly fires a `welcome_free` (or `welcome_paid` if the user has an active subscription) email by default. If the vibe coder's app already sends its own welcome flow, **disable the matching template before running the initial sync**, or the backfill will explode into one duplicate email per existing user. To disable: `GET /api/creator-email/templates/welcome_free` to fetch the current template, then `PUT` the same payload back with `enabled: false` (the endpoint validates `subject`, `greeting`, and `body` as required non-empty strings — you cannot send `{ enabled: false }` alone). Same flow for `welcome_paid`. See the `portaly-email` skill for details.

Branch on the path picked in Step 3b.

#### Option A — Run from local now

The agent does the backfill directly. No UI, no button, no extra route.

1. Read all users from the database using the framework's Local API or ORM (see examples below). **Do NOT** call the app's own HTTP API. **Do NOT** install raw DB drivers — use what the framework already provides.
2. Map each user to the Portaly schema using the mapping from Step 2.
3. Import `syncToPortaly` from the shared module created in Step 4 and call it with the mapped users — the helper handles batching, 429 backoff, and error reporting.
4. Print the result `{ synced, created, updated, errors }` for the human user. If `errors` is non-empty, surface them and offer to retry.

Framework read examples:
- Payload CMS: `const payload = await getPayload({ config }); const { docs } = await payload.find({ collection: 'users', limit: 10000 })`
- Prisma: `const users = await prisma.user.findMany()`
- Supabase: `const { data } = await supabase.from('users').select()`
- Mongoose: `const users = await User.find()`
- Drizzle: `const users = await db.select().from(users)`

Run via `node`, `tsx`, or whatever ad-hoc runner the project already uses. For very large datasets (tens of thousands of users) warn the user the run may take a while — see **Guardrails** below for pacing recommendations.

#### Option B — Generate a one-time script

Create `scripts/sync-portaly-once.mjs` (or `.ts` if the project is TypeScript-first). The script must:

- Import `syncToPortaly` from the shared module created in Step 4 (do not duplicate the helper inline — keeping one source of truth avoids drift)
- Read all users via the same framework ORM/Local API used in Option A's examples
- Map per Step 2 and call `syncToPortaly(users)`
- Print the result `{ synced, created, updated, errors }` and exit non-zero if `errors` is non-empty
- Read `PORTALY_API_KEY` and `PORTALY_API_HOST` from the environment (do not hardcode)

Then tell the user, verbatim (translate to the conversation's language):

> The script is at `scripts/sync-portaly-once.mjs`. After you set `PORTALY_API_KEY` in production and deploy, run it once on the production environment:
>
>     PORTALY_API_KEY=pcs_live_xxx node scripts/sync-portaly-once.mjs
>
> You only need to run it once. After that, the incremental hooks added in Step 4 keep Portaly in sync automatically. Re-run only if data drifts (e.g. a previous sync failed, or the DB was modified outside the app).

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

Tell the user the integration is complete, then present the following action items — these are things the user must do themselves. **You MUST include all three environment variables — do NOT omit `PORTALY_CALLBACK_SECRET`.** Item 3 only applies to users who picked Option B in Step 3b — omit it entirely for Option A (the initial sync already happened in Step 5).

**Action items:**

1. **Set environment variables** in your production/staging environment. Get them at `https://portaly.ai/dashboard`. All three are required:
   ```
   PORTALY_API_HOST=https://portaly.ai
   PORTALY_API_KEY=pcs_live_xxxxxxxxxxxxxxxxxxxxxxxx
   PORTALY_CALLBACK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
   `pcs_test_*` keys sync to Portaly's test environment; `pcs_live_*` keys sync to production.

2. **Deploy your application** — the incremental sync hooks only fire after deployment.

3. **Run the one-time backfill** on production after deploy:
   ```
   PORTALY_API_KEY=pcs_live_xxx node scripts/sync-portaly-once.mjs
   ```

Then explain: after the initial sync, **no manual action is needed for daily use.** When users register, log in, update their profile, or delete their account, the system automatically syncs to Portaly in real time. Re-run the script (Option B) or re-trigger the skill's initial sync (Option A) only if data drifts — e.g. a previous sync failed, or the database was modified outside the app.

Finally, point the user to the Portaly Dashboard to verify: `https://portaly.ai/dashboard/members`

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
