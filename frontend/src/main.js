import './styles.css';

const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const FILES = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, ''); // where pictures are served from
const CATS = {
  event: ['Event', '📣'],
  deadline: ['Deadline', '⏰'],
  general: ['General', '💻'],
};

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const token = () => sessionStorage.getItem('cmita_token');
const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
// "Oct 26, 2026" in Philippine time, from a saved timestamp
const fmtPosted = (iso) =>
  new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  });
const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
    new Date(),
  );
// How far away a deadline is: [text, isOver]
function dlStatus(d) {
  const days = Math.round(
    (new Date(d + 'T00:00:00Z') - new Date(todayISO() + 'T00:00:00Z')) / 864e5,
  );
  if (days < 0) return ['Passed', true];
  if (days === 0) return ['Due today', false];
  if (days === 1) return ['Due tomorrow', false];
  return [`${days} days left`, false];
}
const dparts = (d) => {
  const x = new Date(d + 'T00:00:00');
  return [
    x.getDate(),
    x.toLocaleDateString('en-PH', { month: 'short' }).toUpperCase(),
  ];
};

const st = {
  items: [],
  cat: '',
  q: '',
  ai: { online: false, modelReady: false },
  form: null,
  chat: [],
  chatOpen: false,
  busy: false,
};
const aiReady = () => st.ai.online && st.ai.modelReady;

/* ---------- talking to the backend ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token()) headers.Authorization = 'Bearer ' + token();
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token() && path !== '/auth/login') {
    sessionStorage.removeItem('cmita_token');
    sessionStorage.removeItem('cmita_name');
    st.form = null;
    renderTools();
    renderForm();
    renderList();
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
const showError = (m) => {
  $('#error').innerHTML = m ? `<div class="err">⚠️ ${esc(m)}</div>` : '';
};

async function load() {
  const p = new URLSearchParams();
  if (st.cat) p.set('category', st.cat);
  if (st.q) p.set('q', st.q);
  try {
    st.items = await api('/announcements?' + p);
    showError('');
  } catch (e) {
    showError(e.message);
  }
  renderList();
}
async function checkAi() {
  const was = aiReady();
  try {
    st.ai = await api('/ai/status');
  } catch {
    st.ai = { online: false, modelReady: false };
  }
  renderTools();
  if (was !== aiReady()) {
    renderList();
    renderForm();
    renderChat();
  }
}

/* shrink a picture in the browser before sending it */
function shrink(file, max = 1280) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file),
      im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k);
      c.height = Math.round(im.height * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = () => no(new Error('Could not read that picture.'));
    im.src = url;
  });
}

