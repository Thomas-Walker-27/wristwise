import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, digest, newToken } from './passwords.js';
import { initialize } from './database.js';
const COOKIE = 'wristwise_session';
const AGE = 60 * 60 * 24 * 7;
const dummyHash = hashPassword('unusable-dummy-password');
function cookie(req, token, age) {
  const secure = process.env.VERCEL || req.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
}
export function createHandler(getDatabase) {
  let ready;
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => res.status(status).json(data);
    const action = new URL(req.url, 'http://localhost').searchParams.get('action');
    if (!['me', 'signup', 'login', 'logout'].includes(action)) return send(404, { error: 'Not found.' });
    const method = action === 'me' ? 'GET' : 'POST';
    if (req.method !== method) { res.setHeader('Allow', method); return send(405, { error: 'Method not allowed.' }); }
    if (method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected JSON.' });
      // Browser mutations must come from this site's origin.
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return send(403, { error: 'Please use the form on this website.' }); }
      if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) return send(403, { error: 'Please use the form on this website.' });
    }
    try {
      const db = getDatabase();
      ready ??= initialize(db).catch(error => { ready = undefined; throw error; });
      await ready;
      const rawToken = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      const token = /^[a-f0-9]{64}$/.test(rawToken || '') ? rawToken : '';
      if (action === 'me') {
        const { rows } = await db.query(`SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = $1 AND expires_at > NOW()`, [digest(token)]);
        return rows[0] ? send(200, { user: rows[0] }) : send(401, { error: 'Please log in.' });
      }
      if (action === 'logout') {
        await db.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)]);
        res.setHeader('Set-Cookie', cookie(req, '', 0));
        return send(200, { ok: true });
      }
      const body = req.body;
      if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') return send(400, { error: 'Enter your email and password.' });
      const email = body.email.trim().toLowerCase();
      const password = body.password;
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) return send(400, { error: 'Use a valid email and a password between 8 and 128 characters.' });
      // A database-backed limit survives serverless restarts. Limit both IP and email.
      for (const key of [`ip:${req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown'}`, `email:${email}`]) {
        const { rows } = await db.query(`INSERT INTO auth_limits (key, count, resets_at) VALUES ($1, 1, NOW() + INTERVAL '15 minutes') ON CONFLICT (key) DO UPDATE SET count = CASE WHEN auth_limits.resets_at < NOW() THEN 1 ELSE auth_limits.count + 1 END, resets_at = CASE WHEN auth_limits.resets_at < NOW() THEN NOW() + INTERVAL '15 minutes' ELSE auth_limits.resets_at END RETURNING count`, [digest(key)]);
        if (rows[0].count > 20) return send(429, { error: 'Too many attempts. Please try again in 15 minutes.' });
      }
      let user;
      if (action === 'signup') {
        const { rows } = await db.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id, email', [randomUUID(), email, await hashPassword(password)]);
        user = rows[0];
        if (!user) return send(409, { error: 'Could not create this account. Try logging in instead.' });
      } else {
        const { rows } = await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
        const valid = await verifyPassword(password, rows[0]?.password_hash || await dummyHash);
        if (!rows[0] || !valid) return send(401, { error: 'Email or password is incorrect.' });
        user = { id: rows[0].id, email: rows[0].email };
      }
      const session = newToken();
      await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`, [digest(session), user.id]);
      res.setHeader('Set-Cookie', cookie(req, session, AGE));
      return send(action === 'signup' ? 201 : 200, { user });
    } catch (error) {
      // Do not log database URLs, queries with parameters, or credentials.
      console.error('Authentication request failed:', error.code || 'database_unavailable');
      return send(503, { error: 'Accounts are temporarily unavailable. Please try again shortly.' });
    }
  };
}
