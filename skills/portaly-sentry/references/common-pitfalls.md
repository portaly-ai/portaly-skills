# Common Pitfalls in Portaly Payment Integration

## Use This Reference For

- understanding known bugs found in real Portaly Vibe integrations
- providing correct fix implementations to users
- explaining why each bug matters in production
- detecting these issues during health checks

Each pitfall includes: what goes wrong, why it matters, wrong implementation, correct implementation, and detection method.

---

## Portaly-Specific Pitfalls

### Pitfall 1: Callback Signature Sort Mismatch (SIG-001)

**What goes wrong:**
Code uses `Object.keys(data).sort()` to sort object keys before HMAC signing. Portaly's canonical implementation uses `Object.entries(value).sort(([a], [b]) => a.localeCompare(b))`.

**Why it matters:**
`Object.keys().sort()` uses default Unicode code point order. `localeCompare` uses locale-aware comparison. For most ASCII-only keys, the results are identical. But when keys contain mixed case, accents, or non-ASCII characters, the two can diverge — producing a different HMAC that Portaly will reject. The callback will silently fail and the order will never be fulfilled.

**Wrong implementation:**

```js
// WRONG — uses default sort, not localeCompare
function stableJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted = Object.keys(value)
      .sort()  // <-- default Unicode sort, NOT locale-aware
      .map(k => JSON.stringify(k) + ':' + stableJson(value[k]));
    return '{' + sorted.join(',') + '}';
  }
  return JSON.stringify(value);
}
```

**Correct implementation:**

```js
// CORRECT — matches portaly-payment-skill/scripts/sign_callback.mjs
function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))  // <-- locale-aware sort on entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
```

**Detection:**
Search for files containing `Object.keys(` followed by `.sort()` in files that also reference `portaly`, `callbackSecret`, `x-portaly-signature`, or `stableJson`. If found, check whether the sort uses `localeCompare`.

---

### Pitfall 2: Wrong Subscription ID Storage (SUB-001)

**What goes wrong:**
After payment completion callback, the code stores a local identifier (e.g., a Firestore document ID, an internal order number, or a UUID) instead of persisting `sessionId` from the callback payload as the `subscriptionId`.

**Why it matters:**
Per Portaly's current contract: `subscriptionId === checkoutSessionId === sessionId`. If you store a different identifier, all subscription lifecycle API calls (cancel, resume, query) will return 404 because Portaly doesn't recognize your local ID. The merchant loses the ability to manage subscriptions from their admin panel.

**Wrong implementation:**

```js
// WRONG — stores a local-only reference
app.post('/api/portaly/callback', async (req, res) => {
  // ... signature verification ...
  const { sessionId, status } = req.body;

  if (status === 'completed') {
    const localOrderId = generateOrderId();  // <-- local ID, NOT Portaly's
    await db.collection('orders').doc(localOrderId).set({
      orderId: localOrderId,
      isPaid: true,
      // subscriptionId is missing or set to localOrderId
    });
  }
  res.status(200).json({ ok: true });
});
```

**Correct implementation:**

```js
// CORRECT — persists sessionId as subscriptionId per Portaly contract
app.post('/api/portaly/callback', async (req, res) => {
  // ... signature verification ...
  const { sessionId, status, subscriptionId = sessionId } = req.body;

  if (status === 'completed') {
    await db.collection('subscribers').doc(userId).set({
      subscriptionId,          // <-- Portaly's subscription identifier
      sessionId,               // <-- also store for reference
      isPremium: true,
      premiumSince: new Date(),
    }, { merge: true });
  }
  res.status(200).json({ ok: true });
});
```

**Detection:**
In the callback handler, after the `status === 'completed'` branch, check what gets written to the database. Verify a field named `subscriptionId` (or equivalent) is set to the callback's `sessionId` or `subscriptionId`.

---

### Pitfall 3: Missing Subscription ID in Cancel/Resume (SUB-003)

**What goes wrong:**
The cancel/resume code path reads the subscription identifier from a different database field or collection than what the callback handler wrote, or it uses a hardcoded/incorrect value.

**Why it matters:**
Calling `POST /api/creator-subscription/subscriptions/{wrong-id}/cancel` returns 404. The merchant cannot cancel a subscriber's recurring charges, leading to customer complaints and potential chargebacks.

**Wrong implementation:**

