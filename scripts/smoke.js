// End-to-end API check against a running server: npm run smoke  (BASE, ADMIN_EMAIL, ADMIN_PASSWORD from env)
const BASE = process.env.BASE || 'http://localhost:3000';
let cookie = '';
let pass = 0;
const ok = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  pass++; console.log('ok  ', msg);
};
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const type = res.headers.get('content-type') || '';
  return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
}

const c = await call('/api/content');
ok(c.status === 200 && c.data.packages.length >= 1, 'content loads with packages');

let r = await call('/api/leads', { method: 'POST', body: { name: '', email: 'x' } });
ok(r.status === 400 && r.data.field === 'name', 'lead rejects a missing name');
r = await call('/api/leads', { method: 'POST', body: { name: 'Test Artist', email: 'bad', client_type: 'Artist', message: 'hi' } });
ok(r.status === 400 && r.data.field === 'email', 'lead rejects a bad email');
r = await call('/api/leads', { method: 'POST', body: { name: 'Thandi Test', email: 'thandi@example.co.za', client_type: 'Artist', package: 'Scale', audience: '1M+', message: 'Grow my YouTube.' } });
ok(r.status === 201 && r.data.id, 'enquiry saved');
r = await call('/api/leads', { method: 'POST', body: { kind: 'private', name: 'Private Test', email: 'p@example.com', client_type: 'Actor', contact_pref: 'Through my management', message: 'Discreet please.' } });
ok(r.status === 201, 'private desk request saved');
r = await call('/api/referrals', { method: 'POST', body: { referrer_name: 'Ref', referrer_email: 'ref@example.com', referred_name: 'Friend', referred_contact: '082 000 0000' } });
ok(r.status === 201, 'referral saved');
r = await call('/api/subscribe', { method: 'POST', body: { email: 'list@example.com' } });
ok(r.status === 201 || r.data.already, 'subscriber saved');

r = await call('/api/admin/leads');
ok(r.status === 401, 'admin API is locked without a session');
r = await call('/api/admin/login', { method: 'POST', body: { email: process.env.ADMIN_EMAIL, password: 'wrong' } });
ok(r.status === 401, 'wrong password rejected');
r = await call('/api/admin/login', { method: 'POST', body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
ok(r.status === 200 && cookie, 'admin signs in');

r = await call('/api/admin/stats');
ok(r.status === 200 && r.data.leads.new >= 2, 'stats count new leads');
const leads = (await call('/api/admin/leads')).data;
r = await call(`/api/admin/leads/${leads[0].id}`, { method: 'PATCH', body: { status: 'contacted', notes: 'Called manager.' } });
ok(r.data.status === 'contacted' && r.data.notes === 'Called manager.', 'lead status and notes update');
r = await call('/api/admin/leads.csv');
ok(r.status === 200 && r.data.includes('Thandi Test'), 'leads CSV export');

r = await call('/api/admin/packages', { method: 'POST', body: { name: 'Icon', label: 'Private desk', features: 'Dedicated team\nNDA', sort: 9 } });
ok(r.status === 201, 'package created');
r = await call('/api/content');
ok(r.data.packages.some((p) => p.name === 'Icon' && p.label === 'PRIVATE DESK'), 'new package appears on the public site');
await call(`/api/admin/packages/${r.data.packages.find((p) => p.name === 'Icon').id}`, { method: 'DELETE' });

r = await call('/api/admin/media', { method: 'POST', body: undefined });
ok(r.status === 400, 'media without file or link is rejected');

r = await call('/api/admin/projects', { method: 'POST', body: { title: '', category: 'Artist' } });
ok(r.status === 400 && r.data.field === 'title', 'project needs a name');
r = await call('/api/admin/projects', { method: 'POST', body: { title: 'Smoke project', category: 'Artist', year: '20x5' } });
ok(r.status === 400 && r.data.field === 'year', 'project rejects a bad year');
r = await call('/api/admin/projects', { method: 'POST', body: { title: 'Smoke project', client: 'Test Client', category: 'Artist', year: '2025', summary: 'Clips.', url: 'https://example.com/clip.mp4' } });
ok(r.status === 201 && r.data.resource_type === 'video', 'project created with a linked clip');
const projId = r.data.id;
r = await call(`/api/admin/projects/${projId}`, { method: 'PUT', body: { title: 'Smoke project', category: 'Brand', active: '0' } });
ok(r.status === 200 && r.data.category === 'Brand' && r.data.url === 'https://example.com/clip.mp4', 'project edit keeps its clip');
r = await call('/api/projects');
ok(r.status === 200 && !r.data.some((p) => p.id === projId), 'hidden project is not public');
await call(`/api/admin/projects/${projId}`, { method: 'PUT', body: { title: 'Smoke project', category: 'Brand', remove_media: '1' } });
r = await call('/api/projects');
ok(r.data.some((p) => p.id === projId && p.url === null), 'visible project is public, preview removed');
await call(`/api/admin/projects/${projId}`, { method: 'DELETE' });

r = await call('/api/admin/settings', { method: 'PUT', body: { contact_email: 'hello@sicagency.com', whatsapp: '082 123 4567', instagram: 'https://instagram.com/sic' } });
ok(r.status === 200 && r.data.whatsapp === '0821234567', 'settings saved');
r = await call('/api/content');
ok(r.data.settings.instagram === 'https://instagram.com/sic' && !('notify_email' in r.data.settings), 'public settings exclude private keys');

console.log(`\n${pass} checks passed`);
