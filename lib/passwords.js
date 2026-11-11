import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const computed = await hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(computed.split(':')[1], 'hex'), Buffer.from(hash, 'hex'));
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
