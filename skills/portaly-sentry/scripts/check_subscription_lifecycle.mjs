#!/usr/bin/env node

/**
 * Portaly Sentry — Subscription Lifecycle Verifier
 *
 * Traces the subscription ID lifecycle from callback handler through to
 * cancel/resume API calls, verifying the correct ID is stored and used.
 *
 * Usage:
 *   node check_subscription_lifecycle.mjs --dir /path/to/project [--verbose]
 *
 * Output:
 *   JSON object with check results:
 *   { checks: { callbackPersistence, cancelResumeUsage, idempotency } }
 *
 * Exit code:
 *   0 = no failures
 *   1 = one or more failures found
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  ".firebase",
  "lib",
]);

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
]);

const CALLBACK_MARKERS = [
  "x-portaly-signature",
  "callbackSecret",
  "PORTALY_CALLBACK_SECRET",
  "portalyCallback",
  "portaly/callback",
  "portaly-callback",
  "verifyPortalyCallback",
];

const CANCEL_RESUME_MARKERS = [
  "/subscriptions/",
  "/cancel",
  "/resume",
  "cancelSubscription",
  "resumeSubscription",
  "cancel_subscription",
  "resume_subscription",
];

function parseArgs(argv) {
  const args = {};

  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }

  return args;
}

async function walkDir(dir) {
  const files = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        const subFiles = await walkDir(fullPath);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function findLineNumber(content, searchStr) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchStr)) {
      return i + 1;
    }
  }
  return null;
}

function findLineNumberByPattern(content, pattern) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      return i + 1;
    }
  }
  return null;
}

/**
 * Check 1: Does the callback handler persist subscriptionId after checkout completion?
 */
function checkCallbackPersistence(files) {
  for (const { path, content } of files) {
    const isCallbackFile = CALLBACK_MARKERS.some((m) => content.includes(m));
    if (!isCallbackFile) continue;

    const hasCompletedCheck =
      content.includes("completed") &&
      (content.includes("status") || content.includes("event"));

    if (!hasCompletedCheck) continue;

    // Check if subscriptionId or sessionId is persisted
    const persistsSubscriptionId =
      /subscriptionId\s*[:=]/.test(content) ||
      /subscriptionId.*sessionId/.test(content) ||
      /sessionId.*subscriptionId/.test(content);

    const persistsSessionId =
      /sessionId\s*[:=]/.test(content) && content.includes("set(");

    if (persistsSubscriptionId) {
      const line =
        findLineNumberByPattern(content, /subscriptionId\s*[:=]/) ||
        findLineNumberByPattern(content, /subscriptionId/);
      return {
        status: "pass",
        file: path,
        line,
        detail:
          "Callback handler persists subscriptionId after checkout completion",
      };
    }

    if (persistsSessionId) {
      const line = findLineNumberByPattern(content, /sessionId\s*[:=]/);
      return {
        status: "warn",
        file: path,
        line,
        detail:
          "Callback handler stores sessionId but does not explicitly name it subscriptionId — verify it is used as subscriptionId in cancel/resume flows",
      };
    }

    // Callback file found but no persistence of subscription identifier
    return {
      status: "fail",
      file: path,
      line: findLineNumber(content, "completed"),
      detail:
        "Callback handler processes 'completed' status but does not persist subscriptionId or sessionId — subscription management will not work",
    };
  }

  return {
    status: "skip",
    file: null,
    line: null,
    detail: "No Portaly callback handler found in project",
  };
}

/**
 * Check 2: Do cancel/resume flows use the correct subscriptionId?
 */
