import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';

import { migrate, all, one, run, getSettings, DEFAULT_SETTINGS } from './db.js';
import { issueSession, clearSession, requireAdmin } from './lib/auth.js';
import { sendMail, emailLayout, detailsTable, esc, mailEnabled } from './lib/mail.js';
import { text, email, oneOf, ValidationError } from './lib/validate.js';
import { mediaEnabled, uploadBuffer, destroy } from './lib/media.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);

/* ---------- Fixed option lists (shared with the forms through /api/content) ---------- */
export const OPTIONS = {
  clientTypes: ['Artist', 'Actor', 'Athlete', 'Influencer', 'Media personality', 'Brand', 'Management / label', 'Other'],
  audience: ['Under 10K', '10K–100K', '100K–500K', '500K–1M', '1M+', 'Not sure'],
  budget: ['Under R10k / month', 'R10k–R30k / month', 'R30k–R75k / month', 'R75k+ / month', "Let's discuss"],
  contactPref: ['Email', 'Phone call', 'WhatsApp', 'Through my management'],
};
const LEAD_STATUS = ['new', 'contacted', 'proposal', 'won', 'lost'];
const REFERRAL_STATUS = ['new', 'contacted', 'converted', 'rewarded'];
const PLACEMENTS = ['hero-1', 'hero-2', 'showcase'];
const PROJECT_CATEGORIES = [...OPTIONS.clientTypes.filter((c) => c !== 'Other'), 'Live system', 'Client site'];
const PUBLIC_SETTING_KEYS = ['contact_email', 'whatsapp', 'instagram', 'tiktok', 'youtube'];

const now = () => new Date().toISOString();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

async function notifyAddress() {
  const s = await getSettings();
  return s.notify_email || process.env.NOTIFY_EMAIL || s.contact_email;
}

/* ---------- App ---------- */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        mediaSrc: ["'self'", 'https:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many submissions from this connection. Wait 15 minutes and try again.' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait 15 minutes and try again.' },
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 95 * 1024 * 1024 } });

app.get('/healthz', (_req, res) => res.json({ ok: true }));

/* ---------- Public API ---------- */
app.get(
  '/api/content',
  wrap(async (_req, res) => {
    const s = await getSettings();
    const packages = (await all('SELECT id,name,label,features,featured FROM packages WHERE active=1 ORDER BY sort, id')).map((p) => ({
      ...p,
      featured: Boolean(p.featured),
      features: safeJson(p.features),
    }));
    const media = await all('SELECT id,title,caption,url,resource_type,placement FROM media ORDER BY sort, id DESC');
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      settings: Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, s[k] || ''])),
      packages,
      media,
      options: OPTIONS,
    });
  })
);

app.get(
  '/api/projects',
  wrap(async (_req, res) => {
    const rows = await all('SELECT id,title,client,category,year,summary,link,url,resource_type,demo FROM projects WHERE active=1 ORDER BY sort, id DESC');
    res.set('Cache-Control', 'public, max-age=60');
    res.json(rows);
  })
);

