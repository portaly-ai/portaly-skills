# GA4 Setup Guide

Framework-specific instructions for installing Google Analytics 4 (gtag.js) in web applications.

## Prerequisites

- GA4 Measurement ID (`G-XXXXXXX`) from Google Analytics admin
- Environment variable: `NEXT_PUBLIC_GA_MEASUREMENT_ID` (or equivalent for your framework)

## Next.js App Router (v13+)

### 1. Add gtag.js script in root layout

```tsx
// app/layout.tsx
import Script from 'next/script';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### 2. Create gtag helper

```ts
// lib/gtag.ts
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const pageview = (url: string) => {
  if (typeof window.gtag === 'function') {
    window.gtag('config', GA_MEASUREMENT_ID!, {
      page_path: url,
    });
  }
};

export const event = (action: string, params: Record<string, any>) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', action, params);
  }
};
```

### 3. Track route changes

```tsx
// app/providers.tsx (or in layout.tsx)
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { pageview } from '@/lib/gtag';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      pageview(pathname + (searchParams?.toString() ? `?${searchParams}` : ''));
    }
  }, [pathname, searchParams]);

  return <>{children}</>;
}
```

## Next.js Pages Router

### 1. Add gtag.js script in _app.js

```jsx
// pages/_app.js
import Script from 'next/script';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import * as gtag from '../lib/gtag';

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    const handleRouteChange = (url) => {
      gtag.pageview(url);
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  return (
    <>
      {gtag.GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gtag.GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gtag.GA_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      )}
      <Component {...pageProps} />
    </>
  );
}
```

### 2. Create gtag helper

Same as App Router version — see `lib/gtag.ts` above.

## React SPA (Create React App / Vite)

### 1. Add gtag.js to index.html

```html
<!-- public/index.html (CRA) or index.html (Vite) -->
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXX');
  </script>
</head>
```

Replace `G-XXXXXXX` with the actual Measurement ID. For Vite, use `import.meta.env.VITE_GA_MEASUREMENT_ID`.

### 2. Track SPA route changes

```tsx
// src/hooks/usePageTracking.ts
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('config', 'G-XXXXXXX', {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);
}
```

## Vanilla HTML

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXX');
  </script>
</head>
<body>
  <!-- Your content -->
</body>
</html>
```

## TypeScript Type Declaration

If using TypeScript, add gtag type declaration:

```ts
// types/gtag.d.ts
interface Window {
  gtag: (
    command: 'config' | 'event' | 'js' | 'set',
    targetId: string | Date,
    config?: Record<string, any>
  ) => void;
  dataLayer: Array<any>;
}
```

## Environment Variables

| Variable | Framework | Description |
|----------|-----------|-------------|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Next.js | GA4 Measurement ID (`G-XXXXXXX`) |
| `VITE_GA_MEASUREMENT_ID` | Vite | GA4 Measurement ID |
| `REACT_APP_GA_MEASUREMENT_ID` | CRA | GA4 Measurement ID |

## Verification

After installation, verify tracking works:

1. Open the website in a browser
2. Open Google Analytics → Reports → Realtime
3. You should see your visit in the active users count
4. Navigate between pages to verify pageview tracking
5. Trigger a custom event and check it appears in Realtime → Event count
