import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError, readJson } from './errors.mjs';
import { administerQuestionBanks } from './question-bank-api.mjs';
import { BANK_UPLOAD_BYTES } from './question-bank-validation.mjs';

export const bankBackfillPrefix = '/api/internal/question-bank-backfill/';
const initialVersions = {
  'ctfl/original': [
    '2026.08.29.1',
    'ec7b1a67d720eb2f4a86f968cacb3723147d3949e478abe9e67ae992dede22fd',
  ],
  'ctfl/pdf': [
    'pdf-ctfl-v4-0-2026.08.30.2',
    '3a77451bed49b507ed40e61bfd4786f39dc40511d01c667973ddb869f4ca25f1',
  ],
  'toeic/jimmy': [
    'toeic-jimmy-reading-1.0.0',
    'cc2a5c45ada6cde4b018649281496a5ef8323bb596dddfac927dc9c44c82544b',
  ],
  'toeic/hacker': [
    'toeic-hacker-listening-reading-1.1.1',
    '3c4ed78628adbac72ae1a25779ac9d830488367fd8f27bd6faf4250652b1cfaf',
  ],
};

const digest = (value) => createHash('sha256').update(value).digest();
const notFound = () => Response.json({ error: 'not_found' }, { status: 404 });

export async function backfillQuestionBanks(request, env) {
  const secret = env.QUESTION_BANK_BACKFILL_SECRET;
  const url = new URL(request.url);
  if (
    typeof secret !== 'string' ||
    secret.length < 32 ||
    request.headers.get('Origin') !== (env.APP_ORIGIN || url.origin) ||
    !timingSafeEqual(digest(request.headers.get('Authorization') ?? ''), digest(`Bearer ${secret}`))
  ) {
    return notFound();
  }

  const path = url.pathname.slice(bankBackfillPrefix.length);
  const [certificateId, bankId, resource, version, operation, ...rest] = path.split('/');
  const initial = initialVersions[`${certificateId}/${bankId}`];
  try {
    if (path !== 'media') {
      if (!initial || rest.length) return notFound();
      const [initialVersion, checksum] = initial;
      if (resource === 'active' && version === undefined) {
        if (request.method === 'PUT') {
          const input = await readJson(request.clone(), 2048);
          // This one-off importer can activate a first version only.
          if (input?.previousVersion !== null || input?.bankVersion !== initialVersion)
            return notFound();
        } else if (request.method !== 'GET') {
          return notFound();
        }
      } else {
        if (resource !== 'versions' || version !== initialVersion) return notFound();
        if (!(
          (request.method === 'PUT' && (operation === undefined || operation === 'entries')) ||
          (request.method === 'POST' && operation === 'verify')
        ))
          return notFound();
        const input = await readJson(request.clone(), BANK_UPLOAD_BYTES);
        if (input?.checksum !== checksum) return notFound();
      }
    }
    url.pathname = `/api/admin/question-banks/${path}`;
    return await administerQuestionBanks(new Request(url, request), env);
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
