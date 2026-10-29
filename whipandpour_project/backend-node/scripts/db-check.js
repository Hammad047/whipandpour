#!/usr/bin/env node
/**
 * db-check.js — verify a database connection, layer by layer.
 *
 * Runs the same dialect selection the app uses, so it tests the connection the
 * app would actually make: DATABASE_URL means Postgres, DB_HOST/DB_NAME/DB_USER
 * mean MySQL, neither means the local SQLite file.
 *
 * It checks each layer separately and reports where the failure is, because
 * "cannot connect" has very different causes:
 *
 *   DNS      -> the hostname is wrong or stale
 *   TCP drop -> a firewall is discarding packets (an IP allowlist, typically)
 *   TCP refuse -> reachable, but nothing is listening on that port
 *   auth     -> wrong credentials, or the user has no grant for this host
 *   query    -> connected and authenticated, but the database is unusable
 *   schema   -> connected fine, but the tables are missing or empty
 *
 * Deliberately standalone and read-only. The write check uses a TEMPORARY
 * table, which never outlives the connection.
 *
 *   node scripts/db-check.js                         # whatever the env points at
 *   DATABASE_URL=… DB_SSL=true node scripts/db-check.js
 *   node scripts/db-check.js --no-write --timeout 15
 *
 * Exit code 0 means every check passed, 1 means something failed.
 */

// Loads .env the same way server.js does, so this reads exactly the
// configuration the app would use — and so no password has to be typed on a
// command line or left in shell history.
try {
  require("dotenv").config();
} catch {
  // dotenv is optional here; environment variables still work on their own.
}

const dns = require("dns").promises;
const net = require("net");
const crypto = require("crypto");

const argv = process.argv.slice(2);
const SKIP_WRITE = argv.includes("--no-write");
const TIMEOUT_S = Number((argv[argv.indexOf("--timeout") + 1] || "").trim()) || 10;
const TCP_TIMEOUT_MS = TIMEOUT_S * 1000;

const PASS = "  ok  ";
const FAIL = " FAIL ";
const WARN = " warn ";

let failed = false;
const note = (mark, label, detail) => {
  console.log(`${mark} ${label}${detail ? " — " + detail : ""}`);
  if (mark === FAIL) failed = true;
};

/** One raw TCP handshake, separating a silent drop from an active refusal. */
function tcpProbe(address, port) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const done = (extra) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ address, port, ms: Date.now() - started, ...extra });
    };
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once("connect", () => done({ ok: true, result: "connected" }));
    socket.once("timeout", () => done({ ok: false, result: "timeout" }));
    socket.once("error", (err) => done({ ok: false, result: err.code || err.message }));
    socket.connect({ host: address, port });
  });
}

