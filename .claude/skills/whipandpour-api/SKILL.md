---
name: whipandpour-api
description: How to add, change, or debug a backend procedure in the Whip&Pour FastAPI tRPC bridge — handler placement, dispatcher registration, input parsing, error codes, and serialization. Load when touching whipandpour_project/backend.
---

# Whip & Pour — Backend / API Work

## Adding a procedure (the checklist)

1. **Handler** in `backend/routers/<domain>.py`. Signature takes `db: Session`
   first, then plain keyword args — never a Request object.
2. **Register** in `dispatch_procedure()` in `main.py`, inside the matching
   `# ── <domain> ──` block. Keep blocks grouped.
3. **Import** the handler at the top of `main.py`.
4. **Auth**: call `_require_user(request, db)` for customer-scoped procedures,
   `_require_admin(request, db)` for admin ones. Public procedures call neither.
5. **Validate** input explicitly and raise `TRPCError(message=..., code="BAD_REQUEST")`
   on bad data. Never let a `KeyError`/`ValueError` escape — it becomes a 500.

## Query vs mutation

The frontend decides: `useQuery` sends GET, `useMutation` sends POST. The
dispatcher receives `is_mutation` but currently ignores it. If you add a
destructive procedure, assert `is_mutation` is true so it can't be triggered
by a GET (CSRF / prefetch safety).

## Error codes

Raise `TRPCError(message, code)` with one of: `BAD_REQUEST`, `UNAUTHORIZED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_SERVER_ERROR`. The batch handler
maps these to tRPC numeric codes and HTTP status automatically.

`UNAUTHORIZED` must carry the message `UNAUTHED_ERR_MSG` ("Please login (10001)")
— `src/main.tsx` string-matches it to trigger the login redirect.

## Serialization

Use the existing `_serialize_*` helpers; don't return ORM objects. Keep
`Numeric` columns as `str(...)` and JSON text columns parsed with `json.loads`.
If you add a column, update the serializer **and** the TS interface in
`src/types/index.ts`.

## Testing a procedure by hand

```bash
# query (GET)
curl -s 'http://127.0.0.1:8000/api/trpc/products.list?batch=1&input=%7B%220%22%3A%7B%22limit%22%3A100%7D%7D'

# mutation (POST) — body is {"0": {"json": <input>}}
curl -s -b /tmp/wp-cookies.txt -X POST 'http://127.0.0.1:8000/api/trpc/admin.products.create?batch=1' \
  -H 'Content-Type: application/json' -d '{"0":{"json":{"name":"Test"}}}'
```

Get a session cookie first:
```bash
curl -c /tmp/wp-cookies.txt -X POST http://127.0.0.1:8000/api/auth/demo-login \
  -H 'Content-Type: application/json' -d '{"name":"Test","email":"test@example.com"}'
```

## Gotchas

- The SPA catch-all `@app.get("/{full_path:path}")` is registered last and only
  when `frontend/dist` exists. New API routes must start with `/api/` or the
  catch-all will swallow them.
- `init_db()` seeds **only when the table is empty**. Changing `SEED_PRODUCTS`
  has no effect on an existing `whipandpour.db` — delete the file or write a
  migration.
- In-memory sessions die on restart; `--reload` restarts on every file save,
  which logs you out mid-test.
