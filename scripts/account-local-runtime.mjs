import { Miniflare } from 'miniflare';
import { readdir, readFile } from 'node:fs/promises';
import { buildAccountWorker } from './build-account-worker.mjs';

export async function createLocalAccountRuntime({
  persist = false,
  port,
  jwtSecret,
  bootstrapSecret,
  migrationSecret,
  maintenance = false,
  appOrigin = 'http://localhost:4200',
} = {}) {
  await buildAccountWorker('dist/local-account-worker.mjs');
  const runtime = new Miniflare({
    modules: true,
    scriptPath: 'dist/local-account-worker.mjs',
    compatibilityDate: '2026-07-30',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'certificate-accounts' },
    r2Buckets: ['MEDIA'],
    d1Persist: persist ? '.account-local/d1' : false,
    r2Persist: persist ? '.account-local/r2' : false,
    ...(port ? { port, host: '127.0.0.1' } : {}),
    bindings: {
      APP_ORIGIN: appOrigin,
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