/* ---------- drawing the page ---------- */
function renderTools() {
  const pill = aiReady()
    ? `<span class="pill" title="Local AI model ${esc(st.ai.model)} is running">🟢 AI ready</span>`
    : `<span class="pill" title="Start the Ollama app to turn on the AI features">⚪ AI offline</span>`;
  $('#tools').innerHTML =
    pill +
    (token()
      ? `<span class="pill" title="Logged in">👤 ${esc(sessionStorage.getItem('cmita_name') || 'Admin')}</span><button class="btn" data-a="new">+ New post</button><button class="btn" data-a="logout">Log out</button>`
      : `<button class="btn" data-a="login">Admin login</button>`);
}
function renderChips() {
  $('#chips').innerHTML = [
    ['', 'All'],
    ...Object.entries(CATS).map(([k, v]) => [k, v[0]]),
  ]
    .map(
      ([k, n]) =>
        `<button class="chip${st.cat === k ? ' on' : ''}" data-a="cat" data-v="${k}">${n}</button>`,
    )
    .join('');
}
function card(i, feat) {
  const [catName, ico] = CATS[i.category] || CATS.general;
  const title = i.title,
    body = i.body;
  const dp = i.event_date ? dparts(i.event_date) : null;
  const [dlText, dlOver] = i.deadline_date ? dlStatus(i.deadline_date) : ['', false];
  const dl = i.deadline_date
    ? `<div class="dl${dlOver ? ' over' : ''}">⏰ Deadline: ${fmtDate(i.deadline_date)}${i.event_time && i.category === 'deadline' ? ' · ' + esc(i.event_time) : ''}<em>${dlText}</em></div>`
    : '';
  const atts =
    i.link || i.attachment
      ? `<div class="atts">${i.link ? `<a class="att" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">🔗 Open link</a>` : ''}${i.attachment ? `<a class="att" href="${esc(FILES + i.attachment)}" target="_blank" rel="noopener noreferrer">📄 ${esc(i.attachment_name || 'View PDF')}</a>` : ''}</div>`
      : '';
  const media = i.image
    ? `<img src="${esc(FILES + i.image)}" alt="" loading="lazy">`
    : `<div class="ph">${ico}</div>`;
  const meta = [
    i.location && `📍 <b>${esc(i.location)}</b>`,
    i.event_date && `📅 <b>${fmtDate(i.event_date)}</b>`,
    i.event_time &&
      !(i.category === 'deadline' && i.deadline_date) &&
      `🕐 <b>${esc(i.event_time)}</b>`,
  ]
    .filter(Boolean)
    .map((m) => `<span>${m}</span>`)
    .join('');
  const admin = token()
    ? `<div class="acts"><button class="btn s" data-a="edit" data-id="${i.id}">Edit</button><button class="btn s" data-a="pin" data-id="${i.id}">${i.pinned ? 'Unpin' : 'Pin'}</button><button class="btn s d" data-a="del" data-id="${i.id}">Delete</button></div>`
    : '';
  return `<article class="card${feat ? ' feat' : ''}" id="a-${i.id}">
    <div class="media">${media}<span class="badge ${i.category}">${catName}</span>${i.pinned ? `<span class="pin">📌 Pinned</span>` : ''}${dp ? `<div class="date">${dp[0]}<small>${dp[1]}</small></div>` : ''}</div>
    <div class="cb"><h3>${esc(title)}</h3><div class="posted">🗓️ Posted ${fmtPosted(i.created_at)}</div>${dl}${body ? `<p>${esc(body)}</p>` : ''}${atts}<div class="meta">${meta}</div>
    ${admin}</div></article>`;
}
function renderList() {
  const feat = st.items.length > 1 && st.items[0].pinned && !st.cat && !st.q;
  $('#list').innerHTML = st.items.length
    ? st.items.map((i, n) => card(i, feat && n === 0)).join('')
    : `<div class="empty">No announcements found.</div>`;
}
function renderForm() {
  const f = st.form,
    el = $('#form');
  if (!f) {
    el.innerHTML = '';
    return;
  }
  if (f.type === 'login') {
    el.innerHTML = `<form class="panel" data-form="login"><h2>🔐 Admin login</h2>
      <div class="grid"><div><label>Username</label><input id="lu" autocomplete="username" required></div>
      <div><label>Password</label><input id="lp" type="password" autocomplete="current-password" required></div></div>
      <div class="acts"><button class="btn p">Log in</button><button type="button" class="btn" data-a="cancel">Cancel</button></div></form>`;
    $('#lu').focus();
    return;
  }
  const it = f.item || { category: 'event' };
  const ai = aiReady()
    ? `<div class="ai"><div class="aitag" style="margin:0 0 6px">✨ AI Draft: type rough notes in English, Filipino or Bisaya. The AI detects the language, names and dates by itself. You still check and edit it before posting.</div>
        <textarea id="ai_notes" rows="3" placeholder="Ex: Prof. Reyes no class today IT 301   |   walay klase ugma si Sir Cruz   |   capstone defense Nov 5, 9am, Room 204"></textarea>
        <div class="row"><button type="button" class="btn p" data-a="draft">✨ Draft with AI</button></div><div class="aitag" id="ai_msg"></div></div>`
    : `<p class="mu">AI is offline. Start the Ollama app to use AI Draft.</p>`;
  const curPdf = f.pdf
    ? f.pdfName
    : it.attachment && !f.rmPdf
      ? it.attachment_name || 'document.pdf'
      : '';
  const cur = f.img || (it.image && !f.rm ? FILES + it.image : '');
  el.innerHTML = `<form class="panel" data-form="save"><h2>${it.id ? 'Edit' : 'New'} announcement</h2>${ai}
    <div class="grid">
      <div><label>Category</label><select id="f_category">${Object.entries(CATS)
        .map(
          ([k, v]) =>
            `<option value="${k}"${it.category === k ? ' selected' : ''}>${v[0]}</option>`,
        )
        .join('')}</select></div>
      <div><label>Where</label><input id="f_location" value="${esc(it.location)}" maxlength="120"></div>
      <div class="f"><label>Title *</label><input id="f_title" value="${esc(it.title)}" maxlength="120" required></div>
      <div class="f"><label>Details</label><textarea id="f_body" rows="4" maxlength="2000">${esc(it.body)}</textarea></div>
      <div><label>Event / class date</label><input id="f_event_date" type="date" value="${esc(it.event_date)}"></div>
      <div><label>Deadline (only if there is one)</label><input id="f_deadline_date" type="date" value="${esc(it.deadline_date)}"></div>
      <div class="f"><label>Time</label><input id="f_event_time" value="${esc(it.event_time)}" maxlength="40" placeholder="8:00 AM - 4:00 PM"></div>
      <div class="f"><label>Link (optional)</label><input id="f_link" type="url" value="${esc(it.link)}" maxlength="500" placeholder="https://example.com/form"></div>
      <div class="f"><label>PDF file (optional, 5 MB at most)</label>
        <div class="pv"><input id="f_pdf" type="file" accept="application/pdf,.pdf">
        <button type="button" class="btn s d" data-a="rmpdf"${curPdf ? '' : ' style="display:none"'} id="pdf_rm">Remove</button></div>
        <div class="fnote" id="pdf_name">${curPdf ? '📄 ' + esc(curPdf) : ''}</div></div>
      <div class="f"><label>Picture (optional, JPG / PNG / WEBP)</label>
        <div class="pv"><img id="pv_img" src="${esc(cur)}" alt=""${cur ? '' : ' style="display:none"'}>
        <input id="f_image" type="file" accept="image/jpeg,image/png,image/webp">
        <button type="button" class="btn s d" data-a="rmimg"${cur ? '' : ' style="display:none"'} id="pv_rm">Remove</button></div></div>
      <div class="f"><label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--ink)"><input type="checkbox" id="f_pinned" style="width:auto"${it.pinned ? ' checked' : ''}> 📌 Pin to top</label></div>
    </div>
    <div class="acts"><button class="btn p">${it.id ? 'Update' : 'Post'}</button><button type="button" class="btn" data-a="cancel">Cancel</button></div></form>`;
}
function renderChat() {
  const el = $('#chat');
  if (!aiReady()) {
    el.innerHTML = '';
    return;
  }
  if (!st.chatOpen) {
    el.innerHTML = `<button class="fab" data-a="chat">🤖 Ask CM-ITA AI</button>`;
    return;
  }
  const msgs = [
    {
      role: 'b',
      text: "Hi! I'm the CM-ITA AI Assistant. Ask me about BSIT announcements in English, Filipino or Bisaya. I understand names and dates too.",
    },
    ...st.chat,
  ]
    .map(
      (m) =>
        `<div class="msg ${m.role}">${esc(m.text)}${m.sources?.length ? `<div class="src">${m.sources.map((s) => `<button data-a="goto" data-id="${s.id}">📄 ${esc(s.title)}<span class="det">Posted ${fmtDate(s.posted)}${s.deadline ? ' · ⏰ Deadline ' + fmtDate(s.deadline) : ''}</span></button>`).join('')}</div>` : ''}</div>`,
    )
    .join('');
  const ideas = st.chat.length
    ? ''
    : `<div class="src ideas">${['When is the next event?', 'Naay klase ba karon?', 'What deadlines are coming up?'].map((q) => `<button data-a="suggest" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="chatbox"><header><span>🤖 CM-ITA AI Assistant</span><button data-a="chatx" aria-label="Close">✕</button></header>
    <div class="log" id="log">${msgs}</div>${ideas}
    <div class="note">Answers come only from posted announcements. AI can make mistakes, so check the announcement.</div>
    <form data-form="ask"><input id="askq" maxlength="300" placeholder="Type your question…" autocomplete="off" required><button class="btn p"${st.busy ? ' disabled' : ''}>Send</button></form></div>`;
  const log = $('#log');
  log.scrollTop = log.scrollHeight;
  if (!st.busy) $('#askq').focus();
}

/* ---------- clicks ---------- */
const itemById = (id) => st.items.find((x) => x.id === Number(id));

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const { a, id, v } = b.dataset;
  try {
    if (a === 'cat') {
      st.cat = v;
      renderChips();
      await load();
    } else if (a === 'login') {
      st.form = { type: 'login' };
      renderForm();
    } else if (a === 'logout') {
      sessionStorage.removeItem('cmita_token');
      sessionStorage.removeItem('cmita_name');
      st.form = null;
      renderTools();
      renderForm();
      renderList();
    } else if (a === 'new') {
      st.form = { type: 'edit', item: null };
      renderForm();
      scrollTo({ top: 0, behavior: 'smooth' });
    } else if (a === 'edit') {
      st.form = { type: 'edit', item: itemById(id) };
      renderForm();
      scrollTo({ top: 0, behavior: 'smooth' });
    } else if (a === 'cancel') {
      st.form = null;
      renderForm();
    } else if (a === 'rmimg') {
      st.form.img = null;
      st.form.rm = true;
      $('#f_image').value = '';
      $('#pv_img').style.display = 'none';
      b.style.display = 'none';
    } else if (a === 'rmpdf') {
      st.form.pdf = null;
      st.form.pdfName = '';
      st.form.rmPdf = true;
      $('#f_pdf').value = '';
      $('#pdf_name').textContent = '';
      b.style.display = 'none';
    } else if (a === 'del') {
      if (confirm('Delete this announcement? This cannot be undone.')) {
        await api('/announcements/' + id, { method: 'DELETE' });
        await load();
      }
    } else if (a === 'pin') {
      const it = itemById(id);
      await api('/announcements/' + id, {
        method: 'PUT',
        body: { ...it, pinned: !it.pinned },
      });
      await load();
    } else if (a === 'draft') await draft(b);
    else if (a === 'chat') {
      st.chatOpen = true;
      renderChat();
    } else if (a === 'chatx') {
      st.chatOpen = false;
      renderChat();
    } else if (a === 'suggest') {
      $('#askq').value = b.dataset.q;
      $('#askq').form.requestSubmit();
    } else if (a === 'goto') {
      let el = document.getElementById('a-' + id);
      if (!el) {
        st.cat = '';
        st.q = '';
        $('#search').value = '';
        renderChips();
        await load();
        el = document.getElementById('a-' + id);
      }
      if (innerWidth < 600) {
        st.chatOpen = false;
        renderChat();
      }
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('flash');
      setTimeout(() => el?.classList.remove('flash'), 1800);
    }
  } catch (err) {
    showError(err.message);
  }
});

function readPdf(file) {
  return new Promise((ok, no) => {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name))
      return no(new Error('Please choose a PDF file.'));
    if (file.size > 5 * 1024 * 1024)
      return no(new Error('That PDF is too big (5 MB at most).'));
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => no(new Error('Could not read that PDF.'));
    r.readAsDataURL(file);
  });
}
document.addEventListener('change', async (e) => {
  if (e.target.id === 'f_pdf' && e.target.files[0]) {
    try {
      const f = e.target.files[0];
      st.form.pdf = await readPdf(f);
      st.form.pdfName = f.name;
      st.form.rmPdf = false;
      $('#pdf_name').textContent = '📄 ' + f.name;
      $('#pdf_rm').style.display = '';
      showError('');
    } catch (err) {
      showError(err.message);
      e.target.value = '';
    }
    return;
  }
  if (e.target.id !== 'f_image' || !e.target.files[0]) return;
  try {
    const url = await shrink(e.target.files[0]);
    st.form.img = url;
    st.form.rm = false;
    const pv = $('#pv_img');
    pv.src = url;
    pv.style.display = '';
    $('#pv_rm').style.display = '';
  } catch (err) {
    showError(err.message);
    e.target.value = '';
  }
});

async function draft(btn) {
  const msg = (t) => {
    $('#ai_msg').textContent = t;
  };
  const notes = $('#ai_notes').value.trim();
  if (notes.length < 5) return msg('Type your rough notes first.');
  btn.disabled = true;
  btn.textContent = 'Thinking… (can take up to a minute)';
  msg('');
  try {
    const d = await api('/ai/draft', { method: 'POST', body: { notes } });
    for (const k of [
      'category',
      'title',
      'body',
      'location',
      'event_date',
      'event_time',
      'deadline_date',
      'link',
    ])
      $('#f_' + k).value = d[k] || '';
    msg(
      'Draft ready. Please check every detail (especially dates, names and places) before posting.',
    );
  } catch (err) {
    msg('⚠️ ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Draft with AI';
  }
}

/* ---------- forms ---------- */
document.addEventListener('submit', async (e) => {
  const kind = e.target.dataset.form;
  if (!kind) return;
  e.preventDefault();
  try {
    if (kind === 'login') {
      const r = await api('/auth/login', {
        method: 'POST',
        body: { username: $('#lu').value.trim(), password: $('#lp').value },
      });
      sessionStorage.setItem('cmita_token', r.token);
      sessionStorage.setItem('cmita_name', r.name || '');
      st.form = null;
      renderTools();
      renderForm();
      await load();
      showError('');
    } else if (kind === 'save') {
      const body = {
        category: $('#f_category').value,
        title: $('#f_title').value,
        body: $('#f_body').value,
        location: $('#f_location').value,
        event_date: $('#f_event_date').value,
        event_time: $('#f_event_time').value,
        deadline_date: $('#f_deadline_date').value,
        link: $('#f_link').value,
        pdf: st.form.pdf || undefined,
        pdf_name: st.form.pdfName || undefined,
        remove_pdf: !!st.form.rmPdf,
        pinned: $('#f_pinned').checked,
        image: st.form.img || undefined,
        remove_image: !!st.form.rm,
      };
      const it = st.form.item;
      await api(it ? '/announcements/' + it.id : '/announcements', {
        method: it ? 'PUT' : 'POST',
        body,
      });
      st.form = null;
      renderForm();
      showError('');
      await load();
    } else if (kind === 'ask') {
      const q = $('#askq').value.trim();
      if (!q || st.busy) return;
      st.chat.push(
        { role: 'u', text: q },
        { role: 'b', text: 'Thinking…', temp: true },
      );
      st.busy = true;
      renderChat();
      let reply;
      try {
        const r = await api('/ai/ask', {
          method: 'POST',
          body: { question: q },
        });
        reply = { role: 'b', text: r.answer, sources: r.sources };
      } catch (err) {
        reply = { role: 'b', text: '⚠️ ' + err.message };
      }
      st.chat = st.chat.filter((m) => !m.temp).concat(reply);
      st.busy = false;
      renderChat();
    }
  } catch (err) {
    if (kind === 'login') alert(err.message);
    else showError(err.message);
  }
});

let timer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    st.q = e.target.value.trim();
    load();
  }, 250);
});

/* ---------- theme colors taken from the logo ---------- */
// Reads public/logo.png, finds its main color (and a second one for deadlines),
// and sets the site colors. If anything fails, the green theme in styles.css stays.
function themeFromLogo() {
  const im = new Image();
  im.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0, 64, 64);
      const px = g.getImageData(0, 0, 64, 64).data;
      const bins = Array.from({ length: 24 }, () => 0);
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 200) continue;
        const r = px[i] / 255, gr = px[i + 1] / 255, b = px[i + 2] / 255;
        const mx = Math.max(r, gr, b), mn = Math.min(r, gr, b), l = (mx + mn) / 2;
        const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
        if (sat < 0.35 || l < 0.12 || l > 0.8) continue; // skip grays, black, white
        const d = mx - mn;
        let h = mx === r ? ((gr - b) / d) % 6 : mx === gr ? (b - r) / d + 2 : (r - gr) / d + 4;
        h = (h * 60 + 360) % 360;
        bins[Math.floor(h / 15) % 24] += sat;
      }
      const order = bins.map((w, k) => [w, k * 15 + 7]).sort((a, b) => b[0] - a[0]);
      if (!order[0][0]) return;
      const hue = order[0][1];
      const dist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
      const second = order.find(([w, h]) => w > order[0][0] * 0.1 && dist(h, hue) > 40);
      const root = document.documentElement.style;
      root.setProperty('--brand', `hsl(${hue} 80% 27%)`);
      root.setProperty('--brand2', `hsl(${hue} 85% 18%)`);
      root.setProperty('--blk', `hsl(${hue} 55% 6%)`);
      root.setProperty('--tint', `hsl(${hue} 40% 96%)`);
      root.setProperty('--bg', `hsl(${hue} 15% 95%)`);
      root.setProperty('--bd', `hsl(${hue} 12% 87%)`);
      if (second) root.setProperty('--accent', `hsl(${second[1]} 60% 36%)`);
      let m = document.querySelector('meta[name=theme-color]');
      if (!m) {
        m = document.createElement('meta');
        m.name = 'theme-color';
        document.head.append(m);
      }
      m.content = getComputedStyle(document.documentElement).getPropertyValue('--blk');
    } catch {
      /* keep the default theme */
    }
  };
  im.src = '/logo.png';
}

themeFromLogo();
renderTools();
renderChips();
renderList();
load();
checkAi();
setInterval(checkAi, 30000);