app.post(
  '/api/leads',
  formLimiter,
  wrap(async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ ok: true }); // honeypot: bots fill hidden fields
    const kind = b.kind === 'private' ? 'private' : 'enquiry';
    const pkgNames = (await all('SELECT name FROM packages WHERE active=1')).map((p) => p.name);
    const d = {
      name: text(b.name, 'name', 'Full name', { required: true, max: 120 }),
      email: email(b.email),
      phone: text(b.phone, 'phone', 'Phone', { max: 40 }),
      client_type: oneOf(b.client_type, 'client_type', 'What you do', OPTIONS.clientTypes, true),
      handle: text(b.handle, 'handle', 'Social link', { max: 200 }),
      audience: oneOf(b.audience, 'audience', 'Audience size', OPTIONS.audience),
      package: oneOf(b.package, 'package', 'Package', [...pkgNames, 'Not sure yet']),
      budget: oneOf(b.budget, 'budget', 'Monthly budget', OPTIONS.budget),
      contact_pref: oneOf(b.contact_pref, 'contact_pref', 'Contact preference', OPTIONS.contactPref),
      message: text(b.message, 'message', 'Your message', { required: true, max: 3000 }),
    };
    const ts = now();
    const { id } = await run(
      `INSERT INTO leads(kind,name,email,phone,client_type,handle,audience,package,budget,contact_pref,message,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,'new',?,?)`,
      [kind, d.name, d.email, d.phone, d.client_type, d.handle, d.audience, d.package, d.budget, d.contact_pref, d.message, ts, ts]
    );

    const label = kind === 'private' ? 'Private Desk request' : 'New enquiry';
    notifyAddress().then((to) =>
      sendMail({
        to,
        replyTo: d.email,
        subject: `${label}: ${d.name} (${d.client_type})`,
        html: emailLayout(label, detailsTable([
          ['Name', d.name], ['Email', d.email], ['Phone', d.phone], ['What they do', d.client_type],
          ['Social', d.handle], ['Audience', d.audience], ['Package', d.package], ['Budget', d.budget],
          ['Contact via', d.contact_pref], ['Message', d.message],
        ]) + `<p style="margin-top:20px"><a href="${esc(baseUrl(req))}/admin/#leads" style="color:#E9CB8B">Open in the dashboard</a></p>`),
        text: `${label} from ${d.name} <${d.email}>\n\n${d.message}`,
      })
    );
    sendMail({
      to: d.email,
      subject: kind === 'private' ? 'Your Private Desk request is with us' : 'We received your enquiry',
      html: emailLayout(
        `Thank you, ${d.name.split(' ')[0]}.`,
        `<p>Your ${kind === 'private' ? 'request has gone straight to our senior team' : 'enquiry is with our team'}. We reply within one working day${d.contact_pref ? `, by ${esc(d.contact_pref.toLowerCase())} as you asked` : ''}.</p><p>Since 2016, we've scaled what's already working. Let's do the same for you.</p>`
      ),
      text: `Thank you, ${d.name}. Your enquiry is with the S.I.C team. We reply within one working day.`,
    });

    res.status(201).json({ ok: true, id });
  })
);

app.post(
  '/api/referrals',
  formLimiter,
  wrap(async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ ok: true });
    const d = {
      referrer_name: text(b.referrer_name, 'referrer_name', 'Your name', { required: true, max: 120 }),
      referrer_email: email(b.referrer_email, 'referrer_email', 'Your email'),
      referred_name: text(b.referred_name, 'referred_name', 'Their name', { required: true, max: 120 }),
      referred_contact: text(b.referred_contact, 'referred_contact', 'Their email or phone', { required: true, max: 160 }),
      referred_type: oneOf(b.referred_type, 'referred_type', 'What they do', OPTIONS.clientTypes),
      notes: text(b.notes, 'notes', 'Notes', { max: 2000 }),
    };
    const ts = now();
    const { id } = await run(
      `INSERT INTO referrals(referrer_name,referrer_email,referred_name,referred_contact,referred_type,notes,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,'new',?,?)`,
      [d.referrer_name, d.referrer_email, d.referred_name, d.referred_contact, d.referred_type, d.notes, ts, ts]
    );
    notifyAddress().then((to) =>
      sendMail({
        to,
        replyTo: d.referrer_email,
        subject: `New referral: ${d.referred_name} from ${d.referrer_name}`,
        html: emailLayout('New referral', detailsTable([
          ['Referred by', `${d.referrer_name} (${d.referrer_email})`], ['Referred', d.referred_name],
          ['Their contact', d.referred_contact], ['What they do', d.referred_type], ['Notes', d.notes],
        ])),
      })
    );
    sendMail({
      to: d.referrer_email,
      subject: 'Thanks for the referral',
      html: emailLayout(
        `Thank you, ${d.referrer_name.split(' ')[0]}.`,
        `<p>We'll reach out to ${esc(d.referred_name)}. Once they come on board, your next video is clipped free.</p>`
      ),
    });
    res.status(201).json({ ok: true, id });
  })
);

app.post(
  '/api/subscribe',
  formLimiter,
  wrap(async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ ok: true });
    const addr = email(b.email);
    const existing = await one('SELECT id, token, unsubscribed_at FROM subscribers WHERE email=?', [addr]);
    let token = existing?.token;
    if (existing) {
      if (!existing.unsubscribed_at) return res.json({ ok: true, already: true });
      await run('UPDATE subscribers SET unsubscribed_at=NULL WHERE id=?', [existing.id]);
    } else {
      token = crypto.randomBytes(18).toString('hex');
      await run('INSERT INTO subscribers(email,token,created_at) VALUES(?,?,?)', [addr, token, now()]);
    }
    sendMail({
      to: addr,
      subject: "You're on the S.I.C list",
      html: emailLayout(
        "You're on the list.",
        `<p>Growth notes, platform shifts and what's working right now in South African content, straight to your inbox.</p>
         <p style="font-size:12px;color:#8a7f72;margin-top:24px">Changed your mind? <a style="color:#D9B77E" href="${esc(baseUrl(req))}/unsubscribe?t=${token}">Unsubscribe</a>.</p>`
      ),
    });
    res.status(201).json({ ok: true });
  })
);

