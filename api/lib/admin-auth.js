// api/_lib/admin-auth.js
// Shared helpers for the admin panel: password check, signed session
// cookies, and the Redis client. Lives under `_lib` specifically because
// Vercel does not turn underscore-prefixed paths into routes — this file
// is never itself reachable as an endpoint, and doesn't count toward the
// per-deployment Serverless Function limit.

const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis =
  REDIS_URL && REDIS_TOKEN
    ? new Redis({
        url: REDIS_URL,
        token: REDIS_TOKEN,
        automaticDeserialization: false,
      })
    : null;

const SESSION_COOKIE = "ledger_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || null;
}

function getSigningKey() {
  const pw = getAdminPassword();
  if (!pw) return null;
  return crypto
    .createHash("sha256")
    .update(`${pw}:ledger-admin-session`)
    .digest();
}

function timingSafeEqualStrings(a, b) {
  const bufA = crypto.createHash("sha256").update(String(a)).digest();
  const bufB = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkPassword(candidate) {
  const pw = getAdminPassword();
  if (!pw || typeof candidate !== "string" || !candidate) return false;
  return timingSafeEqualStrings(candidate, pw);
}

function signSession(expiresAt) {
  const key = getSigningKey();
  if (!key) return null;
  const payload = `${expiresAt}`;
  const hmac = crypto.createHmac("sha256", key).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

function verifySessionToken(token) {
  const key = getSigningKey();
  if (!key || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, hmac] = parts;
  const expected = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("hex");
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
  if (!valid) return false;
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return true;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[SESSION_COOKIE]);
}

function requireAdmin(req, res) {
  if (!redis) {
    res.status(500).json({ error: "Storage backend not configured" });
    return false;
  }
  if (!getAdminPassword()) {
    res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server" });
    return false;
  }
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function setSessionCookie(res) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = signSession(expiresAt);
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api/admin; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`,
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/api/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  );
}

async function checkLoginRateLimit(identifier) {
  if (!redis) return true;
  const key = `admin:loginattempts:${identifier}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS);
  }
  return count <= LOGIN_ATTEMPT_LIMIT;
}

async function resetLoginRateLimit(identifier) {
  if (!redis) return;
  await redis.del(`admin:loginattempts:${identifier}`);
}

module.exports = {
  redis,
  checkPassword,
  requireAdmin,
  isAuthenticated,
  setSessionCookie,
  clearSessionCookie,
  checkLoginRateLimit,
  resetLoginRateLimit,
};
