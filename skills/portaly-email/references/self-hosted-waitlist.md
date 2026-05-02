# Mode B — Self-hosted Waitlist Page

Implement `/waitlist/[creatorSlug]` on your own domain so invitation-email clicks land in your product instead of on Portaly's hosted page.

## Contract

Portaly redirects from `https://portaly.ai/r/{code}` → `https://{your-domain}/waitlist/{creatorSlug}` with these query params attached:

| Param | Required to forward? | Source |
|---|---|---|
| `ref` | **Yes** | Recipient's referral code |
| `utm_source` | **Yes** | Always `invitation` |
| `utm_campaign` | If present | Campaign id |
| `utm_content` | If present | Outbox id (per-recipient identifier) |

When the user submits the form, **POST `ref` and `utm_content` back to Portaly** so attribution is preserved:

```
POST https://portaly.ai/api/waitlist/{creatorSlug}
Content-Type: application/json

{
  "email": "follower@example.com",
  "name": "Optional Display Name",
  "source": "creator-app-hero",   // optional, your own tag
  "ref": "<the ref param from the URL>",
  "outboxId": "<the utm_content param from the URL>"
}
```

`outboxId` is the per-recipient identifier; without it, modern campaigns (which share one campaign-level refcode across every recipient) can't pin the signup to a specific row, and the `signedUp` funnel stage in `vibe_get_campaign_analytics` stays at 0 for that signup.

Response:

```json
{
  "data": {
    "joined": true,
    "alreadyOnList": false,
    "creator": { "slug": "jane-creator", "merchantName": "Jane's Studio" }
  }
}
```

Rate limits (server-enforced — show a "try again shortly" message on `429`):
- 5 / hour per IP per creator
- 200 / hour per creator

## Reading the Creator Display Info

Use this to render the headline (`Join {merchantName}'s waitlist`) and the signup count:

```
GET https://portaly.ai/api/waitlist/{creatorSlug}

→ {
  "data": {
    "creator": { "slug": "jane-creator", "merchantName": "Jane's Studio" },
    "count": 142
  }
}
```

This endpoint is public; cache the response for ~60 seconds in your edge / CDN if you have heavy traffic.

---

## Next.js App Router

`app/waitlist/[creatorSlug]/page.tsx` (server component for the headline, client component for the form):

```tsx
import { notFound } from 'next/navigation'
import WaitlistForm from './WaitlistForm'

type Props = {
  params: Promise<{ creatorSlug: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

const PORTALY_API_HOST =
  process.env.NEXT_PUBLIC_PORTALY_API_HOST ?? 'https://portaly.ai'

export default async function WaitlistPage({ params, searchParams }: Props) {
  const { creatorSlug } = await params
  const sp = await searchParams

  const res = await fetch(
    `${PORTALY_API_HOST}/api/waitlist/${encodeURIComponent(creatorSlug)}`,
    { next: { revalidate: 60 } }
  )
  if (!res.ok) notFound()
  const { data } = await res.json()

  return (
    <main className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-3xl font-bold">
        Join {data.creator.merchantName}&apos;s waitlist
      </h1>
      {data.count > 0 && (
        <p className="mt-2 text-sm text-gray-500">
          {data.count} people have already joined
        </p>
      )}
      <WaitlistForm
        creatorSlug={data.creator.slug}
        ref={sp.ref ?? null}
        utm={{
          source: sp.utm_source,
          campaign: sp.utm_campaign,
          content: sp.utm_content,
        }}
      />
    </main>
  )
}
```

`app/waitlist/[creatorSlug]/WaitlistForm.tsx`:

```tsx
'use client'

import { useState } from 'react'

type Props = {
  creatorSlug: string
  ref: string | null
  utm: { source?: string; campaign?: string; content?: string }
}

const PORTALY_API_HOST =
  process.env.NEXT_PUBLIC_PORTALY_API_HOST ?? 'https://portaly.ai'

export default function WaitlistForm({ creatorSlug, ref, utm }: Props) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>(
    'idle'
  )
  const [errorMessage, setErrorMessage] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    try {
      const res = await fetch(
        `${PORTALY_API_HOST}/api/waitlist/${encodeURIComponent(creatorSlug)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            name: name || undefined,
            ref: ref || undefined,
            outboxId: utm.content || undefined,
            source: 'self-hosted',
          }),
        }
      )
      if (res.status === 429) {
        setStatus('error')
        setErrorMessage('Too many signups from this network. Try again shortly.')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus('done')
      // Optional: fire-and-forget user sync to Portaly Dashboard.
      // import { syncToPortaly } from '@/lib/portaly-user-sync'
      // syncToPortaly([{ email, name }]).catch(console.error)
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  if (status === 'done') {
    return <p className="mt-8">You&apos;re on the list — check your email.</p>
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded border px-3 py-2"
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name (optional)"
        className="w-full rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
      >
        {status === 'submitting' ? 'Joining…' : 'Join waitlist'}
      </button>
      {status === 'error' && (
        <p className="text-sm text-red-500">{errorMessage}</p>
      )}
    </form>
  )
}
```

## React SPA + react-router

```tsx
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

const PORTALY_API_HOST = 'https://portaly.ai'

export function WaitlistPage() {
  const { creatorSlug = '' } = useParams()
  const [search] = useSearchParams()
  const [creator, setCreator] = useState<{
    slug: string
    merchantName: string
  } | null>(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    fetch(`${PORTALY_API_HOST}/api/waitlist/${encodeURIComponent(creatorSlug)}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setCreator(data.creator)
        setCount(data.count)
      })
  }, [creatorSlug])

  if (!creator) return <p>Loading…</p>

  return (
    <main>
      <h1>Join {creator.merchantName}&apos;s waitlist</h1>
      <p>{count} people have already joined</p>
      {/* form analogous to the Next.js example, posting back with
          search.get('ref') etc. */}
    </main>
  )
}
```

Add the route: `<Route path="/waitlist/:creatorSlug" element={<WaitlistPage />} />`.

## Plain HTML

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Join the waitlist</title>
  </head>
  <body>
    <h1 id="headline">Join the waitlist</h1>
    <form id="waitlist-form">
      <input type="email" name="email" required placeholder="you@example.com" />
      <button type="submit">Join</button>
    </form>
    <script>
      const slug = location.pathname.split('/').pop()
      const search = new URLSearchParams(location.search)

      fetch(`https://portaly.ai/api/waitlist/${slug}`)
        .then((r) => r.json())
        .then(({ data }) => {
          document.getElementById('headline').textContent =
            `Join ${data.creator.merchantName}'s waitlist`
        })

      document.getElementById('waitlist-form').addEventListener('submit', (e) => {
        e.preventDefault()
        const email = e.target.email.value
        fetch(`https://portaly.ai/api/waitlist/${slug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            ref: search.get('ref') || undefined,
            outboxId: search.get('utm_content') || undefined,
          }),
        }).then(() => {
          document.body.innerHTML = '<p>You\'re on the list — check your email.</p>'
        })
      })
    </script>
  </body>
</html>
```

## Wiring to Portaly User Sync

After a successful POST, fire-and-forget a sync so the new follower also appears in the creator's user list (not just the waitlist):

```ts
// fire-and-forget — never block the success message on this
syncToPortaly([{ email, name, status: 'active' }]).catch((err) =>
  console.error('[Portaly Sync]', err)
)
```

`syncToPortaly` lives in your codebase if you've already integrated `portaly-user`. If not, install that skill (`npx skills add portaly-ai/portaly-skills --skill portaly-user`) and follow its Step 4 to generate the helper.

## Common Mistakes

- **Using `http://` for `appBaseUrl`** — Portaly rejects with 400 at `PUT /api/creator-subscription/config`. Always HTTPS.
- **Forgetting to forward `ref` and `outboxId`** on the form POST — the campaign click is logged but the signup can't be pinned to a specific recipient, so the `signedUp` funnel stage stays at 0 for that signup. `outboxId` (= URL `utm_content`) is what does the per-recipient pinning.
- **Putting `appBaseUrl` behind authentication** — the page must be publicly reachable. Anyone with a valid invitation link can land on it.
- **Renaming the path** — Portaly's redirect uses the literal `/waitlist/{slug}`. Aliasing to `/signup/{slug}` produces 404s.
- **Calling `POST /api/waitlist` with the API key** — that endpoint is public, no key required. Including the key works, but exposes a key in client-side code if you forget to remove it later.
