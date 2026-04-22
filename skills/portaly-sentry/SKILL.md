---
name: portaly-sentry
description: Run a security and reliability health check on a Portaly Vibe payment integration before deployment. Trigger when the user mentions Portaly health check, payment security audit, pre-deploy check, sentry scan, callback verification audit, integration safety check, or wants to verify their Portaly payment integration is safe to go live.
---

# Portaly Sentry — Payment Integration Health Check

Use this skill to run a comprehensive security and reliability health check on a Portaly Vibe payment integration. This skill is designed for non-engineers using vibe coding tools who want to ship with confidence. Keep output actionable: prefer pass/fail/warn checklists over long explanations.

This skill works alongside `portaly-payment`. It uses the same API contract as the canonical source of truth for what a correct integration looks like.

## Quick Start

- Confirm the project has a Portaly Vibe payment integration (look for `portaly`, `callbackSecret`, `x-portaly-signature`, or checkout session creation code).
- If no integration is found, tell the user and stop.
- Ask the user what they want:
  - **Full scan** — run all 8 check categories (default)
  - **Specific category** — run only SIG, SUB, CBK, ENV, SEC, WEB, DEP, or DATA
  - **Scheduled scan** — set up weekly automated health checks
- Static analysis checks (SIG, SUB, CBK, ENV, SEC, WEB, DATA) do not require credentials.
- For DEP checks, the project must have a `package.json`.
- For reporting results to Portaly, the user needs a `PORTALY_API_KEY`.

## Health Check Categories

### SIG — Signature Verification

Checks that callback signature verification matches Portaly's canonical implementation.

| ID | Check | Severity |
|---|---|---|
| SIG-001 | Stable JSON sort order uses `Object.entries().sort(([a],[b]) => a.localeCompare(b))` | CRITICAL |
| SIG-002 | HMAC algorithm is SHA-256 | CRITICAL |
| SIG-003 | Timestamp replay protection rejects callbacks older than 5 minutes | WARNING |
| SIG-004 | Signature comparison uses `crypto.timingSafeEqual` | CRITICAL |

### SUB — Subscription Lifecycle

Checks that subscription identifiers are stored and used correctly across the checkout-to-cancel flow.

| ID | Check | Severity |
|---|---|---|
| SUB-001 | `subscriptionId` (= `sessionId`) persisted after checkout completion | CRITICAL |
| SUB-002 | Duplicate callback handling via idempotency key | WARNING |
| SUB-003 | Cancel/resume APIs use the persisted `subscriptionId` | CRITICAL |

### CBK — Callback Endpoint

Checks callback endpoint configuration and behavior.

| ID | Check | Severity |
|---|---|---|
| CBK-001 | `callbackUrl` uses HTTPS | CRITICAL |
| CBK-002 | Signature verification failure is logged with diagnostics | WARNING |
| CBK-003 | Callback handler returns explicit 200 on success | INFO |

### ENV — Environment & Credentials

Checks credential management and environment configuration.

| ID | Check | Severity |
|---|---|---|
| ENV-001 | `.env` contains `PORTALY_API_KEY` and `PORTALY_CALLBACK_SECRET` | CRITICAL |
| ENV-002 | `.gitignore` covers `.env` | CRITICAL |
| ENV-003 | No API key or callback secret hardcoded in source files | CRITICAL |

### SEC — Security Best Practices

Checks for security hygiene in the integration.

| ID | Check | Severity |
|---|---|---|
| SEC-001 | No callback secret or API key in client-side / browser-accessible code | CRITICAL |
| SEC-002 | Raw callback body persisted for audit trail | INFO |
| SEC-003 | Secrets read from environment variables (rotation-ready) | INFO |
| SEC-004 | Callback endpoint has no overly permissive CORS (`Access-Control-Allow-Origin: *`) | WARNING |
| SEC-005 | Payment-related pages set `Content-Security-Policy` header | INFO |

### WEB — Web Security Fundamentals

Checks for common web security issues in payment flows.

| ID | Check | Severity |
|---|---|---|
| WEB-001 | `successRedirectUrl` / `cancelRedirectUrl` validated against domain allowlist | CRITICAL |
| WEB-002 | Error responses do not expose stack traces, internal paths, or DB schema | WARNING |
| WEB-003 | Callback endpoint validates `Content-Type: application/json` | WARNING |
| WEB-004 | Callback endpoint enforces request body size limit | WARNING |

