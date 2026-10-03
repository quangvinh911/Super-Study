export const MEDIA_ROOTS = [
  'audio',
  'pdf-evidence',
  'media',
  'images',
  'documents',
  'video',
  'videos',
];
export const MEDIA_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export function mediaType(key) {
  const segments = key.split('/');
  if (
    !MEDIA_ROOTS.includes(segments[0]) ||
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    /[\\\u0000-\u001f]/.test(key)
  )
    return null;
  const extension = key.split('.').at(-1).toLowerCase();
  return Object.hasOwn(MEDIA_TYPES, extension) ? MEDIA_TYPES[extension] : null;
}

const adminPath = '/api/site-media';
const singleUploadPath = `${adminPath}/file`;
const maxBatchBytes = 8 * 1024 * 1024;
const maxBatchFiles = 40;
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function administerMedia(request, env) {
  // Upload access is separate from visitor access and can be disabled by removing the secret.
  if (
    !env.MEDIA_UPLOAD_SECRET ||
    request.headers.get('X-Media-Upload-Key') !== env.MEDIA_UPLOAD_SECRET
  ) {
    return json({ error: 'Not found' }, 404);
  }
  if (!env.MEDIA) return json({ error: 'Media storage unavailable' }, 503);
  const length = Number(request.headers.get('content-length'));
  if (new URL(request.url).pathname === singleUploadPath) {
    if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    const key = new URL(request.url).searchParams.get('key');
    const sha256 = request.headers.get('X-Media-Sha256');
    if (
      typeof key !== 'string' ||
      !mediaType(key) ||
      !/^[a-f0-9]{64}$/.test(sha256 ?? '') ||
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      length > 100 * 1024 * 1024
    ) {
      return json({ error: 'Invalid media upload' }, 400);
    }
    // R2 verifies the supplied digest while consuming the stream; large videos stay out of Worker memory.
    const digest = Uint8Array.from(sha256.match(/../g), (hex) => parseInt(hex, 16)).buffer;
    const object = await env.MEDIA.put(key, request.body, {
      sha256: digest,
      httpMetadata: { contentType: mediaType(key), cacheControl: 'private, max-age=86400' },
      customMetadata: { sha256 },
    });
    if (!object || object.size !== length)
      throw new Error('R2 did not acknowledge the complete media file.');
    return json({ stored: [{ key, size: object.size, sha256 }] });
  }
  if (!Number.isSafeInteger(length) || length <= 0 || length > maxBatchBytes) {
    return json({ error: 'Invalid batch size' }, 413);
  }
  if (request.method === 'POST') {
    const keys = await request.json();
    if (
      !Array.isArray(keys) ||
      keys.length > maxBatchFiles ||
      keys.some((key) => typeof key !== 'string' || !mediaType(key))
    ) {
      return json({ error: 'Invalid media keys' }, 400);
    }
    const objects = await Promise.all(
      keys.map(async (key) => {
        const object = await env.MEDIA.head(key);
        return { key, size: object?.size ?? null, sha256: object?.customMetadata?.sha256 ?? null };
      }),
    );
    return json({ objects });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
  const form = await request.formData();
  const manifestText = form.get('manifest');
  if (typeof manifestText !== 'string') return json({ error: 'Missing manifest' }, 400);
  const manifest = JSON.parse(manifestText);
  if (!Array.isArray(manifest) || manifest.length < 1 || manifest.length > maxBatchFiles) {
    return json({ error: 'Invalid manifest' }, 400);
  }
  const validated = [];
  const keys = new Set();
  let totalBytes = 0;
  // Validate the entire batch before writing; retries safely replace identical objects.
  for (const entry of manifest) {
    if (
      !entry ||
      typeof entry.key !== 'string' ||
      !mediaType(entry.key) ||
      keys.has(entry.key) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size <= 0 ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      return json({ error: 'Invalid manifest entry' }, 400);
    }
    const file = form.get(entry.key);
    if (!(file instanceof Blob) || file.size !== entry.size)
      return json({ error: 'File size mismatch' }, 400);
    totalBytes += file.size;
    if (totalBytes > maxBatchBytes) return json({ error: 'Batch too large' }, 413);
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    if (hash !== entry.sha256) return json({ error: 'File checksum mismatch' }, 400);
    keys.add(entry.key);
    validated.push({ ...entry, bytes, digest });
  }
  for (const entry of validated) {
    await env.MEDIA.put(entry.key, entry.bytes, {
      sha256: entry.digest,
      httpMetadata: { contentType: mediaType(entry.key), cacheControl: 'private, max-age=86400' },
      customMetadata: { sha256: entry.sha256 },
    });
  }
  return json({ stored: validated.map(({ key, size, sha256 }) => ({ key, size, sha256 })) });
}

function requestedRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
    return null;
  return { offset: start, length: end - start + 1 };
}

async function serveMedia(request, env, key) {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (!env.MEDIA) return new Response('Media storage unavailable', { status: 503 });
  const metadata = await env.MEDIA.head(key);
  if (!metadata) return new Response('Media not found', { status: 404 });
  const headers = new Headers();
  metadata.writeHttpMetadata(headers);
  headers.set('Content-Type', mediaType(key));
  headers.set('ETag', metadata.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(metadata.size));
  headers.set('Cache-Control', 'private, max-age=86400');
  // Do not let a missing R2 object or conditional response become the SPA index page.
  if (
    request.headers
      .get('if-none-match')
      ?.split(',')
      .map((value) => value.trim().replace(/^W\//, ''))
      .some((value) => value === '*' || value === metadata.httpEtag)
  ) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }
  if (request.method === 'HEAD') return new Response(null, { headers });
  const rangeHeader = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  const useRange = rangeHeader && (!ifRange || ifRange === metadata.httpEtag);
  const range = useRange ? requestedRange(rangeHeader, metadata.size) : undefined;
  if (useRange && !range)
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${metadata.size}` },
    });
  const object = await env.MEDIA.get(key, range ? { range } : undefined);
  if (!object || !('body' in object)) return new Response('Media not found', { status: 404 });
  if (range) {
    headers.set(
      'Content-Range',
      `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`,
    );
    headers.set('Content-Length', String(range.length));
  }
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === adminPath || url.pathname === singleUploadPath)
        return secure(await administerMedia(request, env));
      const key = decodeURIComponent(url.pathname.slice(1));
      if (mediaType(key)) return secure(await serveMedia(request, env, key));
      if (MEDIA_ROOTS.includes(key.split('/')[0]))
        return secure(new Response('Not found', { status: 404 }));
      const response = await env.ASSETS.fetch(request);
      if (
        response.status !== 404 ||
        request.method !== 'GET' ||
        !request.headers.get('accept')?.includes('text/html')
      )
        return secure(response);
      const indexUrl = new URL('/index.html', request.url);
      return secure(await env.ASSETS.fetch(new Request(indexUrl, request)));
    } catch (error) {
      console.error(
        'Site media request failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return secure(
        new Response('Media request unavailable', {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        }),
      );
    }
  },
};
