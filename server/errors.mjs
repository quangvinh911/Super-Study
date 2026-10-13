export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export function requireCondition(condition, code = 'invalid_request', status = 400) {
  if (!condition) throw new ApiError(status, code);
}
export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export async function readJson(request, maxBytes = 8 * 1024 * 1024) {
  requireCondition(
    request.headers.get('Content-Type')?.startsWith('application/json'),
    'invalid_content_type',
    415,
  );
  requireCondition(request.body, 'invalid_request');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, 'request_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, 'invalid_json');
  }
}
