#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const skillNames = [
  "portaly-payment",
  "portaly-product",
  "portaly-payment-integration",
];
const subprocessTimeoutMs = 120_000;
const parityFiles = [
  "references/callback-signature-v1-vectors.json",
  "references/callback-signature-v1.md",
  "scripts/check_callback_vectors.mjs",
  "scripts/sign_callback.mjs",
  "scripts/sign_callback.py",
  "scripts/sign_callback.webcrypto.mjs",
  "scripts/verify_callback.go",
  "scripts/verify_callback_test.go",
];

function runtimeArgument(argv) {
  const index = argv.indexOf("--runtime");
  if (index === -1) {
    return "all";
  }
  if (!argv[index + 1]) {
    throw new Error("--runtime requires a value");
  }
  return argv[index + 1];
}

function skillPath(skillName, relativePath) {
  return path.join(repositoryRoot, "skills", skillName, relativePath);
}

function checkArtifactParity() {
  for (const relativePath of parityFiles) {
    const [firstSkill, ...remainingSkills] = skillNames;
    const expected = fs.readFileSync(skillPath(firstSkill, relativePath));
    for (const skillName of remainingSkills) {
      const actual = fs.readFileSync(skillPath(skillName, relativePath));
      assert.deepEqual(
        actual,
        expected,
        `${relativePath} drifted between independently installable skills`
      );
    }
  }

  console.log(`PASS parity: ${parityFiles.length} callback artifacts`);
}

