import { Miniflare } from 'miniflare';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildAccountWorker } from './build-account-worker.mjs';
import { mediaType } from './sites-media-paths.mjs';
import { isBankMediaPath } from '../server/question-bank-validation.mjs';

async function localMedia(request) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'HEAD' || !isBankMediaPath(path)) {
    return new Response(null, { status: 404 });
  }
  try {
    const file = await stat(resolve('public', `.${path}`));
    if (file.isFile() && file.size > 0) {
      const type =
        mediaType(path.slice(1)) ?? (/\.(mp3|wav|ogg|m4a)$/i.test(path) ? 'audio/mpeg' : 'image/*');
      return new Response(null, { headers: { 'Content-Type': type } });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return new Response(null, { status: 404 });
}

export async function createLocalAccountRuntime({
  persist = false,
  port,
  jwtSecret,
  bootstrapSecret,
  migrationSecret,
  maintenance = false,
  appOrigin = 'http://localhost:4200',
  openaiApiKey,
  explanationModel,
  workerPath = 'dist/local-account-worker.mjs',
} = {}) {
  await buildAccountWorker(workerPath);
  const runtime = new Miniflare({
    modules: true,
    scriptPath: workerPath,
    compatibilityDate: '2026-07-30',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'certificate-accounts' },
    r2Buckets: ['MEDIA'],
    d1Persist: persist ? '.account-local/d1' : false,
    r2Persist: persist ? '.account-local/r2' : false,
    serviceBindings: { ASSETS: localMedia },
    ...(port ? { port, host: '127.0.0.1' } : {}),
    bindings: {
      APP_ORIGIN: appOrigin,
      ...(openaiApiKey ? { OPENAI_API_KEY: openaiApiKey } : {}),
      ...(explanationModel ? { OPENAI_EXPLANATION_MODEL: explanationModel } : {}),
      LOCAL_ASSETS: true,
      ...(jwtSecret ? { JWT_SECRET: jwtSecret } : {}),
      ...(bootstrapSecret ? { BOOTSTRAP_SECRET: bootstrapSecret } : {}),
      ...(migrationSecret ? { MIGRATION_SECRET: migrationSecret } : {}),
      ACCOUNT_MAINTENANCE: String(maintenance),
    },
  });
  const db = await runtime.getD1Database('DB');
  await db.prepare('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)').run();
  const files = (await readdir('drizzle')).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    if (await db.prepare('SELECT name FROM local_migrations WHERE name=?').bind(file).first())
      continue;
    const sql = await readFile(`drizzle/${file}`, 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean);
    await db.batch([
      ...statements.map((statement) => db.prepare(statement)),
      db.prepare('INSERT INTO local_migrations(name) VALUES(?)').bind(file),
    ]);
  }
  return runtime;
}
