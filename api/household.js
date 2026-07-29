// api/household.js
// Generic key/value endpoint scoped by household code, backed by Vercel KV.
// This is what makes "shared" ledgers actually shared across devices —
// every device that enters the same code reads and writes the same
// records in this database, instead of separate local browser storage.
//
// Requires a KV database connected to this Vercel project (Storage tab
// in the Vercel dashboard -> Create Database -> KV -> Connect to Project).
// That step injects KV_REST_API_URL / KV_REST_API_TOKEN automatically.

const { kv } = require("@vercel/kv");

const MAX_VALUE_BYTES = 2 * 1024 * 1024; // 2MB safety cap per key

function isValidCode(code) {
  return typeof code === "string" && /^[a-z0-9-]{1,64}$/.test(code);
}

function isValidKey(key) {
  return typeof key === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(key);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const { code, key } = req.query;

  if (!isValidCode(code) || !isValidKey(key)) {
    res.status(400).json({ error: "Invalid or missing code/key" });
    return;
  }

  const dataKey = `household:${code}:${key}`;
  const metaKey = `household:${code}:__meta`;

  try {
    if (req.method === "GET") {
      const value = await kv.get(dataKey);
      res.status(200).json({ value: value === undefined ? null : value });
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
      await kv.set(dataKey, value);
      const updatedAt = Date.now();
      await kv.set(metaKey, JSON.stringify({ updatedAt, changedKey: key }));
      res.status(200).json({ ok: true, updatedAt });
      return;
    }

    if (req.method === "DELETE") {
      await kv.del(dataKey);
      const updatedAt = Date.now();
      await kv.set(metaKey, JSON.stringify({ updatedAt, changedKey: key }));
      res.status(200).json({ ok: true, updatedAt });
      return;
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error("household api error", err);
    res.status(500).json({
      error:
        "Storage backend error — is a KV database connected to this Vercel project?",
    });
  }
};
