# Attribution: capturing the referral code

The referral link points at the creator's own site, so Portaly never sees the click. Remembering who referred the buyer is the one job that belongs in the creator's codebase.

## The contract

| | |
|---|---|
| URL parameter | `?ps=<code>` |
| Cookie name | `portaly:profitSharing` |
| Lifetime | 3 days |
| Attributes | `sameSite: 'Lax'`, `path: '/'`, `httpOnly`, `secure` on an https origin only |
| Repeat visits | last one wins; the 3 days restart |
| Same parameter twice in one URL | discard entirely, write nothing |
| Malformed value | ignore |

The name, the parameter, the 3 days and last-touch all match how portaly.cc counts referrals on its own store, so the creator's numbers and Portaly's agree. The repeated-parameter row is deliberately stricter than portaly.cc, which takes the first value; discarding both is the safer read and the case is vanishingly rare, but do not describe the two as identical if someone asks.

**Explain last-touch to the creator in their words**, not as a policy: *"whoever's link they clicked most recently gets the commission, and it stops counting after 3 days."* Someone will ask.

## Next.js (App Router) — preferred

`httpOnly` is what makes the value un-forgeable from the browser, and middleware is the shortest path to it — but it is reachable on every stack, including the ones below.

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

  // Follow the request's own scheme, not NODE_ENV: a production build served
  // over plain http (a LAN box, an http staging deploy) would set `Secure`, the
  // browser would discard the cookie without a word, and the symptom is
  // identical to attribution simply not working.
  const isHttps =
    req.nextUrl.protocol === 'https:' ||
    req.headers.get('x-forwarded-proto') === 'https'

  const res = NextResponse.redirect(url, 307)
  res.cookies.set(COOKIE, values[0], {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
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

## SPA or static site — no server rendering

There is still a server in this stack; there has to be. The API key cannot ship to the browser, so only a server can create the checkout session. If the project currently links straight to a checkout URL it needs one small backend endpoint (a serverless function is enough) — say so plainly, because without it the key would be readable in the page source and anyone could use it.

**Capture the code on that server too, not in the page.** Every static and SPA host has a hook that runs before the document is served — Vercel or Netlify edge middleware, a Cloudflare Worker, a function mounted on the landing route. Apply the same logic as the middleware above and return the cookie as a header:

```
Set-Cookie: portaly:profitSharing=<code>; Max-Age=259200; Path=/; HttpOnly; SameSite=Lax; Secure
```

Omit `Secure` when the origin is plain `http` — a LAN address or an untrusted staging box during development. A browser silently discards a `Secure` cookie on an insecure origin, and the symptom is indistinguishable from attribution simply not working.

The checkout endpoint then reads that cookie from the incoming request headers — **not** from a JSON body the page sends.

### Last resort: capturing in the page

Only if the landing page genuinely cannot run any server-side hook. Ship it knowing what it costs, and tell the creator:

```ts
// src/lib/attribution.ts — call once at app start
const PARAM = 'ps'
const COOKIE = 'portaly:profitSharing'
const VALID = /^[A-Za-z0-9_-]{4,64}$/

export function captureReferral() {
  const values = new URLSearchParams(location.search).getAll(PARAM)
  if (values.length !== 1 || !VALID.test(values[0])) return

  const expires = new Date(Date.now() + 3 * 864e5).toUTCString()
  // Secure is fatal on an http origin — the browser drops the cookie silently
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${COOKIE}=${values[0]}; expires=${expires}; path=/; SameSite=Lax${secure}`

  // Strip the parameter, as the middleware does. Left in the address bar it
  // rides along into whatever the visitor copies, shares or bookmarks, and
  // last-touch then credits this promoter for every buyer who follows that URL.
  const url = new URL(location.href)
  url.searchParams.delete(PARAM)
  history.replaceState(null, '', url)
}
```

**A cookie the page can write is a cookie the buyer can write.** Portaly checks that a referral code belongs to this plan and this merchant, but never that the buyer actually clicked it — so on this path a buyer can paste any code into the console, including one they minted themselves, and the sale follows it. Self-referral and taking another promoter's credit both work. That is the hole guardrail 5 exists to close, and the reason the server hook above is worth one extra endpoint. This path also strips the parameter a beat later than the middleware does — the code is in the address bar until the page's JavaScript has run, so a visitor who copies the URL out of the bar immediately can still propagate it. If the creator accepts the trade-off anyway, make sure they are accepting it knowingly rather than inheriting it from a code sample.

## Edge cases worth knowing

- **Subdomains.** A link landing on `www.example.com` while the creator's own session-creating endpoint runs on `shop.example.com` loses the cookie. Set `domain: '.example.com'` on both sides, or keep the referral link on the same host as that endpoint. (This is about the creator's own hosts. Portaly's hosted checkout page is on `portaly.ai` and never sees this cookie — it does not need to.)
- **Safari / ITP.** A cookie written by `document.cookie` (the last-resort path) can be capped well below 3 days. Server-set cookies are not affected — one more reason the capture belongs on the server even when there is no server rendering.
- **Ad and privacy blockers** may strip unfamiliar query parameters. Nothing to do about it; it makes attribution best-effort, which is why an unattributed sale must never be blocked.
- **Preview and staging environments** share cookies with production if they sit on the same domain. Use a distinct host for staging.
- **Do not** copy portaly.cc's three-source priority table (`portalyAds` > `profitSharing` > `affiliate`). That exists because portaly.cc hosts several referral programs on one domain. The creator's site has exactly one, so last-write-wins is the whole rule.
