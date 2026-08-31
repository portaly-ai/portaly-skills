#!/usr/bin/env node
/**
 * Read-only preflight for buyer promotion on a Portaly Payment product.
 *
 *   PORTALY_API_KEY=pcs_test_xxx node check_promotion_setup.mjs
 *
 * Prints the mode, the product switch state, and which of the product's plans
 * are included or excluded and why. Writes nothing. Run it before wiring
 * attribution code, and again before going live.
 *
 * Promotion is configured per product, not per plan: one switch and one rate
 * cover every eligible plan, so this takes no plan argument.
 *
 * The key is read from the environment only. Accepting it as an argument
 * would put it in shell history and in the process list of every other user
 * on the machine.
 */

const HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const get = async (path, apiKey) => {
  const res = await fetch(`${HOST}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

const main = async () => {
  if (process.argv.length > 2) {
    fail(
      `Unknown option: ${process.argv[2]}\n` +
        'Usage: node check_promotion_setup.mjs  (no arguments — the switch is per product)'
    )
  }

  const apiKey = process.env.PORTALY_API_KEY
  if (!apiKey) {
    fail('Missing PORTALY_API_KEY. Set it in the environment; do not pass it as an argument.')
  }

  const mode = apiKey.startsWith('pcs_live_') ? 'live' : 'test'
  console.log(`Host:  ${HOST}`)
  console.log(`Mode:  ${mode}`)
  if (mode === 'test') {
    console.log('       Test-mode purchases never produce commission.')
  }

  const promotion = await get('/api/creator-subscription/promotion', apiKey)
  if (!promotion.ok) {
    fail(
      promotion.status === 404
        ? '\nBuyer promotion is not enabled on this account yet. Contact Portaly.'
        : `\nCould not read promotion settings (HTTP ${promotion.status}). Check the API key.`
    )
  }

  const d = promotion.body?.data || {}
  console.log(`\nPromotion: ${d.enabled ? 'ON' : 'off'}`)
  console.log(`  rate:        ${d.commissionRate ?? '(not set)'}%  — applies to every plan below`)
  console.log(`  allowed:     ${d.minCommissionRate}–${d.maxCommissionRate}% (default ${d.defaultCommissionRate}%)`)
  console.log(`  service fee: ${d.serviceFeeRate}%`)

  const plans = Array.isArray(d.plans) ? d.plans : []
  if (!plans.length) {
    console.log('\nNo plans on this product yet. Create an active, one-time, fixed-price plan first.')
    process.exit(1)
  }

  const included = plans.filter((p) => p.included)
  const excluded = plans.filter((p) => !p.included)

  console.log(`\nIncluded (${included.length}):`)
  if (!included.length) console.log('  (none — nothing is promotable right now)')
  included.forEach((p) => {
    console.log(`  ${p.name} (${p.planId})`)
    console.log(`    ${p.currency || 'TWD'} ${p.amount} → promoter earns about ${p.currency || 'TWD'} ${p.commissionAmount} per sale`)
    console.log(`    link opens: ${p.promotionUrl || '(not set)'}`)
  })

  if (excluded.length) {
    console.log(`\nExcluded (${excluded.length}):`)
    excluded.forEach((p) => {
      console.log(`  ${p.name} (${p.planId}) — ${p.excludedReason}`)
      if (p.excludedMessage) console.log(`    ${p.excludedMessage}`)
    })
  }

  if (!included.length) process.exit(1)
}

main().catch((error) => fail(error?.message || String(error)))
