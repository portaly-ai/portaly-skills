#!/usr/bin/env node

// WebCrypto adapter for server and edge JavaScript runtimes. Callback secrets
// must never be used in browser-delivered code even though WebCrypto exists there.

// This must remain byte-identical to sign_callback.mjs and the production v1
// signer: localeCompare key ordering plus JSON.stringify undefined semantics.
export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value
      .map((item) =>
        typeof item === "undefined" ? "null" : stableJson(item)
      )
      .join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, val]) => typeof val !== "undefined")
      .sort(([a], [b]) => a.localeCompare(b));

    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
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

function timingSafeEqualHex(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
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
  const supported = new Set(["timestamp", "signature", "payload-file"]);

  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    if (!supported.has(key)) {
      throw new Error(`Unknown option: ${current}`);
    }
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
  const fs = await import("node:fs");
  const args = parseArgs(process.argv);
  const secret = process.env.PORTALY_CALLBACK_SECRET;
  const { timestamp, signature } = args;

  if (!secret || !timestamp) {
    console.error(
      "Usage: set PORTALY_CALLBACK_SECRET in the environment, then pipe JSON to " +
        "`node sign_callback.webcrypto.mjs --timestamp <iso> [--signature <hex>]` or use --payload-file."
    );
    process.exit(2);
  }

  const raw = args["payload-file"]
    ? fs.readFileSync(args["payload-file"], "utf8")
    : fs.readFileSync(0, "utf8");
  if (!raw.trim()) {
    throw new Error("Provide the JSON payload on stdin or with --payload-file.");
  }

  const payload = JSON.parse(raw);
  const generated = await signPortalyCallback({ secret, timestamp, payload });
  console.log(generated);

  if (typeof signature === "string") {
    if (await verifyPortalyCallback({ secret, timestamp, payload, signature })) {
      console.log("verified");
    } else {
      console.log("invalid");
      process.exit(1);
    }
  }
}

async function runIfMain() {
  if (typeof process === "undefined" || !process.argv?.[1]) {
    return;
  }

  const { pathToFileURL } = await import("node:url");
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
      await main();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
  }
}

runIfMain();
