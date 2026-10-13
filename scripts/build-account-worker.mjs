import { build } from 'esbuild';
import { resolve } from 'node:path';
export async function buildAccountWorker(output = 'dist/server/index.js') {
  await build({
    entryPoints: ['scripts/sites-media-worker.mjs'],
    outfile: resolve(output),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['node:*'],
    sourcemap: false,
  });
}
if (process.argv[1]?.endsWith('build-account-worker.mjs')) await buildAccountWorker();
