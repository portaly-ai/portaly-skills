#!/usr/bin/env node

import crypto from "node:crypto";

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

export function signPortalyCallback({ secret, payload, timestamp }) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${stableJson(payload)}`)
    .digest("hex");
}

export function verifyPortalyCallback({
  secret,
  payload,
  timestamp,
  signature,
}) {
  const expected = signPortalyCallback({ secret, payload, timestamp });
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.byteLength !== signatureBuffer.byteLength) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
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

function main() {
  const args = parseArgs(process.argv);
  const { secret, timestamp, payload, signature } = args;

  if (!secret || !timestamp || !payload) {
    console.error(
      "Usage: node sign_callback.mjs --secret <secret> --timestamp <timestamp> --payload '<json>' [--signature <hex>]"
    );
    process.exit(1);
  }

  const parsedPayload = JSON.parse(payload);
  const generated = signPortalyCallback({
    secret,
    timestamp,
    payload: parsedPayload,
  });

  console.log(generated);

  if (typeof signature === "string") {
    if (verifyPortalyCallback({ secret, timestamp, payload: parsedPayload, signature })) {
      console.log("verified");
    } else {
      console.log("invalid");
      process.exit(1);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
