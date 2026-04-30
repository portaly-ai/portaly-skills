# Health Check Contract

## Use This Reference For

- checklist item definitions and pass/fail criteria
- severity level definitions
- report API contract for sending results to Portaly
- expected output format

## Severity Levels

| Level | Meaning | Action |
|---|---|---|
| CRITICAL | Will cause payment failures, data loss, or security vulnerabilities in production. | Must fix before deploy. |
| WARNING | May cause issues under edge cases or degrade operational visibility. | Should fix before deploy. |
| INFO | Best practice recommendation. | Fix when convenient. |

## Health Score Formula

The 0–100 health score is computed from per-check results. **This file is the canonical source** — both the skill (`scripts/computeHealthScore.mjs`) and the Vibe dashboard (`portaly-vibe/services/sentryScan/computeHealthScore.ts`) implement this exact formula. If you change weights here, update both implementations.

```
score = 100
for each result r:
  if r.status == 'fail':
    if r.severity == 'critical': score -= 15
    if r.severity == 'warning':  score -=  5
    if r.severity == 'info':     score -=  1
  elif r.status == 'warn':       score -=  2
  // 'pass' and 'skip' do not affect the score
score = clamp(score, 0, 100)
```

Score bands (used for UI tone — not for launch gating):

| Score | Band | Visual |
|---|---|---|
| 90–100 | Healthy | Green |
| 70–89 | Needs attention | Amber |
| 0–69 | At risk | Rose |

Notes:
- Skipped checks do not affect the score.
- Launch-gating decisions still use the standard threshold (Pre-launch / Routine / Gold), not the score band — a single CRITICAL fail (−15) drops to "Needs attention" but is still a launch blocker.

## Checklist Items

### SIG — Signature Verification

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| SIG-001 | Stable JSON sort order | CRITICAL | Uses `Object.entries(value).sort(([a], [b]) => a.localeCompare(b))` for key sorting in the stable JSON serializer. | Uses `Object.keys().sort()` without `localeCompare`, or no sort at all. |
| SIG-002 | HMAC algorithm | CRITICAL | Uses `crypto.createHmac('sha256', secret)`. | Uses a different algorithm (md5, sha1, etc.) or no HMAC. |
| SIG-003 | Timestamp replay protection | WARNING | Parses `x-portaly-timestamp` (ISO datetime string) and rejects callbacks where the timestamp is older than 5 minutes from current time. | No timestamp validation, or uses a different time window. |
| SIG-004 | Timing-safe comparison | CRITICAL | Uses `crypto.timingSafeEqual(expectedBuffer, signatureBuffer)` for signature comparison. | Uses `===`, `==`, or `Buffer.compare` for signature comparison. |

### SUB — Subscription Lifecycle

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| SUB-001 | Subscription ID persistence | CRITICAL | After checkout completion callback (`status === 'completed'`), persists `sessionId` as `subscriptionId` (or equivalent) in the database. Per Portaly contract: `subscriptionId === checkoutSessionId === sessionId`. | Stores a local-only identifier, stores nothing, or stores a different field as the subscription identifier. |
| SUB-002 | Idempotency key | WARNING | Checks if `sessionId` was already processed before fulfilling (check-before-write, conditional update, or upsert with merge). | No duplicate detection — processing the same callback twice could cause double fulfillment. |
| SUB-003 | Subscription ID in cancel/resume | CRITICAL | Cancel and resume code paths read the persisted `subscriptionId` from the same store the callback wrote to, and pass it to `POST /api/creator-subscription/subscriptions/{subscriptionId}/cancel` or `/resume`. | Uses a different identifier, hardcodes an ID, or does not implement cancel/resume for recurring plans. |

### CBK — Callback Endpoint

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| CBK-001 | HTTPS callback URL | CRITICAL | `callbackUrl` starts with `https://`. | Uses `http://` or no scheme specified. |
| CBK-002 | Callback error handling | WARNING | Signature verification failure branch logs diagnostic info (timestamp, expected vs actual signature prefix, payload hash) and returns non-200 status (e.g., 401). | Silent failure, generic error message, or returns 200 on verification failure. |
| CBK-003 | Callback response code | INFO | Success branch explicitly returns HTTP 200. | No explicit status code set (relies on framework defaults). |