### DEP — Dependency Security

Checks for known vulnerabilities in project dependencies.

| ID | Check | Severity |
|---|---|---|
| DEP-001 | `npm audit` / `pnpm audit` reports no critical or high CVEs | CRITICAL |
| DEP-002 | Lock file (`package-lock.json` / `pnpm-lock.yaml`) exists and is committed | WARNING |

### DATA — Data Handling Security

Checks for safe data handling practices.

| ID | Check | Severity |
|---|---|---|
| DATA-001 | Callback payload fields validated (type/length) before database writes | WARNING |
| DATA-002 | Logs do not contain full API keys, callback secrets, or raw customer PII | WARNING |

## Workflow

### Step 1 — Discover integration files

Search the project for files related to Portaly payment integration:

- Files importing `crypto` or containing HMAC operations
- Files containing `portaly`, `x-portaly-signature`, `x-portaly-timestamp`, `callbackSecret`, `PORTALY_CALLBACK_SECRET`
- Callback route handlers (Express routes, Next.js API routes, Cloud Functions HTTP triggers)
- Files containing `subscriptionId`, `sessionId` in the context of checkout completion
- Files containing `successRedirectUrl`, `cancelRedirectUrl`

Build a file inventory and map each file to the relevant check categories.

### Step 2 — Run SIG checks

For each signature-related file:

1. Check sort order pattern — compare against canonical implementation in `../portaly-payment/scripts/sign_callback.mjs`.
2. Check HMAC algorithm — verify `createHmac('sha256', ...)`.
3. Check timestamp validation — look for comparison of `x-portaly-timestamp` against current time with a 5-minute window.
4. Check comparison method — verify `crypto.timingSafeEqual` is used, not `===` or `==`.

Reference: `scripts/check_signature_sort.mjs` can automate this step.

### Step 3 — Run SUB checks

Trace the subscription ID lifecycle:

