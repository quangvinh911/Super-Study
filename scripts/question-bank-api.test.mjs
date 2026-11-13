import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findCertificate } from '../src/app/certificates/registry';
import { completeExamForms, generateExam } from '../src/app/core/domain/exam-generator';
import { bankChecksum } from '../server/question-bank-validation.mjs';
import { createLocalAccountRuntime } from './account-local-runtime.mjs';

const origin = 'http://localhost:4200';
const adminPath = '/api/admin/question-banks';
const readPath = '/api/question-banks';
const bootstrapSecret = 'bank-test-bootstrap-secret-at-least-32';
const backfillSecret = 'bank-test-backfill-secret-at-least-32';
const password = 'Test-question-bank-password-1';
let runtime;
let admin;
let user;

async function request(path, { method = 'GET', body, token, requestOrigin = origin } = {}) {
  const response = await runtime.dispatchFetch(`${origin}${path}`, {
    method,
    headers: {
      Origin: requestOrigin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

const write = (path, body, method = 'PUT') => request(path, { body, method, token: admin });

async function fixture(prefix) {
  const read = async (name) =>
    JSON.parse(
      await readFile(new URL(`../public/data/${prefix}${name}.json`, import.meta.url), 'utf8'),
    );
  const [manifest, questions, solutions] = await Promise.all([
    read('manifest'),
    read('questions'),
    read('solutions'),
  ]);
  return { manifest, questions: questions.questions, solutions: solutions.solutions };
}

function entries(bank) {
  const solutions = new Map(
    bank.solutions.map((solution, solutionPosition) => [
      solution.questionId,
      { solution, solutionPosition },
    ]),
  );
  return bank.questions.map((question, position) => ({
    question,
    position,
    ...solutions.get(question.id),
  }));
}

beforeAll(async () => {
  runtime = await createLocalAccountRuntime({
    workerPath: 'dist/local-question-bank-test-worker.mjs',
    bootstrapSecret,
    bankBackfillSecret: backfillSecret,
    jwtSecret: 'bank-test-jwt-secret-at-least-32-characters',
  });
  const created = await request('/api/auth/bootstrap', {
    method: 'POST',
    token: bootstrapSecret,
    body: { username: 'bank-admin', password },
  });
  expect(created.status).toBe(201);
  admin = (
    await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'bank-admin', password },
    })
  ).body.accessToken;
  expect(admin).toBeTruthy();
  expect(
    (await write('/api/admin/users', { username: 'bank-user', password, role: 'user' }, 'POST'))
      .status,
  ).toBe(201);
  user = (
    await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'bank-user', password },
    })
  ).body.accessToken;
  expect(user).toBeTruthy();
}, 15_000);

afterAll(async () => {
  await runtime?.dispose();
});

