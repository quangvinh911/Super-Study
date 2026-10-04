import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import worker, { mediaType } from './sites-media-worker.mjs';

function bucket(bytes = new Uint8Array([1, 2, 3, 4, 5])) {
  const metadata = {
    size: bytes.length,
    httpEtag: '"media-v1"',
    customMetadata: { sha256: 'stored-hash' },
    writeHttpMetadata: (headers) => headers.set('Content-Type', 'audio/mpeg'),
  };
  return {
    head: vi.fn(async () => metadata),
    get: vi.fn(async (_key, options) => ({
      ...metadata,
      body: options?.range
        ? bytes.slice(options.range.offset, options.range.offset + options.range.length)
        : bytes,
    })),
    put: vi.fn(async () => metadata),
  };
}
function request(path, init) {
  return new Request(`https://study.chatgpt.site${path}`, init);
}
function env(media = bucket()) {
  return {
    MEDIA: media,
    MEDIA_UPLOAD_SECRET: 'test-secret',
    ASSETS: { fetch: vi.fn(async () => new Response('app', { status: 200 })) },
  };
}
async function upload(entries) {
  const form = new FormData();
  const manifest = entries.map(({ key, bytes, hash }) => ({
    key,
    size: bytes.length,
    sha256: hash ?? createHash('sha256').update(bytes).digest('hex'),
  }));
  form.append('manifest', JSON.stringify(manifest));
  for (const entry of entries) form.append(entry.key, new Blob([entry.bytes]), 'sample.mp3');
  return request('/api/site-media', {
    method: 'PUT',
    body: form,
    headers: { 'X-Media-Upload-Key': 'test-secret', 'Content-Length': '2000' },
  });
}

