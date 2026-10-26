/**
 * analytics.js — visitor tracking: one row per page view, aggregated for the
 * admin panel's Visitors page.
 *
 * WHAT IS AND IS NOT STORED
 * No raw IP address is ever written. The IP and user agent are combined into
 * an HMAC-SHA256 `visitorId` under a server-held salt, which is enough to tell
 * two visitors apart and to recognise a returning one, but is not reversible
 * into an address. The salt is generated once and kept in siteSettings, so
 * visitor identity survives restarts without needing configuration.
 *
 * Rotating the salt (delete the `analytics.salt` row, or set ANALYTICS_SALT to
 * something new) makes every historical visitorId unmatchable — a deliberate
 * reset switch rather than a bug.
 *
 * GEOGRAPHY
 * Country comes from Cloudflare's CF-IPCountry header, which the store already
 * sits behind, so there is no IP-geolocation lookup and no third party in the
 * request path. City is only populated if CF-IPCity arrives, which Cloudflare
 * sends on Enterprise plans; on the free plan it stays null. City-level data
 * would need a local GeoLite2 database.
 *
 * RETENTION
 * Rows older than ANALYTICS_RETENTION_DAYS (default 90) are pruned, because
 * this is the one table that grows with traffic rather than with orders.
 */

const crypto = require("crypto");
const cookie = require("cookie");
const { PageView, SiteSetting, Op } = require("../db");
const { crossSiteCookie } = require("../auth");
const { fn, col, literal } = require("sequelize");

const SALT_SETTING_KEY = "analytics.salt";
const VISITOR_COOKIE = "wp_vid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year
// Shape of a cookie-issued id: the "c_" prefix distinguishes it from the
// 32-hex HMAC ids issued before cookies existed, and from each other in the
// admin table, so it is visible which rows carry a reliable identity.
const VISITOR_COOKIE_PATTERN = /^c_[A-Za-z0-9_-]{22}$/;
const DEFAULT_RETENTION_DAYS = 90;
const VISIT_GAP_MINUTES = 30;
const MAX_PATH_LENGTH = 500;

// Per-visitor write ceiling, so a public endpoint that inserts a row cannot be
// used to inflate the table. Generous enough that real browsing never trips it.
const RATE_LIMIT_PER_MINUTE = 60;
// A route change that repeats the same path within this window is a double
// render, not a second visit.
const DEDUPE_MS = 2_000;

// ─── Visitor identity ────────────────────────────────────────────────────────

let cachedSalt = null;

/**
 * The HMAC salt, from ANALYTICS_SALT when set, otherwise generated once and
 * persisted. Persisting matters: a per-boot random salt would make every
 * restart look like a fresh crowd of visitors.
 */
async function getSalt() {
  if (cachedSalt) return cachedSalt;

  const configured = (process.env.ANALYTICS_SALT || "").trim();
  if (configured) {
    cachedSalt = configured;
    return cachedSalt;
  }

  const [row] = await SiteSetting.findOrCreate({
    where: { key: SALT_SETTING_KEY },
    defaults: { value: crypto.randomBytes(32).toString("base64url"), updatedAt: new Date() },
  });
  cachedSalt = row.value;
  return cachedSalt;
}

/**
 * Client IP, preferring Cloudflare's header since the store sits behind it.
 * x-forwarded-for is a comma-separated chain; the first entry is the client.
 */
function clientIp(req) {
  const cf = (req.headers["cf-connecting-ip"] || "").trim();
  if (cf) return cf;
  const forwarded = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded) return forwarded;
  return req.ip || req.socket?.remoteAddress || "unknown";
}

async function visitorIdFor(req) {
  const salt = await getSalt();
  const material = `${clientIp(req)}|${req.headers["user-agent"] || ""}`;
  return crypto.createHmac("sha256", salt).update(material).digest("hex").slice(0, 32);
}

