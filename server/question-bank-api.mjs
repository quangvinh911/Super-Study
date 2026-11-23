import { findCertificate } from '../src/app/certificates/registry.ts';
import { canGenerateExam } from '../src/app/core/domain/exam-generator.ts';
import validateSchema from '../scripts/question-bank-schema.mjs';
import { mediaType } from '../scripts/sites-media-paths.mjs';
import { ApiError, readJson, record, requireCondition } from './errors.mjs';
import { createQuestionBankRepository } from './question-bank-repository.mjs';
import {
  BANK_CHECKSUM,
  BANK_ID,
  BANK_MEDIA_BATCH,
  BANK_UPLOAD_BYTES,
  BANK_UPLOAD_ROWS,
  BANK_VERSION,
  QuestionBankValidationError,
  bankChecksum,
  isBankMediaPath,
  validateBankContent,
  validateBankManifest,
} from './question-bank-validation.mjs';

const bankJson = (value, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

function certificateFor(id) {
  const certificate = BANK_ID.test(id) && findCertificate(id);
  requireCondition(certificate, 'unknown_certificate', 404);
  return certificate;
}

function requireBank(certificate, id) {
  requireCondition(
    BANK_ID.test(id) && certificate.banks.some((bank) => bank.id === id),
    'unknown_bank',
    404,
  );
}

function versionInfo(version) {
  return {
    bankVersion: version.bank_version,
    questionCount: version.question_count,
    checksum: version.checksum,
    verified: Boolean(version.verified_at),
    published: Boolean(version.published_at),
    examReady: Boolean(version.exam_ready),
  };
}

async function missingMedia(paths, request, env) {
  requireCondition(paths.length <= BANK_MEDIA_BATCH, 'bank_media_batch_too_large', 413);
  const results = await Promise.all(
    paths.map(async (path) => {
      const key = path.slice(1);
      const type = mediaType(key);
      if (type && env.MEDIA) {
        if ((await env.MEDIA.head(key))?.size > 0) return null;
        if (!env.LOCAL_ASSETS) return path;
      }
      const asset = await env.ASSETS?.fetch(
        new Request(new URL(path, request.url), { method: 'HEAD' }),
      );
      if (asset?.ok && /^(?:image|audio)\//i.test(asset.headers.get('Content-Type') ?? ''))
        return null;
      return path;
    }),
  );
  return results.filter(Boolean);
}

export async function readQuestionBanks(request, env) {
  try {
    requireCondition(request.method === 'GET', 'method_not_allowed', 405);
    requireCondition(env.DB, 'bank_storage_unavailable', 503);
    const [, , , certificateId, bankId, bankVersion, ...rest] = new URL(request.url).pathname.split(
      '/',
    );
    requireCondition(certificateId && !rest.length, 'not_found', 404);
    const certificate = certificateFor(certificateId);
    const repository = createQuestionBankRepository(env.DB);
    if (bankId === undefined)
      return bankJson({ banks: await repository.listActive(certificateId) });
    requireBank(certificate, bankId);
    requireCondition(bankVersion && BANK_VERSION.test(bankVersion), 'not_found', 404);
    const key = [certificateId, bankId, bankVersion];
    const version = await repository.findVersion(key);
    requireCondition(version?.published_at, 'bank_version_not_found', 404);
    const bank = await repository.readContents(key, version.manifest);
    requireCondition(
      bank.questions.length === version.question_count &&
        bank.solutions.length === version.question_count,
      'bank_storage_unavailable',
      503,
    );
    return Response.json(bank, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (error) {
    if (error instanceof ApiError) return bankJson({ error: error.code }, error.status);
    console.error(
      'Question bank read failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return bankJson({ error: 'bank_storage_unavailable' }, 503);
  }
}

export async function administerQuestionBanks(request, env) {
  try {
    requireCondition(env.DB, 'bank_storage_unavailable', 503);
    const path = new URL(request.url).pathname;
    const repository = createQuestionBankRepository(env.DB);
    if (path === '/api/admin/question-banks/media' && request.method === 'POST') {
      const input = await readJson(request, 48 * 1024);
      requireCondition(Array.isArray(input) && input.every(isBankMediaPath), 'invalid_bank_media');
      return bankJson({ missing: await missingMedia([...new Set(input)], request, env) });
    }
    const [, , , , certificateId, bankId, resource, bankVersion, operation, ...rest] =
      path.split('/');
    requireCondition(certificateId && bankId && !rest.length, 'not_found', 404);
    const certificate = certificateFor(certificateId);
    requireBank(certificate, bankId);
    const bankKey = [certificateId, bankId];
    if (resource === 'active' && bankVersion === undefined) {
      if (request.method === 'GET') {
        return bankJson({ bankVersion: await repository.getActiveVersion(bankKey) });
      }
      requireCondition(request.method === 'PUT', 'method_not_allowed', 405);
      const input = await readJson(request, 2048);
      requireCondition(
        record(input) &&
          [input.bankVersion, input.previousVersion].every(
            (value) => value === null || (typeof value === 'string' && BANK_VERSION.test(value)),
          ),
        'invalid_bank_version',
      );
      if (input.bankVersion !== null) {
        const version = await repository.findVersion([...bankKey, input.bankVersion]);
        requireCondition(version?.verified_at, 'bank_version_not_verified', 409);
      }
      await repository.activate(bankKey, input.bankVersion, input.previousVersion);
      return bankJson({ bankVersion: input.bankVersion });
    }

    requireCondition(
      resource === 'versions' && bankVersion && BANK_VERSION.test(bankVersion),
      'not_found',
      404,
    );
    const key = [...bankKey, bankVersion];
    requireCondition(
      (request.method === 'PUT' && [undefined, 'entries'].includes(operation)) ||
        (request.method === 'POST' && operation === 'verify'),
      'method_not_allowed',
      405,
    );
    const input = await readJson(request, operation === 'entries' ? BANK_UPLOAD_BYTES : 128 * 1024);
    requireCondition(
      record(input) && typeof input.checksum === 'string' && BANK_CHECKSUM.test(input.checksum),
      'invalid_bank_checksum',
    );
    if (operation === undefined) {
      validateBankManifest(input.manifest, certificateId);
      requireCondition(input.manifest.bankVersion === bankVersion, 'invalid_bank_version');
      return bankJson(
        versionInfo(await repository.createDraft(key, input.checksum, input.manifest)),
      );
    }

    const version = await repository.findVersion(key);
    requireCondition(version, 'bank_version_not_found', 404);
    requireCondition(version.checksum === input.checksum, 'bank_version_checksum_conflict', 409);
    if (version.verified_at) return bankJson(versionInfo(version));
    const manifest = JSON.parse(version.manifest);

    if (operation === 'entries') {
      const entries = input.entries;
      requireCondition(
        Array.isArray(entries) &&
          entries.length > 0 &&
          entries.length <= BANK_UPLOAD_ROWS &&
          entries.every(
            (entry) =>
              record(entry) &&
              [entry.position, entry.solutionPosition].every(
                (position) =>
                  Number.isInteger(position) && position >= 0 && position < version.question_count,
              ) &&
              record(entry.question) &&
              record(entry.solution) &&
              entry.question.id === entry.solution.questionId,
          ) &&
          new Set(entries.map((entry) => entry.position)).size === entries.length &&
          new Set(entries.map((entry) => entry.solutionPosition)).size === entries.length,
        'invalid_bank_entries',
      );
      const media = validateBankContent(
        {
          manifest: { ...manifest, questionCount: entries.length, solutionCount: entries.length },
          questions: entries.map((entry) => entry.question),
          solutions: entries.map((entry) => entry.solution),
        },
        certificateId,
        validateSchema,
      );
      const missing = await missingMedia([...media], request, env);
      if (missing.length) return bankJson({ error: 'bank_media_missing', missing }, 422);
      return bankJson(versionInfo(await repository.writeEntries(key, input.checksum, entries)));
    }

    const bank = await repository.readContents(key, version.manifest);
    validateBankContent(bank, certificateId, validateSchema);
    requireCondition(
      bankChecksum(bank) === version.checksum,
      'bank_content_checksum_mismatch',
      409,
    );
    const examReady = canGenerateExam(bank, certificate.exam);
    return bankJson(
      versionInfo(await repository.verifyVersion(key, version.draft_revision, examReady)),
    );
  } catch (error) {
    if (error instanceof QuestionBankValidationError) {
      return bankJson({ error: 'invalid_question_bank', detail: error.message }, 422);
    }
    if (error instanceof ApiError) return bankJson({ error: error.code }, error.status);
    throw error;
  }
}