app.get(
  '/unsubscribe',
  wrap(async (req, res) => {
    const t = String(req.query.t || '');
    const sub = t ? await one('SELECT id FROM subscribers WHERE token=?', [t]) : null;
    if (sub) await run('UPDATE subscribers SET unsubscribed_at=? WHERE id=?', [now(), sub.id]);
    res
      .status(sub ? 200 : 404)
      .type('html')
      .send(
        emailLayout(
          sub ? "You've been unsubscribed." : 'Link not recognised.',
          sub
            ? '<p>You will not receive any more emails from the S.I.C list.</p><p><a style="color:#D9B77E" href="/">Back to the site</a></p>'
            : '<p>This unsubscribe link is invalid or has expired. Email us and we will remove you by hand.</p>'
        )
      );
  })
);

/* ---------- Admin auth ---------- */
app.post(
  '/api/admin/login',
  loginLimiter,
  wrap(async (req, res) => {
    const addr = String(req.body?.email || '').trim().toLowerCase();
    const pass = String(req.body?.password || '');
    const admin = addr ? await one('SELECT * FROM admins WHERE email=?', [addr]) : null;
    if (!admin || !(await bcrypt.compare(pass, admin.password_hash))) {
      return res.status(401).json({ error: 'That email and password do not match.' });
    }
    issueSession(res, admin);
    res.json({ ok: true, email: admin.email });
  })
);
app.post('/api/admin/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

const admin = express.Router();
admin.use(requireAdmin);

admin.get('/me', (req, res) =>
  res.json({ email: req.admin.email, mailEnabled: mailEnabled(), mediaEnabled: mediaEnabled() })
);

admin.post(
  '/password',
  wrap(async (req, res) => {
    const row = await one('SELECT * FROM admins WHERE id=?', [req.admin.sub]);
    if (!row || !(await bcrypt.compare(String(req.body?.current || ''), row.password_hash))) {
      throw new ValidationError('current', 'Your current password is incorrect.');
    }
    const next = String(req.body?.next || '');
    if (next.length < 10) throw new ValidationError('next', 'Use at least 10 characters for the new password.');
    await run('UPDATE admins SET password_hash=? WHERE id=?', [await bcrypt.hash(next, 12), row.id]);
    res.json({ ok: true });
  })
);

admin.get(
  '/stats',
  wrap(async (_req, res) => {
    const leadCounts = await all('SELECT status, COUNT(*) AS n FROM leads GROUP BY status');
    const [{ n: last7 }] = await all("SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?", [
      new Date(Date.now() - 7 * 864e5).toISOString(),
    ]);
    const [{ n: privateOpen }] = await all("SELECT COUNT(*) AS n FROM leads WHERE kind='private' AND status IN ('new','contacted','proposal')");
    const [{ n: refNew }] = await all("SELECT COUNT(*) AS n FROM referrals WHERE status='new'");
    const [{ n: subs }] = await all('SELECT COUNT(*) AS n FROM subscribers WHERE unsubscribed_at IS NULL');
    const byType = await all('SELECT client_type AS label, COUNT(*) AS n FROM leads GROUP BY client_type ORDER BY n DESC');
    const days = await all(
      "SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM leads WHERE created_at >= ? GROUP BY day ORDER BY day",
      [new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10)]
    );
    const recent = await all('SELECT id,kind,name,client_type,status,created_at FROM leads ORDER BY created_at DESC LIMIT 6');
    res.json({
      leads: Object.fromEntries(LEAD_STATUS.map((s) => [s, leadCounts.find((r) => r.status === s)?.n || 0])),
      last7, privateOpen, refNew, subs, byType, days, recent,
    });
  })
);

