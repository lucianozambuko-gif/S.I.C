(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer:fine)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* Fallback option lists; the server's lists replace these once /api/content loads. */
  let OPTIONS = {
    clientTypes: ['Artist', 'Actor', 'Athlete', 'Influencer', 'Media personality', 'Brand', 'Management / label', 'Other'],
    audience: ['Under 10K', '10K–100K', '100K–500K', '500K–1M', '1M+', 'Not sure'],
    budget: ['Under R10k / month', 'R10k–R30k / month', 'R30k–R75k / month', 'R75k+ / month', "Let's discuss"],
    contactPref: ['Email', 'Phone call', 'WhatsApp', 'Through my management'],
  };
  let PACKAGES = ['Starter', 'Scale', 'Viral Push'];

  /* ============ Ambient background: leopard rosettes + gold dust ============ */
  const cv = $('#rosettes');
  const cx = cv.getContext('2d');
  let W, H, spots = [], dust = [];
  const mouse = { x: -999, y: -999 };
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spots = Array.from({ length: Math.round((W * H) / 22000) }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: 6 + Math.random() * 16, a: Math.random() * 6.28,
      s: 0.08 + Math.random() * 0.25, ph: Math.random() * 6.28, ox: 0, oy: 0, c: Math.random() < 0.18,
    }));
    dust = Array.from({ length: Math.round((W * H) / 9000) }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: 0.4 + Math.random() * 1.5, s: 0.15 + Math.random() * 0.5, ph: Math.random() * 6.28,
    }));
  }
  function rosette(s, t) {
    const r = s.r, tw = 0.5 + 0.5 * Math.sin(t * 0.0012 + s.ph);
    cx.save();
    cx.translate(s.x + s.ox, s.y + s.oy);
    cx.rotate(s.a);
    cx.fillStyle = s.c ? `rgba(217,116,58,${0.1 + 0.12 * tw})` : `rgba(242,166,74,${0.035 + 0.05 * tw})`;
    cx.beginPath(); cx.ellipse(0, 0, r * 0.55, r * 0.45, 0, 0, 6.28); cx.fill();
    cx.fillStyle = `rgba(245,238,228,${0.05 + 0.06 * tw})`;
    for (let k = 0; k < 5; k++) {
      const ang = k * 1.26 + 0.3;
      cx.beginPath(); cx.ellipse(Math.cos(ang) * r, Math.sin(ang) * r * 0.85, r * 0.32, r * 0.2, ang, 0, 6.28); cx.fill();
    }
    cx.restore();
  }
  function frame(t) {
    cx.clearRect(0, 0, W, H);
    for (const s of spots) {
      s.y -= s.s; s.x += Math.sin(t * 0.0004 + s.ph) * 0.15; s.a += 0.0008;
      if (s.y < -30) { s.y = H + 30; s.x = Math.random() * W; }
      const dx = s.x - mouse.x, dy = s.y - mouse.y, d = Math.hypot(dx, dy);
      const push = d < 160 ? ((160 - d) / 160) * 40 : 0;
      s.ox += ((d ? (dx / d) * push : 0) - s.ox) * 0.08;
      s.oy += ((d ? (dy / d) * push : 0) - s.oy) * 0.08;
      rosette(s, t);
    }
    for (const p of dust) {
      p.y -= p.s; p.x += Math.sin(t * 0.001 + p.ph) * 0.3;
      if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
      const a = 0.2 + 0.6 * Math.abs(Math.sin(t * 0.002 + p.ph));
      cx.fillStyle = `rgba(240,214,160,${a})`;
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.fill();
      if (p.r > 1.6 && a > 0.68) { cx.fillRect(p.x - p.r * 3, p.y - 0.3, p.r * 6, 0.6); cx.fillRect(p.x - 0.3, p.y - p.r * 3, 0.6, p.r * 6); }
    }
    requestAnimationFrame(frame);
  }
  if (!reduce) { size(); addEventListener('resize', size); requestAnimationFrame(frame); }

  /* ============ Cursor glow, gold cursor, progress ============ */
  const glow = $('#glow');
  if (fine && !reduce) {
    addEventListener('pointermove', (e) => {
      mouse.x = e.clientX; mouse.y = e.clientY;
      glow.style.transform = `translate(${e.clientX - 260}px,${e.clientY - 260}px)`;
    });
  } else glow.style.opacity = 0;

  const pr = $('#progress');
  addEventListener('scroll', () => {
    const h = document.documentElement;
    pr.style.transform = `scaleX(${h.scrollTop / (h.scrollHeight - h.clientHeight || 1)})`;
  }, { passive: true });

  /* Back to top: appears after the first screen; its ring fills with scroll progress. */
  const toTop = $('#toTop');
  if (toTop) {
    const ring = $('.tt-fill', toTop), C = 2 * Math.PI * 25;
    ring.style.strokeDasharray = C;
    const update = () => {
      const h = document.documentElement, show = h.scrollTop > innerHeight * 0.8;
      toTop.classList.toggle('show', show);
      toTop.tabIndex = show ? 0 : -1;
      ring.style.strokeDashoffset = C * (1 - h.scrollTop / (h.scrollHeight - h.clientHeight || 1));
    };
    addEventListener('scroll', update, { passive: true });
    update();
    toTop.addEventListener('click', () => {
      scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      $('.nav .brand')?.focus({ preventScroll: true }); // keyboard users land at the top too
    });
  }

  if (fine && !reduce) {
    const cur = $('#cur'), dot = $('#curDot');
    let px = -100, py = -100, tx = -100, ty = -100;
    document.body.classList.add('cur-on');
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; dot.style.transform = `translate(${tx}px,${ty}px)`; });
    (function loop() { px += (tx - px) * 0.18; py += (ty - py) * 0.18; cur.style.transform = `translate(${px}px,${py}px)`; requestAnimationFrame(loop); })();
    const HOT = 'a,button,.row,.tier,.niche,.pillar,input,select,textarea,.rc';
    document.addEventListener('pointerover', (e) => cur.classList.toggle('big', !!e.target.closest(HOT)));

    $$('.magnet').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px,${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
      });
      b.addEventListener('pointerleave', () => (b.style.transform = ''));
    });
    $$('.tilt').forEach((c) => {
      c.addEventListener('pointermove', (e) => {
        const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg)`;
      });
      c.addEventListener('pointerleave', () => (c.style.transform = ''));
    });
    $$('.sk').forEach((c) => c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', e.clientX - r.left + 'px');
      c.style.setProperty('--my', e.clientY - r.top + 'px');
    }));
    const stage = $('#stage'), mark = $('#mark');
    if (stage) {
      stage.addEventListener('pointermove', (e) => {
        const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        mark.style.transform = `perspective(800px) rotateY(${x * 18}deg) rotateX(${-y * 18}deg) translateZ(20px)`;
      });
      stage.addEventListener('pointerleave', () => (mark.style.transform = ''));
    }
  }

  /* ============ Touch: the phone versions of the pointer effects ============ */
  if (!fine && !reduce) {
    // Finger glow; the rosettes read the same `mouse` and part around the finger.
    const glowAt = (t) => {
      mouse.x = t.clientX; mouse.y = t.clientY;
      glow.style.transform = `translate(${t.clientX - 260}px,${t.clientY - 260}px)`;
    };
    addEventListener('touchstart', (e) => { glowAt(e.touches[0]); glow.style.opacity = 1; }, { passive: true });
    addEventListener('touchmove', (e) => glowAt(e.touches[0]), { passive: true });
    addEventListener('touchend', () => { glow.style.opacity = 0; mouse.x = mouse.y = -999; }, { passive: true });

    // Buttons: ripple from the tap point plus the desktop shine sweep.
    document.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.btn');
      if (!b) return;
      const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
      const rp = document.createElement('span');
      rp.className = 'ripple';
      rp.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
      b.appendChild(rp);
      rp.addEventListener('animationend', () => rp.remove());
      b.classList.remove('tap'); void b.offsetWidth; b.classList.add('tap');
    });
    document.addEventListener('animationend', (e) => e.target.classList?.contains('tap') && e.target.classList.remove('tap'));

    // Hover effects play as each card passes through the middle of the screen.
    const mid = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('hot', e.isIntersecting)),
      { rootMargin: '-38% 0px -38% 0px' });
    const watchHot = () => $$('.sk,.tier,.row,.pillar,.ccard').forEach((el) => mid.observe(el));
    watchHot();
    if ($('#tiers')) new MutationObserver(watchHot).observe($('#tiers'), { childList: true });

    // Tilt: phone motion sensor where allowed, a slow sway otherwise.
    const tilted = new Set();
    const tiltIO = new IntersectionObserver((es) => es.forEach((e) => {
      e.isIntersecting ? tilted.add(e.target) : tilted.delete(e.target);
      if (tilted.size && !tiltOn) { tiltOn = true; requestAnimationFrame(tilt); }
    }));
    const mark = $('#mark');
    [mark, ...$$('.tilt')].filter(Boolean).forEach((el) => tiltIO.observe(el));
    let tiltOn = false, sensor = null, sx = 0, sy = 0;
    addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      sensor = { x: Math.max(-1, Math.min(1, e.gamma / 30)) / 2, y: Math.max(-1, Math.min(1, (e.beta - 45) / 30)) / 2 };
    });
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      // iOS only hands out sensor data after a tap.
      addEventListener('touchend', () => DeviceOrientationEvent.requestPermission().catch(() => {}), { once: true });
    }
    function tilt(t) {
      if (!tilted.size) { tiltOn = false; return; }
      const tx = sensor ? sensor.x : Math.sin(t / 2600) * 0.35, ty = sensor ? sensor.y : Math.cos(t / 3400) * 0.3;
      sx += (tx - sx) * 0.08; sy += (ty - sy) * 0.08;
      tilted.forEach((el) => {
        el.style.transform = el === mark
          ? `perspective(800px) rotateY(${sx * 18}deg) rotateX(${-sy * 18}deg) translateZ(20px)`
          : `perspective(900px) rotateY(${sx * 7}deg) rotateX(${-sy * 7}deg)`;
      });
      requestAnimationFrame(tilt);
    }
  }

  /* ============ Clipping demo ============ */
  const lf = $('#longform'), sh = $('#shorts');
  const plats = ['TikTok', 'Reels', 'Shorts', 'TikTok', 'Reels'];
  if (lf) [0.14, 0.31, 0.5, 0.68, 0.85].forEach((p, i) => {
    const c = document.createElement('i');
    c.className = 'cut'; c.style.left = p * 100 + '%'; c.style.animationDelay = p * 4 - 4 + 's';
    lf.appendChild(c);
    const d = document.createElement('div');
    d.dataset.p = plats[i]; d.style.animationDelay = p * 4 - 3.6 + 's';
    sh.appendChild(d);
  });
  const tc = $('#tc'), t0 = performance.now();
  if (tc && !reduce) (function tick(n) {
    const s = Math.floor((((n - t0) % 4000) / 4000) * 2538);
    tc.textContent = `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    requestAnimationFrame(tick);
  })(t0);

  const cc = $('#clipCount');
  let clips = 24;
  if (cc && !reduce) setInterval(() => { clips = clips >= 96 ? 24 : clips + 1; cc.textContent = clips; }, 1400);

  /* Count-up numbers: the final value is already in the markup. */
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting || reduce) return;
    io.unobserve(e.target);
    const el = e.target, to = +el.dataset.to, from = +(el.dataset.from || 0), st = performance.now();
    (function run(n) {
      const k = Math.min((n - st) / 1600, 1);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(run);
    })(st);
  }), { threshold: 0.6 });
  $$('.count').forEach((c) => io.observe(c));

  /* Scroll reveals for browsers without CSS scroll timelines (Firefox, older iPhones). */
  if (!reduce && !CSS.supports('animation-timeline: view()')) {
    document.documentElement.classList.add('rv-js');
    const seen = new IntersectionObserver((es) => {
      es.filter((e) => e.isIntersecting).forEach((e, i) => {
        seen.unobserve(e.target);
        e.target.style.setProperty('--d', i * 0.09 + 's');
        e.target.classList.add('on');
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    $$('.rv,.statement h2').forEach((el) => seen.observe(el));
    $$('.statement h2 .w').forEach((w, i) => w.style.setProperty('--d', i * 0.07 + 's'));
  }

  /* Services jigsaw: pieces assemble as they scroll in; the seams flash when the last one locks. */
  const board = $('#svcGrid');
  if (board && !reduce) {
    const pieces = $$('.svc', board);
    let left = pieces.length;
    board.classList.add('pz-wait');
    const io2 = new IntersectionObserver((es) => {
      es.filter((e) => e.isIntersecting).forEach((e, i) => {
        io2.unobserve(e.target);
        e.target.style.setProperty('--pd', i * 0.14 + 's');
        e.target.classList.add('pz-in');
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    pieces.forEach((p) => {
      io2.observe(p);
      p.addEventListener('animationend', (e) => {
        if (e.target === p && e.animationName === 'pzIn' && --left === 0) board.classList.add('pz-done');
      });
    });
  }

  $('#yr').textContent = new Date().getFullYear();

  /* ============ API helper ============ */
  async function api(url, body) {
    let res;
    try {
      res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error('We could not reach our server. Check your connection and try again.'), { offline: true });
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error(data.error || 'We could not send that. Check your connection and try again.');
      err.field = data.field;
      err.offline = !data.error; // our API always explains its errors; anything else means it isn't there (e.g. a static host)
      throw err;
    }
    return data;
  }

  /* ============ Live content from the dashboard ============ */
  function fillSelect(sel, list, placeholder) {
    const current = sel.value;
    sel.innerHTML = `<option value="">${esc(placeholder || 'Choose one')}</option>` + list.map((o) => `<option>${esc(o)}</option>`).join('');
    if (list.includes(current)) sel.value = current;
  }
  function fillAllSelects() {
    $$('select[data-options]').forEach((s) => fillSelect(s, OPTIONS[s.dataset.options] || [], s.dataset.placeholder));
    $$('select[data-packages]').forEach((s) => fillSelect(s, [...PACKAGES, 'Not sure yet'], 'Choose a package'));
  }
  fillAllSelects();

  function renderPackages(list) {
    if (!list.length || !$('#tiers')) return;
    $('#tiers').innerHTML = list.map((p) => `
      <div class="tier${p.featured ? ' mid foil' : ''}">
        ${p.featured ? '<span class="flag">MOST BOOKED</span>' : ''}
        <h3>${esc(p.name)}</h3><p class="kind">${esc(p.label)}</p>
        <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <a href="#contact" data-open="enquiry" data-package="${esc(p.name)}" class="btn${p.featured ? '' : ' ghost'}">Choose ${esc(p.name)}</a>
      </div>`).join('');
  }

  function videoEl(m, cls) {
    if (m.resource_type === 'image') return `<img class="${cls}" src="${esc(m.url)}" alt="${esc(m.title)}" loading="lazy">`;
    return `<video class="${cls}" src="${esc(m.url)}" muted loop playsinline preload="metadata"></video>`;
  }

  function renderMedia(media) {
    // Hero phones: one clip each, autoplaying.
    [['hero-1', '.phone.p1 .reel'], ['hero-2', '.phone.p2 .reel']].forEach(([place, sel]) => {
      const m = media.find((x) => x.placement === place);
      const box = $(sel);
      if (!m || !box) return;
      box.insertAdjacentHTML('afterbegin', videoEl(m, 'real'));
      const v = $('video.real', box);
      if (v && !reduce) { v.autoplay = true; v.play().catch(() => {}); }
      const cap = $('.cap', box);
      if (cap && (m.title || m.caption)) cap.innerHTML = `<b>${esc(m.title)}</b>${esc(m.caption)}`;
      $$('.heart', box).forEach((h) => h.remove());
    });
    // Showreel strip.
    const show = media.filter((x) => x.placement === 'showcase');
    if (!show.length || !$('#reelStrip')) return;
    $('#reelStrip').innerHTML = show.map((m) => `
      <figure class="rc" tabindex="0">
        ${videoEl(m, '')}
        ${m.resource_type === 'image' ? '' : '<span class="play" aria-hidden="true"></span>'}
        <figcaption class="rc-cap"><b>${esc(m.title)}</b><span>${esc(m.caption)}</span></figcaption>
      </figure>`).join('');
    $('#reel').hidden = false;
    $('#navReel').hidden = false;
    $$('#reelStrip .rc').forEach((card) => {
      const v = $('video', card);
      if (!v) return;
      const play = () => { v.play().then(() => card.classList.add('playing')).catch(() => {}); };
      const stop = () => { v.pause(); card.classList.remove('playing'); };
      card.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && play());
      card.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && stop());
      card.addEventListener('click', () => (v.paused ? play() : stop()));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); v.paused ? play() : stop(); } });
    });
  }

  let waNumber = '';
  function renderSettings(s) {
    const mail = $('#mail');
    if (s.contact_email && mail) {
      mail.textContent = s.contact_email;
      mail.href = `mailto:${s.contact_email}`;
    }
    if (s.whatsapp) {
      waNumber = s.whatsapp.replace(/[^\d]/g, '').replace(/^0/, '27');
      const wa = $('#waLink');
      if (wa) {
        wa.href = `https://wa.me/${waNumber}?text=${encodeURIComponent("Hi S.I.C, I'd like to talk about a project.")}`;
        wa.hidden = false;
      }
      if ($('#waCard')) $('#waCard').hidden = false;
    }
    const links = [['Instagram', s.instagram], ['TikTok', s.tiktok], ['YouTube', s.youtube]].filter(([, u]) => u);
    $$('[data-socials]').forEach((el) => (el.innerHTML = links.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join('')));
    if (links.length && $('#socialCard')) $('#socialCard').hidden = false;
  }

  api('/api/content')
    .then((c) => {
      if (c.options) OPTIONS = c.options;
      if (c.packages?.length) { PACKAGES = c.packages.map((p) => p.name); renderPackages(c.packages); }
      fillAllSelects();
      renderMedia(c.media || []);
      renderSettings(c.settings || {});
    })
    .catch(() => { /* keep the built-in content */ });

  /* ============ Mobile menu ============ */
  const menuBtn = $('#menuBtn');
  if (menuBtn) {
    const setMenu = (open) => {
      document.body.classList.toggle('menu-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    menuBtn.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    $('#mnav').addEventListener('click', (e) => e.target.closest('a') && setMenu(false));
    addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));
  }

  /* ============ Copy email ============ */
  const cp = $('#copy'), mail = $('#mail');
  if (cp) cp.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(mail.textContent);
      cp.textContent = 'Copied';
    } catch {
      const r = document.createRange();
      r.selectNodeContents(mail);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      cp.textContent = 'Selected';
    }
    setTimeout(() => (cp.textContent = 'Copy email'), 1800);
  });

  /* ============ Contact page form ============ */
  const cForm = $('#contactForm');
  if (cForm) {
    const panel = $('#cPanel'), cDone = $('#cDone'), cOff = $('#cOffline');
    const qs = new URLSearchParams(location.search);
    let demo = (qs.get('demo') || '').slice(0, 80);
    const setKind = (k) => {
      cForm.classList.toggle('is-private', k === 'private');
      $('button[type=submit]', cForm).firstChild.textContent = k === 'private' ? 'Request consultation ' : demo ? 'Request demo ' : 'Send enquiry ';
    };
    cForm.addEventListener('change', (e) => { if (e.target.name === 'kind') setKind(e.target.value); });
    // Deep links: /contact?package=Scale, ?project=Album+launch, ?demo=Max+Meal+POS, ?private
    if (qs.has('private')) { cForm.elements.kind.value = 'private'; setKind('private'); }
    if (qs.get('package')) { const p = qs.get('package'); if (!PACKAGES.includes(p)) PACKAGES.push(p); fillAllSelects(); cForm.elements.package.value = p; }
    if (qs.get('project')) cForm.elements.message.value = `I saw "${qs.get('project').slice(0, 80)}" on your Projects page and want something like it. `;
    if (demo) {
      cForm.elements.message.value = `Hi, I'd like to request a demo of ${demo}. `;
      setKind('enquiry');
    }

    cForm.addEventListener('input', (e) => {
      const f = e.target.closest('.f');
      if (!f) return;
      f.classList.remove('bad');
      const slot = f.querySelector('[data-err]');
      if (slot) slot.textContent = '';
    });
    const show = (el) => { [cForm, cDone, cOff].forEach((x) => (x.hidden = x !== el)); panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); };
    $$('[data-again]').forEach((b) => b.addEventListener('click', () => show(cForm)));

    cForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(cForm);
      if (!validateLocally(cForm)) return;
      const data = Object.fromEntries(new FormData(cForm));
      const btn = $('button[type=submit]', cForm), label = btn.firstChild.textContent;
      btn.disabled = true;
      btn.firstChild.textContent = 'Sending… ';
      try {
        await api('/api/leads', data);
        $('#cDoneTitle').textContent = `Thank you, ${data.name.trim().split(' ')[0]}.`;
        $('#cDoneText').textContent = data.kind === 'private'
          ? 'Your request has gone straight to our senior team. Expect a personal reply within one working day.'
          : "Your enquiry is with our team. We'll reply within one working day, and a confirmation is on its way to your inbox.";
        cForm.reset();
        demo = '';
        setKind('enquiry');
        fillAllSelects();
        show(cDone);
      } catch (err) {
        if (!err.offline) return showFieldError(cForm, err.field, err.message);
        // No server behind this copy of the site: hand the message to email or WhatsApp instead of losing it.
        const body = [
          `Name: ${data.name}`, `Email: ${data.email}`, data.phone && `Phone: ${data.phone}`, `What I do: ${data.client_type}`,
          data.handle && `Social: ${data.handle}`, data.audience && `Audience: ${data.audience}`, data.package && `Package: ${data.package}`,
          data.budget && `Budget: ${data.budget}`, data.contact_pref && `Best way to reach me: ${data.contact_pref}`,
        ].filter(Boolean).join('\n') + `\n\n${data.message}`;
        const subject = `${data.kind === 'private' ? 'Private Desk request' : demo ? `Demo request (${demo})` : 'Project enquiry'}: ${data.name}`;
        $('#offMail').href = `mailto:${mail.textContent.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        const offWa = $('#offWa');
        offWa.hidden = !waNumber;
        if (waNumber) offWa.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(`${subject}\n\n${body}`)}`;
        show(cOff);
      } finally {
        btn.disabled = false;
        btn.firstChild.textContent = label;
      }
    });
  }

  /* Everything below drives the home page's modal forms and mailing list. */
  const modal = $('#modal');
  if (!modal) return;
  const eForm = $('#enquiryForm'), rForm = $('#referralForm'), done = $('#mDone');
  const COPY = {
    enquiry: { crest: 'ENQUIRY', title: 'Start a project', lede: 'Tell us who you are and what you want to grow. We reply within one working day.', button: 'Send enquiry' },
    private: { crest: 'PRIVATE DESK · BY INVITATION', title: 'Request a private consultation', lede: 'A senior member of our team will contact you personally, in the way you prefer.', button: 'Request consultation' },
    referral: { crest: 'REFERRAL', title: 'Bring one in, we cut one free', lede: "Tell us who you're referring. When they come on board, your next video is clipped at no cost.", button: 'Send referral' },
  };

  function clearErrors(form) {
    $$('.f', form).forEach((f) => f.classList.remove('bad'));
    $$('[data-err]', form).forEach((e) => (e.textContent = ''));
    $('.m-status', form).textContent = '';
  }

  function openModal(mode, pkg) {
    const c = COPY[mode] || COPY.enquiry;
    modal.classList.toggle('is-private', mode === 'private');
    $('#mCrest').textContent = c.crest;
    $('#mTitle').textContent = c.title;
    $('#mLede').textContent = c.lede;
    $('.m-head', modal).hidden = false;
    done.hidden = true;
    const isRef = mode === 'referral';
    eForm.hidden = isRef; rForm.hidden = !isRef;
    const form = isRef ? rForm : eForm;
    clearErrors(form);
    if (!isRef) {
      eForm.elements.kind.value = mode === 'private' ? 'private' : 'enquiry';
      $('button[type=submit]', eForm).firstChild.textContent = c.button + ' ';
      if (pkg) eForm.elements.package.value = pkg;
    }
    if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
    document.body.classList.add('modal-open');
    setTimeout(() => $('input:not([type=hidden]):not([tabindex="-1"])', form)?.focus(), 60);
  }
  function closeModal() {
    if (modal.open) modal.close();
  }
  modal.addEventListener('close', () => document.body.classList.remove('modal-open'));
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target === modal) closeModal();
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open]');
    if (!t) return;
    e.preventDefault();
    openModal(t.dataset.open, t.dataset.package);
  });

  function showFieldError(form, field, message) {
    const slot = $(`[data-err="${field}"]`, form);
    if (slot) {
      slot.textContent = message;
      slot.closest('.f')?.classList.add('bad');
      slot.closest('.f')?.querySelector('input,select,textarea')?.focus();
    } else {
      $('.m-status', form).textContent = message;
    }
  }

  function validateLocally(form) {
    for (const el of $$('[required]', form)) {
      if (!el.value.trim()) {
        const label = el.closest('.f').querySelector('span').textContent.replace(' *', '');
        showFieldError(form, el.name, `${label} is required.`);
        return false;
      }
      if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim())) {
        showFieldError(form, el.name, 'Enter a full email address, like name@domain.co.za.');
        return false;
      }
    }
    return true;
  }

  async function submitForm(form, url, success) {
    clearErrors(form);
    if (!validateLocally(form)) return;
    const btn = $('button[type=submit]', form);
    const label = btn.firstChild.textContent;
    btn.disabled = true;
    btn.firstChild.textContent = 'Sending… ';
    try {
      await api(url, Object.fromEntries(new FormData(form)));
      $('.m-head', modal).hidden = true;
      form.hidden = true;
      $('#doneTitle').textContent = success.title;
      $('#doneText').textContent = success.text;
      done.hidden = false;
      form.reset();
      fillAllSelects();
    } catch (err) {
      showFieldError(form, err.field, err.message);
    } finally {
      btn.disabled = false;
      btn.firstChild.textContent = label;
    }
  }

  // Clear a field's error as soon as the visitor edits it.
  [eForm, rForm].forEach((form) => form.addEventListener('input', (e) => {
    const f = e.target.closest('.f');
    if (!f) return;
    f.classList.remove('bad');
    const slot = f.querySelector('[data-err]');
    if (slot) slot.textContent = '';
  }));

  eForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const priv = eForm.elements.kind.value === 'private';
    const first = eForm.elements.namedItem('name').value.trim().split(' ')[0];
    submitForm(eForm, '/api/leads', {
      title: `Thank you, ${first}.`,
      text: priv
        ? 'Your request has gone straight to our senior team. Expect a personal reply within one working day.'
        : "Your enquiry is with our team. We'll reply within one working day, and a confirmation is on its way to your inbox.",
    });
  });
  rForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const them = rForm.elements.referred_name.value.trim();
    submitForm(rForm, '/api/referrals', {
      title: 'Referral received.',
      text: `We'll reach out to ${them}. Once they come on board, your next video is clipped free.`,
    });
  });

  /* ============ Mailing list ============ */
  const lForm = $('#listForm'), lDone = $('#done');
  lForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = lForm.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      lDone.style.color = '#F0937A';
      lDone.textContent = 'Enter a full email address, like name@domain.co.za.';
      return;
    }
    const btn = $('button', lForm);
    btn.disabled = true;
    try {
      const r = await api('/api/subscribe', { email: v, website: lForm.website.value });
      lDone.style.color = '';
      lDone.textContent = r.already ? "You're already on the list." : "You're on the list. Check your inbox for a welcome note.";
      lForm.reset();
    } catch (err) {
      lDone.style.color = '#F0937A';
      lDone.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // Deep link: /#enquire, /#private or /#refer opens the matching form.
  const deep = { '#enquire': 'enquiry', '#private': 'private', '#refer': 'referral' }[location.hash];
  if (deep) setTimeout(() => openModal(deep), reduce ? 0 : 2200);
})();