(async () => {
  // Required late: loading db.js builds the connection from the environment.
  const db = require("../db");
  const { sequelize } = db;
  const dialect = sequelize.getDialect();
  const cfg = sequelize.config || {};

  console.log("=== configuration ===");
  note(PASS, `dialect ${dialect}`);
  if (dialect === "sqlite") {
    note(PASS, "storage", sequelize.options.storage);
  } else {
    // Quoted, so a stray space in an environment variable is visible. Never
    // the password, and never DATABASE_URL itself, which embeds it.
    note(cfg.host ? PASS : FAIL, "host", JSON.stringify(cfg.host || null));
    note(PASS, "port", String(cfg.port || "(default)"));
    note(cfg.database ? PASS : FAIL, "database", JSON.stringify(cfg.database || null));
    note(cfg.username ? PASS : WARN, "username", cfg.username ? "set" : "not set");
    note(cfg.password ? PASS : WARN, "password", cfg.password ? "set" : "not set");
    if (process.env.DATABASE_URL) {
      note(PASS, "DB_SSL", /^(1|true|yes)$/i.test(process.env.DB_SSL || "") ? "on" : "off");
    }
  }

  // ── network, for a server over the wire ────────────────────────────────────
  let addresses = [];
  if (dialect !== "sqlite" && cfg.host) {
    console.log("\n=== network ===");
    const port = Number(cfg.port || (dialect === "postgres" ? 5432 : 3306));
    try {
      const looked = await dns.lookup(cfg.host, { all: true, verbatim: true });
      addresses = looked.map((a) => ({ address: a.address, family: `IPv${a.family}` }));
      note(PASS, "DNS", addresses.map((a) => `${a.address} (${a.family})`).join(", "));
    } catch (err) {
      note(FAIL, "DNS", `${err.code || err.message} — the hostname does not resolve`);
    }

    for (const a of addresses) {
      const p = await tcpProbe(a.address, port);
      if (p.ok) {
        note(PASS, `TCP ${a.address}:${port}`, `connected in ${p.ms}ms`);
      } else if (p.result === "timeout") {
        note(
          a.family === "IPv6" ? WARN : FAIL,
          `TCP ${a.address}:${port}`,
          `no reply in ${p.ms}ms — packets are being dropped (firewall or IP allowlist)`
        );
      } else if (p.result === "ENETUNREACH" || p.result === "EHOSTUNREACH") {
        note(WARN, `TCP ${a.address}:${port}`, `${p.result} — no route (normal for IPv6 without IPv6 egress)`);
      } else if (p.result === "ECONNREFUSED") {
        note(FAIL, `TCP ${a.address}:${port}`, "refused — reachable, but nothing is listening there");
      } else {
        note(FAIL, `TCP ${a.address}:${port}`, p.result);
      }
    }
  }

  // ── the driver's own handshake ─────────────────────────────────────────────
  console.log("\n=== connection ===");
  const t0 = Date.now();
  try {
    await sequelize.authenticate();
    note(PASS, "authenticate()", `${Date.now() - t0}ms`);
  } catch (err) {
    const code = err.original?.code || err.parent?.code || err.name;
    note(FAIL, "authenticate()", `${code}${err.message && err.message !== code ? " — " + err.message : ""}`);
    console.log("\n=== verdict ===");
    console.log(verdict(code, addresses));
    await sequelize.close().catch(() => {});
    process.exit(1);
  }

  try {
    const version = await sequelize.databaseVersion();
    note(PASS, "server version", version);
  } catch (err) {
    note(WARN, "server version", err.message);
  }

  // ── a real round trip ──────────────────────────────────────────────────────
  try {
    await sequelize.query("SELECT 1");
    note(PASS, "SELECT 1");
  } catch (err) {
    note(FAIL, "SELECT 1", err.message);
  }

  if (!SKIP_WRITE) {
    // TEMPORARY is understood by MySQL, Postgres and SQLite alike, and the
    // table disappears when this connection closes — nothing is left behind.
    const tmp = `dbcheck_${crypto.randomBytes(4).toString("hex")}`;
    try {
      await sequelize.query(`CREATE TEMPORARY TABLE ${tmp} (n INTEGER)`);
      await sequelize.query(`INSERT INTO ${tmp} (n) VALUES (1)`);
      const [rows] = await sequelize.query(`SELECT n FROM ${tmp}`);
      await sequelize.query(`DROP TABLE ${tmp}`);
      note(rows.length === 1 ? PASS : FAIL, "write permission", "temporary table created, written, read back, dropped");
    } catch (err) {
      note(FAIL, "write permission", err.message);
    }
  }

  // ── schema ────────────────────────────────────────────────────────────────
  console.log("\n=== schema ===");
  const MODELS = [
    ["users", db.User], ["collections", db.Collection], ["products", db.Product],
    ["orders", db.Order], ["orderItems", db.OrderItem], ["carts", db.Cart],
    ["wishlists", db.Wishlist], ["reviews", db.Review], ["promoCodes", db.PromoCode],
    ["siteSettings", db.SiteSetting], ["authSessions", db.AuthSession],
    ["uploadedImages", db.UploadedImage], ["pageViews", db.PageView],
  ];

  let present = 0;
  let missing = [];
  for (const [label, Model] of MODELS) {
    try {
      const n = await Model.count();
      present += 1;
      console.log(`${PASS} ${label.padEnd(16)} ${String(n).padStart(7)} rows`);
    } catch (err) {
      missing.push(label);
      console.log(`${WARN} ${label.padEnd(16)} missing (${err.original?.code || err.name})`);
    }
  }

  if (missing.length === MODELS.length) {
    note(WARN, "schema", "no tables yet — run the app once, or db-transfer.js load, to create them");
  } else if (missing.length) {
    note(WARN, "schema", `${present}/${MODELS.length} tables present; missing: ${missing.join(", ")}`);
  } else {
    note(PASS, "schema", `all ${MODELS.length} tables present`);
  }

  console.log("\n=== verdict ===");
  console.log(failed ? "Something failed above. See the first FAIL line." : "Database connection is healthy.");
  await sequelize.close().catch(() => {});
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("\nUnexpected error:", err.message);
  process.exit(1);
});

function verdict(code, addresses) {
  const dropped = addresses.length > 0;
  switch (code) {
    case "ETIMEDOUT":
      return [
        "The connection timed out with no reply at all.",
        "",
        "That is a firewall discarding packets, not a database refusing them —",
        "a database that disliked your credentials would answer and say so.",
        "",
        "  - If the database is on shared hosting, check its remote-access IP",
        "    allowlist, and be aware many shared hosts block cloud/datacenter",
        "    ranges at the firewall regardless of that allowlist.",
        "  - Compare this result from another network: if a home connection",
        "    reaches it and a cloud host does not, the range is blocklisted.",
      ].join("\n");
    case "ECONNREFUSED":
      return "Reachable, but nothing is listening on that port. Check the port number, and that the database accepts remote connections at all.";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "The hostname does not resolve. Check it against the provider's panel — hosts change when an account is migrated between servers.";
    case "ER_ACCESS_DENIED_ERROR":
    case "28P01":
      return "Reached the database, but the credentials were rejected. Check the user and password.";
    case "ER_HOST_NOT_PRIVILEGED":
      return "Reached the database, but this host is not granted access. Add it to the remote-access allowlist.";
    case "ER_BAD_DB_ERROR":
    case "3D000":
      return "Connected and authenticated, but that database name does not exist.";
    case "ER_DBACCESS_DENIED_ERROR":
      return "Authenticated, but this user has no rights on that database.";
    default:
      return `Unrecognised failure (${code}). The authenticate() line above has the driver's own message.`;
  }
}