```js
// WRONG — reads from a different field than what callback stored
async function cancelSubscription(userId) {
  const user = await db.collection('users').doc(userId).get();
  const orderId = user.data().orderId;  // <-- this is a local order ID, not Portaly's subscriptionId

  await fetch(`https://portaly.cc/api/creator-subscription/subscriptions/${orderId}/cancel`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'customer_requested' }),
  });
}
```

**Correct implementation:**

```js
// CORRECT — reads the same subscriptionId that callback wrote
async function cancelSubscription(userId) {
  const subscriber = await db.collection('subscribers').doc(userId).get();
  const { subscriptionId } = subscriber.data();  // <-- same field callback persisted

  const res = await fetch(
    `https://portaly.cc/api/creator-subscription/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'customer_requested' }),
    }
  );

  if (!res.ok) {
    throw new Error(`Cancel failed: ${res.status}`);
  }
}
```

**Detection:**
Trace the cancel/resume code path. Find where it reads the subscription identifier. Compare the collection/field name with what the callback handler writes. They must match.

---

### Pitfall 4: No Callback Error Handling (CBK-002)

**What goes wrong:**
The callback handler has no logging on signature verification failure, or silently returns 200 even when verification fails.

**Why it matters:**
If the callback fails silently, the merchant never knows they have a signature mismatch. Orders sit in limbo — the customer paid but never got access. Without diagnostic logs, debugging requires guessing.

**Wrong implementation:**

```js
// WRONG — silent failure, returns 200 regardless
app.post('/api/portaly/callback', (req, res) => {
  const verified = verifyPortalyCallback({ ... });

  if (verified) {
    // process payment...
  }
  // PROBLEM: returns 200 even if verification failed
  // PROBLEM: no logging on failure
  res.status(200).json({ ok: true });
});
```

**Correct implementation:**

```js
// CORRECT — logs failure details and returns 401
app.post('/api/portaly/callback', (req, res) => {
  const timestamp = req.header('x-portaly-timestamp') || '';
  const signature = req.header('x-portaly-signature') || '';

  const verified = verifyPortalyCallback({
    secret: process.env.PORTALY_CALLBACK_SECRET,
    timestamp,
    payload: req.body,
    signature,
  });

  if (!verified) {
    console.error('Portaly callback verification failed', {
      timestamp,
      signaturePrefix: signature.slice(0, 8) + '...',
      sessionId: req.body?.sessionId,
    });
    return res.status(401).json({ error: 'invalid signature' });
  }

  // process payment...
  res.status(200).json({ ok: true });
});
```

**Detection:**
In the callback handler, check the branch where signature verification fails. It should: (1) log diagnostic info, (2) return a non-200 status. If neither exists, flag as WARNING.

---

### Pitfall 5: No Timestamp Replay Protection (SIG-003)

**What goes wrong:**
The callback handler verifies the HMAC signature but does not check whether `x-portaly-timestamp` is within an acceptable time window.

**Why it matters:**
Without this check, an attacker who intercepts a valid callback (e.g., from server logs, a compromised proxy, or a man-in-the-middle) can replay it indefinitely. Each replay triggers another fulfillment — potentially granting free access or double-processing orders.

**Wrong implementation:**

```js
// WRONG — verifies signature but ignores timestamp
app.post('/api/portaly/callback', (req, res) => {
  const timestamp = req.header('x-portaly-timestamp') || '';
  const signature = req.header('x-portaly-signature') || '';

  // Signature check is good, but no timestamp validation
  const verified = verifyPortalyCallback({
    secret: process.env.PORTALY_CALLBACK_SECRET,
    timestamp,
    payload: req.body,
    signature,
  });

  if (!verified) {
    return res.status(401).json({ error: 'invalid signature' });
  }
  // ... process payment without checking if timestamp is stale
});
```

**Correct implementation:**

```js
// CORRECT — validates timestamp before signature check
app.post('/api/portaly/callback', (req, res) => {
  const timestamp = req.header('x-portaly-timestamp') || '';
  const signature = req.header('x-portaly-signature') || '';

  // Step 1: Reject stale callbacks (5-minute window)
  const callbackAge = Date.now() - new Date(timestamp).getTime();
  if (Number.isNaN(callbackAge) || callbackAge > 5 * 60 * 1000) {
    console.error('Portaly callback timestamp expired', { timestamp, ageMs: callbackAge });
    return res.status(401).json({ error: 'timestamp expired' });
  }

  // Step 2: Verify signature
  const verified = verifyPortalyCallback({
    secret: process.env.PORTALY_CALLBACK_SECRET,
    timestamp,
    payload: req.body,
    signature,
  });

  if (!verified) {
    return res.status(401).json({ error: 'invalid signature' });
  }
  // ... process payment
});
```

**Detection:**
In the callback handler, search for timestamp comparison logic (e.g., `Date.now()`, `new Date(timestamp)`, `5 * 60 * 1000`, `300000`). If absent, flag as WARNING.

---

## Industry-Standard Pitfalls

### Pitfall 6: Open Redirect via Redirect URLs (WEB-001)

**What goes wrong:**
`successRedirectUrl` and `cancelRedirectUrl` are passed through to the checkout session without server-side validation. An attacker can craft a malicious checkout URL that, after payment, redirects the buyer to a phishing page.

**Why it matters:**
The buyer trusts the payment flow because it started on a legitimate site. After successful payment, they land on what looks like a confirmation page but is actually an attacker-controlled site that harvests credentials or credit card details.

**Wrong implementation:**

```js
// WRONG — passes user-supplied URL directly without validation
app.post('/create-checkout', async (req, res) => {
  const { planId, successUrl, cancelUrl } = req.body;

  const session = await createCheckoutSession({
    planId,
    successRedirectUrl: successUrl,   // <-- no validation, accepts any URL
    cancelRedirectUrl: cancelUrl,     // <-- could be https://evil.com/phish
  });

  res.json({ checkoutUrl: session.checkoutUrl });
});
```

**Correct implementation:**

```js
// CORRECT — validates redirect URLs against allowlist
const ALLOWED_REDIRECT_HOSTS = [
  'myapp.com',
  'www.myapp.com',
  'staging.myapp.com',
];

function isAllowedRedirect(url) {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_REDIRECT_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

app.post('/create-checkout', async (req, res) => {
  const { planId, successUrl, cancelUrl } = req.body;

  if (!isAllowedRedirect(successUrl) || !isAllowedRedirect(cancelUrl)) {
    return res.status(400).json({ error: 'invalid redirect URL' });
  }

  const session = await createCheckoutSession({
    planId,
    successRedirectUrl: successUrl,
    cancelRedirectUrl: cancelUrl,
  });

  res.json({ checkoutUrl: session.checkoutUrl });
});
```

**Detection:**
Search for `successRedirectUrl` and `cancelRedirectUrl` in checkout session creation code. Check if the values are validated against a domain allowlist before being sent to Portaly's API.

---

### Pitfall 7: Dependency Vulnerabilities (DEP-001)

**What goes wrong:**
The project uses outdated versions of `crypto`, `express`, `next`, or other packages that have known CVEs (Common Vulnerabilities and Exposures).

**Why it matters:**
Known vulnerabilities are publicly documented with exploit code. Attackers scan for outdated packages and use automated tools to exploit them. A vulnerable `express` version could allow request smuggling; a vulnerable `node-forge` could break your HMAC implementation.

**Detection:**

Run:
```bash
npm audit --json 2>/dev/null || pnpm audit --json 2>/dev/null
```

Parse the JSON output. Flag any vulnerability with `severity: "critical"` or `severity: "high"`.

**Fix:**
```bash
# Review and apply security patches
npm audit fix

# For breaking changes, review manually
npm audit fix --force  # Use with caution

# For CI pipelines, add as a check
npm audit --audit-level=high
```

**Best practice:** Add `npm audit --audit-level=high` to your CI pipeline so vulnerabilities are caught before deployment.

---

### Pitfall 8: Sensitive Data in Logs (DATA-002)

**What goes wrong:**
The callback handler or payment flow logs the full request body, which includes customer PII (email, name), payment references, and potentially the callback secret if it's passed as a header.

**Why it matters:**
Logs are often stored in centralized systems (CloudWatch, Datadog, GCP Logging) with broader access than the production database. Developers, support staff, and monitoring tools can see them. Logging PII may violate privacy regulations (GDPR, Taiwan PDPA). Logging secrets enables credential theft from log archives.

**Wrong implementation:**

```js
// WRONG — logs the entire request body
app.post('/api/portaly/callback', (req, res) => {
  console.log('Received callback:', req.body);        // <-- full payload with PII
  console.log('Headers:', req.headers);                // <-- includes signature and timestamp
  // ...
});
```

**Correct implementation:**

```js
// CORRECT — logs only necessary identifiers, masks sensitive data
app.post('/api/portaly/callback', (req, res) => {
  console.log('Received callback', {
    sessionId: req.body?.sessionId,
    status: req.body?.status,
    event: req.body?.event,
    // Do NOT log: customerEmail, customerName, paymentReference, full headers
  });
  // ...
});
```

**Detection:**
Grep for `console.log`, `console.error`, `logger.info`, `logger.error` in callback handler files. Check if any log statement outputs `req.body`, `payload`, `req.headers`, or variables that contain the full callback payload.