### ENV — Environment & Credentials

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| ENV-001 | Required env vars | CRITICAL | `.env` (or `.env.example`, `.env.local`) contains both `PORTALY_API_KEY` and `PORTALY_CALLBACK_SECRET`. | One or both are missing. |
| ENV-002 | Gitignore covers .env | CRITICAL | `.gitignore` includes `.env` (or `.env*` pattern). | `.env` is not in `.gitignore`, risking credential leak via version control. |
| ENV-003 | No hardcoded secrets | CRITICAL | No source file (excluding `node_modules`, `.env`) contains literal strings matching `pcs_live_`, `pcs_test_`, or callback secret patterns. | Found literal API key or secret string in source files. |

### SEC — Security Best Practices

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| SEC-001 | No client-side exposure | CRITICAL | API key and callback secret do not appear in files served to the browser (no `NEXT_PUBLIC_PORTALY_CALLBACK_SECRET`, not in `public/` or client-side `src/` bundles). | Found secret in client-accessible code. |
| SEC-002 | Callback audit trail | INFO | Any form of audit trail exists for processed callbacks: at minimum `sessionId` and `status` are logged or persisted. Does not require storing the full raw body. | No logging or persistence of callback events — impossible to investigate disputes or replay issues. Note: storing the full raw body is discouraged if it contains PII; logging key fields is sufficient. |
| SEC-003 | Secret rotation readiness | INFO | All secrets are read from `process.env` (or framework equivalent), not hardcoded. Application can rotate secrets by updating env vars without code changes. | Secrets are hardcoded or read from config files committed to version control. |
| SEC-004 | CORS configuration | WARNING | Callback endpoint does not set `Access-Control-Allow-Origin: *`. Either no CORS headers or restricted to specific origins. | `Access-Control-Allow-Origin: *` is set on the callback endpoint, allowing any origin to interact with it. |
| SEC-005 | CSP headers | INFO | Payment-related pages (success, cancel, checkout redirect) include a `Content-Security-Policy` header. | No CSP header on payment-related pages. |

### WEB — Web Security Fundamentals

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| WEB-001 | Open redirect protection | WARNING | If the project accepts `successRedirectUrl` or `cancelRedirectUrl` as user-supplied input, those values are validated against a domain allowlist before use. If the project delegates redirect handling entirely to Portaly (hosted checkout), this check does not apply. | User-supplied redirect URLs are passed through without domain validation, enabling phishing via crafted links. |
| WEB-002 | Error info leakage | WARNING | Error responses in callback handler return generic messages (e.g., `{ error: "invalid signature" }`). No stack traces, file paths, or DB schema in responses. | `catch` blocks send `err.stack`, `err.message` with internal details, or framework default error pages with debug info. |
| WEB-003 | Content-Type validation | INFO | Callback endpoint checks that `Content-Type` header is `application/json` before processing. Frameworks like Next.js App Router handle this automatically — manual verification only needed for Express or custom servers. | No Content-Type validation on a custom/bare server endpoint. |
| WEB-004 | Body size limit | INFO | Body parser has an explicit size limit, or the framework's default limit is in effect (e.g., Next.js default 4.5 MB). Explicit configuration only needed for Express or custom servers. | No size limit and using a bare server with no framework defaults. |

### DEP — Dependency Security

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| DEP-001 | Known vulnerability scan | CRITICAL | `npm audit` or `pnpm audit` reports zero **critical** severity CVEs in **production** dependencies (`npm audit --omit=dev`). High-severity CVEs in production deps are WARNING. Dev-dependency vulnerabilities do not affect this check. | One or more critical CVEs found in production dependencies. |
| DEP-002 | Lock file present | WARNING | `package-lock.json` or `pnpm-lock.yaml` exists in the project root and is not in `.gitignore`. | No lock file found, or lock file is gitignored — supply chain risk from inconsistent installs. |

### DATA — Data Handling Security

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| DATA-001 | Input validation | INFO | Callback payload fields are validated (type, length, format) before being written to the database. At minimum: `sessionId` is a string, `status` is one of the expected values, `amount` is a positive number. Best verified by manual code review rather than static analysis. | Callback payload is written directly to the database without any validation. |
| DATA-002 | Sensitive data logging | WARNING | Log statements in callback handler and payment flows do not output full API keys, callback secrets, or complete customer PII (full email, payment references). Logs use `sessionId` and `status` only, or mask sensitive fields. | Found `console.log(req.body)`, `console.log(payload)`, or similar that dumps the full callback payload including potential PII to logs. |

