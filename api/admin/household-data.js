// api/admin/household-data.js
// GET  ?code=X       -> full data for one household (expenses, habits, recurring, settings, meta)
// PUT  ?code=X  body: { expenses?, habits?, recurring?, settings? } -> overwrites whichever keys are provided
// DELETE ?code=X     -> permanently deletes the entire household (all keys)
//
// Unlike api/household.js (the user-facing endpoint, which only ever
// touches the single key a client asks for), this endpoint is authoritative:
// PUT overwrites arrays outright rather than merging, since an admin edit is
// a deliberate correction, not a concurrent-device sync.

const { redis, requireAdmin } = require("./_lib/auth");

const DATA_KEYS = ["expenses", "habits", "recurring", "settings"];
const MAX_VALUE_BYTES = 2 * 1024 * 1024;

function isValidCode(code) {
  return typeof code === "string" && /^[a-z0-9-]{1,64}$/.test(code);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!requireAdmin(req, res)) return;

  const { code } = req.query;
  if (!isValidCode(code)) {
    res.status(400).json({ error: "Invalid or missing code" });
    return;
  }

  try {
    if (req.method === "GET") {
      const values = await Promise.all(
        DATA_KEYS.map((k) => redis.get(`household:${code}:${k}`)),
      );
      const metaRaw = await redis.get(`household:${code}:__meta`);

      const data = {};
      DATA_KEYS.forEach((k, i) => {
        try {
          data[k] = values[i] ? JSON.parse(values[i]) : null;
        } catch {
          data[k] = null;
        }
      });

      let meta = {};
      try {
        meta = metaRaw ? JSON.parse(metaRaw) : {};
      } catch {
        meta = {};
      }

      res.status(200).json({ code, ...data, meta });
      return;
    }

    if (req.method === "PUT") {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }

      const updates = DATA_KEYS.filter((k) => body && body[k] !== undefined);
      if (updates.length === 0) {
        res.status(400).json({ error: "No recognized fields to update" });
        return;
      }

      for (const key of updates) {
        const value = JSON.stringify(body[key]);
        if (value.length > MAX_VALUE_BYTES) {
          res.status(413).json({ error: `${key} payload too large` });
          return;
        }
        await redis.set(`household:${code}:${key}`, value);
      }

      const updatedAt = Date.now();
      await redis.set(
        `household:${code}:__meta`,
        JSON.stringify({ updatedAt, changedKey: `admin:${updates.join(",")}` }),
      );

      res.status(200).json({ ok: true, updatedAt, updated: updates });
      return;
    }

    if (req.method === "DELETE") {
      await Promise.all(
        DATA_KEYS.map((k) => redis.del(`household:${code}:${k}`)),
      );
      await redis.del(`household:${code}:__meta`);
      res.status(200).json({ ok: true, deleted: code });
      return;
    }

    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error("admin household-data error", err);
    res.status(500).json({ error: "Storage backend error" });
  }
};
