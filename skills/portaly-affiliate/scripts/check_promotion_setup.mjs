#!/usr/bin/env node
/**
 * Read-only preflight for buyer promotion on a Portaly Payment plan.
 *
 *   PORTALY_API_KEY=pcs_test_xxx node check_promotion_setup.mjs --plan plan_123
 *
 * Prints the mode, whether the plan qualifies, and the current switch state.
 * Writes nothing. Run it before wiring attribution code, and again before
 * going live.
 *
 * The key is read from the environment only. Accepting it as an argument
 * would put it in shell history and in the process list of every other user
 * on the machine.
 */

const HOST = process.env.PORTALY_API_HOST || 'https://portaly.ai'

const parseArgs = (argv) => {
  const args = { plan: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--plan') {
      args.plan = argv[i + 1]
      i += 1
    } else if (arg.startsWith('--plan=')) {
      args.plan = arg.slice('--plan='.length)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  return args
}

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
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(`${error.message}\nUsage: node check_promotion_setup.mjs --plan <planId>`)
  }

  const apiKey = process.env.PORTALY_API_KEY
  if (!apiKey) {
    fail('Missing PORTALY_API_KEY. Set it in the environment; do not pass it as an argument.')
  }
  if (!args.plan) fail('Missing --plan <planId>.')

  const mode = apiKey.startsWith('pcs_live_') ? 'live' : 'test'
  console.log(`Host:  ${HOST}`)
  console.log(`Mode:  ${mode}`)
  if (mode === 'test') {
    console.log('       Test-mode purchases never produce commission.')
  }

  const plans = await get('/api/creator-subscription/plans', apiKey)
  if (!plans.ok) {
    fail(`Could not read plans (HTTP ${plans.status}). Check the API key.`)
  }

  const list = Array.isArray(plans.body?.data) ? plans.body.data : []
  const plan = list.find((p) => p.id === args.plan)
  if (!plan) fail(`Plan ${args.plan} not found on this account.`)

  console.log(`\nPlan:  ${plan.name} (${plan.id})`)
  console.log(`       ${plan.currency || 'TWD'} ${plan.amount}`)

  const blockers = []
  if (plan.status !== 'active') blockers.push('plan is not active')
  if (plan.billingPeriod !== 'one-time') {
    blockers.push(`billing period is "${plan.billingPeriod}" — promotion needs one-time`)
  }
  if ((plan.pricingType || 'fixed') !== 'fixed') {
    blockers.push('pricing is dynamic — promotion needs a fixed price')
  }
  if (!(plan.amount > 0)) blockers.push('plan charges nothing')

  if (blockers.length) {
    console.log('\nNot eligible for buyer promotion:')
    blockers.forEach((b) => console.log(`  - ${b}`))
    process.exit(1)
  }

  const promotion = await get(
    `/api/creator-subscription/plans/${encodeURIComponent(args.plan)}/promotion`,
    apiKey
  )
  if (!promotion.ok) {
    fail(
      promotion.status === 404
        ? '\nBuyer promotion is not enabled on this account yet. Contact Portaly.'
        : `\nCould not read promotion settings (HTTP ${promotion.status}).`
    )
  }

  const d = promotion.body?.data || {}
  console.log(`\nPromotion: ${d.enabled ? 'ON' : 'off'}`)
  console.log(`  rate:        ${d.commissionRate ?? '(not set)'}%`)
  console.log(`  allowed:     ${d.minCommissionRate}–${d.maxCommissionRate}% (default ${d.defaultCommissionRate}%)`)
  console.log(`  service fee: ${d.serviceFeeRate}%`)
  console.log(`  link opens:  ${d.promotionUrl || '(not set)'}`)

  if (d.enabled && typeof d.commissionRate === 'number') {
    const per = Math.round((plan.amount * d.commissionRate) / 100)
    console.log(`\n  A promoter earns about ${plan.currency || 'TWD'} ${per} per sale.`)
  }
}

main().catch((error) => fail(error?.message || String(error)))
