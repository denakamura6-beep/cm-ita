-- ============================================================
-- CM-ITA: managing admin accounts directly in pgAdmin
-- Open pgAdmin > your database > Tools > Query Tool, paste a block, press F5.
-- (The backend must have been started once so the tables exist.)
-- ============================================================

-- Needed once, so the database can hash passwords itself:
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) CREATE an account (change the 3 values) ----------------
INSERT INTO admins (username, full_name, password_hash)
VALUES ('juan', 'Juan Dela Cruz', crypt('ChangeThisPassword1', gen_salt('bf', 10)));

-- 2) CHANGE a password ---------------------------------------
UPDATE admins SET password_hash = crypt('NewPassword123', gen_salt('bf', 10))
WHERE lower(username) = 'juan';

-- 3) DISABLE / ENABLE an account (disabled = cannot log in or post, right away)
UPDATE admins SET active = FALSE WHERE lower(username) = 'juan';
UPDATE admins SET active = TRUE  WHERE lower(username) = 'juan';

-- 4) SEE all accounts and how many posts each made -----------
SELECT a.id, a.username, a.full_name, a.active, a.last_login,
       (SELECT COUNT(*) FROM announcements n WHERE n.posted_by = a.id) AS posts
FROM admins a ORDER BY a.id;

-- 5) SEE every announcement together with who posted it ------
SELECT * FROM announcement_log;
