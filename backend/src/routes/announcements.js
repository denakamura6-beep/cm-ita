const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { uploadsDir } = require('../config');
const { requireAdmin } = require('../middleware/auth');
const { AppError, wrap } = require('../errors');
const { checkSensitive } = require('../services/ai'); // change the path if your ai.js lives elsewhere

const CATS = ['event', 'deadline', 'general'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(b = {}) {
  const s = (v, max) =>
    String(v ?? '')
      .trim()
      .slice(0, max);
  const title = s(b.title, 120);
  if (!title) throw new AppError(400, 'Title is required.');
  const event_date = s(b.event_date, 10);
  if (event_date && !DATE_RE.test(event_date))
    throw new AppError(400, 'Date must look like 2026-10-31.');
  const deadline_date = s(b.deadline_date, 10);
  if (deadline_date && !DATE_RE.test(deadline_date))
    throw new AppError(400, 'Deadline must look like 2026-10-31.');
  let link = s(b.link, 500);
  if (link) {
    if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
    try {
      const u = new URL(link);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      link = u.href;
    } catch {
      throw new AppError(
        400,
        'That link does not look right. Example: https://example.com',
      );
    }
  }
  return {
    category: CATS.includes(b.category) ? b.category : 'general',
    title,
    body: s(b.body, 2000),
    location: s(b.location, 120),
    event_date,
    event_time: s(b.event_time, 40),
    deadline_date,
    link,
    pinned: !!b.pinned,
  };
}
function getId(req) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new AppError(400, 'Bad id.');
  return id;
}

// Sensitive word check. Returns true when it already answered with a "please confirm" (409).
// It runs BEFORE any picture or PDF is saved, so nothing is left behind if the admin cancels.
// When the admin chose "Post anyway", the frontend sends confirmSensitive: true and we skip the check.
async function needsConfirmation(req, res, d) {
  if (req.body && req.body.confirmSensitive === true) return false;
  const flagged = await checkSensitive({
    title: d.title,
    body: d.body,
    location: d.location,
    event_time: d.event_time,
  });
  if (!flagged.length) return false;
  res.status(409).json({
    needsConfirmation: true,
    message:
      'This announcement contains sensitive words. Do you wish to proceed?',
    flagged,
  });
  return true;
}

// Pictures arrive as a data URL (the browser shrinks them first) and are saved as files.
function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl,
  );
  if (!m) throw new AppError(400, 'Picture must be a JPG, PNG or WEBP image.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1.5 * 1024 * 1024)
    throw new AppError(400, 'Picture is too big (1.5 MB at most).');
  const name =
    crypto.randomBytes(12).toString('hex') +
    '.' +
    (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  return '/uploads/' + name;
}
function removeImage(url) {
  if (url && url.startsWith('/uploads/'))
    fs.unlink(path.join(uploadsDir, path.basename(url)), () => {});
}
function resolveImage(b, old = '') {
  if (typeof b.image === 'string' && b.image.startsWith('data:')) {
    removeImage(old);
    return saveImage(b.image);
  }
  if (b.remove_image) {
    removeImage(old);
    return '';
  }
  return old;
}

// PDFs arrive as a data URL too (max 5 MB) and are saved as files.
function savePdf(dataUrl) {
  const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new AppError(400, 'Attachment must be a PDF file.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 5 * 1024 * 1024)
    throw new AppError(400, 'PDF is too big (5 MB at most).');
  if (buf.subarray(0, 4).toString() !== '%PDF')
    throw new AppError(400, 'That file is not a real PDF.');
  const name = crypto.randomBytes(12).toString('hex') + '.pdf';
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  return '/uploads/' + name;
}
// Returns { attachment, attachment_name } for the saved record.
function resolvePdf(b, old = { attachment: '', attachment_name: '' }) {
  if (typeof b.pdf === 'string' && b.pdf.startsWith('data:')) {
    removeImage(old.attachment);
    const name = String(b.pdf_name || 'document.pdf')
      .replace(/[^\w.\- ()]/g, '')
      .trim()
      .slice(0, 100);
    return {
      attachment: savePdf(b.pdf),
      attachment_name: name || 'document.pdf',
    };
  }
  if (b.remove_pdf) {
    removeImage(old.attachment);
    return { attachment: '', attachment_name: '' };
  }
  return old;
}

router.get(
  '/',
  wrap(async (req, res) => {
    const q = String(req.query.q || '')
      .trim()
      .replace(/[\\%_]/g, '');
    const cat = String(req.query.category || '');
    const where = [],
      params = [];
    if (CATS.includes(cat)) {
      params.push(cat);
      where.push(`category = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      where.push(
        `(title ILIKE $${n} OR body ILIKE $${n} OR location ILIKE $${n})`,
      );
    }
    const sql = `SELECT * FROM announcements ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY pinned DESC, created_at DESC, id DESC`;
    res.json((await db.query(sql, params)).rows);
  }),
);

router.post(
  '/',
  requireAdmin,
  wrap(async (req, res) => {
    const d = clean(req.body);
    if (await needsConfirmation(req, res, d)) return; // asks the admin to confirm first
    d.image = resolveImage(req.body || {});
    const pdf = resolvePdf(req.body || {});
    const { rows } = await db.query(
      `INSERT INTO announcements (category,title,body,location,event_date,event_time,image,pinned,deadline_date,link,attachment,attachment_name,posted_by,posted_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        d.category,
        d.title,
        d.body,
        d.location,
        d.event_date,
        d.event_time,
        d.image,
        d.pinned,
        d.deadline_date,
        d.link,
        pdf.attachment,
        pdf.attachment_name,
        req.admin.id,
        req.admin.name,
      ],
    );
    res.status(201).json(rows[0]);
  }),
);

router.put(
  '/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const id = getId(req);
    const old = (
      await db.query(
        'SELECT image, attachment, attachment_name FROM announcements WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!old) throw new AppError(404, 'Announcement not found.');
    const d = clean(req.body);
    if (await needsConfirmation(req, res, d)) return; // asks the admin to confirm first
    d.image = resolveImage(req.body || {}, old.image);
    const pdf = resolvePdf(req.body || {}, {
      attachment: old.attachment,
      attachment_name: old.attachment_name,
    });
    const { rows } = await db.query(
      `UPDATE announcements SET category=$1,title=$2,body=$3,location=$4,event_date=$5,event_time=$6,image=$7,pinned=$8,
       deadline_date=$9,link=$10,attachment=$11,attachment_name=$12,last_edited_by=$13,updated_at=now()
     WHERE id=$14 RETURNING *`,
      [
        d.category,
        d.title,
        d.body,
        d.location,
        d.event_date,
        d.event_time,
        d.image,
        d.pinned,
        d.deadline_date,
        d.link,
        pdf.attachment,
        pdf.attachment_name,
        req.admin.name,
        id,
      ],
    );
    res.json(rows[0]);
  }),
);

router.delete(
  '/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const { rows } = await db.query(
      'DELETE FROM announcements WHERE id=$1 RETURNING image, attachment',
      [getId(req)],
    );
    if (!rows.length) throw new AppError(404, 'Announcement not found.');
    removeImage(rows[0].image);
    removeImage(rows[0].attachment);
    res.json({ ok: true });
  }),
);
module.exports = router;
