import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalAccountRuntime } from './account-local-runtime.mjs';
import { createD1Repository } from '../server/d1-repository.mjs';
import { validatePassword } from '../server/auth.mjs';

let runtime;
let adminToken;
let adminId;
let userToken;
let userId;
const password = 'Test-password-12345';
const bootstrapSecret = 'test-bootstrap-secret-with-at-least-32-characters';
const workerOptions = {
  modules: true,
  scriptPath: 'dist/local-account-worker.mjs',
  compatibilityDate: '2026-07-30',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'certificate-accounts' },
  r2Buckets: ['MEDIA'],
  d1Persist: false,
  r2Persist: false,
};
async function request(
  path,
  { method = 'GET', body, token, cookie, origin = 'http://localhost:4200' } = {},
) {
  const response = await runtime.dispatchFetch(`http://localhost:4200${path}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('Set-Cookie')?.split(';')[0],
    headers: response.headers,
  };
}
function practice(id = 'practice-1') {
  return {
    schemaVersion: 1,
    id,
    certificateId: 'ctfl',
    mode: 'practice',
    bankVersion: 'test',
    seed: 'test',
    status: 'active',
    createdAt: '2026-10-04T10:00:00.000Z',
    startedAt: '2026-10-04T10:00:00.000Z',
    updatedAt: '2026-10-04T10:00:00.000Z',
    currentIndex: 0,
    questions: [
      {
        question: {
          id: 'q1',
          revision: 1,
          certificateId: 'ctfl',
          stem: [],
          options: [
            { id: 'A', content: [] },
            { id: 'B', content: [] },
          ],
          classification: { section: 'one' },
          interaction: { kind: 'singleChoice', requiredSelections: 1 },
          provenance: {},
          verification: {},
        },
        solution: { questionId: 'q1', correctOptionIds: ['A'], explanation: [], references: [] },
      },
    ],
    responses: {
      q1: {
        questionId: 'q1',
        selectedOptionIds: ['A'],
        checked: true,
        flagged: false,
        isCorrect: true,
        answeredAt: '2026-10-04T10:00:00.000Z',
      },
    },
  };
}
const action = (token, certificateId, name, args = []) =>
  request(`/api/learning/${certificateId}`, {
    method: 'POST',
    token,
    body: { action: name, args },
  });
beforeAll(async () => {
  runtime = await createLocalAccountRuntime({
    jwtSecret: 'test-jwt-secret-with-at-least-32-characters',
    bootstrapSecret,
  });
  const bootstrap = await request('/api/auth/bootstrap', {
    method: 'POST',
    token: bootstrapSecret,
    body: { username: 'admin', password },
  });
  expect(bootstrap.status).toBe(201);
  adminId = bootstrap.body.id;
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password },
  });
  expect(login.status).toBe(200);
  adminToken = login.body.accessToken;
  const create = await request('/api/admin/users', {
    method: 'POST',
    token: adminToken,
    body: { username: 'student', password, email: '', role: 'user' },
  });
  expect(create.status).toBe(201);
  userId = create.body.id;
  const userLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'STUDENT', password },
  });
  expect(userLogin.status).toBe(200);
  userToken = userLogin.body.accessToken;
}, 60_000);
afterAll(async () => {
  await runtime?.dispose();
});

describe('Worker/D1 account integration', () => {
  it('publishes a complete multi-chunk generation and rejects stale writes', async () => {
    const repository = createD1Repository(await runtime.getD1Database('DB'));
    const records = ['first', 'second', 'third'].map((key) => ({
      kind: 'settings',
      key,
      value: 'x'.repeat(200_000),
    }));
    expect(await repository.commit(adminId, 'ctfl', 0, records)).toBe(true);
    expect(
      await repository.commit(adminId, 'ctfl', 0, [
        { kind: 'settings', key: 'stale', value: true },
      ]),
    ).toBe(false);
    const state = await repository.load(adminId, 'ctfl');
    expect(state.version).toBe(1);
    expect(state.records).toEqual(records);
  });
  it('isolates global Notes by account, detects conflicts and preserves them through certificate resets', async () => {
    const noteAction = (token, name, args = []) =>
      request('/api/notes', { method: 'POST', token, body: { action: name, args } });
    const draft = {
      id: crypto.randomUUID(),
      title: 'Global note',
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Please ' },
              {
                type: 'grammarToken',
                attrs: { role: 'V' },
                content: [{ type: 'text', text: 'submit' }],
              },
              { type: 'text', text: ' the form.' },
            ],
          },
        ],
      },
      source: { certificateId: 'ctfl', path: '/certificates/ctfl/practice', label: 'CTFL' },
    };
    const created = await noteAction(adminToken, 'saveNote', [draft, null]);
    expect(created.status).toBe(200);
    expect(created.body.revision).toBe(1);
    expect(created.body.document).toEqual(draft.document);
    expect((await noteAction(adminToken, 'saveNote', [draft, null])).body).toEqual(created.body);
    expect((await noteAction(userToken, 'getNote', [draft.id])).body).toBeNull();
    const edited = { ...draft, title: 'Edited note' };
    expect((await noteAction(adminToken, 'saveNote', [edited, 1])).body.revision).toBe(2);
    expect((await noteAction(adminToken, 'saveNote', [edited, 1])).body.revision).toBe(2);
    expect((await noteAction(adminToken, 'saveNote', [draft, 1])).status).toBe(409);
    expect((await noteAction(adminToken, 'removeNote', [draft.id, 1])).status).toBe(409);
    expect((await noteAction(userToken, 'saveNote', [draft, 2])).status).toBe(409);
    expect(
      (await noteAction(userToken, 'saveNote', [{ ...draft, owner: adminId }, null])).status,
    ).toBe(400);
    for (const certificateId of ['ctfl', 'toeic']) {
      const exported = await action(adminToken, certificateId, 'exportProgress');
      expect(
        (await action(adminToken, certificateId, 'importProgress', [exported.body, 'replace']))
          .status,
      ).toBe(200);
      expect((await action(adminToken, certificateId, 'reset')).status).toBe(200);
    }
    expect((await noteAction(adminToken, 'listNotes')).body.map((note) => note.id)).toContain(
      draft.id,
    );
    expect((await action(adminToken, 'ctfl', 'listNotes')).status).toBe(400);
    expect((await action(adminToken, 'global-notes', 'listNotes')).status).toBe(404);
    expect(
      (await request('/api/notes', { method: 'POST', body: { action: 'listNotes', args: [] } }))
        .status,
    ).toBe(401);
    expect(
      (
        await noteAction(adminToken, 'saveNote', [
          { ...draft, document: { type: 'doc', content: [{ type: 'image' }] } },
          2,
        ])
      ).status,
    ).toBe(400);
    expect((await noteAction(adminToken, 'removeNote', [draft.id, 2])).status).toBe(200);
    expect((await noteAction(adminToken, 'getNote', [draft.id])).body).toBeNull();
  });
  it('accepts 11-character passwords and rejects shorter or oversized passwords', () => {
    expect(() => validatePassword('a'.repeat(11))).not.toThrow();
    expect(() => validatePassword('a'.repeat(128))).not.toThrow();
    for (const length of [0, 10, 129]) expect(() => validatePassword('a'.repeat(length))).toThrow();
  });
  it('allows only one concurrent demotion when two Admins remain', async () => {
    const isolated = await createLocalAccountRuntime();
    try {
      const repository = createD1Repository(await isolated.getD1Database('DB'));
      const template = await createD1Repository(await runtime.getD1Database('DB')).findUser(
        adminId,
      );
      const admins = ['first', 'second'].map((username) => ({
        ...template,
        id: crypto.randomUUID(),
        username,
        usernameKey: username,
        tokenVersion: 0,
      }));
      for (const admin of admins) await repository.createUser(admin);
      const changes = await Promise.allSettled(
        admins.map((admin) =>
          repository.updateUser({ ...admin, role: 'user', tokenVersion: 1 }, 0),
        ),
      );
      expect(changes.filter((change) => change.status === 'fulfilled')).toHaveLength(1);
      expect(changes.find((change) => change.status === 'rejected').reason.code).toBe('last_admin');
      const users = await repository.listUsers({});
      expect(users.users.filter((user) => user.role === 'admin')).toHaveLength(1);
    } finally {
      await isolated.dispose();
    }
  });
  it('bootstrap is one-time and never exposes password hashes', async () => {
    expect(
      (
        await request('/api/auth/bootstrap', {
          method: 'POST',
          token: bootstrapSecret,
          body: { username: 'other-admin', password },
        })
      ).status,
    ).toBe(409);
    const users = await request('/api/admin/users', { token: adminToken });
    expect(users.status).toBe(200);
    expect(JSON.stringify(users.body)).not.toContain('passwordHash');
    expect(JSON.stringify(users.body)).not.toContain(password);
  });
  it('denies guests, Users, wrong origins and duplicate usernames', async () => {
    expect((await request('/api/admin/users')).status).toBe(401);
    expect((await request('/api/admin/users', { token: userToken })).status).toBe(403);
    expect(
      (
        await request('/api/auth/login', {
          method: 'POST',
          origin: 'https://evil.example',
          body: { username: 'admin', password },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request('/api/admin/users', {
          method: 'POST',
          token: adminToken,
          body: { username: 'STUDENT', password, role: 'user' },
        })
      ).status,
    ).toBe(409);
    expect(
      (await request('/api/auth/me', { token: `${userToken.slice(0, -6)}abcdef` })).status,
    ).toBe(401);
  });
  it('rotates refresh tokens and revokes access on logout', async () => {
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'student', password },
    });
    expect(login.headers.get('Set-Cookie')).toContain('HttpOnly');
    expect(login.headers.get('Set-Cookie')).toContain('SameSite=Strict');
    const refresh = await request('/api/auth/refresh', {
      method: 'POST',
      cookie: login.cookie,
      body: {},
    });
    expect(refresh.status).toBe(200);
    expect(refresh.cookie).not.toBe(login.cookie);
    expect(
      (await request('/api/auth/refresh', { method: 'POST', cookie: login.cookie, body: {} }))
        .status,
    ).toBe(401);
    expect(
      (
        await request('/api/auth/logout', {
          method: 'POST',
          token: refresh.body.accessToken,
          body: {},
        })
      ).status,
    ).toBe(200);
    expect((await request('/api/auth/me', { token: refresh.body.accessToken })).status).toBe(401);
  });
  it('isolates users/certificates and keeps snapshot objects private', async () => {
    expect((await action(userToken, 'ctfl', 'saveActiveSession', [practice(), null])).status).toBe(
      200,
    );
    expect((await action(userToken, 'ctfl', 'listActiveSessions')).body).toHaveLength(1);
    expect((await action(adminToken, 'ctfl', 'listActiveSessions')).body).toHaveLength(0);
    expect((await action(userToken, 'toeic', 'listActiveSessions')).body).toHaveLength(0);
    const bucket = await runtime.getR2Bucket('MEDIA');
    const objects = await bucket.list({ prefix: 'account-snapshots/' });
    expect(objects.objects).toHaveLength(1);
    const response = await runtime.dispatchFetch(`http://localhost:4200/${objects.objects[0].key}`);
    expect(response.status).not.toBe(200);
  });
  it('records practice results and submission exactly once', async () => {
    const args = ['q1', 1, true, '2026-10-04T10:00:00.000Z', 'practice-1'];
    const replies = await Promise.all([
      action(userToken, 'ctfl', 'recordQuestionResult', args),
      action(userToken, 'ctfl', 'recordQuestionResult', args),
    ]);
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    expect((await action(userToken, 'ctfl', 'listQuestionStats')).body[0].seenCount).toBe(1);
    const session = practice();
    const attempt = {
      ...session,
      status: undefined,
      schemaVersion: undefined,
      sessionId: session.id,
      completedAt: '2026-10-04T10:01:00.000Z',
      durationSeconds: 60,
      completionReason: 'submitted',
      result: {
        score: 1,
        total: 1,
        answered: 1,
        percent: 100,
        passed: true,
        passMark: 1,
        byChapter: [],
        byKLevel: [],
        bySection: [],
      },
    };
    expect((await action(userToken, 'ctfl', 'completeSession', [attempt, null])).status).toBe(200);
    expect((await action(userToken, 'ctfl', 'completeSession', [attempt, null])).status).toBe(200);
    expect((await action(userToken, 'ctfl', 'listAttempts')).body).toHaveLength(1);
    expect((await action(userToken, 'ctfl', 'listActiveSessions')).body).toHaveLength(0);
    expect(
      (
        await action(userToken, 'ctfl', 'saveAttempt', [
          { ...attempt, result: { ...attempt.result, score: 0 } },
        ])
      ).status,
    ).toBe(409);
  });
  it('handles leases and vocabulary enrichment without resurrecting deleted records', async () => {
    expect(
      (await action(userToken, 'ctfl', 'acquireSessionLease', ['exam-lock', 'device-a', 15000]))
        .body,
    ).toBe(true);
    expect(
      (await action(userToken, 'ctfl', 'acquireSessionLease', ['exam-lock', 'device-b', 15000]))
        .body,
    ).toBe(false);
    expect(
      (await action(userToken, 'ctfl', 'renewSessionLease', ['exam-lock', 'device-b', 15000])).body,
    ).toBe(false);
    const pending = {
      term: 'hello',
      meaning: '',
      pronunciation: '',
      example: '',
      enrichment: 'pending',
    };
    expect((await action(userToken, 'ctfl', 'saveWord', [pending])).status).toBe(200);
    await action(userToken, 'ctfl', 'removeWord', ['hello']);
    expect(
      (
        await action(userToken, 'ctfl', 'updateWordEnrichment', [
          {
            ...pending,
            meaning: 'xin chào',
            pronunciation: 'hello',
            example: 'Hello!',
            enrichment: 'complete',
          },
          pending,
        ])
      ).body,
    ).toBe(false);
  });
  it('persists example attribution and rejects invalid example sources', async () => {
    const word = {
      term: 'shipment',
      meaning: 'lô hàng',
      pronunciation: '/ˈʃɪpmənt/',
      example: 'The shipment arrived.',
      exampleSource: 'Tatoeba',
      exampleSourceUrl: 'https://tatoeba.org/en/sentences/show/3657396',
      exampleAuthor: 'kerbear407',
      enrichment: 'complete',
    };
    expect((await action(userToken, 'toeic', 'saveWord', [word])).status).toBe(200);
    expect((await action(userToken, 'toeic', 'listWords')).body).toContainEqual(word);
    expect(
      (await action(userToken, 'toeic', 'saveWord', [{ ...word, exampleSource: 'Unknown source' }]))
        .status,
    ).toBe(400);
    expect(
      (
        await action(userToken, 'toeic', 'saveWord', [
          { ...word, exampleSourceUrl: 'https://evil.example' },
        ])
      ).status,
    ).toBe(400);
    await action(userToken, 'toeic', 'removeWord', [word.term]);
  });
  it('validates imports before writing and exports v3 without locks', async () => {
    const before = (await action(userToken, 'ctfl', 'exportProgress')).body;
    expect(before.schemaVersion).toBe(3);
    expect(Object.keys(before.settings).some((key) => key.startsWith('session-lock:'))).toBe(false);
    expect(
      (
        await action(userToken, 'ctfl', 'importProgress', [
          { ...before, certificateId: 'toeic' },
          'replace',
        ])
      ).status,
    ).toBe(400);
    expect((await action(userToken, 'ctfl', 'listAttempts')).body).toHaveLength(1);
  });
  it('guards the last Admin in SQL', async () => {
    expect(
      (await request(`/api/admin/users/${adminId}`, { method: 'DELETE', token: adminToken }))
        .status,
    ).toBe(409);
    const db = await runtime.getD1Database('DB');
    const repo = createD1Repository(db);
    const admin = await repo.findUser(adminId);
    await expect(
      repo.updateUser(
        { ...admin, role: 'user', tokenVersion: admin.tokenVersion + 1 },
        admin.tokenVersion,
      ),
    ).rejects.toMatchObject({ code: 'last_admin' });
  });
  it('requires maintenance, Admin and a separate secret for confidential migration exports', async () => {
    expect(
      (await request('/api/admin/migration/export?table=users', { token: adminToken })).status,
    ).toBe(409);
    await runtime.setOptions({
      ...workerOptions,
      bindings: {
        APP_ORIGIN: 'http://localhost:4200',
        JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters',
        ACCOUNT_MAINTENANCE: 'true',
        MIGRATION_SECRET: bootstrapSecret,
      },
    });
    try {
      expect((await action(userToken, 'ctfl', 'listAttempts')).status).toBe(503);
      expect((await request('/api/auth/me', { token: adminToken })).status).toBe(200);
      expect(
        (await request('/api/admin/migration/export?table=users', { token: adminToken })).status,
      ).toBe(403);
      const response = await runtime.dispatchFetch(
        'http://localhost:4200/api/admin/migration/export?table=users',
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'X-Account-Migration-Key': bootstrapSecret,
          },
        },
      );
      expect(response.status).toBe(200);
      const page = await response.json();
      expect(page.total).toBe(2);
      expect(page.rows[0].password_hash).toMatch(/^scrypt/);
      const blocked = await runtime.dispatchFetch(
        'http://localhost:4200/api/admin/migration/export?table=auth_sessions',
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'X-Account-Migration-Key': bootstrapSecret,
          },
        },
      );
      expect(blocked.status).toBe(400);
    } finally {
      await runtime.setOptions({
        ...workerOptions,
        bindings: {
          APP_ORIGIN: 'http://localhost:4200',
          JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters',
          BOOTSTRAP_SECRET: bootstrapSecret,
        },
      });
    }
  });
  it('soft deletion/password reset revoke sessions and restoration retains data', async () => {
    expect(
      (await request(`/api/admin/users/${userId}`, { method: 'DELETE', token: adminToken })).status,
    ).toBe(200);
    expect((await request('/api/auth/me', { token: userToken })).status).toBe(401);
    expect(
      (
        await request('/api/auth/login', {
          method: 'POST',
          body: { username: 'student', password },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(`/api/admin/users/${userId}/restore`, {
          method: 'POST',
          token: adminToken,
          body: {},
        })
      ).status,
    ).toBe(200);
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'student', password },
    });
    expect(login.status).toBe(200);
    expect((await action(login.body.accessToken, 'ctfl', 'listAttempts')).body).toHaveLength(1);
    expect(
      (
        await request(`/api/admin/users/${userId}/password`, {
          method: 'POST',
          token: adminToken,
          body: { password: 'Replacement-password-12345' },
        })
      ).status,
    ).toBe(200);
    expect((await request('/api/auth/me', { token: login.body.accessToken })).status).toBe(401);
  });
});
