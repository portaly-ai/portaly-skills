#!/usr/bin/env node
/**
 * Portaly Sentry — Automated Health Check Reporter
 *
 * Runs all 26 checks and optionally POSTs results to portaly.ai.
 * Designed for CI/CD pipelines and scheduled scans.
 *
 * Usage:
 *   node report.mjs --dir /path/to/project
 *   node report.mjs --dir . --project-name my-app --fail-on critical
 *   # To also report to portaly.ai, export PORTALY_API_KEY in the environment first
 *   # (e.g. via your shell, .env loader, or CI secret store) — do NOT paste the key
 *   # value into the command line.
 *
 * Flags:
 *   --dir <path>           Project root to scan (default: cwd)
 *   --project-name <name>  Override project name (default: package.json name)
 *   --fail-on <level>      Exit 1 if: critical (default) | any | none
 *   --scan-type <type>     manual (default) | scheduled
 *   --dry-run              Skip POST to portaly.ai
 *   --verbose              Show detail for all checks, not just failures
 *
 * Environment:
 *   PORTALY_API_KEY        Required to POST results to portaly.ai dashboard
 */

import { spawnSync } from 'child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

import { computeHealthScore, healthBand, healthBandLabel } from './computeHealthScore.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] ?? fallback : fallback
}
const flag = (name) => args.includes(name)

const projectDir = resolve(arg('--dir', process.cwd()))
const projectNameOverride = arg('--project-name')
const failOn = arg('--fail-on', 'critical') // 'critical' | 'any' | 'none'
const scanType = arg('--scan-type', 'manual')
const dryRun = flag('--dry-run')
const verbose = flag('--verbose')

const API_KEY = process.env.PORTALY_API_KEY
const REPORT_URL = 'https://portaly.ai/api/creator-subscription/health-check-reports'

// ── Constants ─────────────────────────────────────────────────────────────────

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']
// `lib/` is intentionally NOT skipped — many TS projects keep their source there.
// Build output (dist/build/.next/out/.vercel) is still skipped.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out',
  'coverage', '.firebase', '.vercel', '__pycache__',
])
const PORTALY_MARKERS = [
  'x-portaly-signature', 'x-portaly-timestamp',
  'callbackSecret', 'PORTALY_CALLBACK_SECRET', 'PORTALY_API_KEY',
  'portalyCallback', 'portaly/callback', 'portaly-callback',
  'verifyPortalyCallback', 'signPortalyCallback',
]

// ── Terminal colours ──────────────────────────────────────────────────────────

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[90m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'

const c = (str, col) => `${col}${str}${RESET}`

// ── File utilities ────────────────────────────────────────────────────────────

function listFiles(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) return []
  const results = []
  const walk = (d) => {
    let entries
    try { entries = readdirSync(d) } catch { return }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
      const full = join(d, entry)
      let stat
      try { stat = statSync(full) } catch { continue }
      if (stat.isDirectory()) { walk(full); continue }
      if (EXTENSIONS.some(e => full.endsWith(e))) results.push(full)
    }
  }
  walk(root)
  return results
}

function readFile(path) {
  try { return readFileSync(path, 'utf8') } catch { return '' }
}

function grep(files, pattern) {
  const results = []
  for (const f of files) {
    const lines = readFile(f).split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        results.push({ file: f, line: i + 1, text: lines[i].trim() })
      }
    }
  }
  return results
}

function rel(f) {
  return relative(projectDir, f)
}

// ── Project name ──────────────────────────────────────────────────────────────

function resolveProjectName() {
  if (projectNameOverride) return projectNameOverride
  const pkgPath = join(projectDir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFile(pkgPath))
      if (pkg.name && !['react-example', 'my-app', 'app', 'project'].includes(pkg.name)) {
        return pkg.name
      }
    } catch { /* ignore */ }
  }
  return projectDir.split(/[/\\]/).filter(Boolean).pop() || 'unknown'
}

// ── Find Portaly files ────────────────────────────────────────────────────────

function findPortalyFiles(allFiles) {
  return allFiles.filter(f => {
    const content = readFile(f)
    return PORTALY_MARKERS.some(m => content.includes(m))
  })
}

// ── Sub-script runner ─────────────────────────────────────────────────────────

function runSubScript(scriptName) {
  const scriptPath = join(__dirname, scriptName)
  if (!existsSync(scriptPath)) return null
  const result = spawnSync(process.execPath, [scriptPath, '--dir', projectDir], {
    encoding: 'utf8', timeout: 30_000,
  })
  try { return JSON.parse(result.stdout) } catch { return null }
}

