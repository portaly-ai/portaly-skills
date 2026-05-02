# Fix Explanations — Plain-Language Copy for 26 Checks

## Use This Reference For

- rendering the "Top N things to fix" list in the Step 14 Layer 1 summary
- rendering the "Why it matters / Affects / Doesn't affect" block in the Step 15 Interactive Fix Workflow
- keeping user-facing wording consistent across summary and per-item views

Each entry provides:

- **Plain title** — human-readable name shown instead of the technical check name
- **Why it matters** — 1–2 sentences explaining impact, no jargon
- **Affects** — what parts of the user's project a fix touches
- **Doesn't affect** — reassurance about what stays untouched

Severity values match `SKILL.md`. When `SKILL.md` and `health-check-contract.md` disagree, use `SKILL.md` (the skill definition is canonical for the UX layer).

---

## SIG — Callback Signature Verification

### SIG-001 · CRITICAL
- **Plain title**: Signature key ordering doesn't match Portaly
- **Why it matters**: Your code uses `Object.keys().sort()`, which relies on default Unicode ordering. Any mixed-case or non-ASCII key produces an HMAC that diverges from Portaly's canonical implementation, so your own code rejects every callback as "signature invalid." Users pay but never get access.
- **Affects**: Callback verification logic (the `stableJson` helper)
- **Doesn't affect**: Database, frontend, other APIs

### SIG-002 · CRITICAL
- **Plain title**: Wrong HMAC algorithm (not SHA-256)
- **Why it matters**: Portaly signs with SHA-256. If you use MD5 or SHA-1, hashes never match and every callback fails verification — no order can complete.
- **Affects**: Callback verification logic (the `createHmac` line)
- **Doesn't affect**: Database, frontend, other APIs

### SIG-003 · WARNING
- **Plain title**: No replay protection on old callbacks
- **Why it matters**: The callback carries a timestamp, but you don't check it was sent in the last 5 minutes. An attacker who captures one valid callback can replay it forever — each replay looks like a new payment to your system, effectively handing out free subscriptions.
- **Affects**: Callback handler (add a timestamp check before signature verification)
- **Doesn't affect**: Database, frontend, other APIs

### SIG-004 · CRITICAL
- **Plain title**: Signature comparison is vulnerable (timing attack)
- **Why it matters**: You compare signatures with `!==` / `===`. An attacker can measure microsecond-level timing differences to guess the correct signature one character at a time. `crypto.timingSafeEqual` makes the comparison constant-time so no timing information leaks.
- **Affects**: Callback verification logic (the comparison lines)
- **Doesn't affect**: Database, frontend, other APIs

---

## SUB — Subscription Lifecycle

