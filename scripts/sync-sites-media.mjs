import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { MEDIA_ROOTS, mediaType } from './sites-media-worker.mjs';

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const mediaFiles = [];
async function inventory(directory, prefix) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await inventory(path, key);
    else if (entry.isFile() && mediaType(key)) {
      const bytes = await readFile(path);
      mediaFiles.push({
        key,
        path,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  }
}
for (const name of MEDIA_ROOTS) {
  const directory = join(publicDirectory, name);
  try {
    await stat(directory);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  await inventory(directory, name);
}
if (!mediaFiles.length) throw new Error('No public media found.');
console.log(`Ready for media sync JSON on stdin (input is hidden). ${mediaFiles.length} files.`);
const reader = createInterface({ input: process.stdin, terminal: false });
let settings;
for await (const line of reader) {
  settings = JSON.parse(line);
  break;
}
reader.close();
if (!settings) throw new Error('Missing sync settings.');
const site = new URL(settings.siteUrl);
if (
  site.protocol !== 'https:' ||
  !site.hostname.endsWith('.chatgpt.site') ||
  site.username ||
  site.password ||
  site.search ||
  site.hash ||
  site.pathname !== '/'
)
  throw new Error('Use the verified Sites origin.');
if (
  typeof settings.uploadSecret !== 'string' ||
  !settings.uploadSecret ||
  typeof settings.bypassToken !== 'string' ||
  !settings.bypassToken
)
  throw new Error('Missing upload authorization.');
const endpoint = new URL('/api/site-media', site);
const headers = {
  'X-Media-Upload-Key': settings.uploadSecret,
  'OAI-Sites-Authorization': `Bearer ${settings.bypassToken}`,
};

async function request(method, body, extraHeaders = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(endpoint, {
        method,
        headers: { ...headers, ...extraHeaders },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (attempt === 2) throw new Error(`Media sync connection failed (${error.name}).`);
      await delay(2000 * (attempt + 1));
      continue;
    }
    if (response.ok) return response.json();
    if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2)
      throw new Error(`Media sync failed with HTTP ${response.status}.`);
    await response.body?.cancel();
    await delay(2000 * (attempt + 1));
  }
  throw new Error('Media sync did not complete.');
}

const batches = [];
let batch = [];
let batchBytes = 0;
for (const file of mediaFiles) {
  if (file.size > 5 * 1024 * 1024)
    throw new Error(`Media file exceeds current sync batch limit: ${file.key}`);
  if (batch.length && (batch.length >= 30 || batchBytes + file.size > 5 * 1024 * 1024)) {
    batches.push(batch);
    batch = [];
    batchBytes = 0;
  }
  batch.push(file);
  batchBytes += file.size;
}
if (batch.length) batches.push(batch);
let nextBatch = 0;
let verifiedCount = 0;
async function synchronize() {
  while (nextBatch < batches.length) {
    const files = batches[nextBatch++];
    const status = await request('POST', JSON.stringify(files.map((file) => file.key)), {
      'Content-Type': 'application/json',
    });
    if (!Array.isArray(status.objects) || status.objects.length !== files.length)
      throw new Error('Invalid inventory response.');
    const missing = files.filter(
      (file) =>
        !status.objects.some(
          (object) =>
            object.key === file.key && object.size === file.size && object.sha256 === file.sha256,
        ),
    );
    if (missing.length) {
      const form = new FormData();
      form.append(
        'manifest',
        JSON.stringify(missing.map(({ key, size, sha256 }) => ({ key, size, sha256 }))),
      );
      for (const file of missing)
        form.append(
          file.key,
          new Blob([await readFile(file.path)], { type: mediaType(file.key) }),
          file.key.split('/').at(-1),
        );
      const result = await request('PUT', form);
      if (!Array.isArray(result.stored) || result.stored.length !== missing.length)
        throw new Error('Upload was not fully acknowledged.');
    }
    const verified = await request('POST', JSON.stringify(files.map((file) => file.key)), {
      'Content-Type': 'application/json',
    });
    if (
      !Array.isArray(verified.objects) ||
      files.some(
        (file) =>
          !verified.objects.some(
            (object) =>
              object.key === file.key && object.size === file.size && object.sha256 === file.sha256,
          ),
      )
    )
      throw new Error('Remote media checksum verification failed.');
    verifiedCount += files.length;
    console.log(`Verified ${verifiedCount}/${mediaFiles.length} media files.`);
  }
}
await Promise.all([synchronize(), synchronize()]);
console.log(
  JSON.stringify({
    files: verifiedCount,
    bytes: mediaFiles.reduce((sum, file) => sum + file.size, 0),
    verified: true,
  }),
);