1. In the callback handler, after `status === 'completed'`, check what gets persisted. The stored value should be `sessionId` (which equals `subscriptionId` per Portaly's current contract).
2. Check for idempotency — does the handler check if this `sessionId` was already processed before fulfilling?
3. Trace the cancel/resume code path — verify it reads the same `subscriptionId` field that the callback wrote and passes it to `/subscriptions/{subscriptionId}/cancel` or `/resume`.

Reference: `scripts/check_subscription_lifecycle.mjs` can automate this step.

### Step 4 — Run CBK checks

1. Check if `callbackUrl` is constructed with `https://`.
2. Check the signature verification failure branch — does it log diagnostic info (timestamp, payload hash, expected vs actual)?
3. Check that the success branch returns an explicit `200` status.

### Step 5 — Run ENV checks

1. Read `.env` (or `.env.example`, `.env.local`) — check for `PORTALY_API_KEY` and `PORTALY_CALLBACK_SECRET`.
2. Read `.gitignore` — check that `.env` is listed.
3. Grep source files (excluding `node_modules`, `.env`) for literal `pcs_live_`, `pcs_test_`, or any string that looks like a callback secret.

### Step 6 — Run SEC checks

1. Check for API key or callback secret in files under directories typically served to the browser (`src/`, `public/`, `app/`, `pages/` for client components). Watch for `NEXT_PUBLIC_` prefixed env vars containing secrets.
2. Check if the raw callback body is saved to the database for auditing.
3. Verify secrets are read from `process.env` or equivalent, not hardcoded.
4. Check for CORS middleware on the callback endpoint — flag `Access-Control-Allow-Origin: *`.
5. Check for CSP headers on success/cancel redirect pages.

### Step 7 — Run WEB checks

1. Check if `successRedirectUrl` and `cancelRedirectUrl` are validated against an allowlist of trusted domains before being used in redirects.
2. Check error handling in the callback route — ensure `catch` blocks do not send full error stacks in the response body.
3. Check that the callback endpoint validates `Content-Type` header.
4. Check for body parser size limits (e.g., `express.json({ limit: '1mb' })` or equivalent).

### Step 8 — Run DEP checks

1. If `package.json` exists, run `npm audit --json` or `pnpm audit --json` and parse the output for critical/high severity vulnerabilities.
2. Check if `package-lock.json` or `pnpm-lock.yaml` exists and is not in `.gitignore`.

### Step 9 — Run DATA checks

1. Check if callback payload fields are validated before database writes (type checks, length limits, sanitization).
2. Grep log statements (`console.log`, `console.error`, `logger.`) for potential secret or PII exposure — flag any that log the full callback payload, API key, or callback secret.

### Step 10 — Generate report

Produce the health check report in this format:

```
## Portaly Sentry — Health Check Report
Project: {project_name} | Scan: {ISO timestamp} | Mode: {manual|scheduled}

| # | Check | Severity | Status |
|---|-------|----------|--------|
| SIG-001 | Stable JSON sort order | CRITICAL | [PASS] |
| SIG-002 | HMAC algorithm | CRITICAL | [PASS] |
| ... | ... | ... | ... |

Summary: X/26 passed | Y CRITICAL failures | Z warnings

### Fix: {ID} — {Check Name}
File: {file_path}:{line}
{description of the issue}
{code diff showing the fix}
```

### Step 11 — Report to Portaly (optional)

If the user wants to report results to Portaly:

1. Confirm user consent before sending any data.
2. POST to `https://portaly.ai/api/creator-subscription/health-check-reports` with `Authorization: Bearer {PORTALY_API_KEY}`.
3. See `references/health-check-contract.md` for the full request/response schema.
4. If the endpoint returns 404, it is not yet live — skip reporting and show results locally only.

### Step 12 — Schedule weekly scan (optional)

If the user wants recurring scans:

1. Guide them to set up a cron job, CI pipeline step, or Claude Code scheduled task that runs the health check weekly.
2. Each scheduled run should report results to Portaly so they appear on the Vibe dashboard.
3. Recommend running on Monday mornings to catch issues before the work week.

## Output Style

- Lead with the checklist table — this is the primary deliverable.
- Use `[PASS]`, `[FAIL]`, `[WARN]`, `[SKIP]` status indicators.
- Group checks by category (SIG, SUB, CBK, ENV, SEC, WEB, DEP, DATA).
- After the table, provide "Fix instructions" for each `[FAIL]` item:
  - Show the file path and line number.
  - Show a code diff with the fix.
  - Explain why it matters in one sentence.
- End with a summary line: "X/26 checks passed. Y critical issues found."
- Do not modify code unless the user explicitly asks. This is a read-only audit.

## Preferred Response Shape

1. Summary line (e.g., "3 critical issues, 1 warning, 22 passed")
2. Checklist table grouped by category
3. Fix instructions for each FAIL (with code diffs)
4. Optional: report-to-Portaly confirmation

## Guardrails

- **Read-only by default.** Never modify user code without explicit permission. This is an audit skill.
- **Mask secrets.** Never display full API keys or callback secrets in the checklist output. Use `***` masking.
- **Cross-reference portaly-payment.** Load `../portaly-payment/references/api-contract.md` for the authoritative callback verification spec and subscription lifecycle contract.
- **Do not assume the user's stack.** Check for Express, Next.js (App Router / Pages Router), Cloud Functions, Fastify, or vanilla Node.js before recommending fixes.
- **Match the user's code style.** When recommending fixes, generate code that matches the user's existing patterns, variable naming, and module system (ESM vs CommonJS).
- **If no integration is found, stop.** Tell the user the project does not appear to have a Portaly payment integration and ask if they want to set one up using `portaly-payment`.
- **Report API is optional.** Do not call the health-check report API without user consent. If the API returns 404, skip silently and show results locally.
- **DEP checks require package.json.** If no `package.json` exists, skip DEP checks and mark them as `[SKIP]`.
- **Windows encoding.** On Windows, run `chcp 65001` before any API calls containing non-ASCII text.

## Resources

- `references/health-check-contract.md`
  Use for the full checklist item definitions, severity levels, pass/fail criteria, and the report API contract.
- `references/common-pitfalls.md`
  Use for detailed descriptions of known bugs found in real integrations, with wrong vs correct implementations and detection methods.
- `scripts/check_signature_sort.mjs`
  Use for automated signature sort pattern verification across project files.
- `scripts/check_subscription_lifecycle.mjs`
  Use for automated subscription ID lifecycle tracing.
- Cross-reference: `../portaly-payment/scripts/sign_callback.mjs`
  Canonical Portaly callback signature implementation. Use as the reference for what correct looks like.
- Cross-reference: `../portaly-payment/references/api-contract.md`
  Authoritative API contract. Use for callback payload fields, subscription lifecycle endpoints, and the `subscriptionId === sessionId` contract.
