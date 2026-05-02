---
name: portaly-sentry
version: 0.3.2
description: Run a security and reliability health check on a Portaly Vibe payment integration before deployment. Trigger when the user mentions Portaly health check, payment security audit, pre-deploy check, sentry scan, callback verification audit, integration safety check, or wants to verify their Portaly payment integration is safe to go live.
---

# Portaly Sentry — Payment Integration Health Check

Use this skill to run a comprehensive security and reliability health check on a Portaly Vibe payment integration. This skill is designed for non-engineers using vibe coding tools who want to ship with confidence. Keep output human and actionable: lead with a plain-language summary and let the user drill in — reserve the 26-row technical table for when they ask for it.

This skill works alongside `portaly-payment`. It uses the same API contract as the canonical source of truth for what a correct integration looks like.

## Quick Start

### Step 1 — Confirm integration exists

- Confirm the project has a Portaly Vibe payment integration (look for `portaly`, `callbackSecret`, `x-portaly-signature`, or checkout session creation code).
- If no integration is found, tell the user and stop.

### Step 2 — Introduce what Sentry checks, in plain language

Before asking anything else, show the user this intro so they understand what Sentry actually does. Do not skip this step — the first-time user has no idea what "SIG" or "SUB" means.

Template:

```
Portaly Sentry checks your payment integration across 3 areas:
🏦 Is the payment flow itself done right?  signatures, callbacks, subscriptions
🔐 Are your merchant credentials safe?     env vars, credential management
🛡️ Is everything else hardened?            dependencies, web security, data handling
26 checks in total, graded by severity: CRITICAL / WARNING / INFO.
```

### Step 3 — Ask which project and which scan standard

Do **not** pick a default — ask the user both questions and wait for an answer. Phrase it as a checkpoint, not a suggestion.

Template:

```
Two things before I start:
① Which project should I scan? (e.g. ~/gratitude-app)
② Which standard do you want?
   🚀 Pre-launch    — pass all CRITICAL
   🔧 Routine check — pass all CRITICAL + WARNING
   🏆 Gold standard — pass all 26 (including INFO)
   📄 Report only   — scan and show the report, skip the fix workflow
   ⏰ Weekly auto   — schedule a recurring scan instead of scanning now
```

Standard → scope mapping (agent-internal; do not show this table to the user):

| User choice | Report includes | Blocking severity | Fix workflow |
|---|---|---|---|
| 🚀 Pre-launch | all 26 checks | CRITICAL only | offered |
| 🔧 Routine check | all 26 checks | CRITICAL + WARNING | offered |
| 🏆 Gold standard | all 26 checks | all severities | offered |
| 📄 Report only | all 26 checks | n/a | **never offered** |
| ⏰ Weekly auto | skip scan → jump to Step 16 | n/a | n/a |

All four non-scheduled standards run all 26 checks. The first three differ only in the pass/fail threshold used in the Layer 1 summary's "Status" line (see Step 14). 📄 Report only runs the same scan but skips Layer 2 (the fix-mode prompt) and ends after Layer 3 — use it for audits, code-review handoffs, or when the user just wants to see results without committing to fixes now.

**Advanced.** If the user explicitly asks to scan only one category (e.g. "only scan signatures" or "re-run SIG"), accept that as a single-category mode using one of: SIG, SUB, CBK, ENV, SEC, WEB, DEP, DATA. Do not surface this as a main option — category codes overwhelm first-time users.

### Prerequisites

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
| ENV-001 | `PORTALY_API_KEY` and `PORTALY_CALLBACK_SECRET` are referenced in `.env` files or in source code (proves the keys are wired via some mechanism — `.env`, secret manager, runtime env, etc.) | CRITICAL |
| ENV-002 | Sensitive `.env` files are gitignored (verified via `git check-ignore`; `.env.example` is excluded — it is a template meant to be committed) | CRITICAL |
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

### Step 4 — Discover integration files

Search the project for files related to Portaly payment integration:

