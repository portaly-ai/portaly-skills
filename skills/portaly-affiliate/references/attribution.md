# Attribution: capturing the referral code

The referral link points at the creator's own site, so Portaly never sees the click. Remembering who referred the buyer is the one job that belongs in the creator's codebase.

## The contract

| | |
|---|---|
| URL parameter | `?ps=<code>` |
| Cookie name | `portaly:profitSharing` |
| Lifetime | 3 days |
| Attributes | `sameSite: 'Lax'`, `path: '/'`, `secure` in production, `httpOnly` wherever the stack allows |
| Repeat visits | last one wins; the 3 days restart |
| Same parameter twice in one URL | discard entirely, write nothing |
| Malformed value | ignore |

These values mirror how portaly.cc counts referrals on its own store, so the creator's numbers and Portaly's agree.

**Explain last-touch to the creator in their words**, not as a policy: *"whoever's link they clicked most recently gets the commission, and it stops counting after 3 days."* Someone will ask.

## Next.js (App Router) — preferred

`httpOnly` is available here, which is what makes the value un-forgeable from the browser.

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server'

const PARAM = 'ps'
const COOKIE = 'portaly:profitSharing'
const THREE_DAYS = 60 * 60 * 24 * 3
const VALID = /^[A-Za-z0-9_-]{4,64}$/

export function middleware(req: NextRequest) {
  const values = req.nextUrl.searchParams.getAll(PARAM)
  // Two values means a hand-edited or stitched-together URL — take neither.
  if (values.length !== 1 || !VALID.test(values[0])) return NextResponse.next()

  const url = req.nextUrl.clone()
  // Drop the parameter before rendering so the code isn't carried into
  // whatever the visitor shares, bookmarks or pastes next.
  url.searchParams.delete(PARAM)

  const res = NextResponse.redirect(url, 307)
  res.cookies.set(COOKIE, values[0], {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: THREE_DAYS,
  })
  return res
}

export const config = { matcher: ['/((?!_next|api|.*\\..*).*)'] }
```

Read it back where the checkout session is created:

```ts
import { cookies } from 'next/headers'

const ps = (await cookies()).get('portaly:profitSharing')?.value
```

## Single-page app with no server rendering

The capture can only run in the browser, so the cookie cannot be `httpOnly`. That is acceptable — the referral code is public by design, it travels in a URL people share. What is **not** acceptable is letting the browser choose which code reaches Portaly.

```ts
// src/lib/attribution.ts — call once at app start
const PARAM = 'ps'
const COOKIE = 'portaly:profitSharing'
const VALID = /^[A-Za-z0-9_-]{4,64}$/

export function captureReferral() {
  const values = new URLSearchParams(location.search).getAll(PARAM)
  if (values.length !== 1 || !VALID.test(values[0])) return

  const expires = new Date(Date.now() + 3 * 864e5).toUTCString()
  document.cookie = `${COOKIE}=${values[0]}; expires=${expires}; path=/; SameSite=Lax; Secure`
}
```

**The checkout session must still be created by a server** — the API key cannot ship to the browser. If the project currently links straight to a checkout URL, it needs one small backend endpoint (a serverless function is enough). Say so plainly: without it, the API key would be readable in the page source and anyone could use it.

That endpoint reads the cookie from the incoming request headers — **not** from a JSON body the page sends.

## Static site

Same as the SPA case: a short inline script in the shared layout `<head>`, plus a serverless function for checkout. There is no version of this that works with no server at all.

## Edge cases worth knowing

- **Subdomains.** A link landing on `www.example.com` while checkout runs on `shop.example.com` loses the cookie. Set `domain: '.example.com'` on both sides, or keep the referral link on the same host as checkout.
- **Safari / ITP.** Browser-set cookies (the SPA and static paths) can be capped well below 3 days. Server-set cookies are not affected, which is another reason to prefer the middleware version.
- **Ad and privacy blockers** may strip unfamiliar query parameters. Nothing to do about it; it makes attribution best-effort, which is why an unattributed sale must never be blocked.
- **Preview and staging environments** share cookies with production if they sit on the same domain. Use a distinct host for staging.
- **Do not** copy portaly.cc's three-source priority table (`portalyAds` > `profitSharing` > `affiliate`). That exists because portaly.cc hosts several referral programs on one domain. The creator's site has exactly one, so last-write-wins is the whole rule.
