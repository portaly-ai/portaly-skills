---
name: portaly-user
description: Help users sync and manage their application users in Portaly Vibe, including initial migration, incremental sync, and dashboard viewing. Trigger when the user mentions Portaly user sync, user management, user synchronization, member sync, or wants to push user data to Portaly.
---

# Portaly User Management Integration

Use this skill to help a human user integrate Portaly Vibe's User Management API. This lets creators see their users — and who is paying — in the Portaly Vibe Dashboard.

## Key Concepts

- **Source of truth**: The user's data lives in the vibe coder's system. Portaly Vibe is a read-only mirror + subscription status overlay.
- **Sync API**: Push-based. The vibe coder calls `POST /api/creator-subscription/admin/users/sync` to send user data to Portaly Vibe.
- **Dashboard**: Creators view users at `https://payment.portaly.cc/dashboard/users`. It is **read-only** — all changes come from the Sync API.
- **Subscription enrichment**: Each user's row shows their Portaly subscription status (if any) as an attribute. No subscription = "免費".

## API Host

`https://payment.portaly.cc`

## Authentication

Uses the same Creator Subscription API Key (`pcs_live_*` / `pcs_test_*`).

- The Sync API (`POST .../users/sync`) **only accepts API Key auth** (needs `apiKeyId` to identify data ownership).
- GET endpoints accept both API Key and Firebase JWT.

## Workflow

### Step 1 — Get an API Key

Ask the human user to obtain or create a Portaly Vibe Payment API Key:

1. Go to `https://payment.portaly.cc/dashboard/api-keys`
2. Create a **test** key first (recommended for development)
3. Store the secret in `.env`. Check if `PORTALY_API_HOST` already exists (may have been added by another Portaly skill) — if not, add it:
   ```
   PORTALY_API_HOST=https://payment.portaly.cc
   PORTALY_API_KEY=pcs_test_xxxxxxxxxxxxxxxxxxxxxxxx
   ```

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
| `metadata` | object | No | Arbitrary key-value data (max 10KB) |

**How to map:** Read the vibe coder's user model, then match available fields to the Portaly schema. Only map fields that actually exist — skip any the system doesn't have. `email` is the only required field.

- Fields that don't fit core schema → put in `metadata`
- To delete a user: sync with `status: "deleted"` (the record is removed from Portaly)

### Step 3 — Generate Migration Script

Ask the vibe coder:
1. What framework/CMS do they use? (Payload, Next.js + Prisma, Supabase, Express + Mongoose, etc.)
2. How many users do they have?

Then generate a custom migration script that:
- Reads users **using the framework's Local API or ORM that directly queries the database**
  - **Do NOT** call the app's own HTTP/REST API (e.g. `fetch('/api/users')`) — this requires authentication and a running server
  - **Do NOT** install raw DB drivers (e.g. `pg`, `mysql2`) — use what the framework already provides
  - Payload CMS: `const payload = await getPayload({ config }); const { docs } = await payload.find({ collection: 'users' })`
  - Prisma: `const users = await prisma.user.findMany()`
  - Supabase: `const { data } = await supabase.from('users').select()`
  - Mongoose: `const users = await User.find()`
  - Drizzle: `const users = await db.select().from(users)`
- Batches into groups of 100
- Calls `POST /api/creator-subscription/admin/users/sync` for each batch
- Handles 429 with exponential backoff
- Reports progress

See `scripts/migrate_users.mjs` for a Node.js reference template. If the vibe coder uses a different language (Python, Ruby, etc.), generate an equivalent script in their language following the same pattern: batch 100, retry on 429, report progress.

### Step 4 — Pre-flight Environment Check

Before running any sync, **you MUST verify the environment** to prevent accidental data pushes:

1. **Check the API Key mode** — read the `PORTALY_API_KEY` value from `.env` and confirm its prefix:
   - `pcs_test_*` → Test mode (safe to experiment)
   - `pcs_live_*` → Live mode (writes to production Portaly)

2. **Check which database the vibe coder's app is connected to** — read their DB connection config (e.g. `.env`, `DATABASE_URL`, ORM config) and ask:
   - Is this a local dev DB, staging DB, or production DB?
   - Does it contain real user data or test data?

3. **Confirm the combination makes sense:**
   - ✅ Test API Key + any DB → safe, always OK for first run
   - ✅ Live API Key + production DB → correct for go-live
   - ⚠️ Live API Key + local/staging DB → **warn the user**: incomplete or test data will be pushed to Portaly production
   - ⚠️ Test API Key + production DB → harmless but pointless for go-live

**Ask the user to confirm before proceeding.** Example: "Your `.env` has a test key and your app connects to the local DB — this will sync local test users to Portaly's test environment. OK to proceed?"

### Step 5 — Test Run (Test Key + Local DB)

Run the migration script with the **test API key** to verify everything works. The data source can be the local dev DB — this is just to confirm the script runs, the field mapping is correct, and data shows up in Portaly.

```bash
PORTALY_API_KEY=pcs_test_xxx node migrate_users.mjs
```

After running, ask the user to verify at `https://payment.portaly.cc/dashboard/users` (switch to **Test mode**). Check:
- Are the users showing up?
- Are the fields mapped correctly?
- Any errors in the sync logs?

If there are issues, fix the mapping and re-run. Test mode is safe to experiment with.

