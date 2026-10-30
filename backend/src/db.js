// PostgreSQL connection. Settings come from backend/.env (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
// or from one DATABASE_URL (handy for online hosting such as Supabase or Neon).
const { Pool, types } = require('pg');
const config = require('./config'); // loads .env

// Give timestamps to the app as ISO text, like "2026-10-26T08:00:00.000Z"
types.setTypeParser(1184, (v) => new Date(v).toISOString());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

async function init() {
  // Admin accounts live ONLY in the database. The website has no sign-up page.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id             SERIAL PRIMARY KEY,
      username       TEXT NOT NULL,
      full_name      TEXT NOT NULL DEFAULT '',
      password_hash  TEXT NOT NULL,
      active         BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login     TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS admins_username_lower ON admins (lower(username));
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id          SERIAL PRIMARY KEY,
      category    TEXT NOT NULL DEFAULT 'general',
      title       TEXT NOT NULL,
      body        TEXT NOT NULL DEFAULT '',
      location    TEXT NOT NULL DEFAULT '',
      event_date  TEXT NOT NULL DEFAULT '',
      event_time  TEXT NOT NULL DEFAULT '',
      image       TEXT NOT NULL DEFAULT '',
      deadline_date   TEXT NOT NULL DEFAULT '',
      link            TEXT NOT NULL DEFAULT '',
      attachment      TEXT NOT NULL DEFAULT '',
      attachment_name TEXT NOT NULL DEFAULT '',
      pinned      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements (created_at);
  `);
  // Upgrade an older database: new columns, no more "academic" category.
  await pool.query(`
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS deadline_date   TEXT NOT NULL DEFAULT '';
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS link            TEXT NOT NULL DEFAULT '';
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment      TEXT NOT NULL DEFAULT '';
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS posted_by       INTEGER REFERENCES admins(id) ON DELETE SET NULL;
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS posted_by_name  TEXT NOT NULL DEFAULT '';
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS last_edited_by  TEXT NOT NULL DEFAULT '';
    ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_category_check;
    UPDATE announcements SET category = 'general' WHERE category = 'academic';
    UPDATE announcements SET deadline_date = event_date, event_date = ''
      WHERE category = 'deadline' AND deadline_date = '' AND event_date <> '';
    DO $$ BEGIN
      ALTER TABLE announcements ADD CONSTRAINT announcements_category_check
        CHECK (category IN ('event','deadline','general'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  // One-time move: if there are no accounts yet, copy the old .env admin into the database
  // so nobody is locked out. After that, the .env login values are no longer used.
  const adminCount = (await pool.query('SELECT COUNT(*)::int AS n FROM admins'))
    .rows[0].n;
  if (
    adminCount === 0 &&
    config.adminHash &&
    !config.adminHash.startsWith('paste')
  ) {
    const a = (
      await pool.query(
        `INSERT INTO admins (username, full_name, password_hash) VALUES ($1, 'Administrator', $2) RETURNING id`,
        [config.adminUser, config.adminHash],
      )
    ).rows[0];
    await pool.query(
      `UPDATE announcements SET posted_by = $1, posted_by_name = 'Administrator' WHERE posted_by IS NULL`,
      [a.id],
    );
    console.log(
      `Admin account "${config.adminUser}" was copied from .env into the database.`,
    );
  }

  // One table that shows every announcement together with the person who posted it.
  // Open it in pgAdmin: Views > announcement_log > right-click > View/Edit Data > All Rows.
  await pool.query(`
    CREATE OR REPLACE VIEW announcement_log AS
    SELECT a.id,
           a.title,
           a.category,
           COALESCE(NULLIF(ad.full_name, ''), ad.username, NULLIF(a.posted_by_name, ''), '(unknown)') AS posted_by,
           ad.username        AS poster_username,
           a.created_at       AS date_posted,
           a.deadline_date,
           a.event_date,
           a.event_time,
           a.location,
           a.body,
           a.link,
           a.attachment_name  AS pdf_name,
           a.pinned,
           a.last_edited_by,
           a.updated_at       AS last_updated
    FROM announcements a
    LEFT JOIN admins ad ON ad.id = a.posted_by
    ORDER BY a.created_at DESC, a.id DESC
  `);
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM announcements',
  );
  if (process.env.SEED_SAMPLES === 'true' && rows[0].n === 0) {
    const samples = [
      [
        'general',
        'Sample: Welcome to the BSIT Department',
        'This is where the department posts class notices, schedules and activities. Log in as admin to replace these samples.',
        'IT Department',
        '',
        true,
      ],
      [
        'event',
        'Sample: IT Week Hackathon',
        'Form a team of 3 and build a small app in one day. Bring your laptop and charger.',
        'Computer Laboratory 1',
        '8:00 AM - 5:00 PM',
        false,
      ],
      [
        'deadline',
        'Sample: Capstone proposal submission',
        'Submit your printed proposal and soft copy to your adviser.',
        "Adviser's Office",
        'Before 4:00 PM',
        false,
      ],
    ];
    for (const s of samples) {
      await pool.query(
        'INSERT INTO announcements (category,title,body,location,event_time,pinned) VALUES ($1,$2,$3,$4,$5,$6)',
        [s[0], s[1], s[2], s[3], s[4], s[5]],
      );
    }
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  init,
};
