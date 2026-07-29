// api/admin/logout.js
const { clearSessionCookie } = require("./_lib/auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
};
