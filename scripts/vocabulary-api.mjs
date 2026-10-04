import { lookupVocabulary } from './vocabulary-lookup.mjs';
function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
async function readInput(request) {
  if (!request.body) throw new Error('Missing body');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new Error('Body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createVocabularyApi() {
  const clients = new Map();
  const dictionaryCache = new Map();
  let windowStart = Date.now();
  let calls = 0;
  return async function vocabularyApi(request, env = {}) {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const allowedOrigin = env.VOCABULARY_ALLOWED_ORIGIN || new URL(request.url).origin;
    if (request.headers.get('Origin') !== allowedOrigin)
      return json({ error: 'forbidden_origin' }, 403);
    if (!request.headers.get('Content-Type')?.startsWith('application/json'))
      return json({ error: 'invalid_content_type' }, 415);
    let input;
    try {
      input = await readInput(request);
    } catch {
      return json({ error: 'invalid_request' }, 400);
    }
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.term !== 'string' ||
      !input.term.trim() ||
      input.term.length > 120 ||
      !/^[a-zA-Z][a-zA-Z\s'’.,()-]*$/.test(input.term.trim()) ||
      typeof input.context !== 'string' ||
      input.context.length > 4000 ||
      typeof input.meaning !== 'string' ||
      input.meaning.length > 2000
    )
      return json({ error: 'invalid_request' }, 400);
    const now = Date.now();
    if (now - windowStart >= 60000) {
      windowStart = now;
      calls = 0;
      clients.clear();
    }
    const client = request.headers.get('CF-Connecting-IP') || 'local';
    if (calls >= 60 || (clients.get(client) || 0) >= 10)
      return json({ error: 'rate_limited' }, 429);
    calls += 1;
    clients.set(client, (clients.get(client) || 0) + 1);
    try {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
      const details = await lookupVocabulary(input, { signal, cache: dictionaryCache });
      return details ? json(details) : json({ error: 'word_not_found' }, 404);
    } catch {
      return json({ error: 'dictionary_unavailable' }, 502);
    }
  };
}
