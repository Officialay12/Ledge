// api/admin/session.js
// Lightweight check so the admin page can tell, on load, whether the
// browser already holds a valid session cookie — without needing to fetch
// any household data just to find out.

const { isAuthenticated } = require("./_lib/auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ authenticated: isAuthenticated(req) });
};
