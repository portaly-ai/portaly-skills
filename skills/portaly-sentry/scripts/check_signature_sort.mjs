#!/usr/bin/env node

/**
 * Portaly Sentry — Signature Sort Verifier
 *
 * Scans a project directory for Portaly callback signature implementations
 * and checks whether the sort order matches Portaly's canonical implementation.
 *
 * Usage:
 *   node check_signature_sort.mjs --dir /path/to/project [--verbose]
 *
 * Output:
 *   JSON object with scan results: { checked, passed, failed, warned, skipped, details[] }
 *
 * Exit code:
 *   0 = no failures
 *   1 = one or more failures found
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const RELEVANT_MARKERS = [
  "x-portaly-signature",
  "x-portaly-timestamp",
  "callbackSecret",
  "PORTALY_CALLBACK_SECRET",
  "stableJson",
  "stable_json",
  "signPortalyCallback",
  "verifyPortalyCallback",
];

// Pattern descriptions are deliberately worded so this file does not match its own regexes when scanned.
const WRONG_PATTERNS = [
  // Naive object-keys sort with no comparator (missing locale-aware compare).
  /Object\.keys\s*\([^)]*\)\s*\.sort\s*\(\s*\)/,
  // Object-keys sort using a subtract or lexical comparator instead of locale-aware compare.
  /Object\.keys\s*\([^)]*\)\s*\.sort\s*\(\s*\(\s*\w+\s*,\s*\w+\s*\)\s*=>\s*\w+\s*[<>-]\s*\w+\s*\)/,
];

const CORRECT_PATTERNS = [
  // Object.entries(...).sort(([a], [b]) => a.localeCompare(b))
  /Object\.entries\s*\([^)]*\)\s*\.sort\s*\(\s*\(\s*\[\s*\w+\s*\]\s*,\s*\[\s*\w+\s*\]\s*\)\s*=>\s*\w+\.localeCompare\s*\(\s*\w+\s*\)/,
  // .sort((a, b) => a.localeCompare(b)) on keys
  /\.sort\s*\(\s*\(\s*\w+\s*,\s*\w+\s*\)\s*=>\s*\w+\.localeCompare\s*\(\s*\w+\s*\)\s*\)/,
];

// `lib/` is intentionally NOT skipped — many TS projects keep callback source under lib/portaly/.
// Build output lives under dist/build/.next/out, which we still skip.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  ".firebase",
]);

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".py",
]);

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
      // Skip dot-dirs (.git, .next, .claude, .venv, etc.) — match report.mjs walker behavior.
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        const subFiles = await walkDir(fullPath);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function findLineNumber(content, pattern) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      return i + 1;
    }
  }
  return null;
}

function scanFile(filePath, content, verbose) {
  const isRelevant = RELEVANT_MARKERS.some(
    (marker) => content.includes(marker)
  );

  if (!isRelevant) {
    return { file: filePath, status: "skip" };
  }

  // Check for wrong patterns
  for (const pattern of WRONG_PATTERNS) {
    if (pattern.test(content)) {
      const line = findLineNumber(content, pattern);
      return {
        file: filePath,
        status: "fail",
        line,
        message:
          "Object key sort is missing locale-aware compare — see references/common-pitfalls.md (SIG-001) for the canonical fix.",
        ...(verbose ? { matchedPattern: pattern.source } : {}),
      };
    }
  }

  // Check for correct patterns
  for (const pattern of CORRECT_PATTERNS) {
    if (pattern.test(content)) {
      const line = findLineNumber(content, pattern);
      return {
        file: filePath,
        status: "pass",
        line,
        ...(verbose ? { matchedPattern: pattern.source } : {}),
      };
    }
  }

  // Relevant file but no sort pattern found — needs manual review
  return {
    file: filePath,
    status: "warn",
    message:
      "File references Portaly callback verification but no recognizable sort pattern was found — manual review recommended",
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const { dir, verbose } = args;

  if (!dir) {
    console.error(
      "Usage: node check_signature_sort.mjs --dir <project_root> [--verbose]"
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

  const files = await walkDir(dir);
  const results = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const result = scanFile(filePath, content, verbose === "true");
      results.push(result);
    } catch {
      // Skip unreadable files
    }
  }

  const summary = {
    checked: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    warned: results.filter((r) => r.status === "warn").length,
    skipped: results.filter((r) => r.status === "skip").length,
    details: results.filter((r) => r.status !== "skip"),
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.failed > 0 ? 1 : 0);
}

// Cross-platform entry point detection (handles Windows path casing and file:/// prefix)
const importUrl = import.meta.url.toLowerCase();
const argvUrl = new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href.toLowerCase();
if (importUrl === argvUrl) {
  main();
}

export { scanFile, walkDir, RELEVANT_MARKERS, WRONG_PATTERNS, CORRECT_PATTERNS };