/**
 * The visitor's id, preferring a cookie this server issued.
 *
 * WHY A COOKIE BEATS THE HMAC
 * The HMAC is derived from IP and user agent, so it gets two things wrong that
 * matter badly on mobile networks: a visitor whose carrier IP rotates turns
 * into a second visitor, and two people behind one carrier NAT using the same
 * browser collapse into one. Carrier-grade NAT is the norm on Pakistani mobile
 * networks, which is most of this store's traffic. A random id issued once and
 * returned by the browser has neither problem.
 *
 * The cookie is same-site rather than third-party: the API and the storefront
 * share the registrable domain whipandpour.com, so SameSite=Lax is sent and
 * no third-party cookie blocking applies. It is also server-set, which keeps
 * it clear of Safari's 7-day cap on script-written storage.
 *
 * The id is used on the very request that issues the cookie, not from the next
 * one onwards. Deferring it would split a new visitor's first visit across two
 * ids and break the page-path trail, which is the thing the visit log is for.
 *
 * LIMITS, PLAINLY
 * A cookie identifies a browser, not a person: the same shopper on a phone and
 * a laptop is two visitors, and cleared cookies or a private window start
 * over. A client that refuses cookies gets a fresh id per page view and
 * inflates the visitor count — uncommon for a same-site cookie, but real.
 */
async function resolveVisitorId(req, res) {
  const existing = cookie.parse(req.headers.cookie || "")[VISITOR_COOKIE];
  if (existing && VISITOR_COOKIE_PATTERN.test(existing)) return existing;

  // Defensive: without a response to write to there is nowhere to put the
  // cookie, so fall back to the derived id rather than minting one that can
  // never come back.
  if (!res || res.headersSent) return visitorIdFor(req);

  const id = `c_${crypto.randomBytes(16).toString("base64url")}`;
  const crossSite = crossSiteCookie();
  res.append("Set-Cookie", cookie.serialize(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite, // SameSite=None is rejected by browsers without Secure.
    maxAge: VISITOR_COOKIE_MAX_AGE,
    path: "/",
  }));
  return id;
}

// ─── User-agent parsing ──────────────────────────────────────────────────────

// Matching crawlers by name is imperfect by nature — a crawler that does not
// announce itself gets counted as a visitor. It removes the obvious noise
// (search engines, social unfurlers, uptime pingers) rather than claiming to
// be exhaustive.
const BOT_PATTERN = /bot\b|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|discordbot|preview|headless|phantom|puppeteer|playwright|curl\/|wget\/|python-requests|go-http-client|axios\/|okhttp|monitor|uptime|pingdom|better ?uptime|cron-job\.org|whipandpour-keepalive|lighthouse|gtmetrix|pagespeed/i;

function isBot(userAgent) {
  return BOT_PATTERN.test(userAgent || "");
}

function parseDevice(userAgent) {
  const ua = userAgent || "";
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  if (!ua) return "unknown";
  return "desktop";
}

function parseBrowser(userAgent) {
  const ua = userAgent || "";
  // Order matters: Edge and Opera both carry "Chrome", and Chrome carries
  // "Safari", so the more specific names have to be tested first.
  if (/edg(e|a|ios)?\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return null;
}

function parseOs(userAgent) {
  const ua = userAgent || "";
  if (/windows nt/i.test(ua)) return "Windows";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/android/i.test(ua)) return "Android";
  if (/linux/i.test(ua)) return "Linux";
  return null;
}

// ─── Input normalisation ─────────────────────────────────────────────────────

/**
 * Keep the path, drop the query string. Query strings are where stray personal
 * data ends up (an email in a link, a session token someone pasted), and none
 * of it is wanted in an analytics table.
 */
function normalisePath(raw) {
  let value = String(raw || "/").trim();
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.split("?")[0].split("#")[0];
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value.slice(0, MAX_PATH_LENGTH) || "/";
}

/** Host only — see the note on referrerHost in the model. */
function normaliseReferrerHost(raw, req) {
  const value = String(raw || "").trim();
  if (!value) return null;
  let host;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
  // Internal navigation is not a referral, and recording it would bury the
  // real traffic sources under the store's own hostname.
  const ownHost = String(req.headers.host || "").split(":")[0].toLowerCase();
  if (!host || host === ownHost) return null;
  return host.replace(/^www\./, "").slice(0, 255);
}

