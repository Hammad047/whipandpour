/**
 * keepalive.js — self-ping health checker that keeps a free-tier host awake.
 *
 * Render's free web services spin down after ~15 minutes with no inbound HTTP
 * traffic, and the next visitor then waits ~50 seconds for a cold start. This
 * module pings this service's own *public* URL on an interval so the traffic
 * clock never runs out.
 *
 * It must be the public URL, not localhost: Render counts requests at its edge
 * router, so a loopback ping never reaches the thing that decides to sleep.
 * The URL is resolved from, in order:
 *
 *   KEEPALIVE_URL          full URL to ping (e.g. https://api.whipandpour.com/api/health)
 *   RENDER_EXTERNAL_URL    set automatically by Render — no config needed there
 *   PUBLIC_API_URL         only when NODE_ENV=production, so a dev box holding
 *                          a production .env does not ping the live site
 *
 * Tunables:
 *   KEEPALIVE_ENABLED=false            turn it off without unsetting the URL
 *   KEEPALIVE_INTERVAL_SECONDS=300     seconds between pings (default 300)
 *   KEEPALIVE_VERBOSE=true             log every ping, not just status changes
 *
 * A LIMIT WORTH KNOWING: this cannot wake a service that is already asleep —
 * the process is not running, so nothing is left to send the ping. It keeps a
 * live service alive; it does not resurrect a dead one. Pair it with an
 * external pinger (cron-job.org, UptimeRobot) for coverage across restarts,
 * deploys and crashes.
 *
 * Logging is deliberately quiet — one line on start, then only on a change
 * between healthy and unhealthy — because free tiers also ration log volume.
 */

// Render's idle timer is 15 minutes. Pinging every 5 leaves room for a ping
// to fail and the next one to still arrive in time — at 10 minutes a single
// dropped ping opens a 20 minute gap and the service sleeps anyway.
const DEFAULT_INTERVAL_SECONDS = 300;
const MIN_INTERVAL_SECONDS = 10;
const REQUEST_TIMEOUT_MS = 15_000;
const HEALTH_PATH = "/api/health";

function isLoopback(url) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(url.hostname);
}

/**
 * Resolve the URL to ping, or null when no usable public URL is configured.
 * Returns { url, source } so the startup log can say where it came from.
 */
function resolveTarget() {
  const candidates = [
    ["KEEPALIVE_URL", process.env.KEEPALIVE_URL],
    ["RENDER_EXTERNAL_URL", process.env.RENDER_EXTERNAL_URL],
  ];

  // PUBLIC_API_URL is the production API's address, so a dev machine holding a
  // copy of the production .env would otherwise sit there pinging the live
  // site. Only trusted when this process is itself the production one.
  if ((process.env.NODE_ENV || "").trim() === "production") {
    candidates.push(["PUBLIC_API_URL", process.env.PUBLIC_API_URL]);
  }

  for (const [source, raw] of candidates) {
    const value = (raw || "").trim();
    if (!value) continue;

    let url;
    try {
      url = new URL(value);
    } catch {
      console.warn(`[KeepAlive] ${source} is not a valid URL: ${value}`);
      continue;
    }

    // A bare origin means "ping the health endpoint"; an explicit path is
    // taken as given, so KEEPALIVE_URL can point anywhere.
    if (url.pathname === "/" || url.pathname === "") url.pathname = HEALTH_PATH;

    return { url, source };
  }

  return null;
}

function resolveIntervalMs() {
  const raw = Number(process.env.KEEPALIVE_INTERVAL_SECONDS || DEFAULT_INTERVAL_SECONDS);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_SECONDS;
  // A sub-10s loop buys nothing against a 15-minute idle timer and only burns
  // request quota, so the floor is enforced rather than trusted.
  return Math.max(seconds, MIN_INTERVAL_SECONDS) * 1000;
}

/**
 * Start the ping loop. Safe to call unconditionally: it no-ops and explains
 * itself when disabled, unconfigured, or pointed at a loopback address.
 * Returns a stop() function, or null when nothing was started.
 */
function startKeepAlive() {
  const enabled = !["false", "0", "no"].includes(
    (process.env.KEEPALIVE_ENABLED || "true").trim().toLowerCase()
  );
  if (!enabled) {
    console.log("[KeepAlive] Disabled (KEEPALIVE_ENABLED=false).");
    return null;
  }

  if (typeof fetch !== "function") {
    console.warn("[KeepAlive] Disabled: global fetch is unavailable (needs Node 18+).");
    return null;
  }

  const target = resolveTarget();
  if (!target) {
    console.log(
      "[KeepAlive] Disabled: no public URL configured. " +
      "Set KEEPALIVE_URL (or PUBLIC_API_URL) to this service's public address."
    );
    return null;
  }

  if (isLoopback(target.url)) {
    // Local dev lands here, and so does a misconfigured deploy. Either way a
    // loopback ping cannot hold a host awake, so say so instead of looping.
    console.log(`[KeepAlive] Disabled: ${target.source} points at ${target.url.hostname}, which cannot keep a host awake.`);
    return null;
  }

  const intervalMs = resolveIntervalMs();
  const href = target.url.href;
  const verbose = ["true", "1", "yes"].includes(
    (process.env.KEEPALIVE_VERBOSE || "").trim().toLowerCase()
  );

  let inFlight = false;
  let lastHealthy = null; // null until the first result, so the first one logs
  let consecutiveFailures = 0;

  async function ping() {
    // Skip rather than queue: a ping slower than the interval means the host
    // is struggling, and piling on more requests would not help.
    if (inFlight) return;
    inFlight = true;

    const startedAt = Date.now();
    try {
      const res = await fetch(href, {
        method: "GET",
        headers: { "User-Agent": "whipandpour-keepalive" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const ms = Date.now() - startedAt;

      if (res.ok) {
        if (lastHealthy === false) {
          console.log(`[KeepAlive] Recovered after ${consecutiveFailures} failed ping(s) (${res.status}, ${ms}ms).`);
        } else if (lastHealthy === null) {
          console.log(`[KeepAlive] First ping OK (${res.status}, ${ms}ms).`);
        } else if (verbose) {
          console.log(`[KeepAlive] OK (${res.status}, ${ms}ms).`);
        }
        lastHealthy = true;
        consecutiveFailures = 0;
      } else {
        consecutiveFailures += 1;
        if (lastHealthy !== false) {
          console.warn(`[KeepAlive] Unhealthy: HTTP ${res.status} from ${href} (${ms}ms).`);
        }
        lastHealthy = false;
      }
    } catch (err) {
      consecutiveFailures += 1;
      if (lastHealthy !== false) {
        const reason = err && err.name === "TimeoutError" ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : (err && err.message) || String(err);
        console.warn(`[KeepAlive] Unhealthy: ${reason} (${href}).`);
      }
      lastHealthy = false;
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(ping, intervalMs);
  // Never hold the process open on account of the keep-alive loop.
  if (typeof timer.unref === "function") timer.unref();

  console.log(`[KeepAlive] Pinging ${href} every ${intervalMs / 1000}s (from ${target.source}).`);

  // One ping shortly after boot confirms the URL is right without racing the
  // listener that is about to serve it.
  const firstPing = setTimeout(ping, 5_000);
  if (typeof firstPing.unref === "function") firstPing.unref();

  return function stop() {
    clearInterval(timer);
    clearTimeout(firstPing);
  };
}

module.exports = { startKeepAlive };