describe('versioned question banks in the Sites Worker', () => {
  it('limits the initial backfill credential to the shipped bank versions', async () => {
    const bank = await fixture('');
    const checksum = bankChecksum(bank);
    const path = '/api/internal/question-bank-backfill/ctfl/original';
    const draft = `${path}/versions/${bank.manifest.bankVersion}`;
    const create = { method: 'PUT', body: { manifest: bank.manifest, checksum } };
    expect((await request(draft, create)).status).toBe(404);
    expect((await request(draft, { ...create, token: backfillSecret })).status).toBe(200);
    expect(
      (
        await request(`${draft}/entries`, {
          method: 'PUT',
          token: backfillSecret,
          body: { checksum, entries: entries(bank).slice(0, 2) },
        })
      ).status,
    ).toBe(200);
    expect(
      (await request(`${path}/versions/other-version`, { ...create, token: backfillSecret }))
        .status,
    ).toBe(404);
    expect(
      (
        await request(`${path}/active`, {
          method: 'PUT',
          token: backfillSecret,
          body: { bankVersion: null, previousVersion: null },
        })
      ).status,
    ).toBe(404);
    expect((await request('/api/admin/users', { token: backfillSecret })).status).toBe(401);
  });

  it('isolates drafts, verifies actual stored contents and rolls back only the active bank', async () => {
    const bank = await fixture('');
    const checksum = bankChecksum(bank);
    const adminBank = `${adminPath}/ctfl/original`;
    const versionPath = `${adminBank}/versions/${bank.manifest.bankVersion}`;
    const learnerVersion = `${readPath}/ctfl/original/${bank.manifest.bankVersion}`;
    const draft = { manifest: bank.manifest, checksum };
    const allEntries = entries(bank);
    for (const [token, expectedStatus] of [
      [undefined, 401],
      [user, 403],
    ]) {
      expect((await request(versionPath, { method: 'PUT', body: draft, token })).status).toBe(
        expectedStatus,
      );
    }
    expect(
      (
        await request(versionPath, {
          method: 'PUT',
          body: draft,
          token: admin,
          requestOrigin: 'https://example.com',
        })
      ).status,
    ).toBe(403);
    expect((await write(versionPath, draft)).body.verified).toBe(false);
    expect((await write(versionPath, { ...draft, checksum: '0'.repeat(64) })).status).toBe(409);
    expect((await request(learnerVersion)).status).toBe(404);
    expect((await request(`${readPath}/ctfl`)).body.banks).toEqual([]);

    const half = allEntries.slice(0, 40);
    expect((await write(`${versionPath}/entries`, { checksum, entries: half })).status).toBe(200);
    expect((await write(`${versionPath}/verify`, { checksum }, 'POST')).status).toBe(422);
    expect(
      (
        await write(`${adminBank}/active`, {
          bankVersion: bank.manifest.bankVersion,
          previousVersion: null,
        })
      ).status,
    ).toBe(409);
    expect((await write(`${versionPath}/entries`, { checksum, entries: half })).status).toBe(200);
    const rest = allEntries.slice(40);
    const changed = structuredClone(rest);
    changed[0].question.stem[0].text += ' ';
    expect((await write(`${versionPath}/entries`, { checksum, entries: changed })).status).toBe(
      200,
    );
    expect((await write(`${versionPath}/verify`, { checksum }, 'POST')).body.error).toBe(
      'bank_content_checksum_mismatch',
    );
    expect((await write(`${versionPath}/entries`, { checksum, entries: rest })).status).toBe(200);
    const verified = await write(`${versionPath}/verify`, { checksum }, 'POST');
    expect(verified.body).toMatchObject({ verified: true, published: false, examReady: true });
    expect((await request(learnerVersion)).status).toBe(404);
    expect((await write(`${versionPath}/entries`, { checksum, entries: changed })).status).toBe(
      200,
    );
    expect(
      (
        await write(`${adminBank}/active`, {
          bankVersion: bank.manifest.bankVersion,
          previousVersion: null,
        })
      ).status,
    ).toBe(200);
    const loaded = await request(learnerVersion);
    expect(loaded.status).toBe(200);
    expect(loaded.body).toEqual(bank);
    expect(
      generateExam(
        loaded.body.questions,
        loaded.body.solutions,
        findCertificate('ctfl').exam,
        'migration',
      ),
    ).toHaveLength(40);
    expect((await request(`${readPath}/ctfl`)).body.banks).toMatchObject([
      { id: 'original', questionCount: 80, examReady: true },
    ]);
    expect((await request(`${readPath}/toeic`)).body.banks).toEqual([]);
    expect(
      (await write(`${adminBank}/active`, { bankVersion: null, previousVersion: 'stale-version' }))
        .status,
    ).toBe(409);
    expect(
      (
        await write(`${adminBank}/active`, {
          bankVersion: null,
          previousVersion: bank.manifest.bankVersion,
        })
      ).status,
    ).toBe(200);
    expect((await request(`${readPath}/ctfl`)).body.banks).toEqual([]);
    expect((await request(learnerVersion)).body).toEqual(bank);
  }, 15_000);

  it('validates R2 media and preserves the complete ordered TOEIC forms', async () => {
    const bank = await fixture('toeic/hacker-');
    const available = completeExamForms(
      bank.questions,
      bank.solutions,
      findCertificate('toeic').exam,
    );
    expect(available).toHaveLength(9);
    const form = available[0];
    expect(form.map((question) => question.order)).toEqual(
      Array.from({ length: 200 }, (_, index) => index + 1),
    );
    expect(available.some(([question]) => question.formId === 'hacker-3-test-04')).toBe(false);
    expect(completeExamForms(form.slice(1), bank.solutions, findCertificate('toeic').exam)).toEqual(
      [],
    );

    const question = form[0];
    const solution = bank.solutions.find((item) => item.questionId === question.id);
    const audio = question.stem.find((block) => block.kind === 'audio').src;
    const small = {
      manifest: { ...bank.manifest, bankVersion: 'test-audio', questionCount: 1, solutionCount: 1 },
      questions: [question],
      solutions: [solution],
    };
    const checksum = bankChecksum(small);
    const path = `${adminPath}/toeic/hacker/versions/${small.manifest.bankVersion}`;
    expect((await write(path, { checksum, manifest: small.manifest })).status).toBe(200);
    const payload = { checksum, entries: entries(small) };
    const rejected = await write(`${path}/entries`, payload);
    expect(rejected.status).toBe(422);
    expect(rejected.body.missing).toContain(audio);

    const bucket = await runtime.getR2Bucket('MEDIA');
    for (const media of rejected.body.missing) {
      await bucket.put(media.slice(1), new Uint8Array([1]));
    }
    expect((await write(`${path}/entries`, payload)).status).toBe(200);
    const verified = await write(`${path}/verify`, { checksum }, 'POST');
    expect(verified.body).toMatchObject({ verified: true, examReady: false });
  }, 15_000);
});