/* Leads */
admin.get(
  '/leads',
  wrap(async (req, res) => {
    const { where, args } = leadFilter(req.query);
    res.json(await all(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT 1000`, args));
  })
);
admin.get(
  '/leads.csv',
  wrap(async (req, res) => {
    const { where, args } = leadFilter(req.query);
    const rows = await all(`SELECT * FROM leads ${where} ORDER BY created_at DESC`, args);
    sendCsv(res, 'sic-enquiries.csv', rows, ['created_at', 'kind', 'status', 'name', 'email', 'phone', 'client_type', 'handle', 'audience', 'package', 'budget', 'contact_pref', 'message', 'notes']);
  })
);
admin.patch(
  '/leads/:id',
  wrap(async (req, res) => {
    const b = req.body || {};
    const status = b.status !== undefined ? oneOf(b.status, 'status', 'Status', LEAD_STATUS, true) : undefined;
    const notes = b.notes !== undefined ? text(b.notes, 'notes', 'Notes', { max: 5000 }) : undefined;
    await run('UPDATE leads SET status=COALESCE(?,status), notes=COALESCE(?,notes), updated_at=? WHERE id=?', [
      status ?? null, notes ?? null, now(), req.params.id,
    ]);
    res.json(await one('SELECT * FROM leads WHERE id=?', [req.params.id]));
  })
);
admin.delete(
  '/leads/:id',
  wrap(async (req, res) => {
    await run('DELETE FROM leads WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  })
);

/* Referrals */
admin.get('/referrals', wrap(async (_req, res) => res.json(await all('SELECT * FROM referrals ORDER BY created_at DESC LIMIT 1000'))));
admin.patch(
  '/referrals/:id',
  wrap(async (req, res) => {
    const b = req.body || {};
    const status = b.status !== undefined ? oneOf(b.status, 'status', 'Status', REFERRAL_STATUS, true) : undefined;
    const notes = b.admin_notes !== undefined ? text(b.admin_notes, 'admin_notes', 'Notes', { max: 5000 }) : undefined;
    await run('UPDATE referrals SET status=COALESCE(?,status), admin_notes=COALESCE(?,admin_notes), updated_at=? WHERE id=?', [
      status ?? null, notes ?? null, now(), req.params.id,
    ]);
    res.json(await one('SELECT * FROM referrals WHERE id=?', [req.params.id]));
  })
);
admin.delete('/referrals/:id', wrap(async (req, res) => { await run('DELETE FROM referrals WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

/* Subscribers */
admin.get('/subscribers', wrap(async (_req, res) => res.json(await all('SELECT id,email,created_at,unsubscribed_at FROM subscribers ORDER BY created_at DESC'))));
admin.get(
  '/subscribers.csv',
  wrap(async (_req, res) => {
    const rows = await all('SELECT email, created_at FROM subscribers WHERE unsubscribed_at IS NULL ORDER BY created_at DESC');
    sendCsv(res, 'sic-subscribers.csv', rows, ['email', 'created_at']);
  })
);
admin.delete('/subscribers/:id', wrap(async (req, res) => { await run('DELETE FROM subscribers WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

/* Packages */
function packageBody(b) {
  const features = (Array.isArray(b.features) ? b.features : String(b.features || '').split('\n'))
    .map((f) => String(f).trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!features.length) throw new ValidationError('features', 'Add at least one feature, one per line.');
  return {
    name: text(b.name, 'name', 'Package name', { required: true, max: 60 }),
    label: text(b.label, 'label', 'Short label', { max: 60 }).toUpperCase(),
    features: JSON.stringify(features.map((f) => f.slice(0, 120))),
    featured: b.featured ? 1 : 0,
    sort: Number.isFinite(Number(b.sort)) ? Number(b.sort) : 0,
    active: b.active === false || b.active === 0 ? 0 : 1,
  };
}
admin.get('/packages', wrap(async (_req, res) => res.json((await all('SELECT * FROM packages ORDER BY sort, id')).map((p) => ({ ...p, features: safeJson(p.features) })))));
admin.post(
  '/packages',
  wrap(async (req, res) => {
    const p = packageBody(req.body || {});
    const { id } = await run('INSERT INTO packages(name,label,features,featured,sort,active) VALUES(?,?,?,?,?,?)', [p.name, p.label, p.features, p.featured, p.sort, p.active]);
    res.status(201).json({ id });
  })
);
admin.put(
  '/packages/:id',
  wrap(async (req, res) => {
    const p = packageBody(req.body || {});
    await run('UPDATE packages SET name=?,label=?,features=?,featured=?,sort=?,active=? WHERE id=?', [p.name, p.label, p.features, p.featured, p.sort, p.active, req.params.id]);
    res.json({ ok: true });
  })
);
admin.delete('/packages/:id', wrap(async (req, res) => { await run('DELETE FROM packages WHERE id=?', [req.params.id]); res.json({ ok: true }); }));

/* Media */
admin.get('/media', wrap(async (_req, res) => res.json(await all('SELECT * FROM media ORDER BY placement, sort, id DESC'))));
admin.post(
  '/media',
  upload.single('file'),
  wrap(async (req, res) => {
    const b = req.body || {};
    const placement = oneOf(b.placement || 'showcase', 'placement', 'Placement', PLACEMENTS, true);
    const title = text(b.title, 'title', 'Title', { max: 80 });
    const caption = text(b.caption, 'caption', 'Caption', { max: 140 });
    const item = await mediaFrom(req, b);
    if (!item) throw new ValidationError('url', 'Media link is required.');
    if (placement !== 'showcase') {
      // Each hero phone holds one clip; replace what was there.
      const old = await all('SELECT * FROM media WHERE placement=?', [placement]);
      for (const m of old) await destroy(m.public_id, m.resource_type);
      await run('DELETE FROM media WHERE placement=?', [placement]);
    }
    const { id } = await run(
      'INSERT INTO media(title,caption,url,public_id,resource_type,placement,sort,created_at) VALUES(?,?,?,?,?,?,?,?)',
      [title, caption, item.url, item.public_id, item.resource_type, placement, Number(b.sort) || 0, now()]
    );
    res.status(201).json(await one('SELECT * FROM media WHERE id=?', [id]));
  })
);
admin.patch(
  '/media/:id',
  wrap(async (req, res) => {
    const b = req.body || {};
    await run('UPDATE media SET title=?, caption=?, sort=? WHERE id=?', [
      text(b.title, 'title', 'Title', { max: 80 }),
      text(b.caption, 'caption', 'Caption', { max: 140 }),
      Number(b.sort) || 0,
      req.params.id,
    ]);
    res.json(await one('SELECT * FROM media WHERE id=?', [req.params.id]));
  })
);
admin.delete(
  '/media/:id',
  wrap(async (req, res) => {
    const m = await one('SELECT * FROM media WHERE id=?', [req.params.id]);
    if (m) {
      await destroy(m.public_id, m.resource_type);
      await run('DELETE FROM media WHERE id=?', [m.id]);
    }
    res.json({ ok: true });
  })
);

/* Projects */
function projectBody(b) {
  const year = text(b.year, 'year', 'Year', { max: 4 });
  if (year && !/^(19|20)\d{2}$/.test(year)) throw new ValidationError('year', 'Use a four-digit year, like 2025.');
  const link = text(b.link, 'link', 'Project link', { max: 300 });
  if (link && !/^https:\/\//i.test(link)) throw new ValidationError('link', 'Project link must start with https://');
  return {
    title: text(b.title, 'title', 'Project name', { required: true, max: 80 }),
    client: text(b.client, 'client', 'Client', { max: 80 }),
    category: oneOf(b.category, 'category', 'Category', PROJECT_CATEGORIES),
    year,
    summary: text(b.summary, 'summary', 'Write-up', { max: 800 }),
    link,
    sort: Number.isFinite(Number(b.sort)) ? Number(b.sort) : 0,
    active: String(b.active ?? '1') === '0' || b.active === false ? 0 : 1,
    demo: String(b.demo ?? '0') === '1' || b.demo === true ? 1 : 0,
  };
}
admin.get('/projects', wrap(async (_req, res) => res.json({ categories: PROJECT_CATEGORIES, projects: await all('SELECT * FROM projects ORDER BY sort, id DESC') })));
admin.post(
  '/projects',
  upload.single('file'),
  wrap(async (req, res) => {
    const p = projectBody(req.body || {});
    const m = (await mediaFrom(req, req.body || {})) || { url: null, public_id: null, resource_type: 'video' };
    const { id } = await run(
      'INSERT INTO projects(title,client,category,year,summary,link,url,public_id,resource_type,sort,active,demo,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [p.title, p.client, p.category, p.year, p.summary, p.link, m.url, m.public_id, m.resource_type, p.sort, p.active, p.demo, now()]
    );
    res.status(201).json(await one('SELECT * FROM projects WHERE id=?', [id]));
  })
);
admin.put(
  '/projects/:id',
  upload.single('file'),
  wrap(async (req, res) => {
    const b = req.body || {};
    const old = await one('SELECT * FROM projects WHERE id=?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'That project no longer exists. Refresh the page.' });
    const p = projectBody(b);
    let m = await mediaFrom(req, b);
    if (!m && b.remove_media === '1') m = { url: null, public_id: null, resource_type: 'video' };
    if (m) await destroy(old.public_id, old.resource_type); // replaced or removed
    else m = old;
    await run(
      'UPDATE projects SET title=?,client=?,category=?,year=?,summary=?,link=?,url=?,public_id=?,resource_type=?,sort=?,active=?,demo=? WHERE id=?',
      [p.title, p.client, p.category, p.year, p.summary, p.link, m.url, m.public_id, m.resource_type, p.sort, p.active, p.demo, old.id]
    );
    res.json(await one('SELECT * FROM projects WHERE id=?', [old.id]));
  })
);
admin.delete(
  '/projects/:id',
  wrap(async (req, res) => {
    const p = await one('SELECT * FROM projects WHERE id=?', [req.params.id]);
    if (p) {
      await destroy(p.public_id, p.resource_type);
      await run('DELETE FROM projects WHERE id=?', [p.id]);
    }
    res.json({ ok: true });
  })
);

/* Settings */
admin.get('/settings', wrap(async (_req, res) => res.json(await getSettings())));
admin.put(
  '/settings',
  wrap(async (req, res) => {
    const b = req.body || {};
    const clean = {
      contact_email: email(b.contact_email, 'contact_email', 'Public contact email'),
      notify_email: email(b.notify_email, 'notify_email', 'Notification email', false),
      whatsapp: text(b.whatsapp, 'whatsapp', 'WhatsApp number', { max: 30 }).replace(/[^\d+]/g, ''),
      instagram: socialUrl(b.instagram, 'instagram', 'Instagram link'),
      tiktok: socialUrl(b.tiktok, 'tiktok', 'TikTok link'),
      youtube: socialUrl(b.youtube, 'youtube', 'YouTube link'),
    };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, clean[key] ?? '']);
    }
    res.json(await getSettings());
  })
);

app.use('/api/admin', admin);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

/* ---------- Static site ---------- */
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use((_req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));

/* ---------- Errors ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message, field: err.field });
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 95 MB. Compress it or paste a link instead.' : err.message, field: 'file' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again in a moment.' });
});

/* ---------- Helpers ---------- */
/** A media item from an upload or a pasted https link; null when neither was given. */
async function mediaFrom(req, b) {
  if (req.file) {
    if (!/^(video|image)\//.test(req.file.mimetype)) throw new ValidationError('file', 'Upload a video or an image file.');
    if (!mediaEnabled()) throw new ValidationError('file', 'File uploads need Cloudinary. Add CLOUDINARY_URL to your environment, or paste a video link instead.');
    return uploadBuffer(req.file.buffer, req.file.mimetype);
  }
  const url = text(b.url, 'url', 'Media link', { max: 500 });
  if (!url) return null;
  if (!/^https:\/\//i.test(url)) throw new ValidationError('url', 'Use a link that starts with https://');
  return { url, public_id: null, resource_type: /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url) ? 'image' : 'video' };
}
function safeJson(s) {
  try { return JSON.parse(s); } catch { return []; }
}
function socialUrl(v, key, label) {
  const s = text(v, key, label, { max: 200 });
  if (s && !/^https:\/\//i.test(s)) throw new ValidationError(key, `${label} must start with https://`);
  return s;
}
function leadFilter(q) {
  const clauses = [];
  const args = [];
  if (q.status && LEAD_STATUS.includes(q.status)) { clauses.push('status=?'); args.push(q.status); }
  if (q.kind === 'private' || q.kind === 'enquiry') { clauses.push('kind=?'); args.push(q.kind); }
  if (q.q) {
    clauses.push('(name LIKE ? OR email LIKE ? OR handle LIKE ? OR message LIKE ?)');
    const like = `%${String(q.q).slice(0, 80)}%`;
    args.push(like, like, like, like);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', args };
}
function sendCsv(res, filename, rows, cols) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + body);
}

/* ---------- Boot ---------- */
await migrate();
app.listen(PORT, () => {
  console.log(`S.I.C running on http://localhost:${PORT}`);
  if (!mailEnabled()) console.log('[mail] SMTP not configured; emails are logged instead of sent.');
  if (!mediaEnabled()) console.log('[media] CLOUDINARY_URL not set; admin can add media by link only.');
});
