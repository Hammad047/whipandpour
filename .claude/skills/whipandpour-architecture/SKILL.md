---
name: whipandpour-architecture
description: Core architecture, data flow, and safe-change rules for the Whip&Pour e-commerce site (React/Vite frontend + Python FastAPI tRPC-compatible backend + SQLite). Load before changing any frontend page, backend router, tRPC procedure, or database model in whipandpour_project.
---

# Whip & Pour — Architecture & Safe-Change Rules

## Stack

| Layer | Technology | Location |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite 6 | `whipandpour_project/frontend` |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"`), shadcn/ui, Radix | `src/index.css`, `src/components/ui` |
| Routing | **wouter** (not React Router) | `src/App.tsx` |
| Server state | TanStack Query v5 via `@trpc/react-query` | `src/lib/trpc.ts` |
| Client state | React Context (`CartContext`, `AdminContext`, `ThemeContext`) | `src/contexts` |
| Backend | FastAPI, tRPC-compatible batch endpoint | `whipandpour_project/backend/main.py` |
| ORM / DB | SQLAlchemy 2.x + SQLite (`backend/whipandpour.db`) | `backend/database.py` |
| Shared | Constants mirrored between TS and Python | `whipandpour_project/shared/const.ts` |

There is **no Node/tRPC server**. The Python backend hand-implements the tRPC
HTTP batch wire protocol. `AppRouter` is untyped (`any`) in `src/lib/trpc.ts`.

## The tRPC bridge — the single most important thing to understand

`main.py` exposes one route: `@app.api_route("/api/trpc/{procedures}")`.
Adding a backend procedure requires **two** edits:

1. Write the handler in `backend/routers/<domain>.py`.
2. Register it in the `dispatch_procedure()` if-chain in `main.py`.

Forgetting step 2 produces `Procedure not found: <name>` at runtime, never at
build time — the frontend is untyped, so nothing catches it.

Wire format (must be preserved exactly):
- Success: `[{"result": {"data": {"json": <value>}}}]`
- Error:   `[{"error": {"json": {"message", "code", "data": {"code", "httpStatus"}}}}]`
- Input arrives as a superjson envelope `{"json": <value>}` — always unwrap with `_parse_input()`.
- Responses are **arrays**, one entry per batched procedure, in request order.

## Serialization contract — read this before touching product/order code

The backend serializes deliberately, and the frontend must match:

- `price`, `total`, `averageRating` → **strings** (`"2800.00"`), not numbers.
  Always `parseFloat(String(x ?? 0))`. A bare `typeof x === 'number'` check
  silently evaluates to `0` — this caused the zero-star rating bug.
- `images`, `scentNotes`, `sizeOptions` → JSON **text columns** in SQLite,
  parsed to arrays by `_serialize_product()`. When writing, `json.dumps()` them.
- Dates → ISO strings.

## Auth model

Two independent systems — do not conflate them:

- **Customer**: session cookie `app_session_id` → server-side session store in
  `auth.py`. `/api/auth/demo-login` creates a demo user.
- **Admin**: `role='admin'` on the user row. Admin procedures must call
  `require_admin()`. Never trust a client-side admin flag.

Session store is an in-memory dict — **all sessions drop on server restart**.

## Rules for changing this project

1. **Never hardcode domain data in a component.** Products, orders, customers
   and promos come from the API. Hardcoded arrays are how the admin panel
   ended up non-functional.
2. **Never mark an order paid without gateway confirmation.** `paymentStatus`
   defaults to `pending` and only a verified webhook/callback may change it.
3. **Category is a DB enum.** Changing categories means editing the SAEnum in
   `database.py`, migrating existing rows, and updating every frontend
   reference. SQLite does not enforce enums, but SQLAlchemy validates on write.
4. **Validate on the backend too.** Frontend validation is UX; the API is the
   trust boundary.
5. `products.list` has `limit` default 12 — always pass an explicit limit.
6. Preserve the visual identity: `#C9A84C` gold, `#D4A5A5` rose, `#2C2C2C` ink,
   `#FAF7F2` cream, `#E8DDD0` border, Playfair Display headings.

## Running it

```bash
./whipandpour_project/run-local.sh dev    # FastAPI :8000 + Vite :5173
./whipandpour_project/run-local.sh prod   # build, serve everything from :8000
```
