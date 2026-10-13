import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { operatorInput } from './account-operator-input.mjs';
const input = await operatorInput();
const folder = `.account-local/exports/${new Date().toISOString().replace(/[:.]/g, '-')}`;
await mkdir(`${folder}/objects`, { recursive: true });
const headers = {
  Origin: input.siteUrl,
  Authorization: `Bearer ${input.accessToken}`,
  'X-Account-Migration-Key': input.secret,
  ...(input.bypassToken ? { 'OAI-Sites-Authorization': input.bypassToken } : {}),
};
async function fetchExport(query) {
  const response = await fetch(`${input.siteUrl}/api/admin/migration/export?${query}`, {
    headers,
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error(
      `Export failed (${response.status}). Keep the source in maintenance and retry.`,
    );
  return response.json();
}
const manifest = {
  format: 'certificate-account-migration',
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  tables: {},
  objects: [],
};
for (const table of ['users', 'learning_scopes', 'learning_records']) {
  const rows = [];
  let total;
  for (let offset = 0; ; offset += 100) {
    const page = await fetchExport(`table=${table}&offset=${offset}`);
    if (
      !Array.isArray(page.rows) ||
      typeof page.total !== 'number' ||
      (total !== undefined && page.total !== total)
    )
      throw new Error('Export changed during maintenance.');
    total = page.total;
    rows.push(...page.rows);
    if (rows.length >= total) break;
    if (!page.rows.length) throw new Error('Incomplete export page.');
  }
  if (rows.length !== total) throw new Error('Export row count mismatch.');
  manifest.tables[table] = { count: total, rows };
}
let cursor = null;
do {
  const page = await fetchExport(
    `table=objects${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
  if (!Array.isArray(page.objects)) throw new Error('Invalid object manifest.');
  for (const object of page.objects) {
    if (typeof object.key !== 'string' || typeof object.size !== 'number')
      throw new Error('Invalid object metadata.');
    const filename = createHash('sha256').update(object.key).digest('hex');
    const response = await fetch(
      `${input.siteUrl}/api/admin/migration/object?key=${encodeURIComponent(object.key)}`,
      { headers, cache: 'no-store' },
    );
    if (!response.ok || !response.body) throw new Error('Object export failed.');
    const checksum = createHash('sha256');
    let bytes = 0;
    const verify = new Transform({
      transform(chunk, _encoding, callback) {
        checksum.update(chunk);
        bytes += chunk.length;
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      verify,
      createWriteStream(`${folder}/objects/${filename}`),
    );
    if (bytes !== object.size) throw new Error('Object byte count mismatch.');
    manifest.objects.push({
      key: object.key,
      file: `objects/${filename}`,
      size: bytes,
      sha256: checksum.digest('hex'),
    });
  }
  cursor = page.cursor;
} while (cursor);
const body = JSON.stringify(manifest, null, 2);
await writeFile(`${folder}/manifest.json`, body, { mode: 0o600 });
await writeFile(`${folder}/manifest.sha256`, createHash('sha256').update(body).digest('hex'), {
  mode: 0o600,
});
console.log(
  `Verified export written to ${folder}. Auth sessions are excluded; users must sign in again after migration.`,
);
