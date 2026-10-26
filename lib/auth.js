import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const COOKIE = 'sic_admin';
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] JWT_SECRET not set. Using a temporary secret; admin sessions end on every restart.');
}

export function issueSession(res, admin) {
  const token = jwt.sign({ sub: admin.id, email: admin.email }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function requireAdmin(req, res, next) {
  try {
    req.admin = jwt.verify(req.cookies?.[COOKIE] || '', SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Your session has ended. Sign in again.' });
  }
}
