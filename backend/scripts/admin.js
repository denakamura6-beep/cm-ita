// Manage admin accounts from the terminal. This is the ONLY way accounts are made
// (besides pgAdmin, see backend/sql/admins.sql). The website has no sign-up.
//
//   npm run admin -- add <username> "<password>" "<Full Name>"
//   npm run admin -- passwd <username> "<new password>"
//   npm run admin -- disable <username>
//   npm run admin -- enable <username>
//   npm run admin -- remove <username>
//   npm run admin -- list
const bcrypt = require("bcryptjs");
const db = require("../src/db");

const [cmd, username, arg3, ...rest] = process.argv.slice(2);
const usage = () => {
  console.log(`Usage:
  npm run admin -- add <username> "<password>" "<Full Name>"
  npm run admin -- passwd <username> "<new password>"
  npm run admin -- disable <username>
  npm run admin -- enable <username>
  npm run admin -- remove <username>
  npm run admin -- list`);
  process.exit(1);
};
const fail = (m) => { console.error("\n" + m + "\n"); process.exit(1); };

async function main() {
  if (!cmd) usage();
  await db.init(); // makes sure the tables exist
  const find = async () => (await db.query("SELECT * FROM admins WHERE lower(username) = lower($1)", [username || ""])).rows[0];

  if (cmd === "list") {
    const { rows } = await db.query(`SELECT a.id, a.username, a.full_name, a.active, a.last_login,
      (SELECT COUNT(*)::int FROM announcements n WHERE n.posted_by = a.id) AS posts FROM admins a ORDER BY a.id`);
    if (!rows.length) return console.log("No admin accounts yet.");
    console.table(rows.map((r) => ({ id: r.id, username: r.username, name: r.full_name, active: r.active, posts: r.posts, last_login: r.last_login ? new Date(r.last_login).toLocaleString() : "never" })));
    return;
  }
  if (!username) usage();

  if (cmd === "add") {
    const password = arg3, full = rest.join(" ").trim();
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) fail("Username must be 3-30 letters, numbers, dot, dash or underscore.");
    if (!password || password.length < 8) fail("Password must be at least 8 characters.");
    if (await find()) fail(`The username "${username}" already exists.`);
    await db.query("INSERT INTO admins (username, full_name, password_hash) VALUES ($1, $2, $3)", [username, full || username, bcrypt.hashSync(password, 12)]);
    console.log(`\nAccount "${username}" created. They can log in on the website now.\n`);
  } else if (cmd === "passwd") {
    if (!arg3 || arg3.length < 8) fail("New password must be at least 8 characters.");
    if (!(await find())) fail(`No account named "${username}".`);
    await db.query("UPDATE admins SET password_hash = $1 WHERE lower(username) = lower($2)", [bcrypt.hashSync(arg3, 12), username]);
    console.log(`\nPassword changed for "${username}".\n`);
  } else if (cmd === "disable" || cmd === "enable") {
    if (!(await find())) fail(`No account named "${username}".`);
    await db.query("UPDATE admins SET active = $1 WHERE lower(username) = lower($2)", [cmd === "enable", username]);
    console.log(`\n"${username}" is now ${cmd === "enable" ? "active" : "disabled (cannot log in or post)"}.\n`);
  } else if (cmd === "remove") {
    if (!(await find())) fail(`No account named "${username}".`);
    await db.query("DELETE FROM admins WHERE lower(username) = lower($1)", [username]);
    console.log(`\n"${username}" removed. Their old announcements stay, and still show their name in the log.\n`);
  } else usage();
}
main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1); });