// ── Check builder ─────────────────────────────────────────────────────────────

const chk = (id, category, name, severity, status, detail = null, file = null, line = null) =>
  ({ id, category, name, severity, status, detail, file, line })

// ── SIG — Signature Verification ─────────────────────────────────────────────

function runSigChecks(portaSet) {
  const results = []

  // SIG-001: Stable sort order (via sub-script)
  const sigData = runSubScript('check_signature_sort.mjs')
  if (!sigData) {
    results.push(chk('SIG-001', 'signature', 'Stable JSON sort order', 'critical', 'skip',
      'Could not run signature sort script'))
  } else if (sigData.failed > 0) {
    const first = sigData.details?.find(d => d.status === 'fail')
    results.push(chk('SIG-001', 'signature', 'Stable JSON sort order', 'critical', 'fail',
      first?.message ?? 'Wrong key-sort pattern detected',
      first?.file ? rel(first.file) : null, first?.line ?? null))
  } else if (sigData.warned > 0) {
    results.push(chk('SIG-001', 'signature', 'Stable JSON sort order', 'critical', 'warn',
      'Portaly files found but sort pattern could not be confirmed'))
  } else if ((sigData.checked ?? 0) === 0) {
    results.push(chk('SIG-001', 'signature', 'Stable JSON sort order', 'critical', 'skip',
      'No signature-related files found'))
  } else {
    results.push(chk('SIG-001', 'signature', 'Stable JSON sort order', 'critical', 'pass'))
  }

  // SIG-002: HMAC sha256
  const hmacHits = grep(portaSet, /createHmac/i)
  if (hmacHits.length === 0) {
    results.push(chk('SIG-002', 'signature', 'HMAC algorithm', 'critical', 'skip',
      'No HMAC usage found'))
  } else {
    const sha256 = hmacHits.filter(m => m.text.includes('sha256'))
    results.push(sha256.length > 0
      ? chk('SIG-002', 'signature', 'HMAC algorithm', 'critical', 'pass')
      : chk('SIG-002', 'signature', 'HMAC algorithm', 'critical', 'fail',
        'createHmac found but not using sha256', rel(hmacHits[0].file), hmacHits[0].line))
  }

  // SIG-003: Timestamp replay window
  const tsHits = grep(portaSet, /x-portaly-timestamp/i)
  if (tsHits.length === 0) {
    results.push(chk('SIG-003', 'signature', 'Timestamp replay protection', 'warning', 'skip',
      'No x-portaly-timestamp handling found'))
  } else {
    const windowHits = grep(portaSet, /5\s*\*\s*60|300000|5\s*min/i)
    results.push(windowHits.length > 0
      ? chk('SIG-003', 'signature', 'Timestamp replay protection', 'warning', 'pass')
      : chk('SIG-003', 'signature', 'Timestamp replay protection', 'warning', 'warn',
        'Timestamp is read but no 5-minute replay window detected',
        rel(tsHits[0].file), tsHits[0].line))
  }

  // SIG-004: timingSafeEqual
  const tseHits = grep(portaSet, /timingSafeEqual/i)
  if (tseHits.length > 0) {
    results.push(chk('SIG-004', 'signature', 'Timing-safe comparison', 'critical', 'pass'))
  } else {
    const eqHits = grep(portaSet, /signature\s*===|===\s*signature/i)
    results.push(eqHits.length > 0
      ? chk('SIG-004', 'signature', 'Timing-safe comparison', 'critical', 'fail',
        'Signature compared with === instead of timingSafeEqual',
        rel(eqHits[0].file), eqHits[0].line)
      : chk('SIG-004', 'signature', 'Timing-safe comparison', 'critical', 'warn',
        'No signature comparison found — verify manually'))
  }

  return results
}

// ── SUB — Subscription Lifecycle ─────────────────────────────────────────────

