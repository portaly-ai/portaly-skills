#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  signPortalyCallback as signNode,
  stableJson as stableJsonNode,
  verifyPortalyCallback as verifyNode,
} from "./sign_callback.mjs";
import {
  signPortalyCallback as signWebCrypto,
  stableJson as stableJsonWebCrypto,
  verifyPortalyCallback as verifyWebCrypto,
} from "./sign_callback.webcrypto.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const subprocessTimeoutMs = 120_000;
const fixturePath = path.join(
  scriptDirectory,
  "..",
  "references",
  "callback-signature-v1-vectors.json",
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function requestedRuntimes(argv) {
  const index = argv.indexOf("--runtime");
  const raw = index === -1 ? "all" : argv[index + 1];
  if (!raw) {
    throw new Error("--runtime requires a value");
  }

  const runtimes =
    raw === "all" ? ["node", "webcrypto", "python", "go"] : raw.split(",");
  const supported = new Set(["node", "webcrypto", "python", "go"]);
  for (const runtime of runtimes) {
    if (!supported.has(runtime)) {
      throw new Error(`Unknown runtime: ${runtime}`);
    }
  }
  return runtimes;
}

function tamper(payload) {
  const copy = JSON.parse(JSON.stringify(payload));
  const [key] = Object.keys(copy);
  const value = copy[key];
  if (typeof value === "number") {
    copy[key] = value + 1;
  } else if (typeof value === "boolean") {
    copy[key] = !value;
  } else if (typeof value === "string") {
    copy[key] = `${value}-tampered`;
  } else {
    copy[key] = "tampered";
  }
  return copy;
}

async function checkJavaScriptRuntime(label, stableJson, sign, verify) {
  assert.equal(
    stableJson({ list: [undefined], object: { omitted: undefined } }),
    '{"list":[null],"object":{}}',
    `${label}: undefined behavior drifted from production`,
  );

  for (const vector of fixture.vectors) {
    assert.equal(
      stableJson(vector.payload),
      vector.stableJson,
      `${label}/${vector.id}: stable JSON mismatch`,
    );
    assert.equal(
      await sign({
        secret: vector.secret,
        payload: vector.payload,
        timestamp: vector.timestamp,
      }),
      vector.signature,
      `${label}/${vector.id}: signature mismatch`,
    );
    assert.equal(
      await verify({
        secret: vector.secret,
        payload: vector.payload,
        timestamp: vector.timestamp,
        signature: vector.signature,
      }),
      true,
      `${label}/${vector.id}: valid signature rejected`,
    );

    const negativeCases = [
      {
        secret: `${vector.secret}_wrong`,
        payload: vector.payload,
        timestamp: vector.timestamp,
        signature: vector.signature,
      },
      {
        secret: vector.secret,
        payload: tamper(vector.payload),
        timestamp: vector.timestamp,
        signature: vector.signature,
      },
      {
        secret: vector.secret,
        payload: vector.payload,
        timestamp: `${vector.timestamp}-wrong`,
        signature: vector.signature,
      },
      {
        secret: vector.secret,
        payload: vector.payload,
        timestamp: vector.timestamp,
        signature: vector.signature.toUpperCase(),
      },
      {
        secret: vector.secret,
        payload: vector.payload,
        timestamp: vector.timestamp,
        signature: vector.signature.slice(0, -1),
      },
    ];

    for (const candidate of negativeCases) {
      assert.equal(
        await verify(candidate),
        false,
        `${label}/${vector.id}: invalid input accepted`,
      );
    }
  }

  console.log(
    `PASS ${label}: ${fixture.vectors.length} vectors plus negative cases`,
  );
}

function checkPython() {
  const script = path.join(scriptDirectory, "sign_callback.py");

  for (const vector of fixture.vectors) {
    const result = spawnSync(
      "python3",
      [
        script,
        "--timestamp",
        vector.timestamp,
        "--signature",
        vector.signature,
      ],
      {
        input: JSON.stringify(vector.payload),
        encoding: "utf8",
        env: { ...process.env, PORTALY_CALLBACK_SECRET: vector.secret },
        timeout: subprocessTimeoutMs,
      },
    );
    assert.equal(result.status, 0, `python/${vector.id}: ${result.stderr}`);
    assert.deepEqual(
      result.stdout.trim().split("\n"),
      [vector.signature, "verified"],
      `python/${vector.id}: unexpected output`,
    );

    const invalidInputs = [
      {
        secret: `${vector.secret}_wrong`,
        timestamp: vector.timestamp,
        payload: vector.payload,
      },
      {
        secret: vector.secret,
        timestamp: `${vector.timestamp}-wrong`,
        payload: vector.payload,
      },
      {
        secret: vector.secret,
        timestamp: vector.timestamp,
        payload: tamper(vector.payload),
      },
    ];
    for (const candidate of invalidInputs) {
      const invalid = spawnSync(
        "python3",
        [
          script,
          "--timestamp",
          candidate.timestamp,
          "--signature",
          vector.signature,
        ],
        {
          input: JSON.stringify(candidate.payload),
          encoding: "utf8",
          env: { ...process.env, PORTALY_CALLBACK_SECRET: candidate.secret },
          timeout: subprocessTimeoutMs,
        },
      );
      assert.equal(
        invalid.status,
        1,
        `python/${vector.id}: invalid input was accepted`,
      );
      assert.equal(invalid.stdout.trim().split("\n").at(-1), "invalid");
    }
  }

  const unsupportedPayloads = [
    { "hyphen-key": "value" },
    { metadata: { "unknown-metadata-key": "value" } },
    { amount: 1.25 },
    { amount: Number.MAX_SAFE_INTEGER + 1 },
  ];
  for (const payload of unsupportedPayloads) {
    const unsupported = spawnSync(
      "python3",
      [script, "--timestamp", fixture.vectors[0].timestamp],
      {
        input: JSON.stringify(payload),
        encoding: "utf8",
        env: {
          ...process.env,
          PORTALY_CALLBACK_SECRET: fixture.vectors[0].secret,
        },
        timeout: subprocessTimeoutMs,
      },
    );
    assert.equal(
      unsupported.status,
      2,
      `python: unsupported payload must fail closed: ${JSON.stringify(payload)}`,
    );
  }

  console.log(
    `PASS python: ${fixture.vectors.length} vectors plus fail-closed cases`,
  );
}

function checkGo() {
  const result = spawnSync("go", ["test"], {
    cwd: scriptDirectory,
    encoding: "utf8",
    timeout: subprocessTimeoutMs,
  });
  assert.equal(
    result.status,
    0,
    `go: ${[result.error?.message, result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")}`,
  );

  const vector = fixture.vectors[0];
  const emptySignature = spawnSync(
    "go",
    ["run", ".", "--timestamp", vector.timestamp, "--signature", ""],
    {
      cwd: scriptDirectory,
      input: JSON.stringify(vector.payload),
      encoding: "utf8",
      env: { ...process.env, PORTALY_CALLBACK_SECRET: vector.secret },
      timeout: subprocessTimeoutMs,
    },
  );
  assert.equal(
    emptySignature.status,
    1,
    "go: explicit empty signature must fail",
  );
  console.log(
    `PASS go: ${fixture.vectors.length} vectors plus fail-closed cases`,
  );
}

async function main() {
  for (const runtime of requestedRuntimes(process.argv.slice(2))) {
    if (runtime === "node") {
      await checkJavaScriptRuntime(
        "node",
        stableJsonNode,
        signNode,
        verifyNode,
      );
    } else if (runtime === "webcrypto") {
      await checkJavaScriptRuntime(
        "webcrypto",
        stableJsonWebCrypto,
        signWebCrypto,
        verifyWebCrypto,
      );
    } else if (runtime === "python") {
      checkPython();
    } else if (runtime === "go") {
      checkGo();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
