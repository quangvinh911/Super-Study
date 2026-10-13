import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { createAuth, publicUser, userFields, validatePassword } from './auth.mjs';
import { hashPassword } from './passwords.mjs';
import { ApiError, readJson, requireCondition } from './errors.mjs';
import { createLearningService } from './learning.mjs';

const json = (body, status = 200, cookie) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
export function createAccountApi({
  authRepository,
  learningRepository,
  snapshotStorage,
  migrationStorage,
  config,
}) {
  const auth = createAuth(authRepository, config);
  const learning = createLearningService(learningRepository, snapshotStorage);
  return async function accountApi(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === '/api/capabilities' && request.method === 'GET')
        return json({ guestPracticeLimit: 10 });
      const migrationPath =
        path === '/api/admin/migration/export' || path === '/api/admin/migration/object';
      const identityPath = [
        '/api/auth/login',
        '/api/auth/refresh',
        '/api/auth/me',
        '/api/auth/logout',
      ].includes(path);
      if (config.ACCOUNT_MAINTENANCE === 'true' && !migrationPath && !identityPath)
        throw new ApiError(503, 'account_maintenance');
      if (path === '/api/auth/bootstrap' && request.method === 'POST')
        return json(await auth.bootstrap(request, await readJson(request, 8192)), 201);
      if (path === '/api/auth/login' && request.method === 'POST') {
        const result = await auth.login(request, await readJson(request, 8192));
        return json(result.body, 200, result.cookie);
      }
      if (path === '/api/auth/refresh' && request.method === 'POST') {
        const result = await auth.refresh(request);
        return json(result.body, 200, result.cookie);
      }
      const { user, session } = await auth.authenticate(request);
      if (migrationPath && request.method === 'GET') {
        requireCondition(user.role === 'admin', 'forbidden', 403);
        requireCondition(
          config.ACCOUNT_MAINTENANCE === 'true' &&
            typeof config.MIGRATION_SECRET === 'string' &&
            config.MIGRATION_SECRET.length >= 32,
          'migration_disabled',
          409,
        );
        const hash = (value) => createHash('sha256').update(value).digest();
        requireCondition(
          timingSafeEqual(
            hash(config.MIGRATION_SECRET),
            hash(request.headers.get('X-Account-Migration-Key') || ''),
          ),
          'forbidden',
          403,
        );
        requireCondition(migrationStorage, 'migration_unavailable', 503);
        if (path.endsWith('/object')) {
          const key = url.searchParams.get('key');
          requireCondition(
            typeof key === 'string' && key.length <= 1024 && !key.includes('..'),
            'invalid_key',
          );
          const object = await migrationStorage.get(key);
          requireCondition(object, 'not_found', 404);
          return new Response(object.body, {
            headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
          });
        }
        const table = url.searchParams.get('table');
        if (table === 'objects')
          return json(await migrationStorage.list(url.searchParams.get('cursor') || undefined));
        const offset = Number(url.searchParams.get('offset') || 0);
        requireCondition(Number.isSafeInteger(offset) && offset >= 0);
        return json(await authRepository.exportPage(table, offset));
      }
      if (path === '/api/auth/me' && request.method === 'GET') return json(publicUser(user));
      if (path === '/api/auth/logout' && request.method === 'POST') {
        auth.origin(request);
        await authRepository.revokeSession(session.id);
        return json({ ok: true }, 200, auth.cookie('', 0));
      }
      if (path.startsWith('/api/admin/users')) {
        requireCondition(user.role === 'admin', 'forbidden', 403);
        if (request.method !== 'GET') auth.origin(request);
        const match = path.match(
          /^\/api\/admin\/users(?:\/([a-f0-9-]{36})(?:\/(password|restore))?)?$/,
        );
        requireCondition(match, 'not_found', 404);
        const id = match[1];
        const operation = match[2];
        if (!id && request.method === 'GET') {
          const page = Number(url.searchParams.get('page') || 1);
          requireCondition(Number.isInteger(page) && page >= 1 && page <= 100000);
          const search = url.searchParams.get('search') || '';
          requireCondition(search.length <= 50);
          const result = await authRepository.listUsers({
            page,
            search,
            deleted: url.searchParams.get('deleted') === 'true',
          });
          return json({ ...result, users: result.users.map(publicUser) });
        }
        if (!id && request.method === 'POST') {
          const input = await readJson(request, 8192);
          const fields = userFields(input, true);
          const now = new Date().toISOString();
          const created = {
            id: randomUUID(),
            ...fields,
            passwordHash: await hashPassword(input.password),
            tokenVersion: 0,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          };
          await authRepository.createUser(created);
          return json(publicUser(created), 201);
        }
        requireCondition(id, 'method_not_allowed', 405);
        const target = await authRepository.findUser(id);
        requireCondition(target, 'not_found', 404);
        const next = {
          ...target,
          tokenVersion: target.tokenVersion + 1,
          updatedAt: new Date().toISOString(),
        };
        if (operation === 'password' && request.method === 'POST') {
          const input = await readJson(request, 8192);
          validatePassword(input.password);
          next.passwordHash = await hashPassword(input.password);
        } else if (operation === 'restore' && request.method === 'POST') next.deletedAt = null;
        else if (!operation && request.method === 'DELETE') {
          requireCondition(user.id !== id, 'cannot_delete_self', 409);
          next.deletedAt = new Date().toISOString();
        } else if (!operation && request.method === 'PATCH') {
          Object.assign(next, userFields(await readJson(request, 8192)));
          requireCondition(user.id !== id || next.role === 'admin', 'cannot_demote_self', 409);
        } else throw new ApiError(405, 'method_not_allowed');
        await authRepository.updateUser(next, target.tokenVersion);
        return json(publicUser(next));
      }
      const match = path.match(/^\/api\/learning\/(ctfl|toeic)$/);
      if (match && request.method === 'POST') {
        auth.origin(request);
        const input = await readJson(request);
        return json(await learning(user.id, match[1], input));
      }
      throw new ApiError(404, 'not_found');
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.code }, error.status);
      console.error(
        'Account API failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return json({ error: 'service_unavailable' }, 503);
    }
  };
}
