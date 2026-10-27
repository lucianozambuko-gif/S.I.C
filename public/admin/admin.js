(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const STATUS = [
    ['new', 'New'], ['contacted', 'Contacted'], ['proposal', 'Proposal sent'], ['won', 'Won'], ['lost', 'Lost'],
  ];
  const REF_STATUS = [['new', 'New'], ['contacted', 'Contacted'], ['converted', 'Signed on'], ['rewarded', 'Free clip given']];
  const PLACE = { 'hero-1': 'HERO · LEFT', 'hero-2': 'HERO · RIGHT', showcase: 'REEL STRIP' };
  let ME = null;
  let leadsCache = [];

  /* ---------- helpers ---------- */
  async function api(url, { method = 'GET', body, form } = {}) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: form || (body ? JSON.stringify(body) : undefined),
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (res.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error(data.error || 'Sign in again.'); }
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.field = data.field; throw e; }
    return data;
  }
  function toast(msg, bad = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('bad', bad);
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const fmtDate = (iso) => new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  function ago(iso) {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    return d < 30 ? `${d} d ago` : fmtDay(iso);
  }
  const chip = (s, list = STATUS) => `<span class="st ${esc(s)}">${esc((list.find((x) => x[0] === s) || [s, s])[1])}</span>`;
  function confirmBox(text, sub = 'This cannot be undone.', yes = 'Delete') {
    const d = $('#confirmDlg');
    $('#confirmText').textContent = text;
    $('#confirmSub').textContent = sub;
    $('#confirmYes').textContent = yes;
    d.returnValue = '';
    d.showModal();
    return new Promise((r) => d.addEventListener('close', () => r(d.returnValue === 'yes'), { once: true }));
  }

  /* ---------- auth ---------- */
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    setTimeout(() => $('#lgEmail').focus(), 30);
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = $('button', f);
    $('#loginErr').textContent = '';
    btn.disabled = true;
    try {
      await api('/api/admin/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } });
      f.reset();
      boot();
    } catch (err) {
      $('#loginErr').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $('#logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  async function boot() {
    try {
      ME = await api('/api/admin/me');
    } catch {
      return showLogin();
    }
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#who').textContent = ME.email;
    const h = new Date().getHours();
    $('#greet').textContent = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    const warn = [];
    if (!ME.mailEnabled) warn.push('Email alerts are off: new enquiries are saved here, but nobody is emailed. Add SMTP settings to turn them on.');
    $('#banner').hidden = !warn.length;
    $('#banner').textContent = warn.join(' ');
    $('#upNote').textContent = $('#prUpNote').textContent = ME.mediaEnabled ? '(max 95 MB)' : '(needs Cloudinary; use a link for now)';
    $('#mFile').disabled = $('#prFile').disabled = !ME.mediaEnabled;
    route();
  }

  /* ---------- router ---------- */
  const views = { overview: loadOverview, leads: loadLeads, referrals: loadReferrals, subscribers: loadSubs, packages: loadPackages, projects: loadProjects, media: loadMedia, settings: loadSettings };
  function route() {
    const v = location.hash.replace('#', '') || 'overview';
    const name = views[v] ? v : 'overview';
    $$('.view').forEach((s) => (s.hidden = s.dataset.view !== name));
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === name));
    views[name]().catch((e) => toast(e.message, true));
    refreshBadges();
  }
  addEventListener('hashchange', () => { if (ME) route(); });

  async function refreshBadges() {
    try {
      const s = await api('/api/admin/stats');
      const nb = $('#navNew'), rb = $('#navRef');
      nb.textContent = s.leads.new; nb.hidden = !s.leads.new;
      rb.textContent = s.refNew; rb.hidden = !s.refNew;
    } catch { /* ignore */ }
  }

  /* ---------- overview ---------- */
  async function loadOverview() {
    const s = await api('/api/admin/stats');
    const open = s.leads.new + s.leads.contacted + s.leads.proposal;
    $('#kpis').innerHTML = [
      ['New enquiries', s.leads.new, 'Waiting for a first reply', s.leads.new > 0],
      ['Last 7 days', s.last7, 'Enquiries received'],
      ['Private Desk', s.privateOpen, 'Open A-list requests', s.privateOpen > 0],
      ['Mailing list', s.subs, 'Active subscribers'],
    ].map(([l, n, sub, hot]) => `<div class="kpi${hot ? ' hot' : ''}"><p class="mono">${l}</p><strong>${n}</strong><small>${sub}</small></div>`).join('');

    // 30-day bar chart (SVG, one scale for bars and labels)
    const days = [];
    for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    const counts = days.map((d) => s.days.find((x) => x.day === d)?.n || 0);
    const max = Math.max(4, ...counts);
    const Wd = 600, Hd = 170, pad = 24, bw = (Wd - pad) / 30;
    const y = (n) => Hd - 22 - (n / max) * (Hd - 40);
    const grid = [0, Math.round(max / 2), max].map((g) => `<line x1="${pad}" x2="${Wd}" y1="${y(g)}" y2="${y(g)}" stroke="rgba(245,238,228,.08)"/><text x="0" y="${y(g) + 4}" fill="#A99D8E" font-size="10" font-family="JetBrains Mono, monospace">${g}</text>`).join('');
    const bars = counts.map((n, i) => `<rect x="${pad + i * bw + 2}" y="${y(n)}" width="${bw - 4}" height="${Hd - 22 - y(n)}" rx="3" fill="${i === 29 ? '#F2A64A' : '#D9B77E'}" opacity="${n ? 1 : 0.15}"><title>${days[i]}: ${n}</title></rect>`).join('');
    const labels = [0, 10, 20, 29].map((i) => `<text x="${i === 29 ? Wd : pad + i * bw + bw / 2}" y="${Hd - 4}" text-anchor="${i === 29 ? 'end' : 'middle'}" fill="#A99D8E" font-size="10" font-family="JetBrains Mono, monospace">${new Date(days[i]).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</text>`).join('');
    $('#chart').innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="Enquiries per day over the last 30 days">${grid}${bars}${labels}</svg>`;

    const tmax = Math.max(1, ...s.byType.map((t) => t.n));
    $('#byType').innerHTML = s.byType.length
      ? `<div class="bars">${s.byType.map((t) => `<div class="bar-row"><span>${esc(t.label || 'Not given')}</span><span class="track"><i style="width:${(t.n / tmax) * 100}%"></i></span><b>${t.n}</b></div>`).join('')}</div>`
      : '<p class="empty">No enquiries yet.</p>';

    $('#recent').innerHTML = s.recent.length
      ? s.recent.map((l) => `<div class="list-row" data-lead="${l.id}"><div><b>${esc(l.name)} ${l.kind === 'private' ? '<span class="tag-private">PRIVATE</span>' : ''}</b><small>${esc(l.client_type || '')}</small></div>${chip(l.status)}<small class="muted">${ago(l.created_at)}</small></div>`).join('')
      : `<p class="empty">No enquiries yet. Share the site and they will land here. ${open ? '' : ''}</p>`;
  }
  document.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-lead]');
    if (!r) return;
    const id = Number(r.dataset.lead);
    if (!leadsCache.find((l) => l.id === id)) leadsCache = await api('/api/admin/leads');
    openLead(id);
  });

  /* ---------- leads board ---------- */
  function leadQuery() {
    const p = new URLSearchParams();
    if ($('#fq').value.trim()) p.set('q', $('#fq').value.trim());
    if ($('#fstatus').value) p.set('status', $('#fstatus').value);
    if ($('#fkind').value) p.set('kind', $('#fkind').value);
    return p.toString();
  }
  async function loadLeads() {
    const q = leadQuery();
    $('#leadsCsv').href = '/api/admin/leads.csv' + (q ? `?${q}` : '');
    leadsCache = await api('/api/admin/leads' + (q ? `?${q}` : ''));
    const cols = $('#fstatus').value ? STATUS.filter((s) => s[0] === $('#fstatus').value) : STATUS;
    $('#board').style.gridTemplateColumns = `repeat(${cols.length}, minmax(220px, 1fr))`;
    $('#board').innerHTML = cols.map(([key, label]) => {
      const items = leadsCache.filter((l) => l.status === key);
      return `<div class="col" data-status="${key}"><div class="col-h">${chip(key)}<b>${items.length}</b></div>
        ${items.map((l) => `<article class="lead" draggable="true" data-lead="${l.id}" tabindex="0">
          <div class="meta">${l.kind === 'private' ? '<span class="tag-private">PRIVATE</span>' : ''}<small>${esc(l.client_type || '')}</small></div>
          <b>${esc(l.name)}</b>
          <p>${esc(l.message)}</p>
          <small>${esc(l.package || 'No package chosen')} · ${ago(l.created_at)}</small>
        </article>`).join('') || '<p class="empty">Nothing here.</p>'}
      </div>`;
    }).join('');
  }
  let searchT;
  $('#fq').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(() => loadLeads().catch((e) => toast(e.message, true)), 250); });
  $('#fstatus').addEventListener('change', () => loadLeads());
  $('#fkind').addEventListener('change', () => loadLeads());

  // Drag a card to another column to change its status.
  const board = $('#board');
  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.lead');
    if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.lead);
    card.classList.add('dragging');
  });
  board.addEventListener('dragend', (e) => e.target.closest('.lead')?.classList.remove('dragging'));
  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.col');
    if (!col) return;
    e.preventDefault();
    $$('.col', board).forEach((c) => c.classList.toggle('drop', c === col));
  });
  board.addEventListener('dragleave', (e) => { if (!board.contains(e.relatedTarget)) $$('.col', board).forEach((c) => c.classList.remove('drop')); });
  board.addEventListener('drop', async (e) => {
    const col = e.target.closest('.col');
    $$('.col', board).forEach((c) => c.classList.remove('drop'));
    if (!col) return;
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const lead = leadsCache.find((l) => String(l.id) === id);
    if (!lead || lead.status === col.dataset.status) return;
    try {
      await api(`/api/admin/leads/${id}`, { method: 'PATCH', body: { status: col.dataset.status } });
      toast(`${lead.name} moved to ${STATUS.find((s) => s[0] === col.dataset.status)[1]}`);
      loadLeads(); refreshBadges();
    } catch (err) { toast(err.message, true); }
  });
  board.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.lead')) openLead(Number(e.target.dataset.lead)); });

  /* ---------- lead drawer ---------- */
  const drawer = $('#drawer');
  function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
  $('#drawerClose').addEventListener('click', closeDrawer);
  drawer.addEventListener('click', (e) => { if (e.target === drawer) closeDrawer(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  function waNumber(p) {
    const d = String(p || '').replace(/[^\d]/g, '');
    if (d.length < 9) return '';
    return d.startsWith('0') ? '27' + d.slice(1) : d;
  }
  function openLead(id) {
    const l = leadsCache.find((x) => x.id === id);
    if (!l) return;
    const wa = waNumber(l.phone);
    const subject = encodeURIComponent(l.kind === 'private' ? 'Your S.I.C Private Desk request' : 'Your enquiry with S.I.C');
    $('#drawerBody').innerHTML = `
      <p class="mono gold">${l.kind === 'private' ? 'PRIVATE DESK REQUEST' : 'ENQUIRY'} · ${fmtDate(l.created_at)}</p>
      <h2 class="d-name" id="dName">${esc(l.name)}</h2>
      ${chip(l.status)}
      <div class="quick">
        <a class="btn sm" href="mailto:${esc(l.email)}?subject=${subject}">Reply by email</a>
        ${wa ? `<a class="btn ghost sm" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${l.phone ? `<a class="btn ghost sm" href="tel:${esc(l.phone)}">Call</a>` : ''}
      </div>
      <dl class="dl">
        <dt>Email</dt><dd>${esc(l.email)}</dd>
        ${l.phone ? `<dt>Phone</dt><dd>${esc(l.phone)}</dd>` : ''}
        <dt>What they do</dt><dd>${esc(l.client_type || '—')}</dd>
        ${l.handle ? `<dt>Social</dt><dd>${/^https?:\/\//.test(l.handle) ? `<a href="${esc(l.handle)}" target="_blank" rel="noopener">${esc(l.handle)}</a>` : esc(l.handle)}</dd>` : ''}
        ${l.audience ? `<dt>Audience</dt><dd>${esc(l.audience)}</dd>` : ''}
        ${l.package ? `<dt>Package</dt><dd>${esc(l.package)}</dd>` : ''}
        ${l.budget ? `<dt>Budget</dt><dd>${esc(l.budget)}</dd>` : ''}
        ${l.contact_pref ? `<dt>Contact via</dt><dd>${esc(l.contact_pref)}</dd>` : ''}
        <dt>Message</dt><dd>${esc(l.message)}</dd>
      </dl>
      <form class="d-section" id="leadForm">
        <label class="f" for="dStatus"><span>Status</span><select id="dStatus" name="status">${STATUS.map(([k, v]) => `<option value="${k}"${k === l.status ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f" for="dNotes"><span>Team notes (private)</span><textarea id="dNotes" name="notes" rows="5" placeholder="Calls, quotes, next steps…">${esc(l.notes || '')}</textarea></label>
        <div class="row-end"><button class="btn ghost sm" type="button" id="dDelete">Delete</button><button class="btn sm" type="submit">Save changes</button></div>
      </form>`;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    $('#drawerClose').focus();
    $('#leadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const upd = await api(`/api/admin/leads/${l.id}`, { method: 'PATCH', body: { status: e.target.status.value, notes: e.target.notes.value } });
        Object.assign(l, upd);
        toast('Saved');
        closeDrawer();
        route();
      } catch (err) { toast(err.message, true); }
    });
    $('#dDelete').addEventListener('click', async () => {
      if (!(await confirmBox(`Delete ${l.name}'s enquiry?`))) return;
      await api(`/api/admin/leads/${l.id}`, { method: 'DELETE' });
      toast('Enquiry deleted');
      closeDrawer();
      route();
    });
  }

  /* ---------- referrals ---------- */
  async function loadReferrals() {
    const rows = await api('/api/admin/referrals');
    $('#refTable').innerHTML = rows.length ? `<table><thead><tr><th>Received</th><th>Referred</th><th>Referred by</th><th>Their notes</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td class="num">${fmtDay(r.created_at)}</td>
        <td><b>${esc(r.referred_name)}</b><br><small class="muted">${esc(r.referred_contact)}${r.referred_type ? ' · ' + esc(r.referred_type) : ''}</small></td>
        <td>${esc(r.referrer_name)}<br><a class="muted" href="mailto:${esc(r.referrer_email)}">${esc(r.referrer_email)}</a></td>
        <td><div class="notes">${esc(r.notes || '—')}</div></td>
        <td><select data-ref="${r.id}" aria-label="Status for ${esc(r.referred_name)}">${REF_STATUS.map(([k, v]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><button class="link" data-delref="${r.id}" type="button">Delete</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="empty">No referrals yet. The "Refer someone" button on the site sends them here.</p>';
  }
  $('#refTable').addEventListener('change', async (e) => {
    const s = e.target.closest('[data-ref]');
    if (!s) return;
    try { await api(`/api/admin/referrals/${s.dataset.ref}`, { method: 'PATCH', body: { status: s.value } }); toast('Referral updated'); refreshBadges(); }
    catch (err) { toast(err.message, true); }
  });
  $('#refTable').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delref]');
    if (!b || !(await confirmBox('Delete this referral?'))) return;
    await api(`/api/admin/referrals/${b.dataset.delref}`, { method: 'DELETE' });
    toast('Referral deleted');
    loadReferrals();
  });

  /* ---------- subscribers ---------- */
  async function loadSubs() {
    const rows = await api('/api/admin/subscribers');
    const active = rows.filter((r) => !r.unsubscribed_at).length;
    $('#subTable').innerHTML = rows.length ? `<table><thead><tr><th>Email</th><th>Joined</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.email)}</td><td class="num">${fmtDay(r.created_at)}</td>
        <td>${r.unsubscribed_at ? `<span class="st lost">Unsubscribed</span>` : `<span class="st won">Subscribed</span>`}</td>
        <td><button class="link" data-delsub="${r.id}" type="button">Remove</button></td></tr>`).join('')}
      </tbody></table><p class="empty">${active} active of ${rows.length}. The export includes active subscribers only.</p>` : '<p class="empty">No subscribers yet. The "Join the list" form on the site adds them here.</p>';
  }
  $('#subTable').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delsub]');
    if (!b || !(await confirmBox('Remove this subscriber?', 'They will be deleted from the list entirely.', 'Remove'))) return;
    await api(`/api/admin/subscribers/${b.dataset.delsub}`, { method: 'DELETE' });
    toast('Subscriber removed');
    loadSubs();
  });

  /* ---------- packages ---------- */
  let pkgs = [];
  async function loadPackages() {
    pkgs = await api('/api/admin/packages');
    $('#pkgList').innerHTML = pkgs.map((p) => `<div class="pkg${p.featured ? ' feat' : ''}${p.active ? '' : ' off'}">
      <p class="mono gold">${esc(p.label)}${p.featured ? ' · MOST BOOKED' : ''}${p.active ? '' : ' · HIDDEN'}</p>
      <h3>${esc(p.name)}</h3>
      <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <div class="acts"><button class="btn ghost sm" data-editpkg="${p.id}" type="button">Edit</button><button class="link" data-delpkg="${p.id}" type="button">Delete</button></div>
    </div>`).join('') || '<p class="empty">No packages. Add one to show the pricing section.</p>';
  }
  const pkgDlg = $('#pkgDlg'), pkgForm = $('#pkgForm');
  function editPkg(p) {
    $('#pkgDlgTitle').textContent = p ? `Edit ${p.name}` : 'New package';
    pkgForm.elements.id.value = p?.id || '';
    pkgForm.elements.name.value = p?.name || '';
    pkgForm.elements.label.value = p?.label || '';
    pkgForm.elements.features.value = (p?.features || []).join('\n');
    pkgForm.elements.sort.value = p?.sort ?? pkgs.length + 1;
    pkgForm.elements.featured.checked = Boolean(p?.featured);
    pkgForm.elements.active.checked = p ? Boolean(p.active) : true;
    $('#pkgErr').textContent = '';
    pkgDlg.showModal();
  }
  $('#addPkg').addEventListener('click', () => editPkg(null));
  $('#pkgCancel').addEventListener('click', () => pkgDlg.close());
  $('#pkgList').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-editpkg]');
    if (ed) return editPkg(pkgs.find((p) => p.id === Number(ed.dataset.editpkg)));
    const del = e.target.closest('[data-delpkg]');
    if (del && (await confirmBox('Delete this package?', 'It disappears from the website straight away.'))) {
      await api(`/api/admin/packages/${del.dataset.delpkg}`, { method: 'DELETE' });
      toast('Package deleted');
      loadPackages();
    }
  });
  pkgForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = pkgForm.elements;
    const body = { name: f.name.value, label: f.label.value, features: f.features.value, sort: f.sort.value, featured: f.featured.checked, active: f.active.checked };
    try {
      if (f.id.value) await api(`/api/admin/packages/${f.id.value}`, { method: 'PUT', body });
      else await api('/api/admin/packages', { method: 'POST', body });
      pkgDlg.close();
      toast('Package saved. It is live on the site.');
      loadPackages();
    } catch (err) { $('#pkgErr').textContent = err.message; }
  });

  /* ---------- projects ---------- */
  let projs = [], projCats = [];
  const mediaTag = (m) => (!m.url ? '<span class="no-media">No preview yet</span>'
    : m.resource_type === 'image' ? `<img src="${esc(m.url)}" alt="" loading="lazy">`
      : `<video src="${esc(m.url)}" muted loop playsinline preload="metadata"></video>`);
  async function loadProjects() {
    ({ projects: projs, categories: projCats } = await api('/api/admin/projects'));
    $('#prCat').innerHTML = '<option value="">Choose one</option>' + projCats.map((c) => `<option>${esc(c)}</option>`).join('');
    $('#projList').innerHTML = projs.map((p) => `<div class="proj${p.active ? '' : ' off'}">
      <div class="thumb">${mediaTag(p)}</div>
      <div class="proj-body">
        <p class="mono gold">${esc([p.category, p.year].filter(Boolean).join(' · ') || 'Project')}${p.active ? '' : ' · HIDDEN'}</p>
        <h3>${esc(p.title)}</h3>
        ${p.client ? `<small class="muted">${esc(p.client)}</small>` : ''}
        <div class="acts"><button class="btn ghost sm" data-editproj="${p.id}" type="button">Edit</button><button class="link" data-delproj="${p.id}" type="button">Delete</button></div>
      </div></div>`).join('') || '<p class="empty">No projects yet. Add your first one and it appears on the Projects page straight away.</p>';
    $$('#projList video').forEach((v) => {
      v.parentElement.addEventListener('pointerenter', () => v.play().catch(() => {}));
      v.parentElement.addEventListener('pointerleave', () => v.pause());
    });
  }
  const projDlg = $('#projDlg'), projForm = $('#projForm');
  function editProj(p) {
    const f = projForm.elements;
    $('#projDlgTitle').textContent = p ? `Edit ${p.title}` : 'New project';
    projForm.reset();
    f.id.value = p?.id || '';
    for (const k of ['title', 'client', 'category', 'year', 'summary', 'link']) f[k].value = p?.[k] || '';
    f.sort.value = p?.sort ?? 0;
    f.active.checked = p ? Boolean(p.active) : true;
    $('#prMedia').innerHTML = p?.url
      ? `<div class="thumb">${mediaTag(p)}</div><div><p class="muted">Current preview. Upload or paste a new one to replace it.</p><label class="check"><input type="checkbox" name="remove_media" value="1"> Remove the preview</label></div>`
      : '';
    $('#projErr').textContent = '';
    projDlg.showModal();
  }
  $('#addProj').addEventListener('click', () => editProj(null));
  $('#projCancel').addEventListener('click', () => projDlg.close());
  $('#projList').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-editproj]');
    if (ed) return editProj(projs.find((p) => p.id === Number(ed.dataset.editproj)));
    const del = e.target.closest('[data-delproj]');
    if (del && (await confirmBox('Delete this project?', 'It disappears from the website, and an uploaded preview is removed from Cloudinary.'))) {
      await api(`/api/admin/projects/${del.dataset.delproj}`, { method: 'DELETE' });
      toast('Project deleted');
      loadProjects();
    }
  });
  projForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = projForm.elements, btn = $('button[type=submit]', projForm);
    const fd = new FormData(projForm);
    if (!f.file.files.length) fd.delete('file');
    fd.set('active', f.active.checked ? '1' : '0');
    fd.delete('id');
    btn.disabled = true;
    btn.textContent = f.file.files.length ? 'Uploading…' : 'Saving…';
    try {
      if (f.id.value) await api(`/api/admin/projects/${f.id.value}`, { method: 'PUT', form: fd });
      else await api('/api/admin/projects', { method: 'POST', form: fd });
      projDlg.close();
      toast('Project saved. It is live on the site.');
      loadProjects();
    } catch (err) {
      $('#projErr').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save project';
    }
  });

  /* ---------- media ---------- */
  async function loadMedia() {
    const rows = await api('/api/admin/media');
    $('#mediaGrid').innerHTML = rows.map((m) => `<div class="mcard">
      <div class="thumb">${m.resource_type === 'image' ? `<img src="${esc(m.url)}" alt="" loading="lazy">` : `<video src="${esc(m.url)}" muted loop playsinline preload="metadata"></video>`}<span class="where">${PLACE[m.placement] || m.placement}</span></div>
      <form class="body" data-media="${m.id}">
        <input name="title" value="${esc(m.title)}" placeholder="Title" aria-label="Title" maxlength="80">
        <input name="caption" value="${esc(m.caption)}" placeholder="Caption" aria-label="Caption" maxlength="140">
        <input name="sort" type="number" value="${m.sort}" aria-label="Order">
        <div class="acts"><button class="link" type="button" data-delmedia="${m.id}">Delete</button><button class="btn sm" type="submit">Save</button></div>
      </form></div>`).join('') || '<p class="empty">No clips yet. Until you add some, the hero phones show animated placeholders and the reel strip stays hidden.</p>';
    $$('#mediaGrid video').forEach((v) => {
      v.parentElement.addEventListener('pointerenter', () => v.play().catch(() => {}));
      v.parentElement.addEventListener('pointerleave', () => v.pause());
    });
  }
  $('#mediaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = $('button[type=submit]', f);
    $('#mediaErr').textContent = '';
    if (!f.file.files.length && !f.url.value.trim()) { $('#mediaErr').textContent = 'Choose a file or paste a link.'; return; }
    const fd = new FormData(f);
    if (!f.file.files.length) fd.delete('file');
    btn.disabled = true;
    btn.textContent = f.file.files.length ? 'Uploading…' : 'Adding…';
    try {
      await api('/api/admin/media', { method: 'POST', form: fd });
      f.reset();
      toast('Added. It is live on the site.');
      loadMedia();
    } catch (err) {
      $('#mediaErr').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add to site';
    }
  });
  $('#mediaGrid').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api(`/api/admin/media/${f.dataset.media}`, { method: 'PATCH', body: { title: f.elements.title.value, caption: f.elements.caption.value, sort: f.elements.sort.value } });
      toast('Saved');
    } catch (err) { toast(err.message, true); }
  });
  $('#mediaGrid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delmedia]');
    if (!b || !(await confirmBox('Delete this clip?', 'It is removed from the site and from Cloudinary.'))) return;
    await api(`/api/admin/media/${b.dataset.delmedia}`, { method: 'DELETE' });
    toast('Clip deleted');
    loadMedia();
  });

  /* ---------- settings ---------- */
  async function loadSettings() {
    const s = await api('/api/admin/settings');
    const f = $('#settingsForm').elements;
    for (const k of ['contact_email', 'notify_email', 'whatsapp', 'instagram', 'tiktok', 'youtube']) f[k].value = s[k] || '';
    $('#health').innerHTML = `<h2>Connections</h2>
      <div class="dl" style="margin:0">
        <dt>Database</dt><dd><span class="st won">Connected</span></dd>
        <dt>Email alerts</dt><dd>${ME.mailEnabled ? '<span class="st won">On</span>' : '<span class="st proposal">Off</span> Add SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM to the server environment.'}</dd>
        <dt>File uploads</dt><dd>${ME.mediaEnabled ? '<span class="st won">Cloudinary on</span>' : '<span class="st proposal">Off</span> Add CLOUDINARY_URL to upload files. Links still work.'}</dd>
      </div>`;
  }
  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#setErr').textContent = '';
    try {
      await api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) });
      toast('Settings saved');
    } catch (err) { $('#setErr').textContent = err.message; }
  });
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#pwErr').textContent = '';
    try {
      await api('/api/admin/password', { method: 'POST', body: { current: e.target.current.value, next: e.target.next.value } });
      e.target.reset();
      toast('Password updated');
    } catch (err) { $('#pwErr').textContent = err.message; }
  });

  boot();
})();
