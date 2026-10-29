#!/usr/bin/env bash
#
# migrate.sh — move the store's data from Hostinger MySQL to Render Postgres.
#
# Run this on a machine that can already reach the MySQL server (the owner's
# laptop can; Render cannot, which is the reason for the move). It prompts for
# the credentials it needs, so nothing is stored in the script or left in shell
# history, and it checks each database before touching anything.
#
#   bash scripts/migrate.sh
#
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mStopped:\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "node is not on PATH."
[ -f scripts/db-transfer.js ] || die "run this from the repository (scripts/db-transfer.js not found)."
[ -f scripts/db-check.js ]    || die "scripts/db-check.js not found — run: git pull"

DUMP="$HOME/wp-dump-$(date +%Y%m%d-%H%M%S).json"

bold "=== 1/5  MySQL (the database you are moving FROM) ==="
read -rp "  host     [srv1042.hstgr.io]: " MY_HOST;  MY_HOST=${MY_HOST:-srv1042.hstgr.io}
read -rp "  port     [3306]: "            MY_PORT;  MY_PORT=${MY_PORT:-3306}
read -rp "  database [u897553836_whipandpourdb]: " MY_DB; MY_DB=${MY_DB:-u897553836_whipandpourdb}
read -rp "  user     [u897553836_adminmanager]: "   MY_USER; MY_USER=${MY_USER:-u897553836_adminmanager}
read -rsp "  password (not shown): " MY_PASS; echo
[ -n "$MY_PASS" ] || die "no password entered."

# DATABASE_URL is blanked throughout the MySQL steps: db.js prefers it, so a
# leftover value in .env would silently point these at the wrong database.
mysql_env() {
  env DATABASE_URL= DB_SSL= \
      DB_HOST="$MY_HOST" DB_PORT="$MY_PORT" DB_NAME="$MY_DB" \
      DB_USER="$MY_USER" DB_PASSWORD="$MY_PASS" "$@"
}

bold ""
bold "=== 2/5  Checking MySQL before reading anything ==="
mysql_env node scripts/db-check.js || die "MySQL check failed. Nothing was changed."

bold ""
bold "=== 3/5  Dumping MySQL ==="
mysql_env node scripts/db-transfer.js dump "$DUMP" || die "dump failed. Nothing was changed."
chmod 600 "$DUMP"
bold "  dump written to $DUMP (mode 600 — it holds every customer order)"

bold ""
bold "=== 4/5  Postgres (the database you are moving TO) ==="
echo "  Paste Render's EXTERNAL connection string (starts postgres://)."
read -rsp "  connection string (not shown): " PG_URL; echo
case "$PG_URL" in
  postgres://*|postgresql://*) ;;
  *) die "that does not look like a postgres:// connection string." ;;
esac

pg_env() { env DATABASE_URL="$PG_URL" DB_SSL=true "$@"; }

echo
echo "  Checking the target. A brand-new database reports 'no tables yet' — that is expected."
pg_env node scripts/db-check.js || die "Postgres check failed. Your MySQL is untouched and the dump is kept."

bold ""
bold "=== 5/5  Loading into Postgres ==="
echo "  This EMPTIES every table in the target first, then loads the dump and"
echo "  verifies each row count. Your MySQL is only ever read, never written."
read -rp "  Type LOAD to continue: " CONFIRM
[ "$CONFIRM" = "LOAD" ] || die "cancelled. Nothing was changed."

pg_env node scripts/db-transfer.js load "$DUMP" --force || die "load failed. Your MySQL is untouched and the dump is kept at $DUMP"

bold ""
bold "=== Verifying the result ==="
pg_env node scripts/db-check.js || die "the post-load check failed — do not switch the app over yet."

cat <<DONE

$(bold "Migration complete.")

Next, in Render -> your web service -> Environment:

  ADD     DATABASE_URL = <the INTERNAL connection string, not the external one>
  DELETE  DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
  DELETE  DIAG_TOKEN
  SET     KEEPALIVE_ENABLED = false

Saving triggers a redeploy. Then confirm:

  curl -s https://api.whipandpour.com/api/health

You want "database":"ready".

Keep $DUMP somewhere safe and out of the repository — it is a complete copy of
your data. To roll back, restore the DB_* variables and delete DATABASE_URL;
nothing in this script modified your MySQL.
DONE
