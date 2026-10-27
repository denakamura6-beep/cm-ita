const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config");
const { AppError, wrap } = require("../errors");
const db = require("../db");

// The token must be valid AND the account must still exist and be active in the database,
// so disabling or deleting an account in pgAdmin locks that person out right away.
const requireAdmin = wrap(async (req, res, next) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  let payload;
  try { payload = jwt.verify(token, jwtSecret); } catch { throw new AppError(401, "Please log in as admin."); }
  const { rows } = await db.query("SELECT id, username, full_name, active FROM admins WHERE id = $1", [Number(payload.id) || 0]);
  const a = rows[0];
  if (!a || !a.active) throw new AppError(401, "This account is not allowed to post. Please log in again.");
  req.admin = { id: a.id, username: a.username, name: a.full_name || a.username };
  next();
});
module.exports = { requireAdmin };
