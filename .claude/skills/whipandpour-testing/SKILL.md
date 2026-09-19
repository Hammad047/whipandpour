---
name: whipandpour-testing
description: How to verify Whip&Pour changes — backend curl checks, persistence testing across restart, production build, and browser verification. Load before claiming any change works.
---

# Whip & Pour — Verification

There is no automated test suite in this project. Verification is manual and
must actually be run — never report a change as working without evidence.

## 1. Backend

```bash
curl -s http://127.0.0.1:8000/api/health
curl -s 'http://127.0.0.1:8000/api/trpc/products.list?batch=1&input=%7B%220%22%3A%7B%22limit%22%3A100%7D%7D'
```
A `{"error": …}` entry in the array is a failure even though HTTP status is 200.
Check `[0].error` explicitly, not just the status code.

## 2. Persistence — the test that matters

A change is only persisted if it survives all four:

1. Component unmount (navigate away and back)
2. Browser refresh (`F5`)
3. **Server restart** (kill uvicorn, start it again)
4. A fresh `curl` against the API with no browser involved

Step 4 is the real proof: if the data is not in the API response, it is not in
the database, regardless of what the UI shows.

```bash
sqlite3 backend/whipandpour.db "SELECT id,name,slug,category,price,stock FROM products ORDER BY id DESC LIMIT 5;"
```

## 3. Build

```bash
cd whipandpour_project/frontend && npm run build
```
`npm run build` is `vite build` — esbuild strips types without checking them.
It will **not** catch type errors. For that run `npx tsc --noEmit` separately
and read the output critically (the untyped tRPC router produces expected noise).

## 4. Browser

Load the page, then check the console and network tab. Specifically:
- zero console errors
- no request returning a tRPC `error` envelope
- images resolve (a broken `src` is silent unless you look)

Test at 1280×800 (desktop), 768×1024 (tablet), 375×812 (mobile). The navbar,
admin tables, and filter controls have distinct mobile paths.

## 5. Data integrity spot-checks

- product IDs stable across edits
- no duplicate slugs: `SELECT slug, COUNT(*) FROM products GROUP BY slug HAVING COUNT(*)>1;`
- no duplicate order numbers: same query on `orders.orderNumber`
- no order marked paid without a gateway reference:
  `SELECT id,orderNumber,paymentStatus,stripePaymentIntentId FROM orders WHERE paymentStatus='completed';`