// A skill states its version in up to three places: the line-anchored top-level
// `version:` (the only one portaly-vercel's skill-versions endpoint can parse),
// an optional indented `metadata.version`, and the literal in its "Report the
// installed skill version" example, which is what the agent actually sends. A
// drift between them is invisible in production: the dashboard either flags a
// current install as stale or lets a stale one look current. See POR-4237.
// Iterate the directory rather than a hardcoded list — a new skill must be
// covered on the day it lands, not whenever someone remembers to add it here.
function checkSkillVersionConsistency() {
  const skillNamesOnDisk = fs
    .readdirSync(path.join(repositoryRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.ok(skillNamesOnDisk.length > 0, "no skills found under skills/");

  for (const skillName of skillNamesOnDisk) {
    const skill = fs.readFileSync(skillPath(skillName, "SKILL.md"), "utf8");

    const version = skill.match(/^version: (\S+)$/m)?.[1];
    assert.ok(version, `${skillName}: missing top-level version`);
    assert.match(
      version,
      /^\d+\.\d+\.\d+$/,
      `${skillName}: version must be plain semver — portaly-vercel's parser rejects anything else`
    );

    // `metadata:` is genuinely optional — only some skills carry the block, so
    // it only has to agree when present.
    if (/^metadata:$/m.test(skill)) {
      assert.match(
        skill,
        new RegExp(`metadata:\\n  version: ["']${version}["']`),
        `${skillName}: metadata.version must match top-level version`
      );
    }
    // The report example is NOT optional, and must not be guarded by a presence
    // check: that literal is the only version the dashboard ever receives, so a
    // deleted or reformatted example is precisely the silent drift described
    // above — it has to fail, not be skipped.
    assert.ok(
      skill.includes(`"skillName": "${skillName}", "version": "${version}"`),
      `${skillName}: report example must be present and match top-level version`
    );
  }

  console.log(`PASS version consistency: ${skillNamesOnDisk.length} skills`);
}

function checkRefundContractDocumentation() {
  const requiredContractTerms = [
    "GET /api/creator-subscription/orders/{orderId}",
    "POST /api/creator-subscription/orders/{orderId}/refund",
    "creator_subscription.payment.refunded",
    "creator_subscription.payment.refund_failed",
    "refundFailureRetryable",
  ];

  for (const skillName of ["portaly-payment", "portaly-payment-integration"]) {
    const skill = fs.readFileSync(skillPath(skillName, "SKILL.md"), "utf8");
    const contract = fs.readFileSync(
      skillPath(skillName, "references/api-contract.md"),
      "utf8"
    );
    for (const term of requiredContractTerms) {
      assert.ok(
        skill.includes(term) || contract.includes(term),
        `${skillName}: refund contract is missing ${term}`
      );
    }

    for (const document of [skill, contract]) {
      assert.ok(
        document.includes("up to three daily scheduled attempts"),
        `${skillName}: delayed refund retry window is missing`
      );
      assert.ok(
        !document.includes(
          "refundRequestedAt is over 30 minutes old with neither terminal timestamp"
        ),
        `${skillName}: delayed refunds must not be treated as missing after 30 minutes`
      );
    }
  }

  const paymentContract = fs.readFileSync(
    skillPath("portaly-payment", "references/api-contract.md"),
    "utf8"
  );
  assert.ok(
    paymentContract.includes(
      "`REFUND_ATTEMPT_FAILED`: a previous refund attempt reached terminal failure; contact Portaly support"
    ),
    "portaly-payment: terminal refund failure guidance is missing"
  );

  console.log("PASS refund contract documentation");
}

function requestedRuntimes(runtime) {
  return runtime === "all"
    ? ["node", "webcrypto", "python", "go"]
    : runtime.split(",");
}

function checkFixtureSafety(runtime) {
  const fixture = JSON.parse(
    fs.readFileSync(
      skillPath(
        "portaly-payment",
        "references/callback-signature-v1-vectors.json"
      ),
      "utf8"
    )
  );

  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.contract, "portaly-callback-v1");
  assert.ok(fixture.vectors.length >= 5, "expected incident and key-order vectors");
  assert.ok(
    !Object.hasOwn(fixture.provenance, "sourceRepository") &&
      !Object.hasOwn(fixture.provenance, "sourceCommit") &&
      !Object.hasOwn(fixture.provenance, "signerCommit"),
    "public fixtures must not expose private repository provenance"
  );
  for (const vector of fixture.vectors) {
    assert.equal(
      vector.secret,
      "portaly_fixture_secret_not_for_production",
      `${vector.id}: fixture must use the documented fake secret`
    );
    assert.match(vector.signature, /^[0-9a-f]{64}$/);
  }

  console.log(`PASS fixture safety: ${fixture.vectors.length} synthetic vectors`);

  const adapterCases = {
    node: {
      command: process.execPath,
      args: ["sign_callback.mjs"],
      rejection: /Unknown option: --secret/,
    },
    webcrypto: {
      command: process.execPath,
      args: ["sign_callback.webcrypto.mjs"],
      rejection: /Unknown option: --secret/,
    },
    python: {
      command: "python3",
      args: ["sign_callback.py"],
      rejection: /unrecognized arguments: --secret/,
    },
    go: {
      command: "go",
      args: ["run", "."],
      rejection: /flag provided but not defined: -secret/,
    },
  };
  const vector = fixture.vectors[0];
  for (const skillName of skillNames) {
    const scriptsDirectory = path.dirname(
      skillPath(skillName, "scripts/sign_callback.mjs")
    );
    for (const runtimeName of requestedRuntimes(runtime)) {
      const adapter = adapterCases[runtimeName];
      assert.ok(adapter, `Unknown runtime: ${runtimeName}`);
      const result = spawnSync(
        adapter.command,
        [
          ...adapter.args,
          "--timestamp",
          vector.timestamp,
          "--secret",
          "must-not-be-accepted",
        ],
        {
          cwd: scriptsDirectory,
          input: JSON.stringify(vector.payload),
          encoding: "utf8",
          env: {
            ...process.env,
            PORTALY_CALLBACK_SECRET: vector.secret,
          },
          timeout: subprocessTimeoutMs,
        }
      );
      const failure = [result.error?.message, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n");
      assert.notEqual(
        result.status,
        0,
        `${skillName}/${runtimeName}: --secret must be rejected`
      );
      assert.match(
        failure,
        adapter.rejection,
        `${skillName}/${runtimeName}: --secret rejection was ambiguous`
      );
    }
  }
  console.log(`PASS argv secret rejection: runtime=${runtime}`);
}

function runSkillConformance(skillName, runtime) {
  const script = skillPath(skillName, "scripts/check_callback_vectors.mjs");
  const result = spawnSync(process.execPath, [script, "--runtime", runtime], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: subprocessTimeoutMs,
  });

  assert.equal(
    result.status,
    0,
    `${skillName}: ${result.error?.message || ""}${result.stdout}${result.stderr}`
  );
  process.stdout.write(result.stdout);
}

function main() {
  const runtime = runtimeArgument(process.argv.slice(2));
  checkArtifactParity();
  checkSkillVersionConsistency();
  checkRefundContractDocumentation();
  checkFixtureSafety(runtime);
  for (const skillName of skillNames) {
    runSkillConformance(skillName, runtime);
  }
  console.log(`PASS repository conformance: runtime=${runtime}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
}