function countryFrom(req) {
  const raw = String(req.headers["cf-ipcountry"] || "").trim().toUpperCase();
  // Cloudflare sends XX for anonymised clients and T1 for Tor.
  if (!raw || raw.length !== 2 || raw === "XX" || raw === "T1") return null;
  return raw;
}

function cityFrom(req) {
  const raw = String(req.headers["cf-ipcity"] || "").trim();
  return raw ? raw.slice(0, 100) : null;
}

// ─── Rate limiting ───────────────────────────────────────────────────────────

const recentWrites = new Map(); // visitorId -> { count, windowStart, lastPath, lastAt }

function rateLimited(visitorId, path) {
  const now = Date.now();
  const entry = recentWrites.get(visitorId);

  if (!entry || now - entry.windowStart > 60_000) {
    recentWrites.set(visitorId, { count: 1, windowStart: now, lastPath: path, lastAt: now });
    return false;
  }

  if (entry.lastPath === path && now - entry.lastAt < DEDUPE_MS) return true;

  entry.count += 1;
  entry.lastPath = path;
  entry.lastAt = now;
  if (entry.count > RATE_LIMIT_PER_MINUTE) return true;
  return false;
}

// Unbounded growth of the rate-limit map would be a slow memory leak on a
// busy day, so stale entries are dropped periodically.
const rateLimitSweeper = setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, entry] of recentWrites) {
    if (entry.windowStart < cutoff) recentWrites.delete(key);
  }
}, 120_000);
if (typeof rateLimitSweeper.unref === "function") rateLimitSweeper.unref();

// ─── Recording ───────────────────────────────────────────────────────────────

/**
 * Record one page view. Public and fire-and-forget: it resolves
 * `{ recorded: false }` rather than throwing, because a failure to count a
 * visit must never surface as an error in a shopper's browser.
 */
async function recordPageView(req, res, input) {
  try {
    const userAgent = req.headers["user-agent"] || "";
    if (isBot(userAgent)) return { recorded: false, reason: "bot" };

    const path = normalisePath(input && input.path);
    // The admin panel is the shop owner's own usage, not store traffic.
    if (path === "/admin" || path.startsWith("/admin/")) {
      return { recorded: false, reason: "admin" };
    }

    const visitorId = await resolveVisitorId(req, res);
    if (rateLimited(visitorId, path)) return { recorded: false, reason: "throttled" };

    await PageView.create({
      visitorId,
      path,
      referrerHost: normaliseReferrerHost(input && input.referrer, req),
      country: countryFrom(req),
      city: cityFrom(req),
      device: parseDevice(userAgent),
      browser: parseBrowser(userAgent),
      os: parseOs(userAgent),
      createdAt: new Date(),
    });

    return { recorded: true };
  } catch (err) {
    console.error("[Analytics] Failed to record page view:", err.message);
    return { recorded: false, reason: "error" };
  }
}

// ─── Retention ───────────────────────────────────────────────────────────────

