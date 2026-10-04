import { createHash } from 'node:crypto';
import { createReadStream, openAsBlob } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
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
      const information = await stat(path);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      mediaFiles.push({
        key,
        path,
        size: information.size,
        sha256: hash.digest('hex'),
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
const input = await new Promise((resolveInput, rejectInput) => {
  let value = '';
  const terminal = process.stdin.isTTY;
  const finish = (error) => {
    process.stdin.removeListener('data', onData);
    process.stdin.removeListener('end', onEnd);
    if (terminal) process.stdin.setRawMode(false);
    process.stdin.pause();
    if (error) rejectInput(error);
    else resolveInput(value);
  };
  const onData = (chunk) => {
    value += chunk;
    if (value.includes('\u0003')) finish(new Error('Media sync cancelled.'));
    else if (value.length > 65536) finish(new Error('Sync settings too large.'));
    else if (value.includes('\n') || value.includes('\r')) finish();
  };
  const onEnd = () => finish();
  if (terminal) process.stdin.setRawMode(true);
  console.log(`Ready for media sync JSON on stdin (input is hidden). ${mediaFiles.length} files.`);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', onData);
  process.stdin.once('end', onEnd);
  process.stdin.resume();
});
let settings;
try {
  settings = JSON.parse(input);
} catch {
  throw new Error('Invalid sync settings JSON.');
}
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

async function request(method, body, extraHeaders = {}, target = endpoint) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(target, {
        method,
        headers: { ...headers, ...extraHeaders },
        body: typeof body === 'function' ? await body() : body,
        redirect: 'error',
        signal: AbortSignal.timeout(180_000),
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

async function parallel(items, operation) {
  let next = 0;
  async function run() {
    while (next < items.length) await operation(items[next++]);
  }
  await Promise.all(Array.from({ length: 6 }, run));
}
function matches(file, object) {
  return object?.key === file.key && object.size === file.size && object.sha256 === file.sha256;
}
async function remoteInventory() {
  const groups = [];
  for (let index = 0; index < mediaFiles.length; index += 40)
    groups.push(mediaFiles.slice(index, index + 40));
  const remote = new Map();
  await parallel(groups, async (files) => {
    const result = await request('POST', JSON.stringify(files.map((file) => file.key)), {
      'Content-Type': 'application/json',
    });
    if (
      !Array.isArray(result.objects) ||
      result.objects.length !== files.length ||
      files.some((file) => result.objects.filter((object) => object.key === file.key).length !== 1)
    )
      throw new Error('Invalid inventory response.');
    for (const object of result.objects) remote.set(object.key, object);
    if (remote.size % 400 === 0 || remote.size === mediaFiles.length)
      console.log('Checked R2 metadata for ' + remote.size + '/' + mediaFiles.length + ' files.');
  });
  return remote;
}
const existing = await remoteInventory();
const pending = mediaFiles.filter((file) => !matches(file, existing.get(file.key)));
console.log('Uploading ' + pending.length + ' files; unchanged objects are already verified.');
const batches = [];
let batch = [];
let batchBytes = 0;
for (const file of pending) {
  if (file.size > 100 * 1024 * 1024)
    throw new Error('Media file exceeds the streaming upload limit: ' + file.key);
  if (batch.length && (batch.length >= 20 || batchBytes + file.size > 768 * 1024)) {
    batches.push(batch);
    batch = [];
    batchBytes = 0;
  }
  batch.push(file);
  batchBytes += file.size;
}
if (batch.length) batches.push(batch);
let uploaded = 0;
await parallel(batches, async (files) => {
  let result;
  if (files.length === 1 && files[0].size > 5 * 1024 * 1024) {
    const file = files[0];
    const target = new URL('/api/site-media/file', site);
    target.searchParams.set('key', file.key);
    result = await request(
      'PUT',
      () => openAsBlob(file.path),
      {
        'Content-Type': mediaType(file.key),
        'Content-Length': String(file.size),
        'X-Media-Sha256': file.sha256,
      },
      target,
    );
  } else {
    const form = new FormData();
    form.append(
      'manifest',
      JSON.stringify(files.map(({ key, size, sha256 }) => ({ key, size, sha256 }))),
    );
    for (const file of files)
      form.append(
        file.key,
        new Blob([await readFile(file.path)], { type: mediaType(file.key) }),
        file.key.split('/').at(-1),
      );
    result = await request('PUT', form);
  }
  if (
    !Array.isArray(result.stored) ||
    result.stored.length !== files.length ||
    files.some((file) => !result.stored.some((object) => matches(file, object)))
  )
    throw new Error('Upload was not fully acknowledged.');
  uploaded += files.length;
  console.log('Uploaded ' + uploaded + '/' + pending.length + ' pending files.');
});
const verified = await remoteInventory();
if (mediaFiles.some((file) => !matches(file, verified.get(file.key))))
  throw new Error('Remote media checksum verification failed.');
// Verify the visitor-facing URLs as well as storage metadata, including audio seeking.
const samples = [
  mediaFiles.find((file) => mediaType(file.key).startsWith('image/')),
  mediaFiles.find((file) => mediaType(file.key).startsWith('audio/')),
  mediaFiles.find((file) => mediaType(file.key).startsWith('video/')),
  mediaFiles.find((file) => mediaType(file.key) === 'application/pdf'),
].filter(Boolean);
for (const file of samples) {
  const url = new URL(`/${file.key}`, site);
  const head = await fetch(url, {
    method: 'HEAD',
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (
    head.status !== 200 ||
    Number(head.headers.get('content-length')) !== file.size ||
    head.headers.get('content-type') !== mediaType(file.key) ||
    !head.headers.get('cache-control')?.includes('private')
  )
    throw new Error('Media HEAD verification failed: ' + file.key);
  if (mediaType(file.key).startsWith('audio/') || mediaType(file.key).startsWith('video/')) {
    const response = await fetch(url, {
      headers: { ...headers, Range: 'bytes=0-15' },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status !== 206 || !bytes.equals((await readFile(file.path)).subarray(0, 16)))
      throw new Error('Media byte-range verification failed: ' + file.key);
  }
}
console.log(
  JSON.stringify({
    files: mediaFiles.length,
    bytes: mediaFiles.reduce((sum, file) => sum + file.size, 0),
    verified: true,
  }),
);
