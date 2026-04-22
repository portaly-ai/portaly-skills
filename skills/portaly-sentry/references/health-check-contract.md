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
| SEC-002 | Raw callback body persisted | INFO | Full callback payload is saved to a database collection/table for audit trail. | Only specific fields are saved, or nothing is persisted. |
| SEC-003 | Secret rotation readiness | INFO | All secrets are read from `process.env` (or framework equivalent), not hardcoded. Application can rotate secrets by updating env vars without code changes. | Secrets are hardcoded or read from config files committed to version control. |
| SEC-004 | CORS configuration | WARNING | Callback endpoint does not set `Access-Control-Allow-Origin: *`. Either no CORS headers or restricted to specific origins. | `Access-Control-Allow-Origin: *` is set on the callback endpoint, allowing any origin to interact with it. |
| SEC-005 | CSP headers | INFO | Payment-related pages (success, cancel, checkout redirect) include a `Content-Security-Policy` header. | No CSP header on payment-related pages. |

### WEB — Web Security Fundamentals

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| WEB-001 | Open redirect protection | CRITICAL | `successRedirectUrl` and `cancelRedirectUrl` are validated against a domain allowlist before redirect. Server-side validation, not client-side only. | URLs are passed through without validation, allowing attackers to craft URLs that redirect users to phishing sites. |
| WEB-002 | Error info leakage | WARNING | Error responses in callback handler return generic messages (e.g., `{ error: "invalid signature" }`). No stack traces, file paths, or DB schema in responses. | `catch` blocks send `err.stack`, `err.message` with internal details, or framework default error pages with debug info. |
| WEB-003 | Content-Type validation | WARNING | Callback endpoint checks that `Content-Type` header is `application/json` before processing. | No Content-Type validation — endpoint accepts any content type. |
| WEB-004 | Body size limit | WARNING | Body parser has an explicit size limit (e.g., `express.json({ limit: '1mb' })`, Next.js `bodyParser` config, or equivalent). | No body size limit configured — vulnerable to payload bomb attacks. |

### DEP — Dependency Security

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| DEP-001 | Known vulnerability scan | CRITICAL | `npm audit` or `pnpm audit` reports zero critical or high severity vulnerabilities in production dependencies. | One or more critical/high CVEs found in dependencies. |
| DEP-002 | Lock file present | WARNING | `package-lock.json` or `pnpm-lock.yaml` exists in the project root and is not in `.gitignore`. | No lock file found, or lock file is gitignored — supply chain risk from inconsistent installs. |

### DATA — Data Handling Security

| ID | Check | Severity | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| DATA-001 | Input validation | WARNING | Callback payload fields are validated (type, length, format) before being written to the database. At minimum: `sessionId` is a string, `status` is one of the expected values, `amount` is a positive number. | Callback payload is written directly to the database without any validation. |
| DATA-002 | Sensitive data logging | WARNING | Log statements in callback handler and payment flows do not output full API keys, callback secrets, or complete customer PII (full email, payment references). Logs use `sessionId` and `status` only, or mask sensitive fields. | Found `console.log(req.body)`, `console.log(payload)`, or similar that dumps the full callback payload including potential PII to logs. |

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