function runSubChecks() {
  const subData = runSubScript('check_subscription_lifecycle.mjs')
  const mapStatus = (s) => (s === 'info' ? 'pass' : s ?? 'skip')

  if (!subData?.checks) {
    return ['SUB-001', 'SUB-002', 'SUB-003'].map(id =>
      chk(id, 'subscription', id, id === 'SUB-002' ? 'warning' : 'critical', 'skip',
        'Could not run subscription lifecycle script'))
  }

  const { callbackPersistence, idempotency, cancelResumeUsage } = subData.checks
  return [
    chk('SUB-001', 'subscription', 'Subscription ID persistence', 'critical',
      mapStatus(callbackPersistence?.status), callbackPersistence?.detail ?? null,
      callbackPersistence?.file ? rel(callbackPersistence.file) : null,
      callbackPersistence?.line ?? null),
    chk('SUB-002', 'subscription', 'Idempotency key', 'warning',
      mapStatus(idempotency?.status), idempotency?.detail ?? null,
      idempotency?.file ? rel(idempotency.file) : null, idempotency?.line ?? null),
    chk('SUB-003', 'subscription', 'Subscription ID in cancel/resume', 'critical',
      mapStatus(cancelResumeUsage?.status), cancelResumeUsage?.detail ?? null,
      cancelResumeUsage?.file ? rel(cancelResumeUsage.file) : null,
      cancelResumeUsage?.line ?? null),
  ]
}

// ── CBK — Callback Endpoint ───────────────────────────────────────────────────

