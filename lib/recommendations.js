import { randomUUID } from 'node:crypto';
import { digest } from './passwords.js';
import { initialize } from './database.js';
import { generateRecommendations } from './openai.js';
export const styles = ['Everyday', 'Classic / dress', 'Sporty', 'Dive', 'Field / outdoors', 'Minimal'];
export function validatePreferences(body) {
  if (!body || typeof body !== 'object') return null;
  const { minBudget, maxBudget, style, brands = '', interests = '' } = body;
  if (!Number.isFinite(minBudget) || !Number.isFinite(maxBudget) || minBudget < 0 || maxBudget < 50 || maxBudget > 100000 || minBudget > maxBudget || !styles.includes(style) || typeof brands !== 'string' || brands.length > 150 || typeof interests !== 'string' || interests.length > 500) return null;
  return { minBudget, maxBudget, style, brands: brands.trim(), interests: interests.trim() };
}
export function createRecommendationsHandler(getDatabase, generate = generateRecommendations) {
  let ready;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => res.status(status).json(data);
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Method not allowed.' }); }
    if (req.method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected JSON.' });
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return send(403, { error: 'Please use the form on this website.' }); }
      if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) return send(403, { error: 'Please use the form on this website.' });
    }
    try {
      const db = getDatabase();
      ready ??= (async () => {
        await initialize(db);
        await db.query(`CREATE TABLE IF NOT EXISTS recommendations (
          id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          preferences JSONB NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      })().catch(error => { ready = undefined; throw error; });
      await ready;
      const rawToken = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('wristwise_session='))?.slice('wristwise_session='.length);
      const token = /^[a-f0-9]{64}$/.test(rawToken || '') ? rawToken : '';
      const { rows: users } = await db.query('SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()', [digest(token)]);
      if (!users[0]) return send(401, { error: 'Please log in to get your recommendations.' });
      const userId = users[0].user_id;
      if (req.method === 'GET') {
        const { rows } = await db.query('SELECT id, preferences, result, created_at FROM recommendations WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 5', [userId]);
        return send(200, { recommendations: rows });
      }
      const preferences = validatePreferences(req.body);
      if (!preferences) return send(400, { error: 'Choose a style and a valid USD budget: maximum must be $50–$100,000 and at least your minimum. Keep brands under 150 characters and your notes under 500.' });
      // Reserve attempts atomically before calling the paid provider, including failed calls.
      const { rows: limits } = await db.query(`INSERT INTO auth_limits (key, count, resets_at) VALUES ($1, 1, NOW() + INTERVAL '24 hours') ON CONFLICT (key) DO UPDATE SET count = CASE WHEN auth_limits.resets_at < NOW() THEN 1 ELSE auth_limits.count + 1 END, resets_at = CASE WHEN auth_limits.resets_at < NOW() THEN NOW() + INTERVAL '24 hours' ELSE auth_limits.resets_at END RETURNING count`, [digest(`recommendations:${userId}`)]);
      if (limits[0].count > 10) return send(429, { error: 'You’ve reached the limit of 10 recommendation requests per 24 hours. Come back later to explore more.' });
      const result = await generate(preferences);
      const { rows } = await db.query('INSERT INTO recommendations (id, user_id, preferences, result) VALUES ($1, $2, $3, $4) RETURNING id, preferences, result, created_at', [randomUUID(), userId, JSON.stringify(preferences), JSON.stringify(result)]);
      return send(201, { recommendation: rows[0] });
    } catch (error) {
      console.error('Recommendation request failed:', ['missing_key','provider_limit','provider_error','invalid_response','TimeoutError'].includes(error.code || error.name) ? error.code || error.name : 'service_unavailable');
      if (error.code === 'missing_key') return send(503, { error: 'AI recommendations aren’t configured yet. Please try again later.' });
      if (error.code === 'provider_limit') return send(503, { error: 'The AI service has reached its usage or billing limit. Please try again later.' });
      if (error.code === 'invalid_response') return send(502, { error: 'The AI couldn’t produce a reliable shortlist. Try a broader budget or different preferences.' });
      return send(503, { error: 'We couldn’t complete your request. Please try again shortly. Any earlier saved recommendations are still available.' });
    }
  };
}
