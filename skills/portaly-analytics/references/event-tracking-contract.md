# Portaly Event Tracking Contract

Standard event definitions for tracking Portaly-related user actions in Google Analytics 4.

## Portaly Custom Events

These are custom events specific to Portaly integrations. Use the `portaly_` prefix to distinguish them from GA4 built-in events.

### portaly_checkout_start

Fired when a checkout session is created (before redirecting to Portaly hosted checkout).

```ts
gtag('event', 'portaly_checkout_start', {
  plan_id: 'plan_abc123',
  plan_name: 'Premium Monthly',
  amount: 299,
  currency: 'TWD',
  billing_period: 'monthly',   // 'monthly' | 'yearly' | 'one-time'
  pricing_type: 'fixed',       // 'fixed' | 'dynamic'
  session_id: 'cs_xyz789',
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `plan_id` | string | Yes | Portaly plan ID |
| `plan_name` | string | No | Human-readable plan name |
| `amount` | number | Yes | Checkout amount (in smallest currency unit or main unit depending on setup) |
| `currency` | string | Yes | Currency code (e.g., `TWD`, `USD`) |
| `billing_period` | string | No | `monthly`, `yearly`, or `one-time` |
| `pricing_type` | string | No | `fixed` or `dynamic` |
| `session_id` | string | No | Portaly checkout session ID |

### portaly_checkout_complete

Fired when a payment callback confirms successful completion. Typically triggered server-side or on the success redirect page.

```ts
gtag('event', 'portaly_checkout_complete', {
  session_id: 'cs_xyz789',
  subscription_id: 'cs_xyz789',
  amount: 299,
  currency: 'TWD',
  payment_method: 'credit_card',
  plan_id: 'plan_abc123',
  plan_name: 'Premium Monthly',
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Portaly checkout session ID |
| `subscription_id` | string | No | Portaly subscription ID (same as session_id in current implementation) |
| `amount` | number | Yes | Payment amount |
| `currency` | string | Yes | Currency code |
| `payment_method` | string | No | Payment method used |
| `plan_id` | string | No | Portaly plan ID |
| `plan_name` | string | No | Human-readable plan name |

### portaly_subscription_cancel

Fired when a subscription is cancelled.

```ts
gtag('event', 'portaly_subscription_cancel', {
  subscription_id: 'cs_xyz789',
  plan_id: 'plan_abc123',
  reason: 'customer_requested',
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subscription_id` | string | Yes | Portaly subscription ID |
| `plan_id` | string | No | Portaly plan ID |
| `reason` | string | No | Cancellation reason |

### portaly_page_view

Fired when a Portaly-embedded or Portaly-powered page is viewed. Use this in addition to GA4's automatic page_view for more granular Portaly-specific tracking.

```ts
gtag('event', 'portaly_page_view', {
  page_type: 'creator_profile',   // 'creator_profile' | 'product_page' | 'subpage'
  creator_id: 'creator_abc',
  page_slug: 'my-creator-page',
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_type` | string | Yes | Type of Portaly page |
| `creator_id` | string | No | Creator's profile ID |
| `page_slug` | string | No | Page URL slug |

### portaly_product_view

Fired when a specific product page is viewed.

```ts
gtag('event', 'portaly_product_view', {
  product_id: 'prod_001',
  product_name: 'Digital Art Pack',
  price: 150,
  currency: 'TWD',
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `product_id` | string | Yes | Portaly product ID |
| `product_name` | string | No | Product name |
| `price` | number | No | Product price |
| `currency` | string | No | Currency code |

## GA4 Recommended Ecommerce Event Mapping

Map Portaly events to GA4's recommended ecommerce events to enable built-in ecommerce reports.

| Portaly Event | GA4 Ecommerce Event | When to use |
|---------------|---------------------|-------------|
| `portaly_product_view` | `view_item` | Product page viewed |
| `portaly_checkout_start` | `begin_checkout` | Checkout session created |
| `portaly_checkout_complete` | `purchase` | Payment confirmed |

### view_item (mapped from portaly_product_view)

```ts
gtag('event', 'view_item', {
  currency: 'TWD',
  value: 150,
  items: [{
    item_id: 'prod_001',
    item_name: 'Digital Art Pack',
    price: 150,
  }],
});
```

### begin_checkout (mapped from portaly_checkout_start)

```ts
gtag('event', 'begin_checkout', {
  currency: 'TWD',
  value: 299,
  items: [{
    item_id: 'plan_abc123',
    item_name: 'Premium Monthly',
    price: 299,
  }],
});
```

### purchase (mapped from portaly_checkout_complete)

```ts
gtag('event', 'purchase', {
  transaction_id: 'cs_xyz789',
  currency: 'TWD',
  value: 299,
  items: [{
    item_id: 'plan_abc123',
    item_name: 'Premium Monthly',
    price: 299,
    quantity: 1,
  }],
});
```

## Implementation Notes

- **Dual firing**: You can fire both the Portaly custom event and the GA4 ecommerce event for the same action. The custom event gives Portaly-specific parameters; the ecommerce event enables GA4's built-in reports.
- **Server-side events**: `portaly_checkout_complete` is typically triggered by a server-side callback. You can either:
  1. Fire the event client-side on the success redirect page
  2. Use GA4 Measurement Protocol for server-side event sending (requires `api_secret` from GA4 Admin → Data Streams → Measurement Protocol API secrets)
- **Currency**: Always use the 3-letter ISO 4217 currency code (e.g., `TWD`, `USD`, `JPY`).
- **Value**: Use the same unit as your Portaly plan amount configuration.