**Important:** Testing is done, but the integration is NOT complete yet. The test run only verified the script and field mapping — production users have NOT been synced. Let the user know there are still steps remaining:
1. Insert incremental sync hooks into their codebase (Step 6)
2. Migrate production users with a live API key and deploy (Step 7)

Ask: "Test sync looks good! Next I'll add sync hooks to your codebase so new user changes are automatically pushed to Portaly. After that, we'll do the production migration with your live API key. Ready to continue?"

### Step 6 — Insert Incremental Sync Hooks

Provide framework-specific snippets. Use the framework's **hooks / event system** (e.g. Payload `afterChange`, Prisma middleware, Mongoose post-save). The sync helper only calls the **Portaly external API** — it should never call the app's own API.

**Critical: All sync calls MUST be fire-and-forget.**

```typescript
// ✅ Correct: sync failure does not block the main flow
try {
  await createUser(userData) // main business logic
} catch (err) {
  return res.status(500).json({ error: 'Registration failed' })
}
// fire-and-forget — only log errors
syncToPortaly(userData).catch(err => console.error('[Portaly Sync]', err))

// ❌ Wrong: sync failure causes the whole request to fail
await createUser(userData)
await syncToPortaly(userData) // if this fails, user registration fails too
```

**Helper function template:**

Generate a `syncToPortaly` function based on the mapping from Step 2. Only include fields that the vibe coder's system actually has. Below is a full example — remove any fields that don't apply:

```typescript
const PORTALY_API_KEY = process.env.PORTALY_API_KEY
const PORTALY_API_HOST = process.env.PORTALY_API_HOST || 'https://payment.portaly.cc'

async function syncToPortaly(user: {
  email: string;
  id?: string | number;       // → external_user_id
  name?: string;              // → display_name
  role?: string;              // → role
  planName?: string;          // → plan_name
  lastLoginAt?: Date | null;  // → last_login_at (ISO 8601)
  status?: string;            // → status ('active' or 'deleted')
  metadata?: Record<string, unknown>;
}) {
  await fetch(`${PORTALY_API_HOST}/api/creator-subscription/admin/users/sync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PORTALY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      users: [{
        email: user.email,
        external_user_id: user.id != null ? String(user.id) : undefined,
        display_name: user.name,
        role: user.role,
        plan_name: user.planName,
        last_login_at: user.lastLoginAt?.toISOString(),
        status: user.status || 'active',
        metadata: user.metadata,
      }],
    }),
  })
}
```

**Where to insert sync calls — pass all mapped fields available at each hook point:**

- **User registration** — after successful signup, sync the new user with all available fields
- **Profile update** — after successful save, sync updated fields
- **Login** — call sync in the framework's auth hook (e.g. Payload `afterLogin`, NextAuth `events.signIn`, Supabase auth webhooks, Django `user_logged_in` signal, Flask-Login `user_logged_in` signal) and pass `last_login_at` set to the current time in ISO 8601 format. No need to store this in the vibe coder's own database — just generate the timestamp at call time and send it to Portaly.
- **Account deletion** — sync with `status: "deleted"` to remove from Portaly

### Step 7 — Go Live

> **Do NOT skip this step.** The test run (Step 5) only validated the integration in test mode. Production users are NOT yet synced to Portaly. The user must complete this step to go live.

This step has two parts: (A) migrate existing production users, and (B) deploy incremental sync hooks to production.

#### 7a — Migrate Production Users

The migration script needs **two things changed** from the test run: the API key AND the database connection. Present both clearly to the user as a checklist:

**Go-live checklist — both items are required:**

1. **Switch API Key** — replace the test key with a live key in `.env`:
   ```
   PORTALY_API_KEY=pcs_live_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
2. **Switch DB connection** — the migration script must read from the **production database**, not the local dev DB used in testing. Ask the user which approach they prefer:
   - **Option A: Run locally** — temporarily set the production `DATABASE_URL` (or equivalent connection string) in `.env`, run the script, then revert.
   - **Option B: Run on production server / CI** — copy the migration script to a machine that already has production DB access and run it there.

**Before running, verify both are correct (Pre-flight Check):**
1. Read `.env` → `PORTALY_API_KEY` starts with `pcs_live_*`
2. Read `.env` → `DATABASE_URL` (or equivalent) points to the production database, not localhost or a dev/staging DB
3. Ask the user to confirm: "This will read users from your production DB and sync them to Portaly's live environment. Both the API key and DB connection are set to production — OK to proceed?"

```bash
npx tsx --env-file=.env scripts/migrate-users-to-portaly.ts
```

Verify at `https://payment.portaly.cc/dashboard/users` (Live mode).

> **After migration, remind the user to revert `.env`** if they temporarily set production DB credentials locally (Option A). They should restore their local dev `DATABASE_URL` to avoid accidentally writing to production during development.

#### 7b — Deploy Incremental Sync Hooks

The sync hooks from Step 6 should already be in the codebase. Make sure the **production environment variables** are set:

```
PORTALY_API_HOST=https://payment.portaly.cc
PORTALY_API_KEY=pcs_live_xxx
```

Then deploy the application as usual. After deployment, verify incremental sync works by creating/updating a user and checking the Dashboard.

### Step 8 — View Dashboard

Guide the creator to `https://payment.portaly.cc/dashboard/users`:
- User list with search and status filter
- Subscription status column (plan name or "免費")
- Click any user to see full details + metadata
- Sync logs section shows sync history and errors

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
