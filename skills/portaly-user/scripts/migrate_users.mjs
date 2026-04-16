#!/usr/bin/env node

/**
 * Portaly User Management — Bulk Migration Script
 *
 * Usage:
 *   PORTALY_API_KEY=pcs_test_xxx node migrate_users.mjs
 *
 * This script reads users from stdin (JSON array) and syncs them to Portaly Vibe
 * in batches of 100.
 *
 * Example with file input:
 *   cat users.json | PORTALY_API_KEY=pcs_test_xxx node migrate_users.mjs
 *
 * Example users.json:
 *   [
 *     { "email": "alice@example.com", "display_name": "Alice", "status": "active" },
 *     { "email": "bob@example.com", "display_name": "Bob", "metadata": { "role": "admin" } }
 *   ]
 *
 * Instead of stdin, you can read users directly from your framework's API/SDK.
 * Replace the stdin reading section with one of these examples:
 *
 * Payload CMS:
 *   import { getPayload } from 'payload'
 *   import config from './payload.config'
 *   const payload = await getPayload({ config })
 *   const { docs } = await payload.find({ collection: 'users', limit: 10000 })
 *   const users = docs.map(u => ({
 *     email: u.email, display_name: u.name,
 *     external_user_id: String(u.id), role: u.role,
 *   }))
 *
 * Prisma:
 *   import { PrismaClient } from '@prisma/client'
 *   const prisma = new PrismaClient()
 *   const docs = await prisma.user.findMany()
 *   const users = docs.map(u => ({
 *     email: u.email, display_name: u.name,
 *     external_user_id: u.id,
 *   }))
 *
 * Supabase:
 *   import { createClient } from '@supabase/supabase-js'
 *   const supabase = createClient(URL, KEY)
 *   const { data: docs } = await supabase.from('users').select()
 *   const users = docs.map(u => ({
 *     email: u.email, display_name: u.full_name,
 *     external_user_id: u.id,
 *   }))
 *
 * Mongoose:
 *   import User from './models/User'
 *   const docs = await User.find()
 *   const users = docs.map(u => ({
 *     email: u.email, display_name: u.name,
 *     external_user_id: u._id.toString(),
 *   }))
 */

const API_KEY = process.env.PORTALY_API_KEY
const API_HOST = process.env.PORTALY_API_HOST || 'https://payment.portaly.cc'
const API_URL = `${API_HOST}/api/creator-subscription/admin/users/sync`
const BATCH_SIZE = 100
const DELAY_MS = 200

if (!API_KEY) {
  console.error('Error: PORTALY_API_KEY environment variable is required')
  process.exit(1)
}

async function syncBatch(users) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ users }),
  })

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10)
    console.log(`  Rate limited. Retrying in ${retryAfter}s...`)
    await sleep(retryAfter * 1000)
    return syncBatch(users)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }

  return res.json()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  // Read from stdin
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  const input = Buffer.concat(chunks).toString('utf-8')
  const users = JSON.parse(input)

  if (!Array.isArray(users)) {
    console.error('Error: Input must be a JSON array')
    process.exit(1)
  }

  console.log(`Starting migration: ${users.length} users`)

  let totalCreated = 0
  let totalUpdated = 0
  let totalErrors = 0

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(users.length / BATCH_SIZE)

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} users)... `)

    try {
      const result = await syncBatch(batch)
      const { data } = result
      totalCreated += data.created
      totalUpdated += data.updated
      totalErrors += data.errors.length

      console.log(
        `✓ created=${data.created} updated=${data.updated} errors=${data.errors.length}`
      )

      if (data.errors.length > 0) {
        data.errors.forEach((err) => {
          console.log(`    ✗ ${err.email}: ${err.reason}`)
        })
      }
    } catch (err) {
      console.log(`✗ ${err.message}`)
      totalErrors += batch.length
    }

    // Pacing delay between batches
    if (i + BATCH_SIZE < users.length) {
      await sleep(DELAY_MS)
    }
  }

  console.log('')
  console.log('Migration complete:')
  console.log(`  Created: ${totalCreated}`)
  console.log(`  Updated: ${totalUpdated}`)
  console.log(`  Errors:  ${totalErrors}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
