/**
 * track-portaly-events.mjs
 *
 * Reference implementation for tracking Portaly-specific events in GA4.
 * Copy these functions into your project and call them at the appropriate points.
 *
 * Prerequisites:
 *   - gtag.js is installed and configured (see gtag-nextjs-example.mjs)
 *   - Portaly payment skill is integrated (for checkout/subscription events)
 */

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const sendEvent = (eventName, params) => {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
};

// ---------------------------------------------------------------------------
// Portaly custom events
// ---------------------------------------------------------------------------

/**
 * Track when a checkout session is created.
 * Call this right before redirecting to the Portaly hosted checkout.
 *
 * @param {object} options
 * @param {string} options.planId        - Portaly plan ID
 * @param {string} [options.planName]    - Human-readable plan name
 * @param {number} options.amount        - Checkout amount
 * @param {string} options.currency      - Currency code (e.g., 'TWD')
 * @param {string} [options.billingPeriod] - 'monthly' | 'yearly' | 'one-time'
 * @param {string} [options.sessionId]   - Portaly checkout session ID
 */
export function trackCheckoutStart({ planId, planName, amount, currency, billingPeriod, sessionId }) {
  // Portaly custom event
  sendEvent('portaly_checkout_start', {
    plan_id: planId,
    plan_name: planName,
    amount,
    currency,
    billing_period: billingPeriod,
    session_id: sessionId,
  });

  // GA4 recommended ecommerce event
  sendEvent('begin_checkout', {
    currency,
    value: amount,
    items: [{
      item_id: planId,
      item_name: planName,
      price: amount,
      quantity: 1,
    }],
  });
}

/**
 * Track when a payment is confirmed.
 * Call this on the success redirect page or after verifying the callback.
 *
 * @param {object} options
 * @param {string} options.sessionId       - Portaly checkout session ID
 * @param {number} options.amount          - Payment amount
 * @param {string} options.currency        - Currency code
 * @param {string} [options.paymentMethod] - Payment method used
 * @param {string} [options.planId]        - Portaly plan ID
 * @param {string} [options.planName]      - Human-readable plan name
 */
export function trackCheckoutComplete({ sessionId, amount, currency, paymentMethod, planId, planName }) {
  // Portaly custom event
  sendEvent('portaly_checkout_complete', {
    session_id: sessionId,
    subscription_id: sessionId, // current Portaly contract: subscriptionId === sessionId
    amount,
    currency,
    payment_method: paymentMethod,
    plan_id: planId,
    plan_name: planName,
  });

  // GA4 recommended ecommerce event
  sendEvent('purchase', {
    transaction_id: sessionId,
    currency,
    value: amount,
    items: [{
      item_id: planId,
      item_name: planName,
      price: amount,
      quantity: 1,
    }],
  });
}

/**
 * Track when a subscription is cancelled.
 *
 * @param {object} options
 * @param {string} options.subscriptionId - Portaly subscription ID
 * @param {string} [options.planId]       - Portaly plan ID
 * @param {string} [options.reason]       - Cancellation reason
 */
export function trackSubscriptionCancel({ subscriptionId, planId, reason }) {
  sendEvent('portaly_subscription_cancel', {
    subscription_id: subscriptionId,
    plan_id: planId,
    reason,
  });
}

/**
 * Track when a Portaly page is viewed.
 *
 * @param {object} options
 * @param {string} options.pageType    - 'creator_profile' | 'product_page' | 'subpage'
 * @param {string} [options.creatorId] - Creator's profile ID
 * @param {string} [options.pageSlug]  - Page URL slug
 */
export function trackPortalyPageView({ pageType, creatorId, pageSlug }) {
  sendEvent('portaly_page_view', {
    page_type: pageType,
    creator_id: creatorId,
    page_slug: pageSlug,
  });
}

/**
 * Track when a product page is viewed.
 *
 * @param {object} options
 * @param {string} options.productId     - Portaly product ID
 * @param {string} [options.productName] - Product name
 * @param {number} [options.price]       - Product price
 * @param {string} [options.currency]    - Currency code
 */
export function trackProductView({ productId, productName, price, currency }) {
  // Portaly custom event
  sendEvent('portaly_product_view', {
    product_id: productId,
    product_name: productName,
    price,
    currency,
  });

  // GA4 recommended ecommerce event
  if (price && currency) {
    sendEvent('view_item', {
      currency,
      value: price,
      items: [{
        item_id: productId,
        item_name: productName,
        price,
      }],
    });
  }
}
