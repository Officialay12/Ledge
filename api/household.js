// api/household.js
// Generic key/value endpoint scoped by household code, backed by Upstash
// Redis (Vercel's Marketplace storage provider — Vercel KV itself was
// sunset and folded into this integration).
// This is what makes "shared" ledgers actually shared across devices —
// every device that enters the same code reads and writes the same
// records in this database, instead of separate local browser storage.
//
// Requires a Redis database connected to this Vercel project: Storage tab
// in the Vercel dashboard -> Browse Storage -> Upstash -> create a Redis
// database -> Connect to Project. That step injects UPSTASH_REDIS_REST_URL
// / UPSTASH_REDIS_REST_TOKEN (or the legacy KV_REST_API_URL / TOKEN names,
// which the SDK also reads) automatically.

const { Redis } = require("@upstash/redis");

// Read both possible naming schemes explicitly — don't rely on
// Redis.fromEnv()'s fallback, which turned out not to pick up the
// legacy KV_REST_API_* names reliably in practice.
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

const MAX_VALUE_BYTES = 2 * 1024 * 1024; // 2MB safety cap per key

function isValidCode(code) {
  return typeof code === "string" && /^[a-z0-9-]{1,64}$/.test(code);
}

function isValidKey(key) {
  return typeof key === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(key);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!redis) {
    console.error(
      "household api error: no Redis env vars found (checked UPSTASH_REDIS_REST_URL/TOKEN and KV_REST_API_URL/TOKEN)",
    );
    res.status(500).json({
      error:
        "Storage backend error — is a Redis database connected to this Vercel project?",
    });
    return;
  }

  const { code, key } = req.query;

  if (!isValidCode(code) || !isValidKey(key)) {
    res.status(400).json({ error: "Invalid or missing code/key" });
    return;
  }

  const dataKey = `household:${code}:${key}`;
  const metaKey = `household:${code}:__meta`;

  try {
    if (req.method === "GET") {
      const value = await redis.get(dataKey);
      res
        .status(200)
        .json({ value: value === undefined || value === null ? null : value });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (e) {
          body = {};
        }
      }
      const value = body && body.value;
      if (typeof value !== "string") {
        res.status(400).json({ error: "value must be a JSON string" });
        return;
      }
      if (value.length > MAX_VALUE_BYTES) {
        res.status(413).json({ error: "value too large" });
        return;
      }
      await redis.set(dataKey, value);
      const updatedAt = Date.now();
      await redis.set(metaKey, JSON.stringify({ updatedAt, changedKey: key }));
      res.status(200).json({ ok: true, updatedAt });
      return;
    }

    if (req.method === "DELETE") {
      await redis.del(dataKey);
      const updatedAt = Date.now();
      await redis.set(metaKey, JSON.stringify({ updatedAt, changedKey: key }));
      res.status(200).json({ ok: true, updatedAt });
      return;
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error("household api error", err);
    res.status(500).json({
      error:
        "Storage backend error — is a Redis database connected to this Vercel project?",
    });
  }
};