## Reporting transports

There are two ways to push scan results to the user's Vibe dashboard. Both write to the same backing storage and end up as one row in the same scan history.

| Transport | When to use | Auth | Caller |
|---|---|---|---|
| MCP tool `vibe_report_health_check` | The agent is connected to Vibe MCP — preferred for skill runs | Agent's existing MCP bearer token | Claude Code / Cursor / Codex agent |
| REST `POST /api/creator-subscription/health-check-reports` | CI/CD scripts, scheduled scans, or when MCP is unavailable | `Bearer {PORTALY_API_KEY}` | `scripts/report.mjs` and any HTTP client |

Pick one per scan — never call both.

## MCP reporting

When the agent is connected to Vibe MCP, prefer this path. No `PORTALY_API_KEY` is needed; the agent's existing MCP connection is the auth.

Tool: `vibe_report_health_check`

Input (Zod-validated, identical shape to the REST body):

```ts
{
  scanType: 'manual' | 'scheduled',
  scanTimestamp: string,            // ISO-8601
  projectName: string,              // 1-255 chars
  results: CheckResult[],           // 1-100 entries
  summary: {
    total: number,
    passed: number,
    failed: number,
    warned: number,
    skipped: number,
  },
}
```

Result:

```ts
{
  reportId: string,                 // use as {scan_id} in the dashboard URL
  score: number,                    // 0-100, server-computed via the same formula
  dashboardUrl: string,             // direct link to this report
}
```

Errors:

- `401 Invalid or inactive MCP connection token` — re-authenticate with Vibe.
- `404 No Portaly profile linked to this agent connection` — user hasn't completed onboarding; surface and stop, do not retry.

## Report API Contract

Use this when the user wants to send health check results to Portaly for their Vibe dashboard.

### Create Health Check Report

- Endpoint:
  - `POST /api/creator-subscription/health-check-reports`
- API host:
  - `https://portaly.ai`
- Required headers:
  - `Authorization: Bearer {portaly_vibe_payment_api_key}`
  - `Content-Type: application/json`

Request body:

```json
{
  "scanType": "manual",
  "scanTimestamp": "2026-04-08T10:00:00.000Z",
  "projectName": "my-saas-app",
  "results": [
    {
      "id": "SIG-001",
      "category": "signature",
      "name": "Stable JSON sort order",
      "severity": "critical",
      "status": "pass",
      "detail": null,
      "file": null,
      "line": null
    },
    {
      "id": "SIG-003",
      "category": "signature",
      "name": "Timestamp replay protection",
      "severity": "warning",
      "status": "fail",
      "detail": "No timestamp validation found in callback handler",
      "file": "src/api/portaly/callback.ts",
      "line": 42
    }
  ],
  "summary": {
    "total": 26,
    "passed": 22,
    "failed": 2,
    "warned": 1,
    "skipped": 1
  }
}
```

Request field definitions:

- `scanType`: `"manual"` or `"scheduled"`
- `scanTimestamp`: ISO-8601 datetime of when the scan was performed
- `projectName`: human-readable project identifier
- `results[]`: array of check results
  - `id`: check ID (e.g., `SIG-001`)
  - `category`: one of `signature`, `subscription`, `callback`, `environment`, `security`, `web`, `dependency`, `data`
  - `name`: human-readable check name
  - `severity`: `"critical"`, `"warning"`, or `"info"`
  - `status`: `"pass"`, `"fail"`, `"warn"`, or `"skip"`
  - `detail`: optional diagnostic message (null if passed)
  - `file`: optional file path where the issue was found (null if passed)
  - `line`: optional line number (null if passed)
- `summary`: aggregated counts
  - `total`: total number of checks run
  - `passed`: checks that passed
  - `failed`: checks that failed
  - `warned`: checks that produced warnings
  - `skipped`: checks that were skipped

Response (success):

```json
{
  "data": {
    "reportId": "rpt_abc123",
    "dashboardUrl": "https://portaly.ai/dashboard/sentry-scans"
  }
}
```

Notes:

- This API may not be live yet. If the endpoint returns 404, skip reporting and show results locally only.
- Do not call this API without user consent.
- The API key used for reporting is the same Portaly Vibe Payment API key used for checkout and subscription management.

## Example Output

```markdown
## Portaly Sentry — Health Check Report
Project: luna-daily | Scan: 2026-04-08T10:00:00Z | Mode: manual

### SIG — Signature Verification
| # | Check | Severity | Status |
|---|-------|----------|--------|
| SIG-001 | Stable JSON sort order | CRITICAL | [PASS] |
| SIG-002 | HMAC algorithm | CRITICAL | [PASS] |
| SIG-003 | Timestamp replay protection | WARNING | [FAIL] |
| SIG-004 | Timing-safe comparison | CRITICAL | [PASS] |

### SUB — Subscription Lifecycle
| # | Check | Severity | Status |
|---|-------|----------|--------|
| SUB-001 | Subscription ID persistence | CRITICAL | [PASS] |
| SUB-002 | Idempotency key | WARNING | [WARN] |
| SUB-003 | Subscription ID in cancel/resume | CRITICAL | [PASS] |

### CBK — Callback Endpoint
| # | Check | Severity | Status |
|---|-------|----------|--------|
| CBK-001 | HTTPS callback URL | CRITICAL | [PASS] |
| CBK-002 | Callback error handling | WARNING | [PASS] |
| CBK-003 | Callback response code | INFO | [PASS] |

### ENV — Environment & Credentials
| # | Check | Severity | Status |
|---|-------|----------|--------|
| ENV-001 | Required env vars | CRITICAL | [PASS] |
| ENV-002 | Gitignore covers .env | CRITICAL | [PASS] |
| ENV-003 | No hardcoded secrets | CRITICAL | [PASS] |

### SEC — Security Best Practices
| # | Check | Severity | Status |
|---|-------|----------|--------|
| SEC-001 | No client-side exposure | CRITICAL | [PASS] |
| SEC-002 | Raw callback body persisted | INFO | [FAIL] |
| SEC-003 | Secret rotation readiness | INFO | [PASS] |
| SEC-004 | CORS configuration | WARNING | [PASS] |
| SEC-005 | CSP headers | INFO | [SKIP] |

### WEB — Web Security Fundamentals
| # | Check | Severity | Status |
|---|-------|----------|--------|
| WEB-001 | Open redirect protection | CRITICAL | [WARN] |
| WEB-002 | Error info leakage | WARNING | [PASS] |
| WEB-003 | Content-Type validation | WARNING | [PASS] |
| WEB-004 | Body size limit | WARNING | [PASS] |

### DEP — Dependency Security
| # | Check | Severity | Status |
|---|-------|----------|--------|
| DEP-001 | Known vulnerability scan | CRITICAL | [PASS] |
| DEP-002 | Lock file present | WARNING | [PASS] |

### DATA — Data Handling Security
| # | Check | Severity | Status |
|---|-------|----------|--------|
| DATA-001 | Input validation | WARNING | [WARN] |
| DATA-002 | Sensitive data logging | WARNING | [PASS] |

---

Summary: 21/26 passed | 1 CRITICAL failure | 2 warnings | 1 skip

### Fix: SIG-003 — Timestamp replay protection
File: functions/src/index.ts:135
The callback handler does not validate `x-portaly-timestamp`. An attacker who intercepts a valid callback can replay it indefinitely.

Add timestamp validation before signature verification:
\```js
const timestamp = req.header('x-portaly-timestamp') || '';
const callbackAge = Date.now() - new Date(timestamp).getTime();
if (callbackAge > 5 * 60 * 1000) {
  console.error('Callback too old', { timestamp, ageMs: callbackAge });
  return res.status(401).json({ error: 'timestamp expired' });
}
\```

### Fix: SEC-002 — Raw callback body persisted
File: functions/src/index.ts:192
Only `isPremium` and `subscriptionId` are saved after checkout completion. The full callback payload is not persisted, making it harder to investigate disputes or reconciliation issues.

Add raw payload persistence:
\```js
await db.collection('callbackLogs').doc(sessionId).set({
  payload: req.body,
  headers: { timestamp, signature: '***' },
  processedAt: FieldValue.serverTimestamp()
});
\```
```
