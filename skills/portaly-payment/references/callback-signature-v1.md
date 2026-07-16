# Callback signature v1: runtime routing and verification

Use this reference before generating or repairing a Portaly callback receiver.
The goal is to select an implementation that has evidence for the user's
runtime, not to translate JavaScript from memory.

## First inspect the receiver

Identify these facts from the repository before writing code:

1. language and framework;
2. server, serverless, or edge runtime;
3. how the framework exposes the parsed JSON body;
4. the existing signature verifier, if any;
5. where server-side environment secrets are stored;
6. which callback event family the handler consumes.

If the repository does not reveal the stack, ask one focused question. Do not
default to Node merely because the normative implementation is JavaScript.

## Choose an evidence-backed route

| Runtime | Route | Required proof |
|---|---|---|
| Node.js server | `scripts/sign_callback.mjs` | `node scripts/check_callback_vectors.mjs --runtime node` |
| Server-side WebCrypto / edge | `scripts/sign_callback.webcrypto.mjs` | `node scripts/check_callback_vectors.mjs --runtime webcrypto` |
| Python | `scripts/sign_callback.py` | `node scripts/check_callback_vectors.mjs --runtime python` |
| Go | `scripts/verify_callback.go` | `node scripts/check_callback_vectors.mjs --runtime go` |
| JVM, .NET, PHP, Ruby, Rust, or another runtime | Implement against `callback-signature-v1-vectors.json`, or use a server-side Node bridge | Do not ship until exact signatures and negative cases pass |

The Python and Go adapters deliberately fail closed when v1 cannot be
reproduced safely: object keys outside the callback schema order committed in
the golden vectors (including arbitrary metadata keys), floating-point JSON
numbers, integers outside JavaScript's safe range, or malformed Unicode. Route
those payloads to the Node/WebCrypto adapter or keep the integration blocked
until a native adapter extends and passes production-derived vectors. A
self-sign/self-verify test is not evidence because the same bug can exist on
both sides of that test.

## Exact v1 contract

Portaly v1 computes:

```text
HMAC-SHA256(
  callbackSecret,
  x-portaly-timestamp + "." + stableJson(JSON.parse(wireBody))
)
```

The output is lowercase hexadecimal. `stableJson` recursively sorts object
keys with JavaScript `localeCompare` semantics and otherwise mirrors
`JSON.stringify`, including dropping `undefined` object properties, converting
`undefined` array elements to `null`, and leaving `&`, `<`, and `>` unescaped.

Do not sign the raw v1 HTTP body. Do not use code-point ordering such as Go
`sort.Strings`, Python `sorted()`, or Rust `BTreeMap` and assume it is
equivalent. The built-in keys `canceledAt` and `cancelEffectiveAt` already
produce a different order under code-point sorting.

V1 has a protocol-level limitation: the sender does not pin locale or ICU, and
receivers must reconstruct JavaScript serialization. Passing the committed
vectors proves those cases only; it does not prove arbitrary JSON or every
runtime. A future raw-byte/versioned contract is a separate production change.

## Safe handler order

1. Require `x-portaly-event`, `x-portaly-timestamp`, and
   `x-portaly-signature`.
2. Parse the ISO timestamp and apply the documented five-minute maximum age.
   A future-clock-skew tolerance is not defined by the current contract, so
   reject future timestamps rather than inventing one silently.
3. Recompute v1 from the parsed JSON payload and timing-safe compare the
   signature. Reject before any business side effect.
4. Require the authenticated body `event` to equal `x-portaly-event`.
5. Apply event-specific idempotency, then perform the state transition.

Use these event identities where the payload contract provides them:

- checkout completion: `event + sessionId`;
- subscription payment success/failure: `event + paymentId`, falling back to
  `paymentReference` when that is the documented payment identity;
- digital product refund: `event + orderId`.

Do not permanently deduplicate every subscription lifecycle event by
`sessionId` or `subscriptionId`; that suppresses later legitimate transitions.
The current lifecycle payload does not document a delivery identifier. Make
status assignments themselves idempotent and flag any stronger deduplication
requirement for the product owner instead of inventing an identifier.

## Secret and logging rules

- Keep `PORTALY_CALLBACK_SECRET` in a server-side environment or approved
  secret store. Never put it in browser code, chat, source, command arguments,
  or logs.
- The bundled CLIs read the secret from the environment and the payload from
  stdin or `--payload-file`; they do not accept `--secret`.
- Do not log the secret, full signing base, or customer payload in production.
  Retain only the minimum audit data allowed by the application's data policy.
- Callback endpoints must use HTTPS.

## Conformance and diagnosis

The vectors were generated from a committed Portaly production signer with
synthetic data and a fake fixture secret. They cover the incident's mixed-case
`cancel*` keys, nested insertion order, Unicode values, HTML characters, arrays,
nulls, booleans, integers, wrong secrets, changed timestamps, tampering, short
signatures, and uppercase hex.

Run the matching adapter before shipping. If the command cannot run or any
vector fails, report the integration as blocked; do not replace the failure
with an unverified translation.

Useful 401 fingerprints:

- every event fails: check secret selection, raw-body signing, and missing
  canonicalization;
- checkout succeeds but lifecycle/renewal fails: check sender deployment and
  code-point key sorting;
- only payloads containing `&`, `<`, or `>` fail: check HTML escaping;
- automatic delivery and manual retry differ: check signer drift.
