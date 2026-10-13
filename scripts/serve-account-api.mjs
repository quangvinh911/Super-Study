import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createLocalAccountRuntime } from './account-local-runtime.mjs';
await mkdir('.account-local', { recursive: true });
let secret;
try {
  secret = await readFile('.account-local/jwt-secret', 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  secret = randomBytes(32).toString('hex');
  await writeFile('.account-local/jwt-secret', secret, { mode: 0o600 });
}
if (!process.env.BOOTSTRAP_SECRET)
  console.log('Set BOOTSTRAP_SECRET (32+ characters) when creating the first local Admin.');
const runtime = await createLocalAccountRuntime({
  persist: true,
  port: 8788,
  jwtSecret: process.env.JWT_SECRET || secret,
  bootstrapSecret: process.env.BOOTSTRAP_SECRET,
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:4200',
});
await runtime.ready;
console.log('Account and dictionary API listening on 127.0.0.1:8788');
async function stop() {
  await runtime.dispose();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
