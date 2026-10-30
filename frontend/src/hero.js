import './hero.css';

// The headline carousel at the top of the page.
// main.js gives us its helper functions through initHero(), then calls updateHero(items).
let ctx = null;
let root = null;
let items = [];
let idx = 0;
let sig = '';
let touch = null;

export function initHero(c) {
  ctx = c;
  root = document.getElementById('spot');
  if (!root) return;

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-spot]');
    if (!b) return;
    const k = b.dataset.spot;
    if (k === 'prev') go(idx - 1);
    else if (k === 'next') go(idx + 1);
    else if (k === 'dot') go(Number(b.dataset.i));
  });

  // The timer bar of the current headline finishes -> move to the next one
  root.addEventListener('animationend', (e) => {
    if (e.animationName === 'spotfill') go(idx + 1);
  });

  // Pause while the mouse is over it or while keyboard focus is inside it
  const pause = (v) => root.classList.toggle('paused', v);
  root.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') pause(true);
  });
  root.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') pause(false);
  });
  root.addEventListener('focusin', (e) => {
    if (e.target.matches(':focus-visible')) pause(true);
  });
  root.addEventListener('focusout', () => pause(false));

  // Swipe on phones
  root.addEventListener('pointerdown', (e) => {
    touch = e.target.closest('.spot-viewport')
      ? { x: e.clientX, y: e.clientY }
      : null;
  });
  root.addEventListener('pointerup', (e) => {
    if (!touch) return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5)
      go(idx + (dx < 0 ? 1 : -1));
  });
  root.addEventListener('pointercancel', () => {
    touch = null;
  });

  // Keyboard arrows
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(idx - 1);
    else if (e.key === 'ArrowRight') go(idx + 1);
  });
}

export function updateHero(all) {
  if (!root || !ctx || !Array.isArray(all)) return;
  const pinned = all.filter((i) => i.pinned);
  const kind = pinned.length ? 'pinned' : 'latest';
  const list = (pinned.length ? pinned : all).slice(0, 5);
  const key =
    kind +
    JSON.stringify(list.map((i) => [i.id, i.updated_at, i.title, i.pinned]));
  if (key === sig) return; // nothing changed, keep the current position
  sig = key;
  items = list;
  if (idx >= items.length) idx = 0;
  render(kind);
}

function go(n) {
  if (items.length < 2) return;
  idx = (n + items.length) % items.length;
  paint();
}

function paint() {
  const track = root.querySelector('.spot-track');
  if (!track) return;
  track.style.transform = `translateX(-${idx * 100}%)`;
  root.querySelectorAll('.spot-slide').forEach((s, i) => {
    s.inert = i !== idx;
    s.setAttribute('aria-hidden', String(i !== idx));
  });
  root.querySelectorAll('.spot-bars button').forEach((b, i) => {
    b.classList.toggle('done', i < idx);
    b.classList.toggle('on', i === idx);
    b.setAttribute('aria-current', i === idx ? 'true' : 'false');
  });
  const c = root.querySelector('.spot-count');
  if (c) c.textContent = `${idx + 1} / ${items.length}`;
}

function slideHtml(i) {
  const { esc, fmtDate, dlStatus, CATS, FILES } = ctx;
  const [catName, ico] = CATS[i.category] || CATS.general;
  const chips = [];
  if (i.deadline_date) {
    const [txt, over] = dlStatus(i.deadline_date);
    chips.push(
      `<span class="spot-chip${over ? '' : ' warn'}">⏰ Deadline ${esc(fmtDate(i.deadline_date))} · ${esc(txt)}</span>`,
    );
  }
  if (i.event_date)
    chips.push(
      `<span class="spot-chip">📅 ${esc(fmtDate(i.event_date))}</span>`,
    );
  if (i.event_time)
    chips.push(`<span class="spot-chip">🕐 ${esc(i.event_time)}</span>`);
  if (i.location)
    chips.push(`<span class="spot-chip">📍 ${esc(i.location)}</span>`);
  const img = i.image
    ? `<img class="bg" src="${esc(FILES + i.image)}" alt="" onerror="this.remove()">`
    : '';
  return `<article class="spot-slide ${esc(i.category)}">
    ${img}<span class="spot-ico" aria-hidden="true">${ico}</span>
    <div class="spot-body">
      <div class="spot-tags"><span class="spot-badge">${esc(catName)}</span>${i.pinned ? '<span class="spot-pin">📌 Pinned</span>' : ''}</div>
      <h2 class="spot-title">${esc(i.title)}</h2>
      ${i.body ? `<p class="spot-text">${esc(i.body)}</p>` : ''}
      ${chips.length ? `<div class="spot-chips">${chips.join('')}</div>` : ''}
      <button type="button" class="spot-cta" data-a="goto" data-id="${i.id}">View details →</button>
    </div>
  </article>`;
}

const welcomeSlide = () => `<article class="spot-slide welcome">
    <span class="spot-ico" aria-hidden="true">💻</span>
    <div class="spot-body">
      <div class="spot-tags"><span class="spot-badge">Welcome</span></div>
      <h2 class="spot-title">Welcome to CM-ITA</h2>
      <p class="spot-text">No announcements yet. Class notices, events and deadlines will show up here as soon as they are posted.</p>
    </div>
  </article>`;

function render(kind) {
  const multi = items.length > 1;
  const label = !items.length
    ? 'Welcome'
    : kind === 'pinned'
      ? multi
        ? '📌 Pinned announcements'
        : '📌 Pinned announcement'
      : 'Latest announcements';
  const slides = items.length ? items.map(slideHtml).join('') : welcomeSlide();
  root.innerHTML = `
    <div class="spot-label"><i></i><span>${label}</span>${multi ? '<em class="spot-count"></em>' : ''}</div>
    <div class="spot-frame" role="group" aria-roledescription="carousel" aria-label="${label}">
      <div class="spot-viewport"><div class="spot-track">${slides}</div></div>
      ${
        multi
          ? `<button type="button" class="spot-arrow prev" data-spot="prev" aria-label="Previous announcement">‹</button>
      <button type="button" class="spot-arrow next" data-spot="next" aria-label="Next announcement">›</button>
      <div class="spot-bars">${items.map((_, n) => `<button type="button" data-spot="dot" data-i="${n}" aria-label="Go to announcement ${n + 1}"><span><i></i></span></button>`).join('')}</div>`
          : ''
      }
    </div>`;
  paint();
}
