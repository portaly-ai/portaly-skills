---
name: portaly-sentry
description: Run a security and reliability health check on a Portaly Vibe payment integration before deployment. Trigger when the user mentions Portaly health check, payment security audit, pre-deploy check, sentry scan, callback verification audit, integration safety check, or wants to verify their Portaly payment integration is safe to go live.
---

# Portaly Sentry — Payment Integration Health Check

Use this skill to run a comprehensive security and reliability health check on a Portaly Vibe payment integration. This skill is designed for non-engineers using vibe coding tools who want to ship with confidence. Keep output human and actionable: lead with a plain-language summary and let the user drill in — reserve the 26-row technical table for when they ask for it.

This skill works alongside `portaly-payment`. It uses the same API contract as the canonical source of truth for what a correct integration looks like.

## Quick Start

### Step 0 — Confirm integration exists

- Confirm the project has a Portaly Vibe payment integration (look for `portaly`, `callbackSecret`, `x-portaly-signature`, or checkout session creation code).
- If no integration is found, tell the user and stop.

### Step 0.1 — Introduce what Sentry checks, in plain language

Before asking anything else, show the user this intro so they understand what Sentry actually does. Do not skip this step — the first-time user has no idea what "SIG" or "SUB" means.

```
Portaly Sentry 會從 3 個面向幫你健檢金流整合：
🏦 付款這件事本身做對了嗎     簽章驗證、callback、訂閱
🔐 你的商家金鑰有沒有保護好   環境變數、憑證管理
🛡️ 系統其他地方會不會被打穿   套件漏洞、Web 安全、資料處理
共 26 項檢查，依嚴重度分為 CRITICAL / WARNING / INFO。
```

### Step 0.2 — Ask which project and which scan standard

Do **not** pick a default — ask the user both questions and wait for an answer. Phrase it exactly as a checkpoint, not a suggestion.

```
請告訴我：
① 要掃哪個專案？（例如 ~/gratitude-app）
② 想用哪個標準？
   🚀 準備上線 — 只看 CRITICAL，全過即可放行
   🔧 日常健檢 — CRITICAL + WARNING 全過
   🏆 追求業界模範 — 26 項全過（含 INFO）
   ⏰ 每週自動健檢 — 設定排程（不立即掃描）
```

Standard → scope mapping (internal):

| User choice | Report includes | Blocking severity |
|---|---|---|
| 🚀 準備上線 | all 26 checks | CRITICAL only |
| 🔧 日常健檢 | all 26 checks | CRITICAL + WARNING |
| 🏆 追求業界模範 | all 26 checks | all severities |
| ⏰ 每週自動健檢 | skip scan → jump to Step 12 | n/a |

All three non-scheduled standards still run all 26 checks. What changes is the pass/fail threshold used in the summary's "目前狀態：✅ 可以放心上線 / ❌ 還不能安全上線" line.

### Step 0.3 — Advanced: scan a single category

Only offer this if the user asks for it explicitly (e.g. "我只想掃簽章" or "re-run SIG"). Do not surface this as a main option — category codes overwhelm first-time users.

- Single category — SIG, SUB, CBK, ENV, SEC, WEB, DEP, or DATA

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

### Step 10 — Present the summary first (not the full table)

After running all checks, the first thing the user sees must be a plain-language summary, **not** a 26-row table. The full technical report lives on the dashboard — only show it locally when the user asks or when reporting to Portaly fails.

Output three layers, in this order:

#### Layer 1 — Plain-language summary (always show)

Load titles from `references/fix-explanations.md` — do not invent new phrasing.

```
📊 你的金流整合健檢結果
🔴 致命問題   {N} 項   ← 上線前一定要修
🟡 建議修復   {N} 項   ← 這週內處理
⚪ 有空再做   {N} 項   ← 有餘力再補

目前狀態：{status_line}

最嚴重的 {min(3, failures)} 件事：
1. {白話標題 from fix-explanations.md}（{ID}）
2. ...
3. ...

🔗 完整健檢結果（所有 26 項、修復建議、歷史紀錄）
https://portaly.ai/dashboard/sentry-scans/{scan_id}
```

