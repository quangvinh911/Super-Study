import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './errors.mjs';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
let queue = Promise.resolve();
let pending = 0;
async function deriveKey(password, salt) {
  // Bound concurrent KDF allocations inside the Worker isolate (32 MiB per job).
  if (pending >= 8) throw new ApiError(429, 'rate_limited');
  pending++;
  const ready = queue;
  let release;
  queue = new Promise((resolve) => {
    release = resolve;
  });
  try {
    await ready;
    return await derive(password, salt, 32, options);
  } finally {
    pending--;
    release();
  }
}
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt:32768:8:3:${salt.toString('hex')}:${key.toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  const parts = hash.split(':');
  if (
    parts.length !== 6 ||
    parts.slice(0, 4).join(':') !== 'scrypt:32768:8:3' ||
    !/^[a-f0-9]{32}$/.test(parts[4]) ||
    !/^[a-f0-9]{64}$/.test(parts[5])
  )
    return false;
  const expected = Buffer.from(parts[5], 'hex');
  const actual = await deriveKey(password, Buffer.from(parts[4], 'hex'));
  return timingSafeEqual(actual, expected);
}
