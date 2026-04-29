# Mode A — Hosted CTA

Use Portaly's hosted waitlist page. Zero server-side code in the vibe coder's app.

## CTA URL Template

```
https://portaly.ai/waitlist/{creatorSlug}
```

`creatorSlug` is the public-facing slug for the creator's profile. Get it from `GET /api/creator-subscription/config` or the Portaly Vibe Dashboard.

## Placement Examples

### HTML button

```html
<a
  href="https://portaly.ai/waitlist/jane-creator"
  class="btn btn-primary"
  rel="noopener noreferrer"
>
  Join Jane's waitlist
</a>
```

### React component

```tsx
type WaitlistCtaProps = {
  creatorSlug: string
  merchantName: string
}

export const WaitlistCta = ({ creatorSlug, merchantName }: WaitlistCtaProps) => (
  <a
    href={`https://portaly.ai/waitlist/${creatorSlug}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-block rounded-md bg-black px-6 py-3 text-white"
  >
    Join {merchantName}'s waitlist
  </a>
)
```

### Next.js Server Component link

```tsx
import Link from 'next/link'

export default function CreatorHero({ creatorSlug }: { creatorSlug: string }) {
  return (
    <Link
      href={`https://portaly.ai/waitlist/${creatorSlug}`}
      className="rounded bg-amber-500 px-5 py-2"
    >
      Get early access
    </Link>
  )
}
```

## Adding Your Own Attribution (Optional)

Append your own UTM params for marketing analytics — Portaly preserves all unrecognized query params and forwards them to the form submission:

```
https://portaly.ai/waitlist/jane-creator?utm_source=hero&utm_medium=button&utm_campaign=spring2026
```

Portaly's invitation-email flow uses `?utm_source=invitation` already; pick anything else for your own placements so the two streams don't collide in the creator's dashboard.

## What You Don't Need

- No backend route
- No form handling code
- No webhook
- No API key in the embed (the page uses public endpoints)

## When to Switch to Mode B

- You want to match the creator's brand colors / typography
- You want to capture additional fields beyond email + name
- You want to fire your own analytics events on the signup
- You want post-signup redirect to a specific page in your product

See `self-hosted-waitlist.md` for the migration path.