- Files importing `crypto` or containing HMAC operations
- Files containing `portaly`, `x-portaly-signature`, `x-portaly-timestamp`, `callbackSecret`, `PORTALY_CALLBACK_SECRET`
- Callback route handlers (Express routes, Next.js API routes, Cloud Functions HTTP triggers)
- Files containing `subscriptionId`, `sessionId` in the context of checkout completion
- Files containing `successRedirectUrl`, `cancelRedirectUrl`

Build a file inventory and map each file to the relevant check categories.

### Step 5 — Run SIG checks

For each signature-related file:

1. Check sort order pattern — compare against canonical implementation in `../portaly-payment/scripts/sign_callback.mjs`.
2. Check HMAC algorithm — verify `createHmac('sha256', ...)`.
3. Check timestamp validation — look for comparison of `x-portaly-timestamp` against current time with a 5-minute window.
4. Check comparison method — verify `crypto.timingSafeEqual` is used, not `===` or `==`.

Reference: `scripts/check_signature_sort.mjs` can automate this step.

### Step 6 — Run SUB checks

Trace the subscription ID lifecycle:

1. In the callback handler, after `status === 'completed'`, check what gets persisted. The stored value should be `sessionId` (which equals `subscriptionId` per Portaly's current contract).
2. Check for idempotency — does the handler check if this `sessionId` was already processed before fulfilling?
3. Trace the cancel/resume code path — verify it reads the same `subscriptionId` field that the callback wrote and passes it to `/subscriptions/{subscriptionId}/cancel` or `/resume`.

Reference: `scripts/check_subscription_lifecycle.mjs` can automate this step.

### Step 7 — Run CBK checks

1. Check if `callbackUrl` is constructed with `https://`.
2. Check the signature verification failure branch — does it log diagnostic info (timestamp, payload hash, expected vs actual)?
3. Check that the success branch returns an explicit `200` status.

### Step 8 — Run ENV checks

1. Look for `.env*` files anywhere in the tree (root, `functions/`, `apps/*`, `packages/*`, etc.).
2. ENV-001 passes when both `PORTALY_API_KEY` and `PORTALY_CALLBACK_SECRET` are referenced — either in `.env` files or by name in source code. A name appearing in code (e.g. `process.env.PORTALY_API_KEY`, `defineSecret('PORTALY_API_KEY')`, or any other usage) means the project has wired the key via some mechanism (`.env`, a secret manager, runtime env, shell exports, etc.) — the script does not need to know which platform is in use. Both keys are always required: `PORTALY_API_KEY` for outbound calls and `PORTALY_CALLBACK_SECRET` for verifying payment results.
3. ENV-002: verify each sensitive `.env` file is gitignored. Use `git check-ignore` so that hierarchical patterns are respected (e.g. `**/.env` in the root `.gitignore` covers `functions/.env`). Skip `.env.example` — it is a placeholder template that is meant to be committed. If no sensitive `.env` files exist, or the project is not a git repository, the check passes (nothing can leak).
4. ENV-003: grep source files (excluding `node_modules`, `.env`) for literal `pcs_live_`, `pcs_test_`, or any string that looks like a callback secret.

### Step 9 — Run SEC checks

1. Check for API key or callback secret in files under directories typically served to the browser (`src/`, `public/`, `app/`, `pages/` for client components). Watch for `NEXT_PUBLIC_` prefixed env vars containing secrets.
2. Check if the raw callback body is saved to the database for auditing.
3. Verify secrets are read from `process.env` or equivalent, not hardcoded.
4. Check for CORS middleware on the callback endpoint — flag `Access-Control-Allow-Origin: *`.
5. Check for CSP headers on success/cancel redirect pages.

### Step 10 — Run WEB checks

1. Check if `successRedirectUrl` and `cancelRedirectUrl` are validated against an allowlist of trusted domains before being used in redirects.
2. Check error handling in the callback route — ensure `catch` blocks do not send full error stacks in the response body.
3. Check that the callback endpoint validates `Content-Type` header.
4. Check for body parser size limits (e.g., `express.json({ limit: '1mb' })` or equivalent).

### Step 11 — Run DEP checks

1. If `package.json` exists, run `npm audit --json` or `pnpm audit --json` and parse the output for critical/high severity vulnerabilities.
2. Check if `package-lock.json` or `pnpm-lock.yaml` exists and is not in `.gitignore`.

### Step 12 — Run DATA checks

1. Check if callback payload fields are validated before database writes (type checks, length limits, sanitization).
2. Grep log statements (`console.log`, `console.error`, `logger.`) for potential secret or PII exposure — flag any that log the full callback payload, API key, or callback secret.

### Step 13 — Sync results to Portaly (optional)

After running all checks but before presenting the summary, offer to sync the scan to the user's Portaly dashboard. Doing this now means Step 14's Layer 1 summary can include a shareable report link.

There are two transports — prefer MCP when available:

**Path A — MCP (preferred, zero extra config).** If the agent is connected to Vibe MCP, the `vibe_report_health_check` tool is available. It uses the agent's existing MCP connection — no `PORTALY_API_KEY` needed. Briefly ask consent, then call the tool with the scan payload. Use the `dashboardUrl` from the response as the Layer 1 dashboard link. See `references/health-check-contract.md` § "MCP reporting" for the input schema.

**Path B — REST API (fallback).** When MCP is not connected and the user has `PORTALY_API_KEY` set in their environment, fall back to running `scripts/report.mjs` — it reads the key from `process.env.PORTALY_API_KEY` and POSTs to `https://portaly.ai/api/creator-subscription/health-check-reports` for you. Prefer this over hand-rolling a `curl` / `fetch` with the key inline. Use the `dashboardUrl` from the script's stdout (line `Dashboard: <url>`) as the Layer 1 dashboard link. See `references/health-check-contract.md` § "Report API Contract" for the full request/response schema.

Rules:
- Do not call either path without explicit user consent.
- If both paths are unavailable (no MCP, no key) or the call fails (e.g., 404 on REST), skip the sync silently and continue to Step 14 without a dashboard link. Do not block the summary on this.
- Do not call both paths for the same scan — pick one.

### Step 14 — Present the summary (not the full table)

The first thing the user sees must be a plain-language summary, **not** a 26-row table. The full technical report lives on the dashboard — only show it locally when the user picks `[C]`, when the user is in 📄 Report only mode, or when dashboard reporting is unavailable.

Output up to three layers, in this order (📄 Report only mode emits Layer 1 + Layer 3 only — see below):

#### Layer 1 — Plain-language summary (always show)

Load titles from `references/fix-explanations.md` — do not invent new phrasing. Compute the health score from the per-check results using the formula in `references/health-check-contract.md` § "Health Score Formula" — the same number the dashboard shows.

Template:

```
📊 Payment integration health check — {projectName}
   Health score: {score}/100  ({band: Healthy | Needs attention | At risk})

🟢 Passing   {passedCount} checks    looking good
🟡 Review    {warnedCount} warnings  take a look this week
🔴 Critical  {failedCount} blockers  must fix before launch

Status: {status_line}

Top {min(3, failures)} things to fix:
1. {plain title from fix-explanations.md} ({ID})
2. ...
3. ...

🔗 Full report (all 26 checks, fix guidance, history)
{dashboard_url}
```

Score banding (must match the dashboard):

| Score | Band |
|---|---|
| 90–100 | Healthy |
| 70–89 | Needs attention |
| 0–69 | At risk |

`{status_line}` is decided by the scan standard chosen in Step 3 (independent of score — the score is informational, the standard gates launch):

| Standard | Condition for "safe to launch" |
|---|---|
| 🚀 Pre-launch | 0 CRITICAL failures |
| 🔧 Routine check | 0 CRITICAL **and** 0 WARNING failures |
| 🏆 Gold standard | 0 failures across all 26 checks |

Use `✅ Safe to launch` or `❌ Not safe to launch yet` — nothing in between. `{dashboard_url}` is the `dashboardUrl` returned by Step 13. If Step 13 was skipped or did not return one, drop the whole `🔗 Full report` block (both the label line and the URL line).

For **📄 Report only**, omit the `Status:` line entirely (there is no launch gate in this mode) and replace it with `Mode: 📄 Report only — fix workflow disabled`. Everything else in Layer 1 stays the same.

#### Layer 2 — Fix mode choice (show right after summary, **except in 📄 Report only**)

In 📄 Report only mode, **skip Layer 2 entirely** and go straight to Layer 3. Do not render the `[A] / [B] / [C]` prompt — the user has already opted out of fixes.

Template:

```
─────────────────────────────────────
Want to start fixing now?
[A] Yes, walk me through all of them in order (recommended)
[B] Just the 🔴 critical ones (fastest path to launch)
[C] Show me the full report first
```

The user's answer routes to:
- **[A]** → Interactive Fix Workflow with all failures, ordered CRITICAL → WARNING → INFO
- **[B]** → Interactive Fix Workflow with CRITICAL failures only
- **[C]** → Layer 3

#### Layer 3 — Full technical report (on [C], in 📄 Report only mode, or when dashboard reporting is unavailable)

Render the full 26-row table, grouped by category. Format:

```
## Portaly Sentry — Health Check Report
Project: {project_name} | Scan: {ISO timestamp} | Mode: {manual|scheduled}

### SIG — Signature Verification
| # | Check | Severity | Status |
|---|-------|----------|--------|
| SIG-001 | Stable JSON sort order | CRITICAL | [PASS] |
| ... | ... | ... | ... |

### SUB — Subscription Lifecycle
| # | Check | Severity | Status |
|---|-------|----------|--------|
| ... | ... | ... | ... |

(repeat for CBK / ENV / SEC / WEB / DEP / DATA)

---

Summary: X/26 passed | Y CRITICAL failures | Z warnings | W skipped

### Fix: {ID} — {Check Name}
File: {file_path}:{line}
{description of the issue}
{code diff showing the fix}
```

### Step 15 — Interactive Fix Workflow (per-item confirmation)

Enter this workflow only after the user explicitly picks **[A]** (fix all) or **[B]** (fix CRITICAL only) from Layer 2. For each failure, in order of severity (CRITICAL → WARNING → INFO), present exactly one item at a time and wait for confirmation before touching any file.

In **📄 Report only** mode this step is unreachable by design — Layer 2 is never shown, so [A]/[B] are never picked. If the user later changes their mind and asks to start fixing, treat that as a new request and re-prompt with the Layer 2 choices before entering this workflow.

#### Per-item template

Render the block below for each failure. All plain-language copy comes from `references/fix-explanations.md` — do not paraphrase on the fly. Keep IDs, file paths, code in the diff, and the `[Y]/[N]/[?]/[STOP]` keys as-is.

Template:

```
🔴 Item {n} of {m}        | Progress {progress_bar} {percent}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fix: {plain title} ({ID})

📍 Which file?
{file_path} ({change summary, e.g. "add 1 import, change 3 lines"})

❓ Why does this matter?
{why it matters, from fix-explanations.md}

🔧 Preview:
{unified diff, - old / + new}

✅ Affects:       {affects, from fix-explanations.md}
✅ Doesn't affect: {doesn't affect, from fix-explanations.md}
─────────────────────────────────────
Apply this fix?
[Y] Go ahead, apply it
[N] Skip this one
[?] I'd like to understand more first
[STOP] Pause here, I'll come back later
```

#### Rules

- **One item at a time.** Never batch multiple fixes into one confirmation. Even if [B] has 3 CRITICAL items, ask Y/N for each.
- **Match severity icon to the header:** 🔴 for CRITICAL, 🟡 for WARNING, ⚪ for INFO.
- **Progress bar:** use `▓` filled and `░` empty, 7 blocks total. Example at 3/7: `▓▓▓░░░░`.
- **Use the user's own code style in the diff.** Match their module system (ESM vs CommonJS), variable names, and framework idioms. Pull canonical fix patterns from `references/common-pitfalls.md` and `../portaly-payment/scripts/sign_callback.mjs`, then adapt to the user's style.
- **Never show raw CRITICAL/WARNING/INFO labels in user-facing text.** Use natural phrasing like "Critical / Should fix / Nice to have", and let the 🔴/🟡/⚪ icons carry severity visually.

#### Handling each response

Match the user's reply to intent rather than an exact string. The key-letter triggers are canonical; equivalent words in English or the user's own language count as the same intent.

| Intent | Canonical trigger | Action |
|---|---|---|
| Apply | `[Y]` (or "yes" / "apply" / "ok" / equivalent) | Apply the edit, confirm success in one line (e.g. `✅ Applied {ID}`), then move to item n+1. |
| Skip | `[N]` (or "skip" / "no" / equivalent) | Do not modify the file. Mark as `⏭️ Skipped {ID}` and move to item n+1. |
| Explain | `[?]` (or "why" / "tell me more" / equivalent) | Load the corresponding pitfall entry from `references/common-pitfalls.md` (wrong vs correct implementation with explanation). After explaining, re-prompt with the same Y/N/?/STOP choices — do not re-render the full template. |
| Stop | `[STOP]` (or "pause" / "later" / equivalent) | Stop immediately. Show a resume summary: `Applied X / Skipped Y / Remaining Z. Say "resume fixing" any time and I'll pick up at item {n}.` Do not proceed. |

#### After the last item

Template:

```
🎉 Fix session complete
✅ Applied: {X}
⏭️ Skipped: {Y}
─────────────────────────────────────
Suggested next steps:
1. Run your usual tests or try a checkout end-to-end
2. Re-run Sentry to confirm everything passes now
3. If you have a Portaly API key, sync the results to your dashboard
```

### Step 16 — Set up automated scanning (optional)

Three options, from simplest to most rigorous. Present all three and let the user choose.

**Option A — GitHub Actions (recommended for any project with a GitHub repo)**

Tell the user to create `.github/workflows/portaly-sentry.yml` with the template in
`references/ci-setup-guide.md`. Then add `PORTALY_API_KEY` as a GitHub repository secret.
This runs on every push to main AND weekly on Monday — blocks merges if CRITICAL issues are found.

**Option B — Pre-push git hook (local machine enforcement)**

Run once to install:
```bash
cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh
set -e
node "$(git rev-parse --show-toplevel)/.claude/skills/portaly-sentry/scripts/report.mjs" \
  --dir "$(git rev-parse --show-toplevel)" --fail-on critical
EOF
chmod +x .git/hooks/pre-push
```

**Option C — Automated script runner via `scripts/report.mjs`**

For any CI system or scheduled task, point at the automation script directly. The script reads `PORTALY_API_KEY` from the environment — set it through the CI's secret store, your shell profile, or a `.env` loader rather than inlining the value.
```bash
# PORTALY_API_KEY exported via CI secret / shell / .env
node .claude/skills/portaly-sentry/scripts/report.mjs \
  --dir . --scan-type scheduled --fail-on critical
```

`--fail-on critical` makes the command exit 1 when CRITICAL issues are found,
which any CI system will treat as a build failure.

See `references/ci-setup-guide.md` for the full CLI reference and setup instructions.

## Output Style

- **Lead with the plain-language summary (Layer 1), not the table.** The 26-row table is Layer 3, shown only on request.
- Use the **plain title** from `references/fix-explanations.md` when naming a failed check — never surface raw IDs like "SIG-004" as the headline. Put the ID in parentheses after the title.
- Use `[PASS]`, `[FAIL]`, `[WARN]`, `[SKIP]` status indicators only inside Layer 3 tables.
- Group Layer 3 checks by category (SIG, SUB, CBK, ENV, SEC, WEB, DEP, DATA).
- Per-failure fix instructions belong in the Interactive Fix Workflow (one at a time, with explicit confirmation), not in a dumped list after the table.
- Static analysis is read-only. Only enter fix mode after the user picks [A] or [B].

## Preferred Response Shape

**Standard modes (🚀 Pre-launch / 🔧 Routine check / 🏆 Gold standard):**

1. Plain-language summary with 🔴/🟡/⚪ counts, status line, TOP 3 failures, dashboard link (Layer 1)
2. Fix mode choice prompt: [A] / [B] / [C] (Layer 2)
3. Then one of:
   - [A] or [B] → enter Interactive Fix Workflow (one failure at a time)
   - [C] → show full Layer 3 report grouped by category
4. Optional: report-to-Portaly confirmation

**📄 Report only mode:**

1. Plain-language summary (Layer 1, with `Mode:` line in place of `Status:`)
2. Full Layer 3 report grouped by category
3. Stop. Do not show Layer 2, do not enter the Interactive Fix Workflow.
4. Optional: report-to-Portaly confirmation

## Guardrails

- **Read-only until the user enters fix mode.** Discovery, scanning, and the Layer 1/3 reports must not touch user code. Only after the user picks `[A]` or `[B]` in Layer 2 may you enter the Interactive Fix Workflow, and within it only apply an edit after a `[Y]` for that specific item. Never batch-apply multiple fixes from a single confirmation.
- **📄 Report only stays read-only, period.** When the user picks Report only in Step 3, do not show Layer 2 and do not enter the Interactive Fix Workflow — even if the report surfaces CRITICAL failures. If the user later asks to fix, treat that as a new request and re-prompt with [A]/[B]/[C] before applying anything.
- **Don't surface secret values in your own output.** When generating example commands, headers, snippets, logs, PR/commit content, or anything else you write, refer to the credential by variable name only (`$PORTALY_API_KEY`) — never with a literal value like `pcs_live_...`. Prefer `scripts/report.mjs` or the MCP `vibe_report_health_check` tool over hand-rolling `curl`/`fetch` with the key in the header. If a check surfaces a secret found in the user's source, mask it as `***` before displaying. Helping the user when they explicitly provide a key (e.g. "save this to `.env`", "test this key") is fine — this rule is about what you generate on your own initiative.
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
  Use for detailed descriptions of known bugs found in real integrations, with wrong vs correct implementations and detection methods. Load this when a user picks `[?]` (explain more) in the Interactive Fix Workflow.
- `references/fix-explanations.md`
  Use for user-facing plain-language copy of all 26 checks: plain title, why it matters, affects, doesn't affect. Load during Layer 1 summary rendering and during each Interactive Fix Workflow item. Do not paraphrase on the fly — keep the canonical phrasing consistent across summary and per-item views.
- `scripts/report.mjs`
  Use for fully automated CI/CD scanning — runs all 26 checks, prints a formatted report, and POSTs results to portaly.ai. Accepts `--fail-on critical` for CI exit code control.
- `scripts/computeHealthScore.mjs`
  Canonical implementation of the 0–100 health score formula. Imported by `report.mjs` and mirrored by the Vibe dashboard so the skill terminal and the dashboard always show the same number.
- `scripts/check_signature_sort.mjs`
  Use for automated signature sort pattern verification across project files. Called internally by `report.mjs`.
- `scripts/check_subscription_lifecycle.mjs`
  Use for automated subscription ID lifecycle tracing. Called internally by `report.mjs`.
- `references/ci-setup-guide.md`
  Use when the user wants to set up GitHub Actions, pre-push hooks, or npm scripts for automated scanning.
- Cross-reference: `../portaly-payment/scripts/sign_callback.mjs`
  Canonical Portaly callback signature implementation. Use as the reference for what correct looks like.
- Cross-reference: `../portaly-payment/references/api-contract.md`
  Authoritative API contract. Use for callback payload fields, subscription lifecycle endpoints, and the `subscriptionId === sessionId` contract.
