import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { createClient } from '@libsql/client';

// Turso in production; a local SQLite file for development.
const url = process.env.TURSO_DATABASE_URL || 'file:data/sic.db';
if (url.startsWith('file:')) fs.mkdirSync('data', { recursive: true });

export const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

const toObjects = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));

export async function all(sql, args = []) {
  return toObjects(await db.execute({ sql, args }));
}
export async function one(sql, args = []) {
  return (await all(sql, args))[0] || null;
}
export async function run(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return { id: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : null, changes: rs.rowsAffected };
}

const schema = [
  `CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'enquiry',
    name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
    client_type TEXT, handle TEXT, audience TEXT, package TEXT, budget TEXT, contact_pref TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new', notes TEXT DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS leads_status ON leads(status, created_at)`,
  `CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_name TEXT NOT NULL, referrer_email TEXT NOT NULL,
    referred_name TEXT NOT NULL, referred_contact TEXT NOT NULL, referred_type TEXT,
    notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'new', admin_notes TEXT DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE, token TEXT NOT NULL,
    created_at TEXT NOT NULL, unsubscribed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
    features TEXT NOT NULL DEFAULT '[]',
    featured INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL, public_id TEXT, resource_type TEXT NOT NULL DEFAULT 'video',
    placement TEXT NOT NULL DEFAULT 'showcase', sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, client TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
    url TEXT, public_id TEXT, resource_type TEXT NOT NULL DEFAULT 'video',
    sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
];

export const DEFAULT_SETTINGS = {
  contact_email: 'hello@sicagency.com',
  whatsapp: '',
  instagram: '',
  tiktok: '',
  youtube: '',
  notify_email: '',
};

const SEED_PACKAGES = [
  { name: 'Starter', label: 'CONTENT + PUSH', features: ['Content creation', 'Basic clipping', 'Monthly report'], featured: 0, sort: 1 },
  { name: 'Scale', label: 'CONTENT + COLLABS', features: ['Everything in Starter', 'Influencer collabs', 'Paid boost'], featured: 1, sort: 2 },
  { name: 'Viral Push', label: 'FULL CAMPAIGN', features: ['Everything in Scale', 'Multi-platform clipping', 'Growth guarantee'], featured: 0, sort: 3 },
];

export async function migrate() {
  await db.batch(schema, 'write');

  const { n } = await one('SELECT COUNT(*) AS n FROM packages');
  if (!n) {
    for (const p of SEED_PACKAGES) {
      await run('INSERT INTO packages(name,label,features,featured,sort,active) VALUES(?,?,?,?,?,1)', [
        p.name, p.label, JSON.stringify(p.features), p.featured, p.sort,
      ]);
    }
  }

  // Starter projects (the same file the static preview reads), added once only, so deleting them in Studio sticks.
  const { changes: firstSeed } = await run("INSERT OR IGNORE INTO settings(key,value) VALUES('projects_seeded','1')");
  if (firstSeed) {
    const { n: projects } = await one('SELECT COUNT(*) AS n FROM projects');
    if (!projects) {
      const seed = JSON.parse(fs.readFileSync(new URL('./public/data/projects.json', import.meta.url), 'utf8'));
      for (const [i, p] of seed.entries()) {
        await run(
          "INSERT INTO projects(title,category,summary,link,url,resource_type,sort,active,created_at) VALUES(?,?,?,?,?,'image',?,1,?)",
          [p.title, p.category, p.summary, p.link, '/' + p.url, i + 1, new Date().toISOString()]
        );
      }
    }
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', [key, value]);
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (email && password) {
    const existing = await one('SELECT id FROM admins WHERE email=?', [email]);
    if (!existing) {
      await run('INSERT INTO admins(email,password_hash,created_at) VALUES(?,?,?)', [
        email, await bcrypt.hash(password, 12), new Date().toISOString(),
      ]);
      console.log(`[db] admin account created for ${email}`);
    }
  } else {
    const { n: admins } = await one('SELECT COUNT(*) AS n FROM admins');
    if (!admins) console.warn('[db] No admin yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, then restart.');
  }
}

export async function getSettings() {
  const rows = await all('SELECT key, value FROM settings');
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}
