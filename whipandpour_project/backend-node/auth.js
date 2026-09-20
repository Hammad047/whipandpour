/**
 * auth.js — Session cookie management and user authentication helpers.
 * Node port of auth.py. Uses a simple server-side session store backed by an
 * in-memory Map. Cookie name matches the original: app_session_id
 */

const crypto = require("crypto");
const cookie = require("cookie");
const { User } = require("./db");

const COOKIE_NAME = "app_session_id";
const UNAUTHED_ERR_MSG = "Please login (10001)";
const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// In-memory session store: sessionId -> userId
// NOTE: this is process-local. Restarting the server logs everyone out.
const _sessions = new Map();

// ─── Password hashing ───────────────────────────────────────────────────────
// PBKDF2-HMAC-SHA256 — Node's crypto covers this natively, no extra dependency.
// Format: pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
// Deliberately byte-compatible with the Python version's format (same
// algorithm, same iteration count) so a hash created by either backend
// verifies correctly against the other.

const PBKDF2_ITERATIONS = 260_000;
const PBKDF2_KEYLEN = 32; // sha256 digest size

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const digest = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, "sha256");
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt.toString("hex")}$${digest.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  try {
    const [algorithm, iterations, saltHex, digestHex] = stored.split("$");
    if (algorithm !== "pbkdf2_sha256") return false;
    const expected = Buffer.from(digestHex, "hex");
    const actual = crypto.pbkdf2Sync(
      password, Buffer.from(saltHex, "hex"), Number(iterations), expected.length, "sha256"
    );
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ─── Sessions ───────────────────────────────────────────────────────────────

function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString("base64url");
  _sessions.set(sessionId, userId);
  return sessionId;
}

function destroySession(sessionId) {
  _sessions.delete(sessionId);
}

function getSessionIdFromRequest(req) {
  const cookies = cookie.parse(req.headers.cookie || "");
  return cookies[COOKIE_NAME] || null;
}

function getUserIdFromRequest(req) {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return null;
  return _sessions.has(sessionId) ? _sessions.get(sessionId) : null;
}

async function getCurrentUser(req) {
  const userId = getUserIdFromRequest(req);
  if (userId == null) return null;
  return User.findByPk(userId);
}

async function requireUser(req) {
  const user = await getCurrentUser(req);
  if (!user) throw new TRPCError(UNAUTHED_ERR_MSG, "UNAUTHORIZED");
  return user;
}

async function requireAdmin(req) {
  const user = await requireUser(req);
  if (user.role !== "admin") throw new TRPCError(NOT_ADMIN_ERR_MSG, "FORBIDDEN");
  return user;
}

// ─── Cookies ────────────────────────────────────────────────────────────────

function crossSiteCookie() {
  // True when the frontend and backend are on different origins (e.g. the
  // static frontend on whipandpour.com, this API on its own host) — set via
  // the CROSS_SITE_COOKIES env var. Browsers refuse to send a SameSite=Lax
  // cookie on a cross-site fetch/XHR at all, so a split deployment needs
  // SameSite=None, which in turn requires Secure (HTTPS).
  return (process.env.CROSS_SITE_COOKIES || "false").toLowerCase() === "true";
}

function setSessionCookie(res, sessionId) {
  const crossSite = crossSiteCookie();
  const serialized = cookie.serialize(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite, // SameSite=None is rejected by browsers without Secure.
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  res.append("Set-Cookie", serialized);
}

function clearSessionCookie(res) {
  const serialized = cookie.serialize(COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
  res.append("Set-Cookie", serialized);
}

// ─── tRPC-style error ───────────────────────────────────────────────────────

const CODE_TO_HTTP = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};

class TRPCError extends Error {
  constructor(message, code = "INTERNAL_SERVER_ERROR") {
    super(message);
    this.message = message;
    this.code = code;
    this.httpStatus = CODE_TO_HTTP[code] || 500;
  }
}

module.exports = {
  COOKIE_NAME, UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG,
  hashPassword, verifyPassword,
  createSession, destroySession, getSessionIdFromRequest, getUserIdFromRequest,
  getCurrentUser, requireUser, requireAdmin,
  setSessionCookie, clearSessionCookie,
  TRPCError,
};
