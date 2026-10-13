import { createAccountApi } from './api.mjs';
import { createD1Repository, createR2SnapshotStorage } from './d1-repository.mjs';
export function accountRequest(request, env) {
  if (!env.DB || !env.MEDIA)
    return Response.json(
      { error: 'account_storage_not_configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  const repository = createD1Repository(env.DB);
  return createAccountApi({
    authRepository: repository,
    learningRepository: repository,
    snapshotStorage: createR2SnapshotStorage(env.MEDIA),
    migrationStorage: {
      get: (key) => env.MEDIA.get(key),
      async list(cursor) {
        const result = await env.MEDIA.list({ limit: 100, ...(cursor ? { cursor } : {}) });
        return {
          objects: result.objects.map((object) => ({ key: object.key, size: object.size })),
          cursor: result.truncated ? result.cursor : null,
        };
      },
    },
    config: env,
  })(request);
}