function runCbkChecks(portaSet) {
  const httpBad = grep(portaSet, /callbackUrl\s*[:=].*['"`]http:\/\/(?!s)/i)
  const cbkFound = grep(portaSet, /callbackUrl|callback_url/i)
  const errLog = grep(portaSet, /console\.(error|warn).*(?:signature|invalid)|(?:signature|invalid).*console\.(error|warn)/i)
  const ok200 = grep(portaSet, /status\(200\)|sendStatus\(200\)|\.json\(\{\s*(?:ok|success)/i)

  return [
    httpBad.length > 0
      ? chk('CBK-001', 'callback', 'HTTPS callback URL', 'critical', 'fail',
        'callbackUrl uses http:// — must be https://', rel(httpBad[0].file), httpBad[0].line)
      : cbkFound.length === 0
        ? chk('CBK-001', 'callback', 'HTTPS callback URL', 'critical', 'skip', 'No callbackUrl found')
        : chk('CBK-001', 'callback', 'HTTPS callback URL', 'critical', 'pass'),

    chk('CBK-002', 'callback', 'Callback error handling', 'warning',
      errLog.length > 0 ? 'pass' : 'warn',
      errLog.length > 0 ? null : 'No logging in signature failure path — add console.error with diagnostics'),

    chk('CBK-003', 'callback', 'Callback response code', 'info', 'skip',
      'Framework-handled — verify manually if using a bare Node.js server'),
  ]
}

// ── ENV — Environment & Credentials ──────────────────────────────────────────

function runEnvChecks(allFiles) {
  // ENV-001: required env vars
  const envFiles = ['.env', '.env.local', '.env.example', '.env.development']
    .map(f => join(projectDir, f)).filter(existsSync)
  let envResult
  if (envFiles.length === 0) {
    envResult = chk('ENV-001', 'environment', 'Required env vars', 'critical', 'fail', 'No .env file found')
  } else {
    const combined = envFiles.map(readFile).join('\n')
    const missing = [
      !combined.includes('PORTALY_API_KEY') && 'PORTALY_API_KEY',
      !combined.includes('PORTALY_CALLBACK_SECRET') && 'PORTALY_CALLBACK_SECRET',
    ].filter(Boolean)
    envResult = missing.length === 0
      ? chk('ENV-001', 'environment', 'Required env vars', 'critical', 'pass')
      : chk('ENV-001', 'environment', 'Required env vars', 'critical', 'fail', `Missing: ${missing.join(', ')}`)
  }

  // ENV-002: .gitignore
  const gi = join(projectDir, '.gitignore')
  const giResult = !existsSync(gi)
    ? chk('ENV-002', 'environment', 'Gitignore covers .env', 'critical', 'fail', '.gitignore not found')
    : /^\.env/m.test(readFile(gi))
      ? chk('ENV-002', 'environment', 'Gitignore covers .env', 'critical', 'pass')
      : chk('ENV-002', 'environment', 'Gitignore covers .env', 'critical', 'fail',
        '.env is not covered in .gitignore — risk of credential leak in version control')

  // ENV-003: no hardcoded secrets in source
  const srcFiles = allFiles.filter(f => !f.includes('.env'))
  const hardcoded = grep(srcFiles, /pcs_live_[A-Za-z0-9]{6,}|pcs_test_[A-Za-z0-9]{6,}/)
  const hcResult = hardcoded.length > 0
    ? chk('ENV-003', 'environment', 'No hardcoded secrets', 'critical', 'fail',
      'Hardcoded API key found in source file', rel(hardcoded[0].file), hardcoded[0].line)
    : chk('ENV-003', 'environment', 'No hardcoded secrets', 'critical', 'pass')

  return [envResult, giResult, hcResult]
}

// ── SEC — Security Best Practices ────────────────────────────────────────────

function runSecChecks(portaSet, allFiles) {
  // SEC-001: no client-side exposure
  const clientFiles = allFiles.filter(f => {
    const r = rel(f)
    return r.startsWith('public/') || r.startsWith('src/') || r.includes('components/')
  })
  const pubSecret = grep(clientFiles, /NEXT_PUBLIC_PORTALY_CALLBACK_SECRET|NEXT_PUBLIC_.*SECRET/i)

  // SEC-002: audit trail (sessionId + status logged or persisted)
  const auditHits = grep(portaSet, /sessionId|session_id/i)
  const logOrDb = grep(portaSet, /console\.\w+|\.set\(|\.insert\(|\.create\(|\.add\(/i)

  // SEC-004: wildcard CORS on callback
  const corsWild = grep(portaSet, /Access-Control-Allow-Origin['":\s]*\*/i)

  return [
    pubSecret.length > 0
      ? chk('SEC-001', 'security', 'No client-side exposure', 'critical', 'fail',
        'Secret exposed via NEXT_PUBLIC_ prefix', rel(pubSecret[0].file), pubSecret[0].line)
      : chk('SEC-001', 'security', 'No client-side exposure', 'critical', 'pass'),

    chk('SEC-002', 'security', 'Callback audit trail', 'info',
      auditHits.length > 0 && logOrDb.length > 0 ? 'pass' : 'warn',
      auditHits.length > 0 && logOrDb.length > 0 ? null :
        'No evidence of sessionId being logged or persisted — add audit trail for dispute resolution'),

    chk('SEC-003', 'security', 'Secret rotation readiness', 'info', 'skip',
      'Verify manually: secrets should be read from process.env, not hardcoded'),

    corsWild.length > 0
      ? chk('SEC-004', 'security', 'CORS configuration', 'warning', 'fail',
        'Wildcard CORS found on callback endpoint', rel(corsWild[0].file), corsWild[0].line)
      : chk('SEC-004', 'security', 'CORS configuration', 'warning', 'pass'),

    chk('SEC-005', 'security', 'CSP headers', 'info', 'skip',
      'Verify manually if using custom server; Next.js handles this via next.config headers()'),
  ]
}

// ── WEB — Web Security Fundamentals ──────────────────────────────────────────

function runWebChecks(portaSet) {
  const redirectHits = grep(portaSet, /successRedirectUrl|cancelRedirectUrl/i)
  const allowlistHits = grep(portaSet, /allowlist|allowedDomain|trustedDomain|whitelist/i)
  const errStackHits = grep(portaSet, /err\.stack|error\.stack|err\.message/i)

  return [
    // WEB-001: only flag if project actually handles redirect URLs itself
    redirectHits.length === 0
      ? chk('WEB-001', 'web', 'Open redirect protection', 'warning', 'skip',
        'No custom redirect URL handling found — Portaly hosted checkout handles redirects')
      : allowlistHits.length > 0
        ? chk('WEB-001', 'web', 'Open redirect protection', 'warning', 'pass')
        : chk('WEB-001', 'web', 'Open redirect protection', 'warning', 'warn',
          'successRedirectUrl/cancelRedirectUrl used but no domain allowlist detected',
          rel(redirectHits[0].file), redirectHits[0].line),

    errStackHits.length > 0
      ? chk('WEB-002', 'web', 'Error info leakage', 'warning', 'warn',
        'err.stack or err.message may be sent in response — leaks internal paths',
        rel(errStackHits[0].file), errStackHits[0].line)
      : chk('WEB-002', 'web', 'Error info leakage', 'warning', 'pass'),

    chk('WEB-003', 'web', 'Content-Type validation', 'info', 'skip',
      'Framework-handled (Next.js/Express with bodyParser) — verify manually for bare servers'),

    chk('WEB-004', 'web', 'Body size limit', 'info', 'skip',
      'Framework default applies (Next.js 4.5 MB) — verify manually for bare servers'),
  ]
}

// ── DEP — Dependency Security ─────────────────────────────────────────────────

function runDepChecks() {
  const hasPkg = existsSync(join(projectDir, 'package.json'))
  let depResult

  if (!hasPkg) {
    depResult = chk('DEP-001', 'dependency', 'Known vulnerability scan', 'critical', 'skip',
      'No package.json found')
  } else {
    // --omit=dev: only production deps matter for runtime security
    const audit = spawnSync('npm', ['audit', '--json', '--omit=dev'], {
      cwd: projectDir, encoding: 'utf8', timeout: 60_000,
    })
    try {
      const json = JSON.parse(audit.stdout)
      const vulns = json.vulnerabilities ?? json.advisories ?? {}
      // --omit=dev above already restricts npm's output to production deps,
      // so we can count severities directly without a second prod-vs-dev filter.
      const vulnList = Object.values(vulns)
      const critical = vulnList.filter(v => v.severity === 'critical').length
      const high = vulnList.filter(v => v.severity === 'high').length
      if (critical > 0) {
        depResult = chk('DEP-001', 'dependency', 'Known vulnerability scan', 'critical', 'fail',
          `${critical} critical CVE(s) in production dependencies — run: npm audit fix`)
      } else if (high > 0) {
        depResult = chk('DEP-001', 'dependency', 'Known vulnerability scan', 'critical', 'warn',
          `${high} high-severity CVE(s) in production dependencies — review and update`)
      } else {
        depResult = chk('DEP-001', 'dependency', 'Known vulnerability scan', 'critical', 'pass')
      }
    } catch {
      depResult = chk('DEP-001', 'dependency', 'Known vulnerability scan', 'critical', 'warn',
        'Could not parse npm audit output — run manually: npm audit --omit=dev')
    }
  }

  const hasLock =
    existsSync(join(projectDir, 'package-lock.json')) ||
    existsSync(join(projectDir, 'pnpm-lock.yaml')) ||
    existsSync(join(projectDir, 'yarn.lock'))

  return [
    depResult,
    chk('DEP-002', 'dependency', 'Lock file present', 'warning',
      hasLock ? 'pass' : 'fail',
      hasLock ? null : 'No lock file found — install may produce inconsistent versions'),
  ]
}

// ── DATA — Data Handling ──────────────────────────────────────────────────────

function runDataChecks(portaSet) {
  const validationHits = grep(portaSet, /typeof\s+\w+|\.length|parseInt|Number\(|z\.|zod|joi\.|yup\./i)
  const logFullBody = grep(portaSet, /console\.\w+\s*\(\s*(?:req\.body|payload|body)\s*[,)]/i)

  return [
    chk('DATA-001', 'data', 'Input validation', 'info', 'skip',
      'Verify manually: sessionId should be string, status should be enum, amount should be positive number'),

    logFullBody.length > 0
      ? chk('DATA-002', 'data', 'Sensitive data logging', 'warning', 'warn',
        'Full request body logged — may expose PII or secrets',
        rel(logFullBody[0].file), logFullBody[0].line)
      : chk('DATA-002', 'data', 'Sensitive data logging', 'warning', 'pass'),
  ]
}

// ── Display ───────────────────────────────────────────────────────────────────

const ICON = { pass: '✓', fail: '✗', warn: '!', skip: '–' }
const STATUS_COL = { pass: GREEN, fail: RED, warn: YELLOW, skip: DIM }
const SEV_COL = { critical: RED, warning: YELLOW, info: CYAN }

const CAT_LABELS = {
  signature:    'SIG  — Signature Verification',
  subscription: 'SUB  — Subscription Lifecycle',
  callback:     'CBK  — Callback Endpoint',
  environment:  'ENV  — Environment & Credentials',
  security:     'SEC  — Security Best Practices',
  web:          'WEB  — Web Security Fundamentals',
  dependency:   'DEP  — Dependency Security',
  data:         'DATA — Data Handling Security',
}

function printResults(checks) {
  const grouped = {}
  for (const item of checks) (grouped[item.category] ??= []).push(item)

  for (const [cat, label] of Object.entries(CAT_LABELS)) {
    const items = grouped[cat] ?? []
    if (items.length === 0) continue
    console.log(`\n${c(label, BOLD)}`)
    for (const item of items) {
      const sc = STATUS_COL[item.status] ?? ''
      const sevc = SEV_COL[item.severity] ?? ''
      const icon = c(`[${ICON[item.status] ?? '?'}]`, sc)
      const sev = c(item.severity.toUpperCase().padEnd(8), sevc)
      console.log(`  ${icon} ${item.id.padEnd(8)} ${sev} ${item.name}`)
      if (item.detail && (verbose || item.status !== 'pass')) {
        console.log(`           ${c(item.detail, DIM)}`)
        if (item.file) {
          const loc = item.line != null ? `${item.file}:${item.line}` : item.file
          console.log(`           ${c(loc, DIM)}`)
        }
      }
    }
  }
}

// ── POST report ───────────────────────────────────────────────────────────────

async function postReport(payload) {
  const res = await fetch(REPORT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c('Portaly Sentry — Health Check', BOLD)}`)
  console.log(`${c('Project:', DIM)} ${projectDir}`)
  if (dryRun) console.log(c('(dry-run — results will not be sent to portaly.ai)', YELLOW))

  const allFiles = listFiles(projectDir)
  const portaSet = findPortalyFiles(allFiles)

  if (portaSet.length === 0) {
    console.log('\n' + c('No Portaly payment integration found.', YELLOW))
    console.log('Use portaly-payment skill to set up the integration first.')
    process.exit(0)
  }

  console.log(`${c('Found:', DIM)} ${portaSet.length} Portaly file(s)`)
  if (verbose) portaSet.forEach(f => console.log(`  ${c(rel(f), DIM)}`))

  const name = resolveProjectName()
  const scanTimestamp = new Date().toISOString()

  const allChecks = [
    ...runSigChecks(portaSet),
    ...runSubChecks(),
    ...runCbkChecks(portaSet),
    ...runEnvChecks(allFiles),
    ...runSecChecks(portaSet, allFiles),
    ...runWebChecks(portaSet),
    ...runDepChecks(),
    ...runDataChecks(portaSet),
  ]

  printResults(allChecks)

  const passed = allChecks.filter(c => c.status === 'pass').length
  const failed = allChecks.filter(c => c.status === 'fail').length
  const warned = allChecks.filter(c => c.status === 'warn').length
  const skipped = allChecks.filter(c => c.status === 'skip').length
  const total = allChecks.length
  const criticalFails = allChecks.filter(c => c.status === 'fail' && c.severity === 'critical')

  const score = computeHealthScore(allChecks)
  const band = healthBand(score)
  const scoreColor = band === 'healthy' ? GREEN : band === 'needs-attention' ? YELLOW : RED

  console.log(`\n${'─'.repeat(60)}`)
  console.log(
    `${c('📊 Payment integration health check', BOLD)} — ${name}\n` +
    `   ${c('Health score:', BOLD)} ${c(`${score}/100`, scoreColor)}  ${c(`(${healthBandLabel(band)})`, DIM)}\n`
  )
  console.log(
    `${c('🟢 Passing', GREEN)}   ${String(passed).padStart(2)} checks    looking good`
  )
  console.log(
    `${c('🟡 Review', YELLOW)}    ${String(warned).padStart(2)} warnings  take a look this week`
  )
  console.log(
    `${c('🔴 Critical', RED)}   ${String(failed).padStart(2)} blockers  must fix before launch`
  )
  if (skipped > 0) {
    console.log(c(`   (${skipped} skipped)`, DIM))
  }

  if (criticalFails.length > 0) {
    console.log(c(`\n⚠  ${criticalFails.length} critical issue(s) must be fixed before deploy.`, RED))
    criticalFails.forEach(item => {
      const loc = item.file ? ` (${item.file}${item.line != null ? ':' + item.line : ''})` : ''
      console.log(c(`   → ${item.id}: ${item.name}${loc}`, RED))
    })
  } else if (failed === 0 && warned === 0) {
    console.log(c('\n✓  All checks passed. Safe to deploy.', GREEN))
  }

  // POST to portaly.ai
  if (!dryRun && API_KEY) {
    process.stdout.write('\nSending report to portaly.ai... ')
    try {
      const response = await postReport({
        scanType, scanTimestamp, projectName: name,
        results: allChecks,
        summary: { total, passed, failed, warned, skipped },
      })
      console.log(c('done ✓', GREEN))
      if (response.data?.dashboardUrl) {
        console.log(`Dashboard: ${c(response.data.dashboardUrl, CYAN)}`)
      }
    } catch (err) {
      console.log(c(`failed: ${err.message}`, YELLOW))
      console.log('Local results above are still valid.')
    }
  } else if (!API_KEY && !dryRun) {
    console.log(`\n${c('Tip:', DIM)} Set PORTALY_API_KEY to send results to portaly.ai/dashboard/sentry-scans`)
  }

  // CI exit code
  if (failOn === 'any' && failed > 0) process.exit(1)
  if (failOn === 'critical' && criticalFails.length > 0) process.exit(1)
}

main().catch(err => {
  console.error(c(`Fatal: ${err.message}`, RED))
  process.exit(1)
})
