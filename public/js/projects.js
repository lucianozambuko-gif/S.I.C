(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer:fine)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Relative, so it resolves under a sub-path (GitHub Pages) as well as at the root.
  const LOGO = 'img/sic-mark.jpg';
  // Fighter-select colour bands: [light, dark].
  const BANDS = [['#7a3cd6', '#250d4d'], ['#2b6be0', '#0a1f5c'], ['#d4322f', '#4a0a0e'], ['#14a394', '#053a35'],
    ['#ea7a1c', '#5a2305'], ['#c62f8e', '#4a0732'], ['#3c9c2a', '#0f3a0a'], ['#d9a520', '#4d3505']];

  const grid = $('#cselect'), teams = $('#teams'), view = $('#pview');
  let items = [];

  /* ============ Unlock progress (kept per visitor in this browser) ============ */
  const KEY = 'sic-unlocked';
  const keyOf = (p) => String(p.id ?? p.title);
  let unlocked;
  try { unlocked = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { unlocked = new Set(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...unlocked])); } catch { /* private mode: progress just isn't kept */ } };

  function art(p, i, ctx) {
    if (p.url && p.resource_type === 'image') return `<img class="photo" src="${esc(p.url)}" alt="" loading="lazy">`;
    if (p.url) return `<video class="photo" src="${esc(p.url)}" muted loop playsinline preload="metadata" ${ctx === 'view' ? 'controls autoplay' : ''}></video>`;
    // No media yet: the S.I.C mark, nudged and mirrored per fighter so a repeated logo doesn't read as copies.
    return `<img class="logo" src="${LOGO}" alt="" style="--s:${1 + (i % 3) * 0.08};--fx:${i % 2 ? -1 : 1}">`;
  }

  function render(rows) {
    items = rows;
    $('#pEmpty').hidden = rows.length > 0;
    $('.arcade .hud').hidden = $('.select-head').hidden = !rows.length;
    $('#pCount').textContent = rows.length ? ` · ${String(rows.length).padStart(2, '0')}` : '';
    grid.style.setProperty('--per', Math.min(rows.length, 8) || 1);
    grid.innerHTML = rows.map((p, i) => {
      const [c1, c2] = BANDS[i % BANDS.length];
      const open = unlocked.has(keyOf(p));
      return `<button class="fighter${open ? ' open' : ''}" type="button" data-i="${i}" data-cat="${esc(p.category)}"
          style="--c1:${c1};--c2:${c2};--i:${i}" aria-label="${esc(p.title)}${p.category ? `, ${esc(p.category)}` : ''}. ${open ? 'Unlocked' : 'Locked'}">
        <span class="f-clip"><span class="f-in">
          <span class="f-bg"></span>
          <span class="f-art">${art(p, i)}</span>
          <span class="f-lock" aria-hidden="true"><b>?</b>
            <svg viewBox="0 0 24 24"><path class="shackle" d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="5" y="11" width="14" height="10" rx="2"/></svg></span>
          <span class="f-flash"></span>
          <span class="f-stamp" aria-hidden="true">Unlocked</span>
        </span><span class="f-name">${p.category ? `<small>${esc(p.category)}</small>` : ''}${esc(p.title)}</span></span>
        <span class="f-p1" aria-hidden="true">P1</span>
      </button>`;
    }).join('');
    renderTeams();
    progress(false);
  }

  // The entrance animation would replay (with its delay) whenever a filtered fighter is shown again, so drop it once it has run.
  grid.addEventListener('animationend', (e) => { if (e.animationName === 'fIn') e.target.classList.add('in'); });

  /* ============ HUD: unlocked counter, topic scoreboard, timer ============ */
  function progress(celebrate) {
    const n = items.filter((p) => unlocked.has(keyOf(p))).length, total = items.length;
    $('#hudCount').textContent = `${n}/${total}`;
    $('#hudBar').style.width = total ? `${(n / total) * 100}%` : '0';
    $('#replay').hidden = n === 0;
    $$('.team', teams).forEach((t) => {
      const mine = items.filter((p) => !t.dataset.cat || p.category === t.dataset.cat);
      $('.t-got', t).textContent = mine.filter((p) => unlocked.has(keyOf(p))).length;
    });
    const all = total > 0 && n === total;
    if (all && !grid.classList.contains('all')) complete(celebrate);
    if (!all) { grid.classList.remove('all'); $('#complete').hidden = true; }
  }
  function renderTeams() {
    const cats = [...new Set(items.map((p) => p.category).filter(Boolean))];
    teams.hidden = !items.length;
    teams.innerHTML = [['All', ''], ...cats.map((c) => [c, c])].map(([label, val], k) => {
      const total = items.filter((p) => !val || p.category === val).length;
      return `<button type="button" class="team${k ? '' : ' on'}" data-cat="${esc(val)}" aria-pressed="${!k}">
        <span class="t-name">${esc(label)}</span><span class="t-score"><span class="t-got">0</span>/${total} unlocked</span><span class="t-x">${total}</span></button>`;
    }).join('');
  }
  teams.addEventListener('click', (e) => {
    const b = e.target.closest('.team');
    if (!b || b.classList.contains('on')) return;
    $$('.team', teams).forEach((t) => { t.classList.toggle('on', t === b); t.setAttribute('aria-pressed', String(t === b)); });
    const cat = b.dataset.cat;
    let k = 0;
    $$('.fighter', grid).forEach((f) => {
      f.hidden = Boolean(cat) && f.dataset.cat !== cat;
      if (!f.hidden && !reduce) f.animate([{ opacity: 0, translate: '0 -60px' }, { opacity: 1, translate: '0 0' }],
        { duration: 450, delay: k++ * 60, easing: 'cubic-bezier(.2,.9,.3,1.3)', fill: 'backwards' });
    });
    grid.style.setProperty('--per', Math.min(k || 1, 8));
  });
  const tEl = $('#hudTime');
  let t = 99;
  if (!reduce) setInterval(() => { t = t <= 0 ? 99 : t - 1; tEl.textContent = String(t).padStart(2, '0'); }, 1000);

  /* ============ Unlocking ============ */
  function unlock(f) {
    const p = items[f.dataset.i];
    if (!p || f.classList.contains('open')) return;
    unlocked.add(keyOf(p));
    save();
    f.classList.add('open', 'unlocking');
    f.setAttribute('aria-label', f.getAttribute('aria-label').replace(/Locked$/, 'Unlocked'));
    setTimeout(() => f.classList.remove('unlocking'), 1400);
    if (!reduce) sparks(f);
    progress(true);
  }
  function sparks(f) {
    const box = $('.f-in', f);
    for (let k = 0; k < 14; k++) {
      const s = document.createElement('i');
      const a = (k / 14) * Math.PI * 2 + Math.random() * 0.4, d = 60 + Math.random() * 90;
      s.className = 'zap';
      s.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--h:${Math.random() < 0.5 ? '#fff3c4' : 'var(--c1)'}`;
      box.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
    }
  }
  function complete(celebrate) {
    grid.classList.add('all');
    const c = $('#complete');
    c.hidden = false;
    if (celebrate && !reduce) {
      grid.classList.remove('wave'); void grid.offsetWidth; grid.classList.add('wave');
      setTimeout(() => c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 900);
    }
  }
  $('#replay').addEventListener('click', () => {
    unlocked.clear();
    save();
    $$('.fighter', grid).forEach((f) => {
      f.classList.remove('open', 'act');
      f.setAttribute('aria-label', f.getAttribute('aria-label').replace(/Unlocked$/, 'Locked'));
    });
    progress(false);
    grid.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  });

  /* ============ Selecting: hover/focus on desktop, tap on phones ============ */
  let active = null;
  function select(f) {
    if (active === f) return;
    if (active) { active.classList.remove('act'); $('video', active)?.pause(); }
    active = f;
    if (!f) return;
    f.classList.add('act');
    const v = $('video', f);
    if (v && f.classList.contains('open') && !reduce) v.play().catch(() => {});
  }
  if (fine) {
    grid.addEventListener('pointerover', (e) => {
      const f = e.target.closest('.fighter');
      if (!f) return;
      select(f);
      unlock(f);
      $('video', f)?.play().catch(() => {});
    });
    grid.addEventListener('pointerleave', () => select(null));
  }
  // Keyboard focus unlocks like hover; a tap also focuses the button, but taps are handled on click.
  grid.addEventListener('focusin', (e) => {
    const f = e.target.closest('.fighter');
    if (f && (fine || f.matches(':focus-visible'))) { select(f); unlock(f); }
  });
  grid.addEventListener('focusout', (e) => { if (!grid.contains(e.relatedTarget)) select(null); });
  // Arcade joystick: arrow keys move between fighters.
  grid.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const vis = $$('.fighter', grid).filter((f) => !f.hidden);
    vis[(vis.indexOf(document.activeElement) + dir + vis.length) % vis.length]?.focus();
  });
  grid.addEventListener('click', (e) => {
    const f = e.target.closest('.fighter');
    if (!f) return;
    // Touch: the first tap unlocks, the next one opens.
    if (!f.classList.contains('open') || (!fine && active !== f)) {
      select(f);
      unlock(f);
      return;
    }
    openView(Number(f.dataset.i));
  });

  /* ============ Project viewer ============ */
  function openView(i) {
    const p = items[i], [c1, c2] = BANDS[i % BANDS.length];
    const m = $('#pvMedia');
    m.innerHTML = `<div class="pv-art" style="--c1:${c1};--c2:${c2}">${art(p, i, 'view')}</div>`;
    $('#pvMeta').textContent = [p.category, p.year].filter(Boolean).join(' · ').toUpperCase() || 'PROJECT';
    $('#pvTitle').textContent = p.title;
    $('#pvClient').textContent = p.client;
    $('#pvClient').hidden = !p.client;
    $('#pvText').textContent = p.summary;
    $('#pvText').hidden = !p.summary;
    // Systems we can demo get a demo request; the contact form arrives with it already written.
    const cta = $('#pvCta');
    cta.href = `contact?${p.demo ? 'demo' : 'project'}=${encodeURIComponent(p.title)}`;
    cta.firstChild.textContent = p.demo ? 'Request a demo ' : 'Start a project like this ';
    $('#pvLink').hidden = !p.link;
    if (p.link) $('#pvLink').href = p.link;
    view.showModal();
    document.body.classList.add('modal-open');
  }
  view.addEventListener('click', (e) => { if (e.target === view || e.target.closest('[data-close]')) view.close(); });
  view.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    $('#pvMedia').innerHTML = ''; // stops the clip
  });

  /* ============ Load ============ */
  const json = (url) => fetch(url).then((r) => {
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error(`no data at ${url}`);
    return r.json();
  });
  // No server behind the site (the static preview): show the starter projects the dashboard is seeded with.
  json('/api/projects')
    .catch(() => json('data/projects.json').then((rows) => rows.map((p) => ({ ...p, resource_type: 'image' }))))
    .then((rows) => render(rows))
    .catch((err) => { console.error('[projects]', err); render([]); });
})();
