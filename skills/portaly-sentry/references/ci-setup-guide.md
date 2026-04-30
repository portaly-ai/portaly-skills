# CI Setup Guide

Use this guide to set up automated Portaly Sentry scans in your project.
All three options (GitHub Actions, pre-push hook, npm script) use the same
`scripts/report.mjs` runner and report results to the Portaly dashboard.

> **CI uses REST, not MCP.** The MCP path (`vibe_report_health_check`) only
> works inside an agent runtime that's connected to Vibe MCP. CI/CD jobs and
> scheduled scans don't have that — they always go through `PORTALY_API_KEY`
> and the REST endpoint. Both paths land in the same dashboard scan history.

---

## Prerequisites

1. `portaly-sentry` skill installed (this directory)
2. `PORTALY_API_KEY` available — from [portaly.ai/dashboard](https://portaly.ai/dashboard) → Key Management

---

## Option A — GitHub Actions (Recommended)

Copy the workflow file below to `.github/workflows/portaly-sentry.yml` in your project.
Then add `PORTALY_API_KEY` as a GitHub repository secret:
**Settings → Secrets and variables → Actions → New repository secret**

```yaml
# .github/workflows/portaly-sentry.yml
name: Portaly Sentry Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Every Monday at 09:00 Taiwan time (01:00 UTC)
    - cron: '0 1 * * 1'

jobs:
  sentry-scan:
    name: Portaly payment security scan
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --prefer-offline

      - name: Run Portaly Sentry scan
        env:
          PORTALY_API_KEY: ${{ secrets.PORTALY_API_KEY }}
        run: |
          node .claude/skills/portaly-sentry/scripts/report.mjs \
            --dir . \
            --scan-type scheduled \
            --fail-on critical

      # Exit code 1 when CRITICAL issues found → blocks merge automatically
```

### What happens on failure

- Any CRITICAL issue → `exit 1` → GitHub marks the check as failed
- PR cannot be merged until the issue is fixed (if branch protection is enabled)
- Results are posted to [portaly.ai/dashboard/sentry-scans](https://portaly.ai/dashboard/sentry-scans)

### Adjust skill path if needed

The default path assumes Claude Code installs skills at `.claude/skills/`.
If your project installs skills differently, update the path accordingly:

```yaml
# Cursor (project-level)
node .cursor/rules/portaly-sentry/scripts/report.mjs ...

# Global Claude Code installation
node ~/.claude/skills/portaly-sentry/scripts/report.mjs ...
```

---

## Option B — Pre-push Git Hook (local enforcement)

Runs automatically every time you `git push`. Blocks the push if CRITICAL issues are found.

```bash
# Run once in your project root to install the hook
cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh
set -e
echo "Running Portaly Sentry pre-push check..."
node "$(git rev-parse --show-toplevel)/.claude/skills/portaly-sentry/scripts/report.mjs" \
  --dir "$(git rev-parse --show-toplevel)" \
  --fail-on critical
EOF
chmod +x .git/hooks/pre-push
```

Or ask your AI agent:
```
幫我安裝 Portaly Sentry 的 pre-push git hook
```

---

## Option C — npm Script (manual / CI flexible)

Add to `package.json`:

```json
{
  "scripts": {
    "portaly:check": "node .claude/skills/portaly-sentry/scripts/report.mjs --dir . --fail-on critical",
    "portaly:check:ci": "node .claude/skills/portaly-sentry/scripts/report.mjs --dir . --scan-type scheduled --fail-on critical",
    "portaly:check:report": "node .claude/skills/portaly-sentry/scripts/report.mjs --dir . --verbose"
  }
}
```

Usage:
```bash
# Local check (no API key needed — just shows results)
npm run portaly:check

# With reporting to dashboard
# PORTALY_API_KEY must already be set in your shell or .env — do not paste the value here
npm run portaly:check:report

# In any CI system (PORTALY_API_KEY comes from the CI's secret store)
npm run portaly:check:ci
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORTALY_API_KEY` | Optional (for reporting) | Portaly Vibe Payment API Key (`pcs_live_*` or `pcs_test_*`) |

Results are always printed to stdout regardless of whether `PORTALY_API_KEY` is set.
Set it to also send results to [portaly.ai/dashboard/sentry-scans](https://portaly.ai/dashboard/sentry-scans).

---

## CLI Reference

```
node report.mjs [options]

Options:
  --dir <path>           Project root to scan (default: current directory)
  --project-name <name>  Override project name (default: package.json "name")
  --fail-on <level>      Exit code behaviour:
                           critical  exit 1 if any CRITICAL failure (default)
                           any       exit 1 if any failure
                           none      always exit 0
  --scan-type <type>     manual (default) | scheduled
  --dry-run              Run checks but do not POST to portaly.ai
  --verbose              Show detail lines for all checks, not just failures
```

---

## Scan Trigger Summary

| Trigger | When | Blocks deploy? | Posts to dashboard? |
|---------|------|---------------|---------------------|
| GitHub Actions (push) | Every push to main | Yes (if branch protection on) | Yes |
| GitHub Actions (schedule) | Weekly on Monday | No | Yes |
| GitHub Actions (PR) | Every PR to main | Yes | Yes |
| pre-push hook | Before every git push | Yes | Yes (if API_KEY set) |
| npm script | Manual | No | Yes (if API_KEY set) |
| AI agent (manual) | On demand | No | Yes (user confirms) |

---

## Recommended Setup for Vibe Coders

If you're not familiar with GitHub Actions, ask your AI agent:

```
幫我設定 Portaly Sentry 的 GitHub Actions，
讓每次 push 到 main 都自動掃描金流安全設定，
並把結果回傳到 Portaly 儀表板
```

The AI agent will:
1. Create `.github/workflows/portaly-sentry.yml`
2. Guide you to add `PORTALY_API_KEY` in GitHub Settings
3. Verify the workflow runs correctly on next push
