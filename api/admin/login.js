// api/admin/login.js
// Verifies the admin password and, on success, sets a signed, httpOnly
// session cookie scoped to /api/admin. The password itself never touches
// the client again after this call.

const {
  checkPassword,
  setSessionCookie,
  checkLoginRateLimit,
  resetLoginRateLimit,
} = require("./_lib/auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.ADMIN_PASSWORD) {
    res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server" });
    return;
  }

  // Coarse identifier for rate limiting — real IP if the platform provides
  // one, otherwise a shared bucket (still limits total guess throughput).
  const identifier =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";

  const withinLimit = await checkLoginRateLimit(identifier);
  if (!withinLimit) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const password = body && body.password;
  if (!checkPassword(password)) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  await resetLoginRateLimit(identifier);
  setSessionCookie(res);
  res.status(200).json({ ok: true });
};
