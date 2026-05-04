#!/usr/bin/env node

/**
 * Portaly User Management — Single User Sync Example
 *
 * Usage (CLI):
 *   PORTALY_API_KEY=pcs_test_xxx node sync_user.mjs alice@example.com "Alice" active
 *
 * Usage (in code):
 *   import { syncUser } from './sync_user.mjs'
 *   await syncUser({ email: 'alice@example.com', display_name: 'Alice' })
 */

const API_KEY = process.env.PORTALY_API_KEY
const API_HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'
const API_URL = `${API_HOST}/api/creator-subscription/admin/users/sync`

/**
 * Sync a single user to Portaly Vibe.
 * Designed to be called as fire-and-forget:
 *   syncUser(data).catch(err => console.error('[Portaly Sync]', err))
 */
export async function syncUser(user) {
  if (!API_KEY) {
    throw new Error('PORTALY_API_KEY not set')
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      users: [
        {
          email: user.email,
          external_user_id: user.external_user_id,
          display_name: user.display_name,
          status: user.status || 'active',
          role: user.role,
          plan_name: user.plan_name,
          last_login_at:
            user.last_login_at instanceof Date
              ? user.last_login_at.toISOString()
              : user.last_login_at,
          created_at:
            user.created_at instanceof Date
              ? user.created_at.toISOString()
              : user.created_at,
          metadata: user.metadata,
          signup_ref_code: user.signup_ref_code,
        },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Portaly sync failed (${res.status}): ${text}`)
  }

  return res.json()
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('sync_user.mjs')) {
  const [, , email, displayName, status] = process.argv

  if (!email) {
    console.error('Usage: node sync_user.mjs <email> [display_name] [status]')
    process.exit(1)
  }

  if (!API_KEY) {
    console.error('Error: PORTALY_API_KEY environment variable is required')
    process.exit(1)
  }

  syncUser({
    email,
    display_name: displayName,
    status: status || 'active',
  })
    .then((result) => {
      console.log('Sync result:', JSON.stringify(result.data, null, 2))
    })
    .catch((err) => {
      console.error('Error:', err.message)
      process.exit(1)
    })
}