`{status_line}` is decided by the scan standard chosen in Step 0.2:

| Standard | 可以放心上線條件 |
|---|---|
| 🚀 準備上線 | 0 CRITICAL failures |
| 🔧 日常健檢 | 0 CRITICAL **and** 0 WARNING failures |
| 🏆 追求業界模範 | 0 failures across all 26 checks |

Use `✅ 可以放心上線` or `❌ 還不能安全上線` — nothing in between. If the user has not reported to Portaly yet (no `scan_id`), omit the dashboard link and show only local results.

#### Layer 2 — Fix mode choice (always show right after summary)

```
─────────────────────────────────────
要現在開始修嗎？
[A] 好，全部照順序修（建議）
[B] 只修 🔴 致命問題（最快上線）
[C] 我想先看完整報告
```

The user's answer routes to:
- **[A]** → Interactive Fix Workflow with all failures, ordered CRITICAL → WARNING → INFO
- **[B]** → Interactive Fix Workflow with CRITICAL failures only
- **[C]** → Layer 3

#### Layer 3 — Full technical report (only on [C], or when dashboard reporting is unavailable)

This is the old 26-row table, grouped by category. Format:

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

### Step 10.5 — Interactive Fix Workflow (per-item confirmation)

Enter this workflow only after the user explicitly picks **[A]** (fix all) or **[B]** (fix CRITICAL only) from Layer 2. For each failure, in order of severity (CRITICAL → WARNING → INFO), present exactly one item at a time and wait for confirmation before touching any file.

#### Per-item template

Render the block below for each failure. All plain-language copy comes from `references/fix-explanations.md` — do not paraphrase on the fly.

```
🔴 第 {n} 項，共 {m} 項       | 進度 {progress_bar} {percent}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
修復：{白話標題}（{ID}）

📍 會動哪個檔案？
{file_path}（{summary of change: "新增 1 個 import、修改 3 行" etc.}）

❓ 為什麼要改？
{為什麼要改 from fix-explanations.md}

🔧 修改預覽：
{unified diff, - old / + new}

✅ 會影響：{會影響 from fix-explanations.md}
✅ 不會影響：{不會影響 from fix-explanations.md}
─────────────────────────────────────
要套用這個修改嗎？
[Y] 好，修下去
[N] 跳過這項
[?] 我想先了解更多
[STOP] 先停在這，我有事要處理
```

#### Rules

- **One item at a time.** Never batch multiple fixes into one confirmation. Even if [B] has 3 CRITICAL items, ask Y/N for each.
- **Match severity icon to the header:** 🔴 for CRITICAL, 🟡 for WARNING, ⚪ for INFO.
- **Progress bar:** use `▓` filled and `░` empty, 7 blocks total. Example at 3/7: `▓▓▓░░░░`.
- **Use the user's own code style in the diff.** Match their module system (ESM vs CommonJS), variable names, and framework idioms. Pull canonical fix patterns from `references/common-pitfalls.md` and `../portaly-payment/scripts/sign_callback.mjs`, then adapt to the user's style.
- **Never show raw CRITICAL/WARNING/INFO in user-facing text** — use 🔴 致命 / 🟡 建議 / ⚪ 有空再做.

#### Handling each response

| User reply | Action |
|---|---|
| `[Y]` or "好" / "修" / "套用" | Apply the edit, confirm success in one line (`✅ 已套用 {ID}`), then move to item n+1. |
| `[N]` or "跳過" | Do not modify the file. Mark as `⏭️ 已跳過 {ID}` and move to item n+1. |
| `[?]` or "為什麼" / "了解更多" | Load the corresponding pitfall entry from `references/common-pitfalls.md` (wrong vs correct implementation with explanation). After explaining, re-prompt with the same Y/N/?/STOP choices — do not re-render the full template. |
| `[STOP]` or "暫停" / "先停" | Stop immediately. Show a resume summary: `已完成 X 項 / 跳過 Y 項 / 剩 Z 項未處理。隨時說「繼續修復」我就從第 {n} 項接著做。` Do not proceed. |

