(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer:fine)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* Shown only when there's no server behind the site (the static preview), so the design can still be judged. */
  const SAMPLES = [
    ['Album rollout', 'Artist'], ['Matchday content', 'Athlete'], ['Brand launch film', 'Brand'],
    ['Talk-show clips', 'Media personality'], ['Red-carpet coverage', 'Actor'], ['Creator series', 'Influencer'],
  ].map(([title, category]) => ({
    title, category, client: '', year: '', link: '', url: null,
    summary: 'Sample entry. Real projects, with their preview clips and write-ups, are added in S.I.C Studio under Projects.',
  }));

  const list = $('#plist'), chips = $('#chips'), view = $('#pview');
  let items = [];

  const initials = (t) => t.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('');
  function mediaHTML(p, i, opts = '') {
    if (!p.url) return `<div class="ph-art" style="--x:${20 + ((i * 23) % 60)}%"><span>${esc(initials(p.title))}</span></div>`;
    if (p.resource_type === 'image') return `<img src="${esc(p.url)}" alt="" loading="lazy">`;
    return `<video src="${esc(p.url)}" muted loop playsinline preload="metadata" ${opts}></video>`;
  }
  // Each letter sits in its own clipped box with a gold twin below it; hovering rolls the twins up.
  function roll(t) {
    let n = 0;
    return t.split(/\s+/).map((w) => `<span class="w">${[...w].map((c) => `<span class="ch" style="--d:${n++}"><span data-c="${esc(c)}">${esc(c)}</span></span>`).join('')}</span>`).join(' ');
  }

  function render(rows, sample) {
    items = rows;
    $('#sampleNote').hidden = !sample;
    $('#pEmpty').hidden = rows.length > 0;
    $('#pCount').textContent = rows.length ? ` · ${String(rows.length).padStart(2, '0')}` : '';
    list.innerHTML = rows.map((p, i) => {
      const meta = [p.category, p.year].filter(Boolean).join(' · ');
      return `<li class="prow" style="--i:${i}" data-i="${i}" data-cat="${esc(p.category)}">
        <button class="prow-in" type="button">
          <span class="pnum">${String(i + 1).padStart(2, '0')}</span>
          <span class="ptitle"><span class="sr">${esc(p.title)}</span><span aria-hidden="true">${roll(p.title)}</span></span>
          <span class="pmeta"><b>${esc(p.client || meta)}</b>${p.client && meta ? `<i>${esc(meta)}</i>` : ''}</span>
          <span class="pthumb" aria-hidden="true">${mediaHTML(p, i)}</span>
          <span class="parr" aria-hidden="true">→</span>
        </button>
      </li>`;
    }).join('');
    renderChips();
    if (!fine) watchMiddle();
  }
  // The entrance animation would replay whenever a filtered row is shown again, so drop it once it has run.
  list.addEventListener('animationend', (e) => { if (e.animationName === 'prIn') e.target.classList.add('in'); });

  /* ============ Filter chips (FLIP re-order) ============ */
  function renderChips() {
    const cats = [...new Set(items.map((p) => p.category).filter(Boolean))];
    chips.hidden = cats.length < 2;
    chips.innerHTML = [['All', '', items.length], ...cats.map((c) => [c, c, items.filter((p) => p.category === c).length])]
      .map(([label, val, n], k) => `<button type="button" class="fchip${k ? '' : ' on'}" data-cat="${esc(val)}" aria-pressed="${!k}">${esc(label)}<sup>${n}</sup></button>`).join('');
  }
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.fchip');
    if (!b || b.classList.contains('on')) return;
    $$('.fchip', chips).forEach((c) => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', String(c === b)); });
    const cat = b.dataset.cat, rows = $$('.prow', list);
    const before = new Map(rows.map((r) => [r, r.hidden ? null : r.getBoundingClientRect().top]));
    rows.forEach((r) => (r.hidden = Boolean(cat) && r.dataset.cat !== cat));
    let k = 0;
    rows.filter((r) => !r.hidden).forEach((r) => {
      $('.pnum', r).textContent = String(++k).padStart(2, '0');
      if (reduce) return;
      const was = before.get(r), now = r.getBoundingClientRect().top;
      if (was === null) r.animate([{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: k * 60, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'backwards' });
      else if (was !== now) r.animate([{ transform: `translateY(${was - now}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.9,.2,1)' });
    });
  });

  /* ============ Desktop: floating preview card that trails the pointer ============ */
  const card = $('#pcard'), cardIn = $('#pcardIn');
  if (fine && !reduce) {
    let x = 0, y = 0, tx = 0, ty = 0, vx = 0, raf = 0, active = null;
    const loop = () => {
      const px = x;
      x += (tx - x) * 0.14; y += (ty - y) * 0.14;
      vx += (x - px - vx) * 0.2;
      card.style.transform = `translate(${x}px,${y}px) translate(-30%,-55%) rotate(${Math.max(-14, Math.min(14, vx * 0.6))}deg)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.4 || Math.abs(vx) > 0.05 ? requestAnimationFrame(loop) : 0;
    };
    list.addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    list.addEventListener('pointerover', (e) => {
      const r = e.target.closest('.prow');
      if (!r || r === active) return;
      if (!active) { x = tx = e.clientX; y = ty = e.clientY; } // first hover: appear under the pointer, don't fly in
      active?.classList.remove('on');
      active = r;
      r.classList.add('on');
      list.classList.add('hovering');
      const i = Number(r.dataset.i), p = items[i];
      const layer = document.createElement('div');
      layer.className = 'pc-layer';
      layer.innerHTML = mediaHTML(p, i, 'autoplay') + `<span class="pc-tag">${esc(p.category || 'Project')}</span>`;
      const old = [...cardIn.children];
      cardIn.appendChild(layer);
      $('video', layer)?.play().catch(() => {});
      setTimeout(() => old.forEach((o) => o.remove()), 700);
      card.classList.add('show');
      if (!raf) raf = requestAnimationFrame(loop);
    });
    list.addEventListener('pointerleave', () => {
      active?.classList.remove('on');
      active = null;
      list.classList.remove('hovering');
      card.classList.remove('show');
      $$('video', cardIn).forEach((v) => v.pause());
    });
  }

  /* ============ Touch: rows light up as they cross the middle of the screen ============ */
  let mid;
  function watchMiddle() {
    mid?.disconnect();
    mid = new IntersectionObserver((es) => es.forEach((e) => {
      e.target.classList.toggle('hot', e.isIntersecting);
      const v = $('.pthumb video', e.target);
      if (v) e.isIntersecting && !reduce ? v.play().catch(() => {}) : v.pause();
    }), { rootMargin: '-40% 0px -40% 0px' });
    $$('.prow', list).forEach((r) => mid.observe(r));
  }

  /* ============ Project viewer ============ */
  list.addEventListener('click', (e) => {
    const r = e.target.closest('.prow');
    if (!r) return;
    const i = Number(r.dataset.i), p = items[i];
    $('#pvMedia').innerHTML = p.url && p.resource_type !== 'image'
      ? `<video src="${esc(p.url)}" controls autoplay muted loop playsinline></video>`
      : mediaHTML(p, i);
    $('#pvMeta').textContent = [p.category, p.year].filter(Boolean).join(' · ').toUpperCase() || 'PROJECT';
    $('#pvTitle').textContent = p.title;
    $('#pvClient').textContent = p.client;
    $('#pvClient').hidden = !p.client;
    $('#pvText').textContent = p.summary;
    $('#pvText').hidden = !p.summary;
    $('#pvCta').href = `contact?project=${encodeURIComponent(p.title)}`; // relative, so it also works under a sub-path
    $('#pvLink').hidden = !p.link;
    if (p.link) $('#pvLink').href = p.link;
    view.showModal();
    document.body.classList.add('modal-open');
  });
  view.addEventListener('click', (e) => { if (e.target === view || e.target.closest('[data-close]')) view.close(); });
  view.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    $('#pvMedia').innerHTML = ''; // stops the clip
  });

  /* ============ Load ============ */
  fetch('/api/projects')
    .then((r) => {
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no api');
      return r.json();
    })
    .then((rows) => render(rows, false))
    .catch(() => render(SAMPLES, true));
})();
