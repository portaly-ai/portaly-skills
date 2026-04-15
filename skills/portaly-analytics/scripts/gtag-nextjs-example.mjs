/**
 * gtag-nextjs-example.mjs
 *
 * Reference implementation for installing Google Analytics 4 (gtag.js)
 * in a Next.js application.
 *
 * This file demonstrates the gtag helper functions. For the full Next.js
 * integration (Script component, route change tracking), see:
 * references/ga4-setup-guide.md
 *
 * Usage:
 *   Copy the relevant functions into your project's lib/gtag.ts
 */

// ---------------------------------------------------------------------------
// Environment variable
// ---------------------------------------------------------------------------

/**
 * GA4 Measurement ID from environment.
 * Set NEXT_PUBLIC_GA_MEASUREMENT_ID in your .env file.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Track a page view.
 * Call this on route changes in your Next.js app.
 *
 * @param {string} url - The page URL path (e.g., '/about', '/products/123')
 */
export const pageview = (url) => {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: url,
    });
  }
};

/**
 * Track a custom event.
 *
 * @param {string} action   - Event name (e.g., 'portaly_checkout_start')
 * @param {object} params   - Event parameters
 *
 * @example
 *   event('portaly_checkout_start', {
 *     plan_id: 'plan_abc123',
 *     amount: 299,
 *     currency: 'TWD',
 *   });
 */
export const event = (action, params = {}) => {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', action, params);
  }
};

// ---------------------------------------------------------------------------
// Next.js App Router integration example
// ---------------------------------------------------------------------------

/**
 * Example: Root layout with gtag.js Script tags.
 *
 * // app/layout.tsx
 * import Script from 'next/script';
 * import { GA_MEASUREMENT_ID } from '@/lib/gtag';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <head>
 *         {GA_MEASUREMENT_ID && (
 *           <>
 *             <Script
 *               src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
 *               strategy="afterInteractive"
 *             />
 *             <Script id="gtag-init" strategy="afterInteractive">
 *               {`
 *                 window.dataLayer = window.dataLayer || [];
 *                 function gtag(){dataLayer.push(arguments);}
 *                 gtag('js', new Date());
 *                 gtag('config', '${GA_MEASUREMENT_ID}');
 *               `}
 *             </Script>
 *           </>
 *         )}
 *       </head>
 *       <body>{children}</body>
 *     </html>
 *   );
 * }
 */

// ---------------------------------------------------------------------------
// Route change tracking example (App Router)
// ---------------------------------------------------------------------------

/**
 * Example: Client component that tracks route changes.
 *
 * // app/providers.tsx
 * 'use client';
 * import { usePathname, useSearchParams } from 'next/navigation';
 * import { useEffect } from 'react';
 * import { pageview } from '@/lib/gtag';
 *
 * export function AnalyticsProvider({ children }) {
 *   const pathname = usePathname();
 *   const searchParams = useSearchParams();
 *
 *   useEffect(() => {
 *     if (pathname) {
 *       pageview(pathname + (searchParams?.toString() ? `?${searchParams}` : ''));
 *     }
 *   }, [pathname, searchParams]);
 *
 *   return <>{children}</>;
 * }
 */
