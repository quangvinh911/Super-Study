import { build } from 'esbuild';
import { resolve } from 'node:path';
import standaloneCode from 'ajv/dist/standalone/index.js';
import validateBankSchema, { bankAjv } from './question-bank-schema.mjs';

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
    plugins: [
      {
        name: 'question-bank-schema',
        setup(builder) {
          // Compile on the build host because Workers cannot generate code at runtime.
          builder.onLoad({ filter: /[/\\]scripts[/\\]question-bank-schema\.mjs$/ }, ({ path }) => ({
            contents: standaloneCode(bankAjv, validateBankSchema),
            resolveDir: resolve(path, '..'),
            loader: 'js',
          }));
        },
      },
    ],
  });
}
if (process.argv[1]?.endsWith('build-account-worker.mjs')) await buildAccountWorker();