describe('Sites R2 media worker', () => {
  it('allows media under controlled roots and rejects executable and traversal keys', () => {
    expect(mediaType('documents/guide.pdf')).toBe('application/pdf');
    expect(mediaType('videos/demo.mp4')).toBe('video/mp4');
    for (const key of [
      'media/../secret.pdf',
      'audio/script.js',
      'audio//a.mp3',
      'data/questions.json',
      'audio\\a.mp3',
      'audio/a.constructor',
    ])
      expect(mediaType(key)).toBeNull();
  });
  it('serves R2 media at the existing URL with private caching and security headers', async () => {
    const runtime = env();
    const response = await worker.fetch(request('/audio/toeic/test.mp3'), runtime);
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4, 5]);
    expect(response.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(runtime.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('supports audio ranges and suffix ranges for seeking', async () => {
    const response = await worker.fetch(
      request('/audio/test.mp3', { headers: { Range: 'bytes=1-3' } }),
      env(),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 1-3/5');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3, 4]);
    const suffix = await worker.fetch(
      request('/audio/test.mp3', { headers: { Range: 'bytes=-2' } }),
      env(),
    );
    expect([...new Uint8Array(await suffix.arrayBuffer())]).toEqual([4, 5]);
  });
  it('rejects unsatisfiable ranges and sends the full object when If-Range changed', async () => {
    const bad = await worker.fetch(
      request('/audio/test.mp3', { headers: { Range: 'bytes=9-' } }),
      env(),
    );
    expect(bad.status).toBe(416);
    const changed = await worker.fetch(
      request('/audio/test.mp3', { headers: { Range: 'bytes=1-3', 'If-Range': '"older"' } }),
      env(),
    );
    expect(changed.status).toBe(200);
  });
  it('supports HEAD and ETag revalidation without downloading the body', async () => {
    const runtime = env();
    const head = await worker.fetch(request('/audio/test.mp3', { method: 'HEAD' }), runtime);
    expect(head.headers.get('content-length')).toBe('5');
    const cached = await worker.fetch(
      request('/audio/test.mp3', { headers: { 'If-None-Match': 'W/"media-v1"' } }),
      runtime,
    );
    expect(cached.status).toBe(304);
    expect(runtime.MEDIA.get).not.toHaveBeenCalled();
  });
  it('keeps missing media out of SPA fallback and reports R2 failures', async () => {
    const runtime = env();
    runtime.MEDIA.head.mockResolvedValue(null);
    expect(
      (
        await worker.fetch(
          request('/pdf-evidence/missing.webp', { headers: { Accept: 'text/html' } }),
          runtime,
        )
      ).status,
    ).toBe(404);
    expect(runtime.ASSETS.fetch).not.toHaveBeenCalled();
    expect(
      (await worker.fetch(request('/audio/test.mp3'), { ASSETS: runtime.ASSETS })).status,
    ).toBe(503);
  });
  it('requires the upload secret even for visitors with Site access', async () => {
    const runtime = env();
    expect(
      (await worker.fetch(request('/api/site-media', { method: 'PUT' }), runtime)).status,
    ).toBe(404);
    expect(runtime.MEDIA.put).not.toHaveBeenCalled();
  });
  it('checks all checksums before any file is written', async () => {
    const runtime = env();
    const response = await worker.fetch(
      await upload([
        { key: 'audio/a.mp3', bytes: Buffer.from('valid') },
        { key: 'audio/b.mp3', bytes: Buffer.from('corrupt'), hash: '0'.repeat(64) },
      ]),
      runtime,
    );
    expect(response.status).toBe(400);
    expect(runtime.MEDIA.put).not.toHaveBeenCalled();
  });
  it('stores verified original bytes and checksum metadata', async () => {
    const runtime = env();
    const bytes = Buffer.from('original audio');
    const response = await worker.fetch(await upload([{ key: 'audio/a.mp3', bytes }]), runtime);
    expect(response.status).toBe(200);
    const [key, stored, options] = runtime.MEDIA.put.mock.calls[0];
    expect(key).toBe('audio/a.mp3');
    expect(Buffer.from(stored)).toEqual(bytes);
    expect(options.customMetadata.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
  it('streams documents and videos into R2 with checksum verification', async () => {
    const bytes = Buffer.from('original video');
    const runtime = env(bucket(bytes));
    const input = request('/api/site-media/file?key=videos/demo.mp4', {
      method: 'PUT',
      body: bytes,
      headers: {
        'X-Media-Upload-Key': 'test-secret',
        'Content-Length': String(bytes.length),
        'X-Media-Sha256': createHash('sha256').update(bytes).digest('hex'),
      },
    });
    const response = await worker.fetch(input, runtime);
    expect(response.status).toBe(200);
    expect(runtime.MEDIA.put.mock.calls[0][1]).toBe(input.body);
    expect(runtime.MEDIA.put.mock.calls[0][2].httpMetadata.contentType).toBe('video/mp4');
    expect(Buffer.from(runtime.MEDIA.put.mock.calls[0][2].sha256)).toEqual(
      createHash('sha256').update(bytes).digest(),
    );
  });
  it('rejects streaming uploads without a valid checksum before writing', async () => {
    const runtime = env();
    const response = await worker.fetch(
      request('/api/site-media/file?key=documents/guide.pdf', {
        method: 'PUT',
        body: 'pdf',
        headers: { 'X-Media-Upload-Key': 'test-secret', 'Content-Length': '3' },
      }),
      runtime,
    );
    expect(response.status).toBe(400);
    expect(runtime.MEDIA.put).not.toHaveBeenCalled();
  });
  it('preserves normal SPA routes', async () => {
    const runtime = env();
    runtime.ASSETS.fetch
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('index'));
    const response = await worker.fetch(
      request('/certificates/toeic/grammar', { headers: { Accept: 'text/html' } }),
      runtime,
    );
    expect(await response.text()).toBe('index');
    expect(new URL(runtime.ASSETS.fetch.mock.calls[1][0].url).pathname).toBe('/index.html');
  });
});