function checkCancelResumeUsage(files) {
  const cancelResumeFiles = [];

  for (const { path, content } of files) {
    const hasCancelResume = CANCEL_RESUME_MARKERS.some((m) =>
      content.includes(m)
    );
    if (hasCancelResume) {
      cancelResumeFiles.push({ path, content });
    }
  }

  if (cancelResumeFiles.length === 0) {
    return {
      status: "info",
      file: null,
      line: null,
      detail:
        "No cancel/resume implementation found — this is expected for one-time plans only",
    };
  }

  for (const { path, content } of cancelResumeFiles) {
    // Check if the cancel/resume call uses subscriptionId from a database read
    const usesStoredId =
      /subscriptionId/.test(content) &&
      (/\.get\(/.test(content) ||
        /\.doc\(/.test(content) ||
        /\.findOne/.test(content) ||
        /\.find\(/.test(content) ||
        /await.*fetch/.test(content));

    if (usesStoredId) {
      const line =
        findLineNumber(content, "subscriptionId") ||
        findLineNumber(content, "/cancel") ||
        findLineNumber(content, "/resume");
      return {
        status: "pass",
        file: path,
        line,
        detail:
          "Cancel/resume flow reads subscriptionId from stored data and passes it to the Portaly API",
      };
    }

    // Check if it uses a hardcoded or parameter-based ID (might be wrong)
    const usesParamId =
      /subscriptions\/\$\{/.test(content) ||
      /subscriptions\/' \+/.test(content) ||
      /subscriptions\/` \+/.test(content);

    if (usesParamId) {
      const line = findLineNumberByPattern(content, /subscriptions\//);
      return {
        status: "warn",
        file: path,
        line,
        detail:
          "Cancel/resume flow constructs subscription URL dynamically — verify the ID source matches what the callback handler persisted",
      };
    }
  }

  return {
    status: "warn",
    file: cancelResumeFiles[0].path,
    line: null,
    detail:
      "Cancel/resume code found but could not trace the subscriptionId source — manual review recommended",
  };
}

/**
 * Check 3: Does the callback handler have idempotency protection?
 */
function checkIdempotency(files) {
  for (const { path, content } of files) {
    const isCallbackFile = CALLBACK_MARKERS.some((m) => content.includes(m));
    if (!isCallbackFile) continue;

    const hasCompletedCheck =
      content.includes("completed") &&
      (content.includes("status") || content.includes("event"));

    if (!hasCompletedCheck) continue;

    // Check for explicit duplicate detection
    const hasExplicitCheck =
      // Check-before-write pattern
      /\.get\([^)]*sessionId/.test(content) ||
      /\.get\([^)]*subscriptionId/.test(content) ||
      // Conditional writes
      /if\s*\(.*already/.test(content) ||
      /if\s*\(.*processed/.test(content) ||
      /if\s*\(.*exists/.test(content) ||
      /if\s*\(.*duplicate/.test(content);

    if (hasExplicitCheck) {
      const line =
        findLineNumberByPattern(content, /already|processed|exists|duplicate/) ||
        findLineNumberByPattern(content, /\.get\(/);
      return {
        status: "pass",
        file: path,
        line,
        detail:
          "Callback handler has explicit duplicate/idempotency check before processing",
      };
    }

    // Check for merge/upsert pattern (partial protection)
    const hasMergeUpsert =
      /merge:\s*true/.test(content) ||
      /\$set/.test(content) ||
      /upsert/.test(content) ||
      /ON\s+CONFLICT/.test(content);

    if (hasMergeUpsert) {
      const line = findLineNumberByPattern(
        content,
        /merge:\s*true|\$set|upsert|ON\s+CONFLICT/
      );
      return {
        status: "warn",
        file: path,
        line,
        detail:
          "Callback uses merge/upsert for data write (idempotent for storage) but no explicit duplicate callback check — a repeated callback could trigger side effects (emails, notifications) twice",
      };
    }

    // No idempotency protection found
    return {
      status: "warn",
      file: path,
      line: findLineNumber(content, "completed"),
      detail:
        "No duplicate callback detection found — processing the same callback twice could cause double fulfillment",
    };
  }

  return {
    status: "skip",
    file: null,
    line: null,
    detail: "No Portaly callback handler found in project",
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const { dir, verbose } = args;

  if (!dir) {
    console.error(
      "Usage: node check_subscription_lifecycle.mjs --dir <project_root> [--verbose]"
    );
    process.exit(1);
  }

  // Verify directory exists
  try {
    const dirStat = await stat(dir);
    if (!dirStat.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch {
    console.error(`Error: ${dir} does not exist`);
    process.exit(1);
  }

  const filePaths = await walkDir(dir);
  const files = [];

  for (const filePath of filePaths) {
    try {
      const content = await readFile(filePath, "utf-8");
      files.push({ path: filePath, content });
    } catch {
      // Skip unreadable files
    }
  }

  const checks = {
    callbackPersistence: checkCallbackPersistence(files),
    cancelResumeUsage: checkCancelResumeUsage(files),
    idempotency: checkIdempotency(files),
  };

  const hasFailure = Object.values(checks).some((c) => c.status === "fail");

  console.log(JSON.stringify({ checks }, null, 2));
  process.exit(hasFailure ? 1 : 0);
}

// Cross-platform entry point detection (handles Windows path casing and file:/// prefix)
const importUrl = import.meta.url.toLowerCase();
const argvUrl = new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href.toLowerCase();
if (importUrl === argvUrl) {
  main();
}

export {
  checkCallbackPersistence,
  checkCancelResumeUsage,
  checkIdempotency,
};