function retentionDays() {
  const raw = Number(process.env.ANALYTICS_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_RETENTION_DAYS;
}

async function prunePageViews() {
  const days = retentionDays();
  const cutoff = new Date(Date.now() - days * 86_400_000);
  try {
    const removed = await PageView.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
    if (removed > 0) console.log(`[Analytics] Pruned ${removed} page view(s) older than ${days} days.`);
    return removed;
  } catch (err) {
    console.error("[Analytics] Prune failed:", err.message);
    return 0;
  }
}

/** Prune on boot, then daily. Returns a stop function. */
function startRetentionSweeper() {
  const kick = setTimeout(prunePageViews, 60_000);
  if (typeof kick.unref === "function") kick.unref();

  const timer = setInterval(prunePageViews, 86_400_000);
  if (typeof timer.unref === "function") timer.unref();

  return function stop() {
    clearTimeout(kick);
    clearInterval(timer);
  };
}

// ─── Admin reporting ─────────────────────────────────────────────────────────

function startOfDaysAgo(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

// DATE() exists in both MySQL and SQLite, so one expression serves either
// dialect and the aggregation stays in the database.
const DAY_EXPR = fn("DATE", col("createdAt"));
const COUNT_VIEWS = [fn("COUNT", col("id")), "views"];
const COUNT_VISITORS = [fn("COUNT", fn("DISTINCT", col("visitorId"))), "visitors"];

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Everything the Visitors page renders.
 *
 * Aggregation is pushed into SQL rather than done by loading rows into
 * JavaScript, because this table grows with traffic — the approach the sales
 * analytics uses for orders would not hold up here.
 */
async function adminVisitors(input) {
  const days = Math.min(Math.max(Number((input && input.days) || 30), 1), 365);
  const visitLimit = Math.min(Math.max(Number((input && input.limit) || 100), 1), 500);
  const since = startOfDaysAgo(days);
  const windowWhere = { createdAt: { [Op.gte]: since } };

  const [
    totals,
    dailyRows,
    pageRows,
    countryRows,
    referrerRows,
    deviceRows,
    browserRows,
    recentRows,
    allTime,
  ] = await Promise.all([
    PageView.findOne({ where: windowWhere, attributes: [COUNT_VIEWS, COUNT_VISITORS], raw: true }),
    PageView.findAll({
      where: windowWhere,
      attributes: [[DAY_EXPR, "day"], COUNT_VIEWS, COUNT_VISITORS],
      group: [DAY_EXPR],
      order: [[literal("day"), "ASC"]],
      raw: true,
    }),
    PageView.findAll({
      where: windowWhere,
      attributes: ["path", COUNT_VIEWS, COUNT_VISITORS],
      group: ["path"],
      order: [[literal("views"), "DESC"]],
      limit: 15,
      raw: true,
    }),
    PageView.findAll({
      where: { ...windowWhere, country: { [Op.ne]: null } },
      attributes: ["country", COUNT_VIEWS, COUNT_VISITORS],
      group: ["country"],
      order: [[literal("visitors"), "DESC"]],
      limit: 20,
      raw: true,
    }),
    PageView.findAll({
      where: { ...windowWhere, referrerHost: { [Op.ne]: null } },
      attributes: ["referrerHost", COUNT_VIEWS, COUNT_VISITORS],
      group: ["referrerHost"],
      order: [[literal("visitors"), "DESC"]],
      limit: 15,
      raw: true,
    }),
    PageView.findAll({
      where: windowWhere,
      attributes: ["device", COUNT_VIEWS, COUNT_VISITORS],
      group: ["device"],
      order: [[literal("views"), "DESC"]],
      raw: true,
    }),
    PageView.findAll({
      where: { ...windowWhere, browser: { [Op.ne]: null } },
      attributes: ["browser", COUNT_VIEWS, COUNT_VISITORS],
      group: ["browser"],
      order: [[literal("views"), "DESC"]],
      raw: true,
    }),
    // Bounded: enough rows to assemble the most recent visits without ever
    // reading the whole table.
    PageView.findAll({
      where: windowWhere,
      order: [["createdAt", "DESC"]],
      limit: visitLimit * 12,
      raw: true,
    }),
    PageView.findOne({ attributes: [COUNT_VIEWS, COUNT_VISITORS], raw: true }),
  ]);

  // Today's figures, so the page can show "today" without a second round trip.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const today = await PageView.findOne({
    where: { createdAt: { [Op.gte]: todayStart } },
    attributes: [COUNT_VIEWS, COUNT_VISITORS],
    raw: true,
  });

  // ── Fill gaps in the daily series ──
  // A day with no traffic has no row, and a line chart that simply skips it
  // would imply the quiet day never happened.
  const byDay = new Map();
  for (const row of dailyRows) {
    const key = String(row.day).slice(0, 10);
    byDay.set(key, { views: asNumber(row.views), visitors: asNumber(row.visitors) });
  }
  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const hit = byDay.get(key) || { views: 0, visitors: 0 };
    daily.push({ date: key, views: hit.views, visitors: hit.visitors });
  }

  // ── Group page views into visits ──
  // A visit is one visitor's run of page views with no gap longer than
  // VISIT_GAP_MINUTES. Rows arrive newest-first, so they are reversed to walk
  // each visitor's path in the order they actually browsed it.
  const ordered = [...recentRows].reverse();
  const openVisits = new Map();
  const visits = [];
  const gapMs = VISIT_GAP_MINUTES * 60_000;

  for (const row of ordered) {
    const at = new Date(row.createdAt).getTime();
    const open = openVisits.get(row.visitorId);

    if (open && at - open.lastAt <= gapMs) {
      open.pageCount += 1;
      open.lastAt = at;
      open.endedAt = row.createdAt;
      if (open.paths.length < 25) open.paths.push(row.path);
      if (!open.country && row.country) open.country = row.country;
      if (!open.city && row.city) open.city = row.city;
      continue;
    }

    const visit = {
      visitorId: row.visitorId,
      startedAt: row.createdAt,
      endedAt: row.createdAt,
      lastAt: at,
      country: row.country,
      city: row.city,
      device: row.device,
      browser: row.browser,
      os: row.os,
      referrerHost: row.referrerHost,
      landingPath: row.path,
      paths: [row.path],
      pageCount: 1,
    };
    openVisits.set(row.visitorId, visit);
    visits.push(visit);
  }

  const recentVisits = visits
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, visitLimit)
    .map((v) => ({
      // Shortened for display: the full hash is of no use in a table, and a
      // shorter label is still stable enough to spot a returning visitor.
      visitorId: v.visitorId.slice(0, 12),
      startedAt: new Date(v.startedAt).toISOString(),
      endedAt: new Date(v.endedAt).toISOString(),
      durationSeconds: Math.max(0, Math.round((new Date(v.endedAt) - new Date(v.startedAt)) / 1000)),
      country: v.country,
      city: v.city,
      device: v.device,
      browser: v.browser,
      os: v.os,
      referrerHost: v.referrerHost,
      landingPath: v.landingPath,
      pageCount: v.pageCount,
      paths: v.paths,
    }));

  // Repeat visitors are the honest version of "loyalty" here: distinct
  // visitorIds seen on more than one calendar day inside the window.
  const repeatRows = await PageView.findAll({
    where: windowWhere,
    attributes: ["visitorId", [fn("COUNT", fn("DISTINCT", DAY_EXPR)), "daysSeen"]],
    group: ["visitorId"],
    having: literal("COUNT(DISTINCT DATE(createdAt)) > 1"),
    raw: true,
  });

  return {
    rangeDays: days,
    since: since.toISOString(),
    retentionDays: retentionDays(),
    cityAvailable: recentRows.some((r) => r.city),
    summary: {
      views: asNumber(totals && totals.views),
      visitors: asNumber(totals && totals.visitors),
      viewsToday: asNumber(today && today.views),
      visitorsToday: asNumber(today && today.visitors),
      viewsAllTime: asNumber(allTime && allTime.views),
      visitorsAllTime: asNumber(allTime && allTime.visitors),
      repeatVisitors: repeatRows.length,
      viewsPerVisitor: asNumber(totals && totals.visitors)
        ? Number((asNumber(totals.views) / asNumber(totals.visitors)).toFixed(2))
        : 0,
    },
    daily,
    topPages: pageRows.map((r) => ({ path: r.path, views: asNumber(r.views), visitors: asNumber(r.visitors) })),
    countries: countryRows.map((r) => ({ country: r.country, views: asNumber(r.views), visitors: asNumber(r.visitors) })),
    referrers: referrerRows.map((r) => ({ host: r.referrerHost, views: asNumber(r.views), visitors: asNumber(r.visitors) })),
    devices: deviceRows.map((r) => ({ device: r.device, views: asNumber(r.views), visitors: asNumber(r.visitors) })),
    browsers: browserRows.map((r) => ({ browser: r.browser, views: asNumber(r.views), visitors: asNumber(r.visitors) })),
    recentVisits,
  };
}

module.exports = {
  recordPageView,
  adminVisitors,
  prunePageViews,
  startRetentionSweeper,
};
