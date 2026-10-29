#!/usr/bin/env node
/**
 * db-transfer.js — copy every row from one database into another.
 *
 * Written to move this store off a MySQL server reached across the public
 * internet (whose firewall allowlists an egress IP that Render rotates) onto a
 * database on the same host as the app. It is dialect-agnostic: the dialect is
 * chosen by the environment, exactly as the app chooses it, so the same models
 * define the schema on both sides and nothing is translated by hand.
 *
 *   # 1. dump, with the OLD database's credentials in the environment
 *   DB_HOST=… DB_NAME=… DB_USER=… DB_PASSWORD=… \
 *     node scripts/db-transfer.js dump ./wp-dump.json
 *
 *   # 2. load, with the NEW database's connection string
 *   DATABASE_URL=postgres://… \
 *     node scripts/db-transfer.js load ./wp-dump.json --force
 *
 * The dump is plain JSON, so it doubles as a readable backup. --force is
 * required to load because the load empties every table first.
 */

// Loads .env the same way server.js does, so this reads exactly the
// configuration the app would use — and so no password has to be typed on a
// command line or left in shell history.
try {
  require("dotenv").config();
} catch {
  // dotenv is optional here; environment variables still work on their own.
}

const fs = require("fs");
const path = require("path");
const db = require("../db");

// No associations are declared anywhere in db.js, so sync() creates no foreign
// keys and the order below is for readability only, not correctness.
const MODELS = [
  ["users", db.User],
  ["collections", db.Collection],
  ["products", db.Product],
  ["orders", db.Order],
  ["orderItems", db.OrderItem],
  ["carts", db.Cart],
  ["wishlists", db.Wishlist],
  ["reviews", db.Review],
  ["promoCodes", db.PromoCode],
  ["siteSettings", db.SiteSetting],
  ["authSessions", db.AuthSession],
  ["uploadedImages", db.UploadedImage],
  ["pageViews", db.PageView],
];

const BUFFER_TAG = "__buffer_base64";
const CHUNK = 500;

/** Binary columns (uploadedImages.data) survive JSON only as base64. */
function encodeValue(value) {
  return Buffer.isBuffer(value) ? { [BUFFER_TAG]: value.toString("base64") } : value;
}

function decodeValue(value) {
  if (value && typeof value === "object" && typeof value[BUFFER_TAG] === "string") {
    return Buffer.from(value[BUFFER_TAG], "base64");
  }
  return value;
}

/** Columns this model declares as BOOLEAN. MySQL returns them as 0/1, which
 *  Postgres rejects outright, so they are coerced on the way in. */
function booleanColumns(Model) {
  return Object.entries(Model.rawAttributes)
    .filter(([, a]) => a.type && a.type.key === "BOOLEAN")
    .map(([name]) => name);
}

function autoIncrementKey(Model) {
  const found = Object.entries(Model.rawAttributes).find(([, a]) => a.autoIncrement);
  return found ? found[0] : null;
}

async function dump(file) {
  const out = {
    meta: {
      createdAt: new Date().toISOString(),
      dialect: db.sequelize.getDialect(),
      host: db.sequelize.config.host || "(connection string)",
      database: db.sequelize.config.database,
    },
    tables: {},
  };

  for (const [name, Model] of MODELS) {
    const rows = await Model.findAll({ raw: true });
    out.tables[name] = rows.map((row) => {
      const encoded = {};
      for (const [k, v] of Object.entries(row)) encoded[k] = encodeValue(v);
      return encoded;
    });
    console.log(`  ${name.padEnd(16)} ${String(rows.length).padStart(6)} rows`);
  }

  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  const total = Object.values(out.tables).reduce((n, r) => n + r.length, 0);
  console.log(`\nWrote ${total} rows from ${out.meta.dialect} to ${path.resolve(file)}`);
}

async function load(file, force) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const dialect = db.sequelize.getDialect();
  const target = db.sequelize.config.database || "(connection string)";

  console.log(`source : ${parsed.meta.dialect} / ${parsed.meta.database} (dumped ${parsed.meta.createdAt})`);
  console.log(`target : ${dialect} / ${target}`);

  if (!force) {
    console.error("\nRefusing to load without --force: the load empties every table first.");
    process.exitCode = 1;
    return;
  }

  console.log("\nCreating schema…");
  await db.initDb();

  // initDb() seeds products, collections, reviews and promo codes on an empty
  // database. Those seeds must go before the real rows land, or the store ends
  // up with demo products beside the genuine catalogue.
  console.log("Clearing seeded rows…");
  const tableNames = MODELS.map(([, M]) => M.getTableName());
  if (dialect === "postgres") {
    await db.sequelize.query(
      `TRUNCATE ${tableNames.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
    );
  } else {
    for (const [, Model] of [...MODELS].reverse()) {
      await Model.destroy({ where: {}, truncate: true, force: true });
    }
  }

  let total = 0;
  for (const [name, Model] of MODELS) {
    const rows = parsed.tables[name] || [];
    if (!rows.length) {
      console.log(`  ${name.padEnd(16)}      0 rows`);
      continue;
    }
    const bools = booleanColumns(Model);
    const prepared = rows.map((row) => {
      const r = {};
      for (const [k, v] of Object.entries(row)) r[k] = decodeValue(v);
      for (const b of bools) {
        if (r[b] !== null && r[b] !== undefined) r[b] = Boolean(Number(r[b]) || r[b] === true);
      }
      return r;
    });

    for (let i = 0; i < prepared.length; i += CHUNK) {
      // validate:false because these rows were already accepted by the source
      // database; re-validating would reject legacy rows for rules added since.
      await Model.bulkCreate(prepared.slice(i, i + CHUNK), { validate: false, hooks: false });
    }
    total += prepared.length;
    console.log(`  ${name.padEnd(16)} ${String(prepared.length).padStart(6)} rows`);
  }

  // Postgres sequences do not notice explicitly inserted ids, so the next
  // insert would collide with an existing primary key.
  if (dialect === "postgres") {
    console.log("Resetting id sequences…");
    for (const [, Model] of MODELS) {
      const key = autoIncrementKey(Model);
      if (!key) continue;
      const table = Model.getTableName();
      await db.sequelize.query(
        `SELECT setval(pg_get_serial_sequence('"${table}"', '${key}'),
                       COALESCE((SELECT MAX("${key}") FROM "${table}"), 1), true)`
      );
    }
  }

  console.log("\nVerifying row counts…");
  let mismatched = 0;
  for (const [name, Model] of MODELS) {
    const expected = (parsed.tables[name] || []).length;
    const actual = await Model.count();
    const ok = expected === actual;
    if (!ok) mismatched += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(16)} expected ${expected}, got ${actual}`);
  }

  if (mismatched) {
    console.error(`\n${mismatched} table(s) do not match. Do not switch the app over.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${total} rows transferred and verified.`);
  }
}

(async () => {
  const [mode, file] = process.argv.slice(2);
  const force = process.argv.includes("--force");

  if (!mode || !file || !["dump", "load"].includes(mode)) {
    console.error("usage: db-transfer.js <dump|load> <file.json> [--force]");
    process.exit(1);
  }

  try {
    await db.sequelize.authenticate();
    if (mode === "dump") await dump(file);
    else await load(file, force);
  } finally {
    await db.sequelize.close();
  }
})().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