### SUB-001 · CRITICAL
- **Plain title**: subscriptionId not persisted (can't manage subscriptions later)
- **Why it matters**: After payment completes, the callback's `sessionId` is never saved as `subscriptionId`. When a user later tries to cancel or check their subscription, you have no Portaly-recognized ID and every API call returns 404. Support gets flooded.
- **Affects**: Callback handler success branch, database (one extra field)
- **Doesn't affect**: Signature verification, frontend, checkout flow

### SUB-002 · WARNING
- **Plain title**: Same callback can be processed twice
- **Why it matters**: You don't check whether a given `sessionId` has already been handled. When Portaly retries or the network hiccups, the same payment can be processed twice — users get two billing cycles or inventory is deducted twice.
- **Affects**: Callback handler (add a deduplication check), database writes
- **Doesn't affect**: Signature verification, frontend, checkout flow

### SUB-003 · CRITICAL
- **Plain title**: Cancel/resume reads the wrong ID
- **Why it matters**: The cancel/resume code reads from a different field than the callback wrote. Calls to Portaly return 404 — users want to cancel but can't, and their next step is a chargeback with their bank.
- **Affects**: Cancel/resume API call logic
- **Doesn't affect**: Checkout flow, callback verification, frontend

---

## CBK — Callback Endpoint

### CBK-001 · CRITICAL
- **Plain title**: callbackUrl uses http:// instead of https://
- **Why it matters**: Without HTTPS, the callback payload (signature, user data, payment status) travels the network in plaintext. Anyone on the path can intercept or tamper with it. Portaly's production environment rejects non-HTTPS URLs outright.
- **Affects**: The `callbackUrl` field sent when creating a checkout session
- **Doesn't affect**: Database, frontend, callback processing logic

### CBK-002 · WARNING
- **Plain title**: No trace when callback verification fails
- **Why it matters**: The signature-failure branch doesn't log anything and doesn't return 401. When "user paid but didn't get access" hits later, you have no way to tell which step broke. A few log lines save hours of debugging.
- **Affects**: Callback handler failure branch
- **Doesn't affect**: Success flow, database, frontend

### CBK-003 · INFO
- **Plain title**: Success path doesn't return an explicit 200
- **Why it matters**: You're relying on the framework's default status code. If middleware changes later, Portaly may see a non-200 response, treat it as a failure, and retry — resulting in duplicate processing of the same payment.
- **Affects**: Callback handler success branch (add one `res.status(200)` line)
- **Doesn't affect**: Verification logic, database, frontend

---

## ENV — Environment & Credentials

### ENV-001 · CRITICAL
- **Plain title**: Missing required env vars
- **Why it matters**: Either `PORTALY_API_KEY` or `PORTALY_CALLBACK_SECRET` is not referenced anywhere — neither in `.env` nor in source code. In production, your checkout or callback-verification code crashes the moment it runs.
- **Affects**: `.env`, or wherever your project loads secrets from (secret manager, runtime env, etc.)
- **Doesn't affect**: Source code, database

### ENV-002 · CRITICAL
- **Plain title**: .env is not in .gitignore
- **Why it matters**: `.env` holds your merchant secrets. Once committed to GitHub, the key lives in every commit of history — deleting it later doesn't help because bots continuously scrape GitHub for leaked credentials. (If you don't keep secrets in a `.env` file at all, this check passes automatically — there's nothing to leak.)
- **Affects**: `.gitignore` in each directory that contains a `.env` file
- **Doesn't affect**: Source code, database, frontend

### ENV-003 · CRITICAL
- **Plain title**: API key or callback secret is hardcoded in source
- **Why it matters**: The secret string is written directly in code rather than read from env. Once pushed to the repo it's effectively public, and rotating the secret later requires code changes and a redeploy — too slow for an emergency rotation.
- **Affects**: Files where the secret is hardcoded (replace with `process.env.XXX`)
- **Doesn't affect**: Database, frontend, other business logic

---

## SEC — Security Best Practices

### SEC-001 · CRITICAL
- **Plain title**: Secret leaks to the browser
- **Why it matters**: The callback secret or API key ends up in the frontend bundle, the `public/` directory, or a `NEXT_PUBLIC_*` env var. Anyone opening DevTools can read it — like leaving the vault key on the front door.
- **Affects**: Frontend files that contain the secret (move to server-side)
- **Doesn't affect**: Backend callback verification, database

### SEC-002 · INFO
- **Plain title**: No audit trail for processed callbacks
- **Why it matters**: You don't record which `sessionId`s have been handled. When a user complains "I paid but never got access," you have nothing to look up. You don't need to store the whole payload — at minimum, write `sessionId`, `status`, and timestamp to a log or audit table.
- **Affects**: Callback handler (a few log lines or an audit table)
- **Doesn't affect**: Verification logic, frontend, existing business flow

### SEC-003 · INFO
- **Plain title**: Secrets aren't read from env, so rotation requires code changes
- **Why it matters**: If a secret leaks and needs urgent rotation, you'd have to edit code, test, and redeploy. Reading from `process.env` means you just change the env var and restart.
- **Affects**: Hardcoded values (move to env)
- **Doesn't affect**: Database, frontend, business logic

### SEC-004 · WARNING
- **Plain title**: Callback endpoint has wide-open CORS (`*`)
- **Why it matters**: The callback endpoint should only accept requests from Portaly's servers — it doesn't need cross-origin browser access. Setting `Access-Control-Allow-Origin: *` lets any site's JavaScript probe your API, expanding your attack surface.
- **Affects**: CORS config on the callback route
- **Doesn't affect**: Portaly's own callbacks, checkout flow

### SEC-005 · INFO
- **Plain title**: No Content-Security-Policy on payment pages
- **Why it matters**: Without CSP, any XSS vulnerability on the checkout or success page lets an attacker inject JavaScript that steals card info. CSP is a seatbelt — even if a hole exists, exploiting it gets much harder.
- **Affects**: HTTP headers on success/cancel/checkout redirect pages
- **Doesn't affect**: Backend APIs, database, callback logic

---

## WEB — Web Security Fundamentals

### WEB-001 · CRITICAL
- **Plain title**: Success/cancel URLs can be spoofed (open redirect)
- **Why it matters**: User-supplied `successRedirectUrl` and `cancelRedirectUrl` are passed to Portaly without domain validation. An attacker can craft a link that looks like your legitimate checkout but redirects to a phishing site after payment. Users trust the flow because the first hop was real — and then type their card details into the fake page.
- **Affects**: Checkout session creation code (add a domain allowlist check)
- **Doesn't affect**: Database, callback verification, other frontend pages

### WEB-002 · WARNING
- **Plain title**: Error messages leak internal details
- **Why it matters**: `catch` blocks send full stack traces, file paths, or DB errors back to the caller. An attacker can use these to figure out your framework, source layout, and database — accelerating their search for other vulnerabilities.
- **Affects**: Error-handler branch response bodies
- **Doesn't affect**: Success flow, database, business logic

### WEB-003 · WARNING
- **Plain title**: Callback doesn't validate Content-Type
- **Why it matters**: Without this check, an attacker can send `text/plain` or `multipart/form-data` to bypass certain frameworks' body parsing or signature verification. Next.js usually handles this automatically — Express or bare servers need an explicit check.
- **Affects**: Callback route (one line of Content-Type validation)
- **Doesn't affect**: Post-verification processing logic

### WEB-004 · WARNING
- **Plain title**: No size limit on callback requests
- **Why it matters**: An attacker can send a massive body to exhaust your Node process's memory and take the service down (DoS). Next.js has a 4.5MB default — Express needs an explicit `limit`.
- **Affects**: Body parser configuration
- **Doesn't affect**: Verification logic, database, normal-sized callbacks

---

## DEP — Dependency Security

### DEP-001 · CRITICAL
- **Plain title**: Dependencies have known vulnerabilities
- **Why it matters**: `npm audit` found production-dependency packages with critical CVEs. Attackers scan live services for vulnerable versions and target those with published exploits. Not upgrading is like leaving a key in the door.
- **Affects**: `package.json`, lock file (upgrade)
- **Doesn't affect**: Your own code (unless the package has a breaking change — the upgrade will flag it)

### DEP-002 · WARNING
- **Plain title**: No lock file (different environments install different versions)
- **Why it matters**: Without `package-lock.json` / `pnpm-lock.yaml`, your local install and production install can pick different minor versions. Production might silently upgrade to a buggy or vulnerable version without you noticing.
- **Affects**: Adds a lock file to the project root
- **Doesn't affect**: Source code, database, frontend

---

## DATA — Data Handling Security

### DATA-001 · WARNING
- **Plain title**: Callback data is written to DB without validation
- **Why it matters**: You don't check that `sessionId` is a string or that `amount` is positive. If Portaly's format ever changes or the body is corrupted, bad rows land in your database and break reporting and reconciliation later.
- **Affects**: Validation logic before DB writes in the callback handler
- **Doesn't affect**: Signature verification, frontend, checkout flow

### DATA-002 · WARNING
- **Plain title**: Logs contain full secrets or customer PII
- **Why it matters**: `console.log(req.body)` prints the whole callback — including user email, payment references, and potentially the prefix of a secret. Logs usually live in Datadog/CloudWatch where a wider audience can read them, so this effectively leaks sensitive data and may violate GDPR or local privacy laws.
- **Affects**: Every `console.log` / `logger.info` statement (switch to logging just `sessionId` and `status`)
- **Doesn't affect**: Business logic, database, frontend
