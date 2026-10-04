import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_ROOTS } from './sites-media-worker.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const angularOutput = resolve(root, 'dist/cloudflare/browser');
const clientOutput = resolve(root, 'dist/client');
const serverOutput = resolve(root, 'dist/server');
const buildOutput = resolve(root, 'dist/cloudflare');
for (const directory of [angularOutput, clientOutput, serverOutput, buildOutput]) {
  if (!relative(root, directory).startsWith(`dist${sep}`))
    throw new Error('Output must stay within dist.');
}
const hosting = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8'));
if (hosting.r2 !== 'MEDIA') throw new Error('Sites requires the MEDIA R2 binding.');

await rm(clientOutput, { recursive: true, force: true });
await rm(serverOutput, { recursive: true, force: true });
await mkdir(clientOutput, { recursive: true });
await mkdir(serverOutput, { recursive: true });
await cp(angularOutput, clientOutput, {
  recursive: true,
  filter: (source) => !MEDIA_ROOTS.includes(relative(angularOutput, source).split(sep)[0]),
});

// Regenerate hashes after removing media so offline installation never requests absent build assets.
const serviceWorkerConfig = JSON.parse(await readFile(resolve(root, 'ngsw-config.json'), 'utf8'));
for (const group of serviceWorkerConfig.assetGroups) {
  if (group.name === 'exam-audio') group.resources = { urls: ['/audio/**'] };
  if (group.name === 'pdf-evidence') group.resources = { urls: ['/pdf-evidence/**'] };
}
serviceWorkerConfig.assetGroups.push({
  name: 'site-media',
  installMode: 'lazy',
  updateMode: 'prefetch',
  resources: {
    urls: MEDIA_ROOTS.filter((name) => !['audio', 'pdf-evidence'].includes(name)).map(
      (name) => `/${name}/**`,
    ),
  },
});
const configPath = resolve(root, 'dist/sites-ngsw-config.json');
await writeFile(configPath, JSON.stringify(serviceWorkerConfig), 'utf8');
await promisify(execFile)(
  process.execPath,
  [
    resolve(root, 'node_modules/@angular/service-worker/ngsw-config.js'),
    relative(root, clientOutput),
    relative(root, configPath),
  ],
  { cwd: root },
);
await rm(configPath);
await cp(resolve(root, 'scripts/sites-media-worker.mjs'), resolve(serverOutput, 'index.js'));
await rm(buildOutput, { recursive: true, force: true });
console.log('Prepared Sites application; media is served by the MEDIA R2 binding.');
