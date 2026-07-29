// api/admin.js
// Every admin operation lives in this ONE serverless function, routed by
// ?action=. This is deliberate: Vercel's Hobby plan caps a deployment at
// 12 Serverless Functions total, and this app was hitting that ceiling
// with one file per admin operation. Consolidating cuts the admin surface
// down to a single function instead of five+.
//
// Actions:
//   POST   ?action=login      body:{password}      -> sets session cookie
//   POST   ?action=logout                            -> clears session cookie
//   GET    ?action=session                            -> { authenticated }
//   GET    ?action=households                         -> list every household code
//   GET    ?action=household&code=X                   -> full data for one household
//   PUT    ?action=household&code=X  body:{...}        -> overwrite provided keys
//   DELETE ?action=household&code=X                   -> permanently delete household

const {
  redis,
  checkPassword,
  requireAdmin,
  isAuthenticated,
  setSessionCookie,
  clearSessionCookie,
  checkLoginRateLimit,
  resetLoginRateLimit,
} = require("./_lib/admin-auth");

const DATA_KEYS = ["expenses", "habits", "recurring", "settings"];
const MAX_VALUE_BYTES = 2 * 1024 * 1024;

function isValidCode(code) {
  return typeof code === "string" && /^[a-z0-9-]{1,64}$/.test(code);
}

async function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body || {};
}

async function handleLogin(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!process.env.ADMIN_PASSWORD) {
    res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server" });
    return;
  }

  const identifier =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";

  const withinLimit = await checkLoginRateLimit(identifier);
  if (!withinLimit) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  const body = await parseBody(req);
  if (!checkPassword(body.password)) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  await resetLoginRateLimit(identifier);
  setSessionCookie(res);
  res.status(200).json({ ok: true });
}

async function handleLogout(req, res) {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}

async function handleSession(req, res) {
  res.status(200).json({ authenticated: isAuthenticated(req) });
}

async function handleHouseholdsList(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
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
}

async function handleHouseholdDetail(req, res) {
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
      const body = await parseBody(req);
      const updates = DATA_KEYS.filter((k) => body[k] !== undefined);
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
    console.error("admin household detail error", err);
    res.status(500).json({ error: "Storage backend error" });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const { action } = req.query;

  switch (action) {
    case "login":
      return handleLogin(req, res);
    case "logout":
      return handleLogout(req, res);
    case "session":
      return handleSession(req, res);
    case "households":
      return handleHouseholdsList(req, res);
    case "household":
      return handleHouseholdDetail(req, res);
    default:
      res.status(400).json({ error: "Unknown or missing action" });
  }
};
