const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../db");
const rateLimit = require("../middleware/rateLimit");
const { AppError, wrap } = require("../errors");

// Used so a wrong username takes as long as a wrong password (no hint about which accounts exist).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// There is no sign-up route on purpose. Accounts are created only in the database
// (see backend/scripts/admin.js and backend/sql/admins.sql).
router.post("/login", rateLimit({ max: 10, message: "Too many login tries. Please wait a minute." }), wrap(async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const { rows } = await db.query("SELECT id, username, full_name, password_hash, active FROM admins WHERE lower(username) = lower($1)", [username]);
  const a = rows[0];
  let match = false;
  try { match = await bcrypt.compare(password, a ? a.password_hash : DUMMY_HASH); } catch { match = false; }
  if (!a || !match) throw new AppError(401, "Wrong username or password.");
  if (!a.active) throw new AppError(403, "This account is disabled. Ask the main admin.");
  await db.query("UPDATE admins SET last_login = now() WHERE id = $1", [a.id]);
  const name = a.full_name || a.username;
  res.json({ token: jwt.sign({ role: "admin", id: a.id, username: a.username, name }, config.jwtSecret, { expiresIn: "8h" }), name });
}));
module.exports = router;