#### After the last item

```
🎉 修復流程結束
✅ 已套用 {X} 項
⏭️ 已跳過 {Y} 項
─────────────────────────────────────
建議下一步：
1. 執行你平常的測試／預覽一下結帳流程
2. 重跑一次 Sentry 健檢確認都通過
3. 有 Portaly API Key 的話可以同步結果到 dashboard
```

### Step 11 — Report to Portaly (optional)

If the user wants to report results to Portaly:

1. Confirm user consent before sending any data.
2. POST to `https://portaly.ai/api/creator-subscription/health-check-reports` with `Authorization: Bearer {PORTALY_API_KEY}`.
3. See `references/health-check-contract.md` for the full request/response schema.
4. If the endpoint returns 404, it is not yet live — skip reporting and show results locally only.

### Step 12 — Set up automated scanning (optional)

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

For any CI system or scheduled task, point at the automation script directly:
```bash
PORTALY_API_KEY=pcs_live_... node .claude/skills/portaly-sentry/scripts/report.mjs \
  --dir . --scan-type scheduled --fail-on critical
```

`--fail-on critical` makes the command exit 1 when CRITICAL issues are found,
which any CI system will treat as a build failure.

See `references/ci-setup-guide.md` for the full CLI reference and setup instructions.

## Output Style

- **Lead with the plain-language summary (Layer 1), not the table.** The 26-row table is Layer 3, shown only on request.
- Use the **白話標題** from `references/fix-explanations.md` when naming a failed check — never surface raw IDs like "SIG-004" as the headline. Put the ID in parentheses after the title.
- Use `[PASS]`, `[FAIL]`, `[WARN]`, `[SKIP]` status indicators only inside Layer 3 tables.
- Group Layer 3 checks by category (SIG, SUB, CBK, ENV, SEC, WEB, DEP, DATA).
- Per-failure fix instructions belong in the Interactive Fix Workflow (one at a time, with explicit confirmation), not in a dumped list after the table.
- Static analysis is read-only. Only enter fix mode after the user picks [A] or [B].

## Preferred Response Shape

1. Plain-language summary with 🔴/🟡/⚪ counts, status line, TOP 3 failures, dashboard link (Layer 1)
2. Fix mode choice prompt: [A] / [B] / [C] (Layer 2)
3. Then one of:
   - [A] or [B] → enter Interactive Fix Workflow (one failure at a time)
   - [C] → show full Layer 3 report grouped by category
4. Optional: report-to-Portaly confirmation

## Guardrails

- **Read-only until the user enters fix mode.** Discovery, scanning, and the Layer 1/3 reports must not touch user code. Only after the user picks `[A]` or `[B]` in Layer 2 may you enter the Interactive Fix Workflow, and within it only apply an edit after a `[Y]` for that specific item. Never batch-apply multiple fixes from a single confirmation.
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
  Use for detailed descriptions of known bugs found in real integrations, with wrong vs correct implementations and detection methods. Load this when a user picks `[?] 我想先了解更多` in the Interactive Fix Workflow.
- `references/fix-explanations.md`
  Use for user-facing plain-language copy of all 26 checks: 白話標題, 為什麼要改, 會影響, 不會影響. Load during Layer 1 summary rendering and during each Interactive Fix Workflow item. Do not paraphrase on the fly — keep wording consistent across summary and per-item views.
- `scripts/report.mjs`
  Use for fully automated CI/CD scanning — runs all 26 checks, prints a formatted report, and POSTs results to portaly.ai. Accepts `--fail-on critical` for CI exit code control.
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
