# Whip & Pour — Python FastAPI Backend

A Python FastAPI backend that replaces the original Node.js/tRPC/Express server.
It is **tRPC-compatible** — the original React frontend talks to it unchanged via `/api/trpc`.

---

## Project Structure

```
whipandpour_project/
├── frontend/          ← Original React + TypeScript + Vite frontend (UNTOUCHED)
│   ├── src/
│   ├── index.html
│   └── package.json
│
└── backend/           ← Python FastAPI backend (this folder)
    ├── main.py            ← FastAPI app + tRPC batch endpoint
    ├── database.py        ← SQLAlchemy models + SQLite engine + seed data
    ├── auth.py            ← Session cookie management + TRPCError
    ├── routers/
    │   ├── products.py    ← products.list/featured/bestsellers/bySlug/byId
    │   ├── cart.py        ← cart.get/add/update/clear
    │   ├── wishlist.py    ← wishlist.list/add/remove
    │   ├── orders.py      ← orders.list/byId/items
    │   ├── promos.py      ← promos.validate
    │   ├── reviews.py     ← reviews.byProduct
    │   └── stripe_router.py ← stripe.createCheckoutSession/getSession
    ├── requirements.txt
    ├── .env.example
    └── README.md
```

---

## Quick Start

### 1. Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure environment (optional)

```bash
cp .env.example .env
# Edit .env and set your STRIPE_SECRET_KEY
```

### 3. Start the backend

```bash
python main.py
# Server runs on http://localhost:8000
# API docs at  http://localhost:8000/docs
```

### 4. Build & run the frontend (separate terminal)

```bash
cd ../frontend
npm install
npm run dev
# Vite dev server on http://localhost:5173
# Frontend proxies /api/trpc → http://localhost:8000/api/trpc
```

> **Vite proxy**: Add this to `frontend/vite.config.ts` for local dev:
> ```ts
> server: {
>   proxy: {
>     '/api': 'http://localhost:8000',
>   }
> }
> ```

### 5. (Production) Build frontend and serve everything from FastAPI

```bash
cd frontend && npm run build     # outputs to frontend/dist/
cd ../backend && python main.py  # serves frontend/dist + /api/trpc
```

---

## tRPC-Compatible Endpoint

The frontend connects to `/api/trpc` using `@trpc/client` with `httpBatchLink` and `superjson`.
This backend implements the same HTTP batch protocol:

| HTTP Method | URL Pattern | Used for |
|-------------|-------------|----------|
| `GET` | `/api/trpc/<proc>?batch=1&input={"0":{...}}` | Queries |
| `POST` | `/api/trpc/<proc1>,<proc2>?batch=1` + JSON body | Mutations & batched queries |

Response format (array, one entry per procedure):
```json
[
  { "result": { "data": { "json": <value> } } },
  { "error": { "json": { "message": "...", "code": -32001, "data": { "code": "UNAUTHORIZED", "httpStatus": 401 } } } }
]
```

---

## All Implemented Procedures

### Auth
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `auth.me` | query | public | Returns current user or null |
| `auth.logout` | mutation | public | Clears session cookie |

### Products
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `products.list` | query | public | Filtered/sorted product list |
| `products.featured` | query | public | Featured products (max 6) |
| `products.bestsellers` | query | public | Bestseller products (max 6) |
| `products.bySlug` | query | public | Product by URL slug |
| `products.byId` | query | public | Product by numeric ID |

### Cart
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `cart.get` | query | 🔒 required | Get user's cart |
| `cart.add` | mutation | 🔒 required | Add item to cart |
| `cart.update` | mutation | 🔒 required | Update item quantity (0 = remove) |
| `cart.clear` | mutation | 🔒 required | Empty the cart |

### Wishlist
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `wishlist.list` | query | 🔒 required | List wishlist items with product details |
| `wishlist.add` | mutation | 🔒 required | Add product to wishlist |
| `wishlist.remove` | mutation | 🔒 required | Remove product from wishlist |

### Orders
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `orders.list` | query | 🔒 required | List user's orders |
| `orders.byId` | query | 🔒 required | Get order by ID (ownership enforced) |
| `orders.items` | query | public | Get items for an order |

### Promos
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `promos.validate` | query | public | Validate a promo code |

### Reviews
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `reviews.byProduct` | query | public | Get reviews for a product |

### Stripe
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `stripe.createCheckoutSession` | mutation | 🔒 required | Create Stripe checkout session |
| `stripe.getSession` | query | public | Retrieve a Stripe session |

---

## Demo Login (for testing without OAuth)

The backend provides a simple demo login endpoint so you can test protected routes:

```bash
# Login as demo user
curl -c cookies.txt -X POST http://localhost:8000/api/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com"}'

# Use session cookie in subsequent requests
curl -b cookies.txt http://localhost:8000/api/trpc/auth.me?batch=1&input={"0":null}
```

---

## Database

- **Engine**: SQLite (file: `backend/whipandpour.db`)
- **ORM**: SQLAlchemy 2.x
- **Migrations**: Auto-created on startup via `Base.metadata.create_all()`
- **Seed data**: 12 candle products + 3 promo codes seeded automatically on first run

### Seed Promo Codes

| Code | Type | Value | Applies To | Min Order |
|------|------|-------|------------|-----------|
| `WELCOME10` | percent | 10% | All products | — |
| `PREMIUM20` | percent | 20% | Premium only | Rs 3,000 |
| `FLAT500` | flat | Rs 500 | All products | Rs 2,000 |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | No* | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `PORT` | No | Server port (default: `8000`) |

*Stripe procedures will raise an error if called without a valid key.

---

## API Health Check

```bash
curl http://localhost:8000/api/health
# {"status":"ok","service":"whipandpour-python-backend"}
```

## Interactive API Docs

Visit **http://localhost:8000/docs** for the auto-generated Swagger UI.
