const express = require('express');
const cors = require('cors');
const config = require('./config');
const db = require('./db');
const ollama = require('./services/openrouter');

if (config.jwtSecret.length < 16) {
  console.error('\nSet JWT_SECRET in backend/.env (at least 16 characters).\n');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '9mb' })); // room for one shrunken picture and one PDF (5 MB)
app.use(
  '/uploads',
  express.static(config.uploadsDir, {
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'Bad JSON.' });
  if (err.type === 'entity.too.large')
    return res
      .status(413)
      .json({ error: 'That file is too large. Try a smaller picture or PDF.' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error:
      status >= 500 && !err.status
        ? 'Something went wrong on the server.'
        : err.message,
  });
});

async function start() {
  try {
    await db.init();
    console.log('Database: PostgreSQL connected');
    const n = (
      await db.query('SELECT COUNT(*)::int AS n FROM admins WHERE active')
    ).rows[0].n;
    if (!n)
      console.warn(
        '\nNo admin accounts yet, so nobody can log in. Create one:\n  npm run admin -- add yourname "a-strong-password" "Your Full Name"\n',
      );
  } catch (e) {
    console.error('\nCannot connect to PostgreSQL:', e.message || e.code);
    console.error(
      'Check PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE in backend/.env, and that the database exists in pgAdmin.\n',
    );
    process.exit(1);
  }
  app.listen(config.port, async () => {
    console.log(`CM-ITA API listening on http://localhost:${config.port}`);
    const s = await ollama.status();
    if (!s.online)
      console.log(
        'AI: Ollama is not running (the website still works, AI buttons stay off). Start the Ollama app.',
      );
    else if (!s.modelReady)
      console.log(
        `AI: Ollama is running but model "${s.model}" is missing. Run: ollama pull ${s.model}`,
      );
    else console.log(`AI: ready (local model ${s.model})`);
  });
}
start();
