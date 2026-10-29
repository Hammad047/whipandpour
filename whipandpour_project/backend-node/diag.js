/**
 * diag.js — a token-gated connectivity report, for diagnosing a database the
 * application cannot reach.
 *
 * WHY NOT ADMIN AUTH
 * Admin auth looks the user up in the database, so it is unavailable during
 * exactly the outage this endpoint exists for. The gate is a shared secret
 * from the environment instead, and the endpoint is off entirely unless that
 * secret is set — so it is inert on every deploy that has not opted in.
 *
 * Answers three questions that are otherwise hard to get off a host with no
 * shell: what IP this service connects out from (what to allowlist), what
 * DB_HOST actually resolves to, and whether TCP to the database port is
 * dropped, refused, or fine.
 *
 * Remove it once the connectivity question is settled.
 */

const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");

const MIN_TOKEN_LENGTH = 16;
const TCP_TIMEOUT_MS = 8_000;
const EGRESS_TIMEOUT_MS = 6_000;
const MAX_PROBES = 4;

/** Constant-time compare. Hashed first so the digests hide the token length. */
function tokenMatches(provided, expected) {
  const a = crypto.createHash("sha256").update(String(provided)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * The public IP this service leaves from — the value to put in a database
 * allowlist. Comes from an external echo service, since a host behind NAT
 * cannot see its own public address.
 */
async function egressIp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EGRESS_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { ip: (await res.json()).ip };
  } catch (err) {
    return { error: err.name === "AbortError" ? "timeout" : err.code || err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveHost(host) {
  const out = { host, a: [], aaaa: [], connectOrder: [], errors: {} };
  await Promise.all([
    dns.resolve4(host).then((r) => { out.a = r; }, (e) => { out.errors.a = e.code || e.message; }),
    dns.resolve6(host).then((r) => { out.aaaa = r; }, (e) => { out.errors.aaaa = e.code || e.message; }),
    // The order Node's own connect path would try. This is what produces an
    // AggregateError with one entry per address when every attempt fails.
    dns.lookup(host, { all: true, verbatim: true }).then(
      (r) => { out.connectOrder = r.map((x) => ({ address: x.address, family: `IPv${x.family}` })); },
      (e) => { out.errors.lookup = e.code || e.message; }
    ),
  ]);
  return out;
}

/** One raw TCP handshake, with the outcome split into dropped vs refused. */
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
    socket.once("timeout", () =>
      done({ ok: false, result: "timeout", meaning: "packets dropped — firewall or IP allowlist" })
    );
    socket.once("error", (err) =>
      done({
        ok: false,
        result: err.code || err.message,
        meaning:
          err.code === "ECONNREFUSED"
            ? "reachable, but nothing is listening on that port"
            : err.code === "EHOSTUNREACH" || err.code === "ENETUNREACH"
              ? "no route to that address from here"
              : undefined,
      })
    );
    socket.connect({ host: address, port });
  });
}

function verdictFor(probes, dnsInfo) {
  if (dnsInfo.errors && dnsInfo.errors.lookup) {
    return {
      state: "dns-failed",
      nextStep: `DB_HOST does not resolve (${dnsInfo.errors.lookup}). Check it for typos against the hostname hPanel shows.`,
    };
  }
  if (!probes.length) {
    return { state: "not-probed", nextStep: "DB_HOST is not set in this environment." };
  }
  if (probes.some((p) => p.ok)) {
    return {
      state: "tcp-reachable",
      nextStep:
        "The network is fine. A failure now is past the handshake — credentials, database name, or the user's host grant.",
    };
  }

  // An unroutable IPv6 address is the normal state of a host with no IPv6
  // egress, and says nothing about the database. Judge on the rest, or the
  // verdict is "mixed" every time and useless.
  const unroutable = probes.filter((p) => p.result === "ENETUNREACH" || p.result === "EHOSTUNREACH");
  const routable = probes.filter((p) => !unroutable.includes(p));
  const note = unroutable.length
    ? `${unroutable.length} of ${probes.length} addresses had no route from here (IPv6, most likely). That is expected on a host without IPv6 egress and is not the cause.`
    : undefined;

  if (!routable.length) {
    return {
      state: "no-route",
      note,
      nextStep:
        "Every resolved address was unroutable. If they are all IPv6, the database hostname needs an IPv4 (A) record reachable from here.",
    };
  }
  if (routable.every((p) => p.result === "timeout")) {
    return {
      state: "all-dropped",
      note,
      nextStep:
        "Every routable address silently dropped the connection — the signature of an IP allowlist or firewall. Add the egress IP above in hPanel -> Databases -> Remote MySQL, and confirm DB_HOST still matches the server hPanel shows.",
    };
  }
  if (routable.every((p) => p.result === "ECONNREFUSED")) {
    return {
      state: "refused",
      note,
      nextStep:
        "The host answered and refused: it is reachable, but nothing is listening on that port. Check DB_PORT and that remote MySQL is enabled at all.",
    };
  }
  return { state: "mixed", note, nextStep: "See each probe's meaning below." };
}

function registerDiag(app) {
  const expected = (process.env.DIAG_TOKEN || "").trim();
  const enabled = expected.length >= MIN_TOKEN_LENGTH;

  app.get("/api/diag", async (req, res) => {
    if (!enabled) {
      return res.status(404).json({
        message: "Diagnostics are disabled.",
        hint: `Set DIAG_TOKEN to at least ${MIN_TOKEN_LENGTH} characters and redeploy to enable.`,
      });
    }

    const provided = req.get("x-diag-token") || req.query.token || "";
    // 404 rather than 401, so a wrong token does not confirm the route exists.
    if (!provided || !tokenMatches(provided, expected)) {
      return res.status(404).json({ message: "Not found." });
    }

    const host = (process.env.DB_HOST || "").trim();
    const port = Number(process.env.DB_PORT || 3306);

    const [egress, dnsInfo] = await Promise.all([
      egressIp(),
      host ? resolveHost(host) : Promise.resolve({ host: null, errors: { lookup: "DB_HOST is not set" } }),
    ]);

    const targets = (dnsInfo.connectOrder || []).slice(0, MAX_PROBES);
    const probes = await Promise.all(targets.map((t) => tcpProbe(t.address, port)));

    res.json({
      checkedAt: new Date().toISOString(),
      node: process.version,
      render: {
        service: process.env.RENDER_SERVICE_NAME ?? null,
        region: process.env.RENDER_SERVICE_REGION ?? null,
        instance: process.env.RENDER_INSTANCE_ID ?? null,
      },
      // Values, not secrets: the host is quoted so stray whitespace is visible,
      // and the credentials are reported only as present or absent.
      env: {
        DB_HOST: JSON.stringify(process.env.DB_HOST ?? null),
        DB_PORT: port,
        DB_NAME_set: Boolean(process.env.DB_NAME),
        DB_USER_set: Boolean(process.env.DB_USER),
        DB_PASSWORD_set: Boolean(process.env.DB_PASSWORD),
      },
      egress,
      dns: dnsInfo,
      tcp: probes,
      verdict: verdictFor(probes, dnsInfo),
    });
  });
}

module.exports = { registerDiag };
