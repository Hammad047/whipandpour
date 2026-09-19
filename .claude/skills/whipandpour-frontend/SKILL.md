---
name: whipandpour-frontend
description: Frontend conventions for Whip&Pour — wouter routing, tRPC data fetching, cart context, Tailwind v4 brand tokens, and responsive rules. Load when editing anything under whipandpour_project/frontend/src.
---

# Whip & Pour — Frontend Conventions

## Routing is wouter, not React Router

```tsx
import { useLocation, Route, Switch } from 'wouter';
const [location, navigate] = useLocation();
navigate('/shop?category=cupcake');
```

- `location` is the **pathname only** — query strings are *not* included.
  To read params use `window.location.search`, and re-read it on `location`
  change. Parsing `location.split('?')[1]` returns `undefined` and silently
  drops the filter — this bug shipped in `Shop.tsx`.
- Route params arrive as a `params` prop: `<Route path="/product/:slug" component={ProductDetail} />`.
- Register new routes in `src/App.tsx`, above the catch-all `<Route component={NotFound} />`.

## Data fetching

All server data goes through `trpc` from `@/lib/trpc`:

```tsx
const { data: products = [], isLoading } = trpc.products.list.useQuery({ limit: 100, offset: 0 });
const utils = trpc.useUtils();
const create = trpc.admin.products.create.useMutation({
  onSuccess: () => { utils.admin.products.list.invalidate(); utils.products.list.invalidate(); },
});
```

**Always invalidate after a mutation.** Without it the list keeps serving the
stale cache and the change appears to vanish on navigation.

The router is untyped (`AppRouter = any`), so procedure-name typos are runtime
errors. Double-check names against `dispatch_procedure()` in `main.py`.

## Numbers from the API are strings

```tsx
const price = parseFloat(String(product.price ?? 0));       // correct
const rating = parseFloat(String(product.averageRating ?? 0));
```
Never `typeof product.price === 'number' ? … : 0` — it always takes the else branch.

## Cart

`useCart()` from `@/contexts/CartContext`. Items are persisted to
`localStorage['whipandpour_cart']`. `addItem` needs a `nanoid()` line id;
items are deduped by `productId + size`.

## Brand tokens (use these exact values)

| Token | Hex | Use |
|---|---|---|
| Gold | `#C9A84C` | primary actions, prices, accents |
| Rose | `#D4A5A5` | hover, badges, secondary accent |
| Ink | `#2C2C2C` | headings, body text, button text on gold |
| Cream | `#FAF7F2` | page background |
| Border | `#E8DDD0` | card and divider borders |
| Muted | `#7A7066` | secondary text |

Headings use `style={{ fontFamily: "'Playfair Display', serif" }}`.
Cards: `rounded-xl border border-[#E8DDD0] bg-white`.
Currency is **PKR** — format as `PKR {n.toLocaleString()}`. Do not use `$`.

## Responsive

Mobile-first Tailwind. Grids follow
`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. The navbar has a separate mobile
drawer — **any nav change must be made in both the desktop and mobile blocks
of `Navbar.tsx`**. Tables need a `overflow-x-auto` wrapper.
