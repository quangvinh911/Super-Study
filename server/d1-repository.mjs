import { randomUUID, createHash } from 'node:crypto';
import { ApiError, requireCondition } from './errors.mjs';

function userFromRow(row) {
  return row
    ? {
        id: row.id,
        username: row.username,
        usernameKey: row.username_key,
        email: row.email,
        role: row.role,
        passwordHash: row.password_hash,
        deletedAt: row.deleted_at,
        tokenVersion: row.token_version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}
function sessionFromRow(row) {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        refreshHash: row.refresh_hash,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      }
    : null;
}
export function createD1Repository(db) {
  const prepare = (sql, ...bindings) => db.prepare(sql).bind(...bindings);
  return {
    async exportPage(table, offset) {
      requireCondition(
        ['users', 'learning_scopes', 'learning_records'].includes(table),
        'invalid_export_table',
      );
      const order =
        table === 'users'
          ? 'id'
          : table === 'learning_scopes'
            ? 'user_id,certificate_id'
            : 'user_id,certificate_id,kind,key';
      const result = await db.batch([
        prepare(`SELECT * FROM ${table} ORDER BY ${order} LIMIT 100 OFFSET ?`, offset),
        prepare(`SELECT COUNT(*) AS total FROM ${table}`),
      ]);
      return { table, rows: result[0].results, total: result[1].results[0].total, offset };
    },
    async findUser(id) {
      return userFromRow(await prepare('SELECT * FROM users WHERE id=?', id).first());
    },
    async findUsername(key) {
      return userFromRow(await prepare('SELECT * FROM users WHERE username_key=?', key).first());
    },
    async listUsers({ search = '', deleted = false, page = 1 }) {
      const filter = deleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL';
      const query = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      const results = await db.batch([
        prepare(
          `SELECT * FROM users WHERE ${filter} AND username_key LIKE ? ESCAPE '\\' ORDER BY username_key LIMIT 25 OFFSET ?`,
          query.toLowerCase(),
          (page - 1) * 25,
        ),
        prepare(
          `SELECT COUNT(*) AS total FROM users WHERE ${filter} AND username_key LIKE ? ESCAPE '\\'`,
          query.toLowerCase(),
        ),
      ]);
      return {
        users: results[0].results.map(userFromRow),
        total: results[1].results[0].total,
        page,
      };
    },
    async createUser(user, bootstrap = false) {
      const condition = bootstrap ? 'WHERE NOT EXISTS(SELECT 1 FROM users)' : '';
      try {
        const result = await prepare(
          `INSERT INTO users(id,username,username_key,email,role,password_hash,deleted_at,token_version,created_at,updated_at)
          SELECT ?,?,?,?,?,?,?,?,?,? ${condition}`,
          user.id,
          user.username,
          user.usernameKey,
          user.email,
          user.role,
          user.passwordHash,
          user.deletedAt,
          user.tokenVersion,
          user.createdAt,
          user.updatedAt,
        ).run();
        return result.meta.changes === 1;
      } catch (error) {
        if (String(error).includes('UNIQUE constraint')) throw new ApiError(409, 'username_exists');
        throw error;
      }
    },
    async updateUser(user, expectedVersion) {
      try {
        const results = await db.batch([
          prepare(
            `UPDATE users SET username=?,username_key=?,email=?,role=?,password_hash=?,deleted_at=?,token_version=?,updated_at=? WHERE id=? AND token_version=?`,
            user.username,
            user.usernameKey,
            user.email,
            user.role,
            user.passwordHash,
            user.deletedAt,
            user.tokenVersion,
            user.updatedAt,
            user.id,
            expectedVersion,
          ),
          prepare(
            `UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND token_version=?)`,
            Date.now(),
            user.id,
            user.id,
            user.tokenVersion,
          ),
        ]);
        requireCondition(results[0].meta.changes === 1, 'concurrent_user_change', 409);
      } catch (error) {
        if (String(error).includes('last_admin')) throw new ApiError(409, 'last_admin');
        if (String(error).includes('UNIQUE constraint')) throw new ApiError(409, 'username_exists');
        throw error;
      }
    },
    async findSession(id) {
      return sessionFromRow(await prepare('SELECT * FROM auth_sessions WHERE id=?', id).first());
    },
    async createSession(session) {
      await prepare(
        'INSERT INTO auth_sessions(id,user_id,refresh_hash,expires_at) VALUES(?,?,?,?)',
        session.id,
        session.userId,
        session.refreshHash,
        session.expiresAt,
      ).run();
    },
    async rotateSession(id, oldHash, newHash, now) {
      const result = await prepare(
        `UPDATE auth_sessions SET refresh_hash=? WHERE id=? AND refresh_hash=? AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE users.id=auth_sessions.user_id AND deleted_at IS NULL)`,
        newHash,
        id,
        oldHash,
        now,
      ).run();
      return result.meta.changes === 1;
    },
    async revokeSession(id) {
      await prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?', Date.now(), id).run();
    },
    async consumeLimit(key, now, limit, windowMs) {
      const result = await prepare(
        `INSERT INTO auth_limits(key,count,reset_at) VALUES(?,1,?)
        ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
        reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END RETURNING count`,
        key,
        now + windowMs,
        now,
        now,
        now + windowMs,
      ).first();
      return result.count <= limit;
    },
    async load(userId, certificateId) {
      const results = await db.batch([
        prepare(
          'SELECT version FROM learning_scopes WHERE user_id=? AND certificate_id=?',
          userId,
          certificateId,
        ),
        prepare(
          `SELECT kind,key,body FROM learning_records WHERE user_id=? AND certificate_id=? AND generation=(SELECT operation_id FROM learning_scopes WHERE user_id=? AND certificate_id=?)`,
          userId,
          certificateId,
          userId,
          certificateId,
        ),
      ]);
      return {
        version: results[0].results[0]?.version ?? 0,
        records: results[1].results.map((row) => ({
          kind: row.kind,
          key: row.key,
          value: JSON.parse(row.body),
        })),
      };
    },
    async commit(userId, certificateId, version, records) {
      const operationId = randomUUID();
      // Stage bounded chunks privately, then publish a generation with one CAS.
      // Readers see either the old or the complete new generation, never a partial import.
      const chunks = [];
      let chunk = [];
      let bytes = 2;
      for (const item of records) {
        const row = { kind: item.kind, key: item.key, body: JSON.stringify(item.value) };
        const size = Buffer.byteLength(JSON.stringify(row)) + 1;
        requireCondition(size <= 384 * 1024, 'record_too_large', 413);
        if (bytes + size > 512 * 1024) {
          chunks.push(chunk);
          chunk = [];
          bytes = 2;
        }
        chunk.push(row);
        bytes += size;
      }
      if (chunk.length) chunks.push(chunk);
      try {
        for (const rows of chunks)
          await prepare(
            `INSERT INTO learning_records(user_id,certificate_id,generation,kind,key,body)
          SELECT ?,?,?,json_extract(value,'$.kind'),json_extract(value,'$.key'),json_extract(value,'$.body') FROM json_each(?)`,
            userId,
            certificateId,
            operationId,
            JSON.stringify(rows),
          ).run();
        const results = await db.batch([
          prepare(
            'INSERT INTO learning_scopes(user_id,certificate_id,version) VALUES(?,?,0) ON CONFLICT DO NOTHING',
            userId,
            certificateId,
          ),
          prepare(
            'UPDATE learning_scopes SET version=version+1,operation_id=? WHERE user_id=? AND certificate_id=? AND version=?',
            operationId,
            userId,
            certificateId,
            version,
          ),
          prepare(
            `DELETE FROM learning_records WHERE user_id=? AND certificate_id=? AND generation<>? AND EXISTS(SELECT 1 FROM learning_scopes WHERE user_id=? AND certificate_id=? AND operation_id=?)`,
            userId,
            certificateId,
            operationId,
            userId,
            certificateId,
            operationId,
          ),
        ]);
        return results[1].meta.changes === 1;
      } finally {
        await prepare(
          `DELETE FROM learning_records WHERE user_id=? AND certificate_id=? AND generation=? AND NOT EXISTS(SELECT 1 FROM learning_scopes WHERE user_id=? AND certificate_id=? AND operation_id=?)`,
          userId,
          certificateId,
          operationId,
          userId,
          certificateId,
          operationId,
        ).run();
      }
    },
  };
}

export function createR2SnapshotStorage(bucket) {
  return {
    async put(userId, certificateId, questions) {
      const body = JSON.stringify(questions);
      const hash = createHash('sha256').update(body).digest('hex');
      const key = `account-snapshots/${userId}/${certificateId}/${hash}.json`;
      if (!(await bucket.head(key)))
        await bucket.put(key, body, { httpMetadata: { contentType: 'application/json' } });
      return key;
    },
    async get(userId, certificateId, key) {
      requireCondition(
        key.startsWith(`account-snapshots/${userId}/${certificateId}/`),
        'invalid_snapshot_owner',
        403,
      );
      const object = await bucket.get(key);
      requireCondition(object, 'snapshot_unavailable', 503);
      const body = await object.text();
      const checksum = createHash('sha256').update(body).digest('hex');
      requireCondition(key.endsWith(`/${checksum}.json`), 'invalid_snapshot_checksum', 503);
      const questions = JSON.parse(body);
      requireCondition(Array.isArray(questions), 'invalid_snapshot', 503);
      return questions;
    },
  };
}
