#!/usr/bin/env node

// WebCrypto port of sign_callback.mjs — runs on ANY JS runtime (Node 20+, Deno,
// browsers, and edge runtimes like InsForge / Cloudflare / Vercel Edge) because it
// uses the global `crypto.subtle` instead of `node:crypto`. Use this one when the
// callback handler runs on an edge / WebCrypto runtime that cannot import `node:crypto`
// (e.g. an InsForge edge function). The signing scheme — `${timestamp}.${stableJson(payload)}`
// — and `stableJson` are byte-identical to `sign_callback.mjs`; the only differences are
// that signing/verifying are **async** (WebCrypto's API is promise-based) and the
// constant-time compare is done in portable JS.
// (`globalThis.crypto` is unflagged from Node 19+; on Node 18 it needs
// `--experimental-global-webcrypto`.)

// `stableJson` MUST stay byte-identical to sign_callback.mjs and to Portaly's
// server-side signer — both sort keys with localeCompare (NOT a naive .sort(),
// which is UTF-16 order and silently mismatches some keys → rejects real
// callbacks). NOTE: sign_callback.py sorts by Unicode code point, so it can
// diverge for mixed-case / non-ASCII keys (e.g. merchant-supplied metadata keys).
export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signPortalyCallback({ secret, payload, timestamp }) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${stableJson(payload)}`)
  );
  return toHex(signature);
}

// Constant-time comparison over the two hex strings (WebCrypto has no timingSafeEqual).
// Returns false on length mismatch (same as the node:crypto version), then XOR-folds
// every char so the loop runs in time independent of where a mismatch occurs.
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyPortalyCallback({
  secret,
  payload,
  timestamp,
  signature,
}) {
  const expected = await signPortalyCallback({ secret, payload, timestamp });
  return timingSafeEqualHex(expected, signature);
}

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

async function main() {
  const args = parseArgs(process.argv);
  const { secret, timestamp, payload, signature } = args;

  if (!secret || !timestamp || !payload) {
    console.error(
      "Usage: node sign_callback.webcrypto.mjs --secret <secret> --timestamp <timestamp> --payload '<json>' [--signature <hex>]"
    );
    process.exit(1);
  }

  const parsedPayload = JSON.parse(payload);
  const generated = await signPortalyCallback({
    secret,
    timestamp,
    payload: parsedPayload,
  });

  console.log(generated);

  if (typeof signature === "string") {
    if (await verifyPortalyCallback({ secret, timestamp, payload: parsedPayload, signature })) {
      console.log("verified");
    } else {
      console.log("invalid");
      process.exit(1);
    }
  }
}

// Run main() only when executed directly as a CLI — never on import. Guarded so
// the module still loads on runtimes with no `process` global, and `node:url` is
// imported lazily so it never touches an edge / WebCrypto runtime.
async function runIfMain() {
  if (typeof process === "undefined" || !process.argv?.[1]) return;
  const { pathToFileURL } = await import("node:url");
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
  }
}

runIfMain();
