# Whip & Pour — Project Reference

Primary development reference for the Whip & Pour e-commerce site. Everything
below is derived from reading the actual code, not from assumptions.

- **Repo root:** `/home/hammad/PycharmProjects/whipandpour_project_website_our`
- **Application root:** `whipandpour_project/`
- **Live deployment referenced by the owner:** `https://whippourpy-3ck7wmbv.manus.space`
- **Local URLs:** `http://localhost:5173` (dev) · `http://localhost:8000` (API + built app)

> **Audit date:** 2026-08-26. Sections marked *(pre-change)* describe the state
> of the code before the August 2026 feature work; see
> [Change Log](#change-log) at the end for what was modified.

---

## 1. Architecture

| Concern | Technology | Notes |
|---|---|---|
| Frontend framework | React 19 + TypeScript, Vite 6 | SPA, client-side rendered |
| Styling | Tailwind CSS v4 + shadcn/ui + Radix primitives | `@import "tailwindcss"`, `@theme inline` tokens |
| Routing | **wouter** 3 | Not React Router — different API |
| Server state | TanStack Query v5 through `@trpc/react-query` | cache + invalidation |
| Client state | React Context | `CartContext`, `AdminContext`, `ThemeContext` |
| Backend framework | FastAPI (Python 3.11) | `backend/main.py` |
| API style | Hand-rolled **tRPC-compatible HTTP batch** | one FastAPI route serves all procedures |
| Serialization | superjson envelope (`{"json": …}`) | matched manually on the Python side |
| ORM | SQLAlchemy 2.x | declarative models |
| Database | SQLite, file `backend/whipandpour.db` | created and seeded on startup |
| Migrations | **None** — `Base.metadata.create_all()` only | schema changes need manual intervention |
| Auth (customer) | Server-side session + `app_session_id` cookie | in-memory session store |
| Auth (admin) | Database `role='admin'` + session cookie | *(was client-side localStorage pre-change)* |
| Payments | Stripe SDK wired for Checkout Sessions | no webhook; Easypaisa/JazzCash not integrated |
| Build | `tsc --noEmit && vite build` → `frontend/dist` | FastAPI serves `dist` when present |

### The tRPC bridge

There is **no Node.js server**. The original project used Node + tRPC + Express;
that server was replaced by Python, and the frontend was left untouched. The
Python backend therefore re-implements the tRPC HTTP batch wire protocol by hand
so `@trpc/client` works unmodified.

A single FastAPI route handles every procedure:

```python
@app.api_route("/api/trpc/{procedures}", methods=["GET", "POST"])
```

- `GET  /api/trpc/<proc>?batch=1&input={"0":{...}}` — queries
- `POST /api/trpc/<a>,<b>?batch=1` with JSON body `{"0":…,"1":…}` — mutations and batched queries

Responses are always a JSON **array**, one entry per procedure, in request order:

```jsonc
[{ "result": { "data": { "json": <value> } } }]
[{ "error":  { "json": { "message": "...", "code": -32001,
                         "data": { "code": "UNAUTHORIZED", "httpStatus": 401 } } } }]
```

**Consequence:** a failed procedure still returns HTTP 200. Any client or test
that only checks the status code will not notice the error.

Procedures are dispatched by a long `if procedure == "..."` chain in
`dispatch_procedure()` (`backend/main.py`). Adding a procedure requires editing
**both** the router module and that chain.

### Type safety boundary

`frontend/src/lib/trpc.ts` originally imported `AppRouter` from
`../../../server/routers` — a TypeScript server that no longer exists. The proxy
is now `createTRPCReact<any>() as any`. This means:

- procedure names are **not** checked at build time; a typo is a runtime error
- procedure inputs and outputs are **not** typed
- `npm run build` **does** now type-check (`tsc --noEmit && vite build`), but the
  API boundary itself is outside what those types can cover

`src/types/index.ts` holds hand-written interfaces that must be kept in sync with
the Python serializers manually.

---

## 2. Directory Structure

```
whipandpour_project_website_our/
├── PROJECT_REFERENCE.md          ← this file
├── .claude/skills/               ← project skills (architecture, api, frontend, commerce, testing)
└── whipandpour_project/
    ├── run-local.sh              ← dev/prod launcher
    ├── shared/
    │   └── const.ts              ← COOKIE_NAME, UNAUTHED_ERR_MSG, ONE_YEAR_MS (mirrors auth.py)
    ├── backend/
    │   ├── main.py               ← FastAPI app, tRPC batch handler, dispatch_procedure()
    │   ├── database.py           ← SQLAlchemy models, seed data, init_db(), get_db()
    │   ├── auth.py               ← session store, cookie helpers, TRPCError, require_admin()
    │   ├── requirements.txt
    │   ├── ecosystem.config.cjs  ← PM2 config (cwd path is stale: /home/user/…)
    │   ├── .env / .env.example   ← STRIPE_SECRET_KEY, PORT
    │   ├── whipandpour.db        ← SQLite database file
    │   └── routers/
    │       ├── products.py       ← list / featured / bestsellers / bySlug / byId
    │       ├── cart.py           ← server-side cart (see note below)
    │       ├── wishlist.py
    │       ├── orders.py         ← list / byId / items + create_order_from_cart()
    │       ├── admin.py          ← admin CRUD, inventory, customers, orders, stats
    │       ├── promos.py
    │       ├── reviews.py
    │       └── stripe_router.py  ← Checkout Session create / retrieve
    └── frontend/
        ├── index.html
        ├── package.json          ← created during local deployment (was absent)
        ├── vite.config.ts        ← @ and @shared aliases, /api → :8000 proxy
        ├── tsconfig.json
        └── src/
            ├── main.tsx          ← tRPC client, QueryClient, error→login redirect
            ├── App.tsx           ← wouter route table
            ├── const.ts          ← getLoginUrl(), re-exports @shared/const
            ├── index.css         ← Tailwind v4 theme + brand tokens
            ├── types/index.ts    ← hand-written API types
            ├── lib/trpc.ts       ← createTRPCReact<any>()
            ├── contexts/         ← CartContext, AdminContext, ThemeContext
            ├── hooks/            ← useMobile, useComposition, usePersistFn
            ├── _core/hooks/      ← useAuth (customer auth)
            ├── components/       ← Navbar, ProductCard, sliders, AdminLayout
            │   └── ui/           ← ~60 shadcn/ui primitives
            ├── pages/            ← 10 customer pages + 10 admin pages
            └── (public/images/products/ holds 25 real photos + SVG placeholders)
```

### Files that are not what they look like

| File | Reality |
|---|---|
| `src/pages/ComponentShowcase.tsx` | 1437-line demo gallery, **not routed** in `App.tsx`, dead code |
| `src/components/Map.tsx` | Google Maps wrapper, no API key, unused |
| `src/components/AIChatBox.tsx` | Used only by ComponentShowcase; `trpc.ai.chat` appears in comments/demo strings only — the procedure does not exist |
| `src/components/DashboardLayout.tsx` | Unused; admin pages use `AdminLayout.tsx` |
| `backend/routers/cart.py`, `wishlist.py` | Fully implemented server-side, but the frontend never calls them — the cart lives in `localStorage` |

---

## 3. Database

SQLite file `backend/whipandpour.db`. Created by `init_db()` at FastAPI startup
via `Base.metadata.create_all(bind=engine)`.

**There is no migration tool.** `create_all` only creates missing tables; it
never alters an existing one. Changing a column requires deleting the database
file or hand-writing SQL.

### Tables

#### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `openId` | str(64) | UNIQUE, e.g. `demo_test_example_com` |
| `name`, `email` | text / str(320) | `email` UNIQUE |
| `phone`, `address`, `city`, `state`, `zipCode`, `country` | | shipping defaults |
| `loginMethod` | str(64) | `demo`, `admin`, … |
| `role` | enum `user` \| `admin` | authorization source of truth |
| `createdAt`, `updatedAt`, `lastSignedIn` | datetime | |

#### `products`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `name` | str(255) | |
| `slug` | str(255) | **UNIQUE** — used for `/product/:slug` |
| `description` | text | required |
| `category` | enum | see [Categories](#categories) |
| `price` | Numeric(10,2) | serialized to the API as a **string** |
| `stock` | int | authoritative inventory count |
| `images` | text | JSON array of URLs |
| `scentNotes` | text | JSON array of strings |
| `burnTime`, `waxType` | str(100) | nullable |
| `sizeOptions` | text | JSON array `[{size, ml}]` |
| `isFeatured`, `isBestseller`, `isLimitedEdition` | bool | drive homepage sections |
| `averageRating` | Numeric(3,2) | string in API responses |
| `reviewCount`, `viewCount` | int | |
| `createdAt`, `updatedAt` | datetime | |

#### `orders`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `userId` | FK → users.id | required — orders need a user row |
| `orderNumber` | str(50) | **UNIQUE** — the customer-facing Order ID |
| `status` | enum | `pending` \| `processing` \| `shipped` \| `delivered` \| `cancelled` |
| `total`, `subtotal`, `shippingCost`, `discountAmount` | Numeric(10,2) | |
| `promoCode` | str(50) | nullable |
| `shippingAddress`, `shippingCity`, `shippingState`, `shippingZipCode`, `shippingCountry` | | `State` nullable, rest required |
| `paymentMethod` | enum | `stripe` \| `jazzcash` \| `easypaisa` \| `cod` |
| `paymentStatus` | enum | `pending` \| `completed` \| `failed` \| `refunded`, default `pending` |
| `stripePaymentIntentId` | str(255) | gateway reference |
| `trackingNumber` | str(100) | |
| `customerEmail`, `customerPhone`, `notes` | | |
| `createdAt`, `updatedAt` | datetime | |

#### `orderItems`
`id`, `orderId` FK, `productId` FK, `quantity`, `unitPrice` Numeric(10,2), `size`, `createdAt`.
A snapshot of price at purchase time — editing a product later does not rewrite history.

#### `carts`
`id`, `userId` FK **UNIQUE**, `items` (JSON text `[{productId, quantity, size}]`), timestamps.
Implemented server-side but unused by the current frontend.

#### `wishlists`
`id`, `userId` FK, `productId` FK, `createdAt`. No unique constraint on the pair —
duplicates are prevented in `routers/wishlist.py`, not by the schema.

#### `reviews`
`id`, `productId` FK, `userId` FK, `rating` int, `body`, `isVerifiedPurchase`, `helpful`, timestamps.
Never seeded — the table is empty; product pages showed hardcoded reviews *(pre-change)*.

#### `promoCodes`
`id`, `code` **UNIQUE**, `discountType` (`percent`|`flat`), `value`, `usageLimit`,
`usedCount`, `expiryDate`, `isActive`, `applicableCategory`, `minOrderAmount`, timestamps.

Seeded: `WELCOME10` (10%, all), `PREMIUM20` (20%, premium, min 3000), `FLAT500` (flat 500, min 2000).

### Relationships

```
users 1──∞ orders 1──∞ orderItems ∞──1 products
users 1──1 carts
users 1──∞ wishlists ∞──1 products
users 1──∞ reviews  ∞──1 products
promoCodes  (referenced by orders.promoCode as a plain string, no FK)
```

Foreign keys are declared, but **SQLite does not enforce them unless
`PRAGMA foreign_keys=ON`**, which this project never sets. Deleting a product
with existing order items will not raise — it will silently orphan them.

### Categories

*(pre-change)* `SAEnum("signature", "premium")`.
*(current)* See the [Change Log](#change-log).

Category is referenced in: `Product.category`, `PromoCode.applicableCategory`,
`src/types/index.ts`, `ProductCard` badge, `ProductDetail` badge, `Navbar`
dropdown, `ShopFilters`, `Home` section filters, and the admin product form.
Changing it means touching all of them.

---

## 4. Product Flow

```
┌─────────────────┐
│ Admin creates   │  admin.products.create  (mutation, requires role=admin)
│ product         │
└────────┬────────┘
         ▼
┌─────────────────┐
│ products table  │  SQLite row; slug must be unique
│ (SQLite)        │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Collection page │  products.list  → Shop.tsx → ProductCard
│ /shop           │  filters: category, search, price, sort
└────────┬────────┘
         ▼
┌─────────────────┐
│ Product detail  │  products.bySlug → ProductDetail.tsx
│ /product/:slug  │  reviews.byProduct for real reviews
└────────┬────────┘
         ▼
┌─────────────────┐
│ Cart            │  CartContext → localStorage['whipandpour_cart']
│ (client-side)   │  NOT the server carts table
└────────┬────────┘
         ▼
┌─────────────────┐
│ Checkout        │  customer form + payment method selection
│ /checkout       │
└────────┬────────┘
         ▼
┌─────────────────┐
│ orders +        │  orders.create → create_order() writes both tables
│ orderItems      │  paymentStatus = 'pending' until a gateway confirms
└─────────────────┘
```

**Important:** the cart is client-side only. It is not associated with a user
account and does not sync across devices. The server-side `carts` table exists
and works but nothing calls it.

---

## 5. Admin Flow

Routes (all under `/admin`, registered in `App.tsx`, navbar hidden on these paths):

`/admin/login`, `/admin`, `/admin/products`, `/admin/orders`, `/admin/customers`,
`/admin/analytics`, `/admin/promos`, `/admin/reviews`, `/admin/inventory`, `/admin/payments`

### Authentication

*(pre-change)* `AdminContext.tsx` compared the email and password to string
literals **in the browser** and set `localStorage['wap_admin_token']` to a fixed
fake token. The backend was never involved, `require_admin()` in `auth.py` was
never called, and no admin API existed.

*(current)* Credentials are verified server-side against a seeded admin user;
admin procedures call `require_admin()`. See the [Change Log](#change-log).

Every admin page guards with:
```tsx
if (!isAdminAuthenticated) { navigate('/admin/login'); return null; }
```
This is a UI guard only — it hides pages, it does not protect data.

### Page inventory *(pre-change)*

| Page | Data source | Persisted |
|---|---|---|
| AdminDashboard | hardcoded stats | no |
| AdminProducts | `useState(initialProducts)` — 5 hardcoded rows | **no** |
| AdminInventory | `useState(initialInventory)` — 8 hardcoded rows | **no** |
| AdminOrders | `initialOrders` — 7 hardcoded rows | no |
| AdminCustomers | `customers` — 10 hardcoded rows, module-level `const` | no |
| AdminPromos | hardcoded | no |
| AdminReviews | hardcoded | no |
| AdminAnalytics | hardcoded | no |
| AdminPayments | hardcoded | no |

None of these pages made a single API call. New product IDs were generated with
`Date.now()`.

---

## 6. Data Persistence

Where each kind of data actually lives, and what survives what:

| Data | Storage | Page nav | Refresh | Server restart | Rebuild/redeploy |
|---|---|---|---|---|---|
| Products | SQLite `products` | ✅ | ✅ | ✅ | ✅ (file persists) |
| Orders / order items | SQLite | ✅ | ✅ | ✅ | ✅ |
| Users, reviews, promos | SQLite | ✅ | ✅ | ✅ | ✅ |
| **Cart** | `localStorage['whipandpour_cart']` | ✅ | ✅ | ✅ | ✅ (per browser only) |
| **Customer session** | in-memory dict in `auth.py` | ✅ | ✅ | ❌ **lost** | ❌ **lost** |
| Admin session flag | `localStorage['wap_admin_token']` | ✅ | ✅ | ✅ | ✅ |
| **Admin page data** *(pre-change)* | React `useState` | ❌ **lost** | ❌ **lost** | ❌ | ❌ |
| Theme | `localStorage` via `next-themes` | ✅ | ✅ | ✅ | ✅ |

Two things to note:

1. **`_sessions` is a plain dict in `auth.py`.** Restarting uvicorn logs every
   customer out. In dev, `--reload` restarts on every file save.
2. **The SQLite file is local to the machine.** On a container-based deploy
   (such as the manus.space host) a rebuild replaces the filesystem, so
   `whipandpour.db` is recreated empty and reseeded. Any product added through
   a working admin panel would still be lost on redeploy unless the database
   file is on a mounted volume or an external database is used.

---

## 7. Existing Problems Found During the Audit

Ordered by severity. Items marked ✅ were fixed in the August 2026 work; see the
[Change Log](#change-log).

### Critical

1. ✅ **The entire admin panel was a static mock.** No admin API existed;
   `dispatch_procedure()` had no admin branch. Product create/edit/delete only
   mutated React state, so anything added vanished on unmount. This is the
   reported "product disappears" bug — nothing was ever saved.

2. ✅ **Checkout faked a successful payment.** `Checkout.tsx` ran
   `setTimeout(() => setStep('confirmation'), 2000)` and showed an order
   confirmation. No API call, no order row, no payment. The order number was
   `WP-${Math.random()}` generated in the component.

3. ✅ **Checkout captured raw card numbers, CVCs, and wallet PINs** into React
   state (`cardData.cardNumber`, `easyData.pin`, `jazzData.mpin`). This is a PCI
   violation and an account-credential risk even though the data went nowhere.

4. ✅ **Admin credentials were hardcoded in shipped client JavaScript**
   (`admin@whipandpour.com` / `WhipPour@123` in `AdminContext.tsx`), readable by
   anyone who opened the bundle.

5. **No order is ever created.** `create_order()` exists in `routers/orders.py`
   but had no caller and no registered procedure. `orders.list` therefore always
   returned `[]`. ✅ Fixed.

6. **No Stripe webhook.** `stripe.createCheckoutSession` builds a session with
   order details in `metadata`, but nothing consumes the result. Even a real
   Stripe payment would never produce an order row. Still outstanding — see
   [Remaining Limitations](#remaining-limitations).

### High

7. ✅ **`ProductDetail` never added to the cart.** `handleAddToCart` called
   `alert()`.

8. ✅ **Ratings always rendered as zero.** The API sends `averageRating` as the
   string `"4.90"`, but the component tested `typeof product.averageRating === 'number'`
   and fell through to `0`. Same pattern for `price`.

9. ✅ **Product sizes and prices were hardcoded** (`Small (6oz) $1800`) instead of
   reading `product.sizeOptions`, so every product showed identical sizes.

10. ✅ **Product reviews were hardcoded** in `ProductDetail.tsx`; the working
    `reviews.byProduct` procedure was never called.

11. ✅ **Navbar search was a dead end.** It navigated to `/shop?search=…`, but
    `Shop.tsx` parsed `location.split('?')[1]` — and wouter's `location` excludes
    the query string, so the parameter was always `undefined`. Both the search
    and `?category=` links silently did nothing.

12. **Currency was inconsistent.** `ProductCard` and `ProductDetail` rendered
    `$2800.00`; `Home` and the navbar rendered `PKR 2,800`. Same number, two
    currencies, ~280× apart in real terms. ✅ Standardized on PKR.

### Medium

13. ✅ `products.list` defaulted to `limit=12`, so a caller omitting `limit` saw
    only the first 12 products. Default is now 100, capped at 200.

14. `sortBy: 'price-desc'` maps to the backend's `'price'`, which is ascending.
    Descending sort silently returned ascending results. ✅ Fixed.

15. SQLite foreign keys are not enforced (`PRAGMA foreign_keys` never set).
    Deleting a product silently orphans its `orderItems`.

16. `init_db()` seeds only when a table is **empty**, so editing `SEED_PRODUCTS`
    has no effect on an existing database — a real trap when changing seed data.

17. `_sessions` in-memory store: all customers are logged out on restart.

18. CORS is `allow_origins=["*"]` **with** `allow_credentials=True`. Browsers
    reject that combination for credentialed requests, and it is over-permissive.
    Should be an explicit origin list.

19. `auth.py:set_session_cookie` sets `secure=False`, so the session cookie is
    sent over plain HTTP. Must be `True` behind HTTPS in production.

20. `ecosystem.config.cjs` has a stale `cwd` (`/home/user/whipandpour_project/backend`).
    Still outstanding — update it before deploying with PM2.

### Low

21. ✅ Dead code removed: `CartDrawer.tsx`, `ShopFilters.tsx`, `HeroSlider.tsx`,
    `ProductSlider.tsx`, `TestimonialsSlider.tsx`, the scroller's
    `FALLBACK_PRODUCTS`, and `Navbar`'s unused `navLinks`. Still present and
    unrouted: `ComponentShowcase.tsx` (1437 lines), `DashboardLayout.tsx`,
    `Map.tsx`, `AIChatBox.tsx`.
22. `frontend/src/components/ui/*` ships ~60 shadcn primitives, most unused.
23. Seed product images are unrelated Unsplash photos (a cake stands in for
    "Lavender Fields").
24. `useAuth` writes to `localStorage['manus-runtime-user-info']` on every render
    of its `useMemo` — a side effect inside a memo callback.
25. Single 1.15 MB JS bundle; no code splitting.

---

## 8. Important Implementation Notes

Read these before modifying anything.

1. **Adding a backend procedure takes two edits** — the handler module *and* the
   `dispatch_procedure()` chain in `main.py`. Missing the second yields
   `Procedure not found` only at runtime.

2. **Numeric fields arrive as strings.** Always
   `parseFloat(String(value ?? 0))`. Never `typeof value === 'number'`.

3. **wouter's `location` has no query string.** Use `window.location.search`,
   and include `location` in the effect dependencies so it re-parses on navigation.

4. **`npm run build` now type-checks** (`tsc --noEmit && vite build`). Keep it
   that way — before this change 62 type errors had accumulated unnoticed
   because esbuild strips types without checking them.

5. **Changing seed data requires deleting `whipandpour.db`** or writing a
   migration — `init_db()` skips seeding a non-empty table.

6. **Every nav change must be made twice** in `Navbar.tsx` — once in the desktop
   block and once in the mobile drawer.

7. **Invalidate queries after every mutation** (`utils.<proc>.invalidate()`).
   Without it the TanStack cache serves stale data and the change looks like it
   reverted — the same symptom as the original persistence bug, from a different
   cause.

8. **Never advance `paymentStatus` without gateway confirmation.** Order creation
   always writes `pending`.

9. **A 200 response can still be an error.** Check `[0].error` in tRPC responses.

10. **The database file is machine-local.** Anything that rebuilds the
    filesystem loses it unless it is on a persistent volume.

---

## Change Log

<!-- CHANGELOG-START -->
## August 2026 — Feature work & remediation

### Summary

The admin panel was converted from a static mock into a working, database-backed
panel; checkout was rewritten to create real orders without ever faking a
payment; categories were replaced; and the product catalogue was reseeded from
the live store at whipandpour.com.

### 1. Categories

`signature` / `premium` were replaced by five categories, defined once in
`backend/database.py` (`CATEGORIES`) and once in `frontend/src/const.ts`:

| Value | Label |
|---|---|
| `dessert-jar` | Dessert Jar Candles |
| `cupcake` | Cupcake Candles |
| `iced-latte` | Iced Latte Candles |
| `cheesecake` | Cheesecake Candles |
| `wax-melts` | Wax Melts |

`PromoCode.applicableCategory` was widened to match, and the seeded `PREMIUM20`
code became `CHEESECAKE20`.

### 2. Catalogue reseeded from the live store

Products, prices, copy, scent notes, burn times, ratings, review counts, stock
levels and photography were taken from `https://whipandpour.com/js/data.js` and
mapped into the five categories above:

| Category | Products |
|---|---|
| Dessert Jar Candles | Mango Mousse Cup, Tiramisu Dessert Cup |
| Cupcake Candles | Vanilla Buttercream Cupcake, Red Velvet Cupcake Candle |
| Iced Latte Candles | Caramel Latte Candle |
| Cheesecake Candles | Blueberry Cheesecake Slice, Strawberry Cheesecake Slice |
| Wax Melts | *(none yet — add via the admin panel)* |

Four real customer reviews were imported and are shown on the matching product
pages. `Review` gained a `title` column to carry them.

**Products deliberately not imported.** The live store also sells Donut,
Pancake, Chocolate, Fruity and Gift Box lines (8 products). Those categories are
not among the five requested, so they were left out rather than forced into an
ill-fitting category. Add the categories first, then the products.

**Images.** 25 product photos were downloaded from the live store into
`frontend/public/images/products/` so they cannot break. Three photos referenced
by the live site already return 404 (`photo-1548907040`, `photo-1599785209707`,
`photo-1605478579222`); the Red Velvet main image was substituted with its own
second gallery shot. Branded SVG category placeholders were generated as
fallbacks for products with no photo.

### 3. Product persistence — root cause and fix

**Root cause.** Nothing was ever saved. `AdminProducts.tsx` held a hardcoded
`initialProducts` array in `useState` and mutated it locally with
`id: Date.now()`; `AdminInventory.tsx` did the same with `initialInventory`. The
backend had **no admin procedures at all** — `dispatch_procedure()` in `main.py`
handled 21 procedures, none of which wrote a product. So a "saved" product lived
only in React state and was discarded the moment the component unmounted, which
is exactly what navigating to another admin page does.

This was therefore not a cache, refresh or state-refresh bug, and no frontend
patch could have fixed it.

**Fix.**
- New `backend/routers/admin.py` with validated CRUD, gated by `_require_admin`.
- `AdminProducts`, `AdminInventory`, `AdminCustomers`, `AdminOrders` and
  `AdminDashboard` rewired to tRPC queries and mutations.
- Every mutation invalidates both the admin and public product queries, so the
  storefront reflects the change immediately.

**Verified:** product survives navigation between admin pages, a browser
refresh, and a full backend restart; appears on the public storefront API; is
present in `whipandpour.db`; and produces no duplicate slugs.

### 4. Admin authentication

Was: `AdminContext.tsx` compared email and password to string literals **in the
browser bundle** and wrote a fixed fake token to localStorage. The working
password was also printed on the login page.

Now: `POST /api/auth/admin-login` verifies credentials against a PBKDF2-SHA256
hash on the admin user row and issues the httpOnly `app_session_id` session
cookie. Every `admin.*` procedure calls `_require_admin()`, which requires
`role == 'admin'` on the user row. Credentials come from `ADMIN_EMAIL` /
`ADMIN_PASSWORD` (falling back to the historical pair so existing installs keep
working). Failed logins return one generic message so admin emails cannot be
enumerated.

### 5. Checkout and orders

Was: `handlePaymentSubmit` ran `setTimeout(…, 2000)` and showed a confirmation.
No order row, no API call, no payment. The order number was `Math.random()` in a
component, and the form captured raw card numbers, CVCs and wallet PINs.

Now:

| Concern | Where |
|---|---|
| Method selection | `Checkout.tsx` → `orders.paymentMethod` |
| Processing | Gateway adapter (Stripe wired; Easypaisa/JazzCash **not** integrated) |
| Order creation | `orders.create` → `create_order_from_cart()`, always `paymentStatus='pending'` |
| Payment status | Only a verified gateway callback may advance it |

- Prices are re-read from the database; a client-supplied `price` is ignored.
- Stock is checked and decremented in the same transaction.
- Order numbers (`WP-YYMM-NNNNNN`) are generated server-side and collision-checked.
- Guest checkout resolves or creates a user row, since `orders.userId` is NOT NULL.
- No card number, CVC or wallet PIN is collected anywhere.
- The confirmation screen states plainly that no payment has been taken.

### 6. Other fixes made along the way

| Issue | Fix |
|---|---|
| `/cart` always showed "empty" — it had its own `useState([])` and was never connected to `CartContext` | Connected to `useCart()` |
| `ProductDetail` "Add to Cart" only called `alert()` | Adds to the cart properly |
| Ratings always rendered `0.0` (`typeof "4.90" === 'number'` is false) | Shared `toNumber()` helper |
| Sizes hardcoded Small/Medium/Large with fixed prices | Read from `product.sizeOptions` |
| Reviews hardcoded in the component | `reviews.byProduct`, with the reviewer name joined server-side |
| Navbar search and `?category=` links did nothing — wouter's `location` excludes the query string | Read `window.location.search` |
| `price-desc` sorted ascending | Added a real descending branch |
| Currency inconsistent (`$2800.00` vs `PKR 2,800`) | Single `formatPrice()` helper, PKR throughout |
| Free-shipping threshold disagreed between pages | One constant, PKR 4,000, matching the live store |
| **Production served no `public/` assets** — only `/assets` was mounted, so the SPA catch-all returned `index.html` for every image with a 200 | Catch-all now serves real files from `dist`, with path-traversal protection |
| Expired admin session left the panel silently 401-ing | `main.tsx` redirects to `/admin/login` on UNAUTHORIZED/FORBIDDEN under `/admin` |
| `getLoginUrl()` returns `""`, so the old redirect reloaded the page in a loop | Only redirects when an OAuth portal is configured |
| `products.list` defaulted to `limit=12`, hiding a 13th product | Default 100, capped at 200 |
| Dead code and dead images | Removed `HeroSlider`, `ProductSlider`, `TestimonialsSlider`, `CartDrawer`, `ShopFilters`, and the scroller's hardcoded `FALLBACK_PRODUCTS` |
| `npm run build` never type-checked | Now `tsc --noEmit && vite build`; 62 pre-existing type errors fixed to zero |

### 7. Files changed

**Backend**
- `database.py` — categories, seed products, seed reviews, admin seeding, `isActive`, `passwordHash`, `Review.title`
- `auth.py` — `hash_password()` / `verify_password()` (PBKDF2, stdlib only)
- `main.py` — `_require_admin()`, admin dispatch block, `orders.create`, `products.categories`, admin login, static-file serving
- `routers/admin.py` — **new**, all admin handlers and validation
- `routers/orders.py` — `create_order_from_cart()`, `resolve_checkout_user()`, order numbering
- `routers/products.py` — soft-delete filter, search across name/description/category/scents, `price-desc`, `products_categories()`
- `routers/reviews.py` — reviewer name and title

**Frontend**
- `src/const.ts` — `CATEGORIES`, `categoryLabel()`, `toNumber()`, `formatPrice()`
- `src/lib/trpc.ts`, `src/main.tsx`, `src/types/index.ts`
- `src/contexts/AdminContext.tsx` — server-side auth
- `src/components/` — `Navbar`, `ProductCard`, `CartDrawerComponent`, `InfiniteProductScroller`
- `src/pages/` — `Home`, `Shop`, `ProductDetail`, `Cart`, `Checkout`, `AdminLogin`, `AdminProducts`, `AdminInventory`, `AdminCustomers`, `AdminOrders`, `AdminDashboard`, `AdminPromos`
- `public/images/products/` — 25 real photos + 10 branded SVG placeholders
- `package.json` — `build` now type-checks; added `typecheck`

**Root**
- `PROJECT_REFERENCE.md`, `.claude/skills/` (5 project skills), `run-local.sh`

### 8. Database changes

| Change | Note |
|---|---|
| `products.category` enum replaced | 5 dessert categories |
| `products.isActive` added | Soft delete, so deleting a product cannot orphan order items |
| `users.passwordHash` added | Admin only, PBKDF2-SHA256 |
| `reviews.title` added | Carries the real review headlines |
| `promoCodes.applicableCategory` enum widened | Matches the new categories |

There is no migration tool. `whipandpour.db` was **rebuilt**; the previous file
is kept at `backend/whipandpour.db.pre-migration-backup`. A production deploy
needs the same treatment or hand-written SQL.

### 9. Testing performed

**Backend (curl):** health; all 5 category filters; search by name, scent and
category; price bounds; all sort orders; combined filters; reviews; admin login
with correct and incorrect passwords; unauthenticated and non-admin access to
`admin.*` (401 / 403); product create, update, delete; duplicate-slug handling;
invalid category, negative price, oversized payloads.

**Order validation:** client-supplied price ignored (server re-reads the
product); over-stock rejected; empty cart rejected; invalid payment method
rejected; totals recomputed from line items and reconciled.

**Browser (desktop 1280×800, tablet 768×1024, mobile 375×812):** every customer
page and all 9 admin pages render without crashing; zero broken images; no
horizontal overflow at any size; admin tables scroll within their own container;
mobile drawer lists all five categories.

**Persistence:** product added through the admin UI survived navigation to
another admin page, a browser refresh, and a full backend restart; confirmed
present in SQLite and on the public storefront API.

**Data integrity:** no duplicate slugs, order numbers or promo codes; no
orphaned order items; no orders without a user; no order marked paid; no
plaintext passwords; product IDs stable across edits; deleting an
order-referenced product deactivates it and preserves order history.

**Build:** `npm run build` (type check + Vite) passes with zero errors.

### 10. Known limitations

1. **Wax Melts has no products.** Add stock through the admin panel.
2. **Easypaisa and JazzCash are selection-only.** No gateway integration exists.
   Orders record the chosen method and stay `pending`; someone must confirm
   payment out of band. Do not describe them as accepting payment.
3. **No Stripe webhook.** `stripe.createCheckoutSession` still has no consumer,
   so even a completed Stripe payment will not advance `paymentStatus`. This is
   the single largest remaining gap before taking real card payments.
4. **`STRIPE_SECRET_KEY` is still the placeholder** in `backend/.env`.
5. **Sessions are in-memory.** A backend restart logs everyone out, including
   the admin. Use a persistent session store before production.
6. **Admin Promos, Reviews, Analytics and Payments pages are still hardcoded
   mocks.** They render and do not crash, but their data is invented and their
   controls do not persist. They need the same treatment as Products/Inventory.
7. **The dashboard revenue chart is sample data**, labelled as such in the UI.
   The KPI cards, recent orders and top products above it are real.
8. **SQLite file is machine-local.** On a container host that rebuilds the
   filesystem, the database is recreated empty. Move to a mounted volume or a
   managed database before relying on it.
9. **CORS is `allow_origins=["*"]` with `allow_credentials=True`**, and the
   session cookie sets `secure=False`. Both must be tightened behind HTTPS.
10. **No automated test suite.** All verification above was manual.
11. **API remains untyped** (`AppRouter = any`), so procedure-name typos are
    runtime errors rather than build errors.

### 11. Recommended next steps

1. Implement the Stripe webhook so `paymentStatus` can legitimately reach
   `completed`, and add gateway adapters for Easypaisa and JazzCash.
2. Move sessions to a persistent store; set `secure=True` and a real CORS origin list.
3. Convert the four remaining mock admin pages to the API.
4. Add the missing product categories (Donut, Pancake, Chocolate, Fruity, Gift
   Box) and import the remaining 8 live products.
5. Introduce Alembic (or equivalent) before the next schema change.
6. Add automated tests, starting with order creation and the admin authorization boundary.
7. Replace the placeholder SVGs with real photography for any product lacking a photo.
<!-- CHANGELOG-END -->

---

## Addendum — Admin panel audit & follow-up work

### Audit result

Three automated suites exercise every admin procedure and check its effect on
the customer-facing API. All are in
`scratchpad/admin_audit.py`, `admin_audit2.py`, `gift_review_audit.py`.

| Suite | Covers | Result |
|---|---|---|
| `admin_audit.py` | auth boundary, product CRUD, inventory, customers, orders, stats, delete semantics | **85/85** |
| `admin_audit2.py` | promo codes, review moderation, analytics, payments | **43/43** |
| `gift_review_audit.py` | gifting options, purchase-verified reviews | **34/34** |

Every mutation is re-checked against the **public** API as an anonymous visitor,
so a pass means the change genuinely reached the storefront.

### Bugs the audit found and fixed

1. **Soft-deleted products were still fetchable by id.** `products_by_id` did
   not filter `isActive`, so a product hidden from the store was still reachable
   at its `/product/:id` data path. `products_by_slug` and `products_list` had
   the filter; this one was missed.
2. **`products.featured` / `bestsellers` returned an arbitrary subset.** With no
   `ORDER BY` and a `limit`, marking a 7th product "featured" left it invisible.
   Now ordered newest-first, limit raised to 12.
3. **Renaming a product silently changed its slug**, breaking `/product/<slug>`
   links, bookmarks and search results. Slugs are now generated once on create
   and stay stable unless an explicit `slug` is supplied.
4. **Review moderation read stale data.** `SessionLocal` uses
   `autoflush=False`, so recalculating a product's rating immediately after
   changing a review status queried the pre-change state and landed one step
   behind. Fixed with an explicit `db.flush()`.

### Admin panel is now the system of record

The four pages that made **zero** API calls are wired to real data:

| Page | Now backed by | Storefront effect |
|---|---|---|
| Promo Codes | `admin.promos.*` → `promoCodes` | Creating/deactivating a code changes what `promos.validate` accepts and what checkout discounts |
| Reviews | `admin.reviews.*` → `reviews` | A review only appears on a product page once approved; approving/rejecting recomputes that product's rating |
| Analytics | `admin.analytics` → `orders` + `orderItems` | Reporting only; all figures aggregated from real orders |
| Payments | `admin.payments.list` → `orders` | Reporting only; states plainly what has and has not been confirmed |

**Review rating model.** Products carry aggregate ratings imported from the live
store (e.g. 211 reviews) with only a handful of local `reviews` rows.
Recalculating purely from local rows would have destroyed that history, so the
imported portion is stored separately in `products.importedReviewCount` /
`importedRatingSum`, and the displayed rating combines imported + approved
local. Rejecting one review moves the count by exactly one.

### Gifting

Gift packaging is a real, paid checkout option, not marketing copy:

- `gifting.options` (public) publishes the fee and what's included, so the
  homepage and checkout can never quote a price that differs from what is charged.
- `orders` gained `giftPackaging`, `giftPackagingFee`, `giftCardMessage`,
  `giftRecipientName`, `giftSenderName`. The fee is stored on the order, so
  changing the price later does not rewrite history.
- The fee is added to the order total server-side; a card message without
  packaging is rejected.
- Admin → Orders flags gift orders in the table and shows the card message,
  recipient and sender in the detail modal. The dashboard counts gift orders
  still to pack.
- Configure the price via `GIFT_PACKAGING_FEE` in `backend/routers/orders.py`.

### Reviews now require a real purchase

"Share Your Experience" previously gated on `useAuth()` — a login flow this
store does not have — and its submit handler only called `console.log`. No
review was ever created.

Because checkout is guest-based, the proof of purchase is the **order number
plus the email the order was placed with**, the pair shown on the confirmation
screen. `reviews.create` verifies that the order exists, that the email matches,
and that the order actually contains the product, then stores the review as
`pending` with `isVerifiedPurchase = true`. `reviews.canReview` offers the same
check without writing.

Rejected: unknown order number, mismatched email, product not in that order,
out-of-range rating, too-short body, and a second review of the same product by
the same customer.

### Data-integrity note discovered during testing

SQLite reuses primary keys after deletion and this schema has no
`ON DELETE` handling, so deleting a user out from under their reviews orphans
those rows — and a later insert can reuse the freed id, making the
duplicate-review guard match a stale row. Nothing in the application deletes
users, so this is only reachable by manual database surgery, but it is a real
consequence of running without `PRAGMA foreign_keys=ON`.

### Still outstanding

Everything in the earlier limitations list stands, in particular: **no Stripe
webhook**, so `paymentStatus` cannot legitimately reach `completed`; Easypaisa
and JazzCash remain selection-only; sessions are in-memory; and there is no
automated test suite in the repo itself (the three audit scripts live in the
scratchpad and are not wired into a runner).

---

## Addendum 2 — Account page, wishlist, and email

### Account page — now real order tracking

Was: `isLoggedIn` hardcoded `false`, so the entire "logged in" branch was dead
code that always claimed "No orders yet". Its sign-in form popped an alert
telling **customers** to use the admin panel, and checkout's "View my orders"
button led straight into that wall.

Now: a guest order-tracking page backed by a new public `orders.lookup`
procedure. Ownership is proven by **order number + the email the order was
placed with** — `orders.list` needs a session and is unreachable for guests.
Shows status timeline, line items with images, gift details, full totals
breakdown, delivery address, tracking number, and a payment note. The last
order placed in the browser is remembered in `localStorage` so the lookup
prefills (deliberately **not** a URL parameter — an email address does not
belong in a query string).

A wrong email and an unknown order number return the **same** message, so an
order number alone reveals nothing.

### Wishlist — was entirely non-functional

Two independent breakages:

1. `ProductCard` called an optional `onToggleWishlist?.()` prop that **only the
   wishlist page ever passed**, so the heart button did nothing on Shop, Home
   or the product page.
2. `Wishlist.tsx` held `useState<Product[]>([])` and never loaded anything, so
   it always rendered the empty state.

Now backed by `WishlistContext` (localStorage, mirroring `CartContext`). Only
product **ids** are stored; products are re-fetched so prices and stock are
never stale and deleted/hidden products drop out. Adds a navbar badge,
"Add all to cart", "Clear all" and a **Checkout** action that moves every
in-stock item to the cart and goes to checkout.

The server-side `wishlists` table and `wishlist.list/add/remove` procedures
still exist but require a session; migrate to them when customer accounts
arrive.

### Email — implemented (needs credentials)

Previously **nothing sent email**, yet the confirmation screen stated
"We've emailed a copy to …". That claim is now conditional on an actual send.

`backend/mailer.py` uses stdlib `smtplib` — no new dependency, no third party
holding customer data. Configured for Hostinger:

| Variable | Value |
|---|---|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` (SSL) or `587` (STARTTLS) |
| `SMTP_USER` / `MAIL_FROM` | `owner@whipandpour.com` — Hostinger rejects a mismatched sender |
| `SMTP_PASSWORD` | that mailbox's password |
| `MAIL_ADMIN` | optional internal copy of each order |
| `STORE_URL` | used for the "Track your order" link |

Behaviour:
- Multipart **plain text + HTML** confirmation with items, totals, gift message,
  delivery address and a tracking link.
- Optional internal notification flagging gift orders that need a handwritten card.
- Sent on a **background thread** — a slow mail server cannot delay checkout.
- **Never fails an order.** If SMTP is unconfigured or errors, it logs and the
  order still completes; `orders.create` returns `confirmationEmailQueued`, and
  the UI only promises an email when that is true.
- **Refuses to send credentials over an unencrypted connection.** If the server
  does not advertise STARTTLS, authentication is aborted rather than leaking the
  password (`MAIL_ALLOW_INSECURE=true` exists only for a trusted local relay).
- Payment wording never implies money was received.

Verified against a local SMTP sink: both messages delivered, correct headers,
correct plain-text and HTML parts. **No email has been sent to any real
address.** Add the password to `backend/.env` to switch it on.
