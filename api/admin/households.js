// api/admin/households.js
// Lists every household code that has ever synced data, using the __meta
// key each one writes on every change (see api/household.js). Deliberately
// lightweight — it reads only the meta key per code, not the full
// expenses/habits/recurring/settings payload, so listing a large number of
// households stays fast. Full data is fetched per-code by household-data.js
// when the admin actually opens one.

const { redis, requireAdmin } = require("./_lib/auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!requireAdmin(req, res)) return;

  try {
    // Upstash's `keys` supports glob patterns. Fine at moderate scale; if
    // this app grows into the thousands-of-households range, swap for
    // cursor-based SCAN instead of a single KEYS call.
    const metaKeys = await redis.keys("household:*:__meta");

    const codes = metaKeys
      .map((k) => {
        const match = k.match(/^household:(.+):__meta$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    const households = await Promise.all(
      codes.map(async (code) => {
        let meta = {};
        try {
          const raw = await redis.get(`household:${code}:__meta`);
          meta = raw ? JSON.parse(raw) : {};
        } catch {
          meta = {};
        }
        return {
          code,
          updatedAt: meta.updatedAt || null,
          lastChangedKey: meta.changedKey || null,
        };
      }),
    );

    households.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    res.status(200).json({ households, count: households.length });
  } catch (err) {
    console.error("admin households list error", err);
    res.status(500).json({ error: "Failed to list households" });
  }
};
