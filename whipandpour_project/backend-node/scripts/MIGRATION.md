# Moving the database onto the app's host

## Why

The store's MySQL lives on Hostinger and is reached across the public internet.
Hostinger only accepts MySQL from IPs in its Remote MySQL allowlist, and
Render's free tier sends outbound traffic from *shared regional ranges* rather
than an address that belongs to us. When Render reschedules the service onto a
different address, the allowlist stops matching and every query fails with
`ETIMEDOUT` — silently, because the firewall drops rather than refuses.

That is what took the store down on 2026-10-29. Allowlisting the new IP fixes
it until the next reschedule. Putting the database on the same host as the app
removes the public-internet hop altogether: no egress IP, no allowlist, nothing
to rotate.

## Before you start

- The dump runs from a machine that **can already reach** the Hostinger MySQL —
  the owner's laptop qualifies, since its IP is in the allowlist.
- Create the Postgres instance on Render first. It has two connection strings:
  - **internal** — for the app. Private network, no SSL needed.
  - **external** — for running this migration from a laptop. Needs `DB_SSL=true`.

## Steps

```bash
cd whipandpour_project/backend-node

# 1. Dump the live MySQL. Produces readable JSON, so it doubles as a backup.
DB_HOST=srv1042.hstgr.io DB_NAME=<name> DB_USER=<user> DB_PASSWORD=<password> \
  node scripts/db-transfer.js dump ./wp-dump.json

# 2. Load it into the new Postgres, using the EXTERNAL connection string.
#    --force is required: the load empties every table first, because
#    creating the schema also seeds demo products.
DATABASE_URL='postgres://…external…' DB_SSL=true \
  node scripts/db-transfer.js load ./wp-dump.json --force
```

The load prints a row count per table and fails loudly if any count differs
from the dump. Do not continue unless it ends with `transferred and verified`.

```
# 3. Point the app at it: in Render's Environment tab
DATABASE_URL = <the INTERNAL connection string>
# and delete DB_HOST, DB_NAME, DB_USER, DB_PASSWORD so nothing falls back.
```

Deploy. `/api/health` should report `"database":"ready"`, and `/api/ready`
should return 200.

## Afterwards

- Keep `wp-dump.json` somewhere safe; it is a full copy of the store's data.
- Delete `DIAG_TOKEN` and remove `diag.js` — it exists only for the outage.
- Hostinger's MySQL can stay as a cold backup for a while; nothing points at it.

## What this migration had to change

Sequelize hides most dialect differences, but not these:

| Thing | MySQL | Postgres |
|---|---|---|
| `LIKE` | case-insensitive by collation | case-sensitive — product search needed `ILIKE` |
| day of a timestamp | `DATE(x)` | no such function — needs `CAST(x AS DATE)` |
| unquoted `camelCase` in raw SQL | preserved | folded to lowercase — the `HAVING` clause needed quoting |
| booleans | `TINYINT` 0/1 | real `BOOLEAN` — coerced during the load |
| `BLOB` | `LONGBLOB` | `BYTEA` — base64-encoded through the JSON dump |
| inserted ids | sequence unaffected | sequences must be reset or the next insert collides |

All six are handled, and verified against live MySQL 8 and Postgres 16.
