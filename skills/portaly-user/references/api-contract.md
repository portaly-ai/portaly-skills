# Portaly User Management API Contract

## Base URL

```
https://portaly.ai
```

## Authentication

All endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer {PORTALY_API_KEY}
```

- API Key prefix determines mode: `pcs_live_*` (production) / `pcs_test_*` (sandbox)
- The Sync endpoint (`POST .../users/sync`) only accepts API Key auth.
- GET endpoints also accept Firebase JWT (for Dashboard SSO login).

---

## Endpoints

### 1. POST /api/creator-subscription/admin/users/sync

Batch upsert users. Max 100 per call.

**Auth:** API Key only

**Request:**
```json
{
  "users": [
    {
      "email": "alice@example.com",
      "external_user_id": "usr_123",
      "display_name": "Alice",
      "status": "active",
      "role": "admin",
      "plan_name": "Pro",
      "last_login_at": "2026-04-15T08:30:00.000Z",
      "created_at": "2026-01-10T12:00:00.000Z",
      "metadata": { "tier": "gold" }
    }
  ]
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `email` | string | Yes | Valid email, max 255 chars. Dedup key. |
| `external_user_id` | string | No | Max 255 chars |
| `display_name` | string | No | Max 255 chars |
| `status` | string | No | `active` (default), `deleted` (removes the user) |
| `role` | string | No | Max 255 chars |
| `plan_name` | string | No | Max 255 chars |
| `last_login_at` | string | No | ISO 8601 datetime (e.g. `2026-04-15T08:30:00.000Z`) |
| `created_at` | string | No | ISO 8601 datetime — user registration time in the vibe coder's system (e.g. `2026-01-10T12:00:00.000Z`) |
| `metadata` | object | No | Arbitrary key-value, max 10KB serialized |

**Response (200):**
```json
{
  "data": {
    "synced": 98,
    "created": 50,
    "updated": 48,
    "deleted": 0,
    "errors": [
      { "email": "bad-email", "reason": "invalid email format" },
      { "email": "huge@meta.data", "reason": "metadata exceeds 10KB" }
    ]
  }
}
```

**Fire-and-forget pattern (required):**
```typescript
// Sync should never block the main flow
syncToPortaly(userData).catch(err => console.error('[Portaly Sync]', err))
```

---

### 2. GET /api/creator-subscription/admin/users

List users with pagination, search, and subscription enrichment.

**Auth:** API Key or Firebase JWT

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `profileId` | string | — | Required for Firebase JWT auth |
| `mode` | string | from API Key | `live` or `test` |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Max 100 |
| `search` | string | — | Search email and display_name (ILIKE) |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid-xxx",
      "email": "alice@example.com",
      "displayName": "Alice",
      "externalUserId": "usr_123",
      "status": "active",
      "role": "admin",
      "planName": "Pro",
      "lastLoginAt": "2026-04-15T08:30:00.000Z",
      "metadata": { "tier": "gold" },
      "syncedAt": "2026-04-13T10:00:00.000Z",
      "createdAt": "2026-04-13T09:00:00.000Z",
      "updatedAt": "2026-04-13T10:00:00.000Z",
      "subscription": {
        "planName": "Creator Pro",
        "billingPeriod": "monthly",
        "status": "active",
        "amount": 299,
        "currency": "TWD",
        "nextBillingAt": "2026-05-01T00:00:00.000Z"
      }
    },
    {
      "id": "uuid-yyy",
      "email": "bob@example.com",
      "displayName": "Bob",
      "externalUserId": null,
      "status": "active",
      "role": null,
      "planName": null,
      "lastLoginAt": null,
      "metadata": null,
      "syncedAt": "2026-04-13T10:00:00.000Z",
      "createdAt": "2026-04-13T09:00:00.000Z",
      "updatedAt": "2026-04-13T10:00:00.000Z",
      "subscription": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Note:** `subscription` is null for free users (no active Portaly subscription). This field is read-only and populated by the Portaly payment system.

---

### 3. GET /api/creator-subscription/admin/users/{userId}

Get a single user with subscription info.

**Auth:** API Key or Firebase JWT

**Query params:** `profileId`, `mode` (same as list)

**Response (200):**
```json
{
  "data": {
    "id": "uuid-xxx",
    "email": "alice@example.com",
    "displayName": "Alice",
    "externalUserId": "usr_123",
    "status": "active",
    "role": "admin",
    "planName": "Pro",
    "lastLoginAt": "2026-04-15T08:30:00.000Z",
    "metadata": { "tier": "gold" },
    "syncedAt": "2026-04-13T10:00:00.000Z",
    "createdAt": "2026-04-13T09:00:00.000Z",
    "updatedAt": "2026-04-13T10:00:00.000Z",
    "subscription": { ... }
  }
}
```

**Response (404):**
```json
{ "error": "User not found" }
```

---

### 4. GET /api/creator-subscription/admin/users/stats

Get aggregated user statistics.

**Auth:** API Key or Firebase JWT

**Query params:** `profileId`, `mode`

**Response (200):**
```json
{
  "data": {
    "total": 500,
    "withSubscription": 300,
    "withoutSubscription": 200
  }
}
```

---

### 5. GET /api/creator-subscription/admin/users/sync-logs

Get sync history logs.

**Auth:** API Key or Firebase JWT

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `profileId` | string | — | Required for Firebase JWT auth |
| `mode` | string | from API Key | `live` or `test` |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Max 50 |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid-xxx",
      "status": "success",
      "totalCount": 100,
      "createdCount": 50,
      "updatedCount": 50,
      "errorCount": 0,
      "errors": null,
      "createdAt": "2026-04-13T10:05:00.000Z"
    },
    {
      "id": "uuid-yyy",
      "status": "partial",
      "totalCount": 100,
      "createdCount": 48,
      "updatedCount": 50,
      "errorCount": 2,
      "errors": [
        { "email": "bad-email", "reason": "invalid email format" },
        { "email": "huge@meta.data", "reason": "metadata exceeds 10KB" }
      ],
      "createdAt": "2026-04-13T09:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

Sync log `status` values:
- `success` — all users synced without errors
- `partial` — some users synced, some failed
- `failed` — all users failed

---

## Error Responses

**401 Unauthorized:**
```json
{ "error": "Missing bearer token" }
{ "error": "Invalid API key" }
```

**400 Bad Request:**
```json
{
  "error": "Validation error",
  "details": [ ... zod issues ... ]
}
```

**500 Internal Server Error:**
```json
{ "error": "Internal server error" }
```
