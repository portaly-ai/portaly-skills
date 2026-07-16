#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

// Portaly callback v1 signs stableJson(JSON.parse(wireBody)), not the raw body.
// Keep this byte-identical to the committed production signer. In particular,
// object keys use localeCompare and undefined mirrors JSON.stringify semantics.
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

function readPayload(payloadFile) {
  const raw = payloadFile
    ? fs.readFileSync(payloadFile, "utf8")
    : fs.readFileSync(0, "utf8");

  if (!raw.trim()) {
    throw new Error("Provide the JSON payload on stdin or with --payload-file.");
  }

  return JSON.parse(raw);
}

function main() {
  const args = parseArgs(process.argv);
  const secret = process.env.PORTALY_CALLBACK_SECRET;
  const { timestamp, signature } = args;

  if (!secret || !timestamp) {
    console.error(
      "Usage: set PORTALY_CALLBACK_SECRET in the environment, then pipe JSON to " +
        "`node sign_callback.mjs --timestamp <iso> [--signature <hex>]` or use --payload-file."
    );
    process.exit(2);
  }

  const payload = readPayload(args["payload-file"]);
  const generated = signPortalyCallback({ secret, timestamp, payload });

  console.log(generated);

  if (typeof signature === "string") {
    if (verifyPortalyCallback({ secret, timestamp, payload, signature })) {
      console.log("verified");
    } else {
      console.log("invalid");
      process.exit(1);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
