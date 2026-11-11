import { neon } from '@neondatabase/serverless';
let client;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  client ??= neon(process.env.DATABASE_URL);
  return { query: async (sql, values = []) => ({ rows: await client.query(sql, values) }) };
}
export async function initialize(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS auth_limits (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at TIMESTAMPTZ NOT NULL
  )`);
}
