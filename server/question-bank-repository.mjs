import { ApiError, requireCondition } from './errors.mjs';

const bankKey = 'certificate_id = ? AND bank_id = ?';
const versionKey = `${bankKey} AND bank_version = ?`;
const writableVersion = `EXISTS (
  SELECT 1 FROM question_bank_versions WHERE ${versionKey} AND checksum = ? AND verified_at IS NULL
)`;

export function createQuestionBankRepository(db) {
  function findVersion(key) {
    return db
      .prepare(`SELECT * FROM question_bank_versions WHERE ${versionKey}`)
      .bind(...key)
      .first();
  }

  return {
    async listActive(certificateId) {
      const { results } = await db
        .prepare(
          `SELECT bank.bank_id AS id, version.bank_version AS bankVersion,
                version.question_count AS questionCount, version.exam_ready AS examReady
         FROM question_banks bank JOIN question_bank_versions version
           ON version.certificate_id = bank.certificate_id AND version.bank_id = bank.bank_id
          AND version.bank_version = bank.active_version
         WHERE bank.certificate_id = ? AND version.published_at IS NOT NULL
         ORDER BY bank.bank_id`,
        )
        .bind(certificateId)
        .all();
      return results.map((row) => ({ ...row, examReady: Boolean(row.examReady) }));
    },
    findVersion,
    async getActiveVersion([certificateId, bankId]) {
      return (
        (await db
          .prepare(`SELECT active_version FROM question_banks WHERE ${bankKey}`)
          .bind(certificateId, bankId)
          .first('active_version')) ?? null
      );
    },
    async createDraft(key, checksum, manifest) {
      const [certificateId, bankId] = key;
      await db.batch([
        db
          .prepare(
            'INSERT INTO question_banks (certificate_id, bank_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
          )
          .bind(certificateId, bankId),
        db
          .prepare(
            `INSERT INTO question_bank_versions
           (certificate_id, bank_id, bank_version, checksum, manifest, question_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          )
          .bind(
            ...key,
            checksum,
            JSON.stringify(manifest),
            manifest.questionCount,
            new Date().toISOString(),
          ),
      ]);
      const version = await findVersion(key);
      requireCondition(version?.checksum === checksum, 'bank_version_checksum_conflict', 409);
      return version;
    },
    async writeEntries(key, checksum, entries) {
      const question = db.prepare(
        `INSERT INTO bank_questions (certificate_id, bank_id, bank_version, question_id, position, body)
         SELECT ?, ?, ?, ?, ?, ? WHERE ${writableVersion}
         ON CONFLICT (certificate_id, bank_id, bank_version, question_id) DO UPDATE
         SET position = excluded.position, body = excluded.body`,
      );
      const solution = db.prepare(
        `INSERT INTO bank_solutions (certificate_id, bank_id, bank_version, question_id, position, body)
         SELECT ?, ?, ?, ?, ?, ? WHERE ${writableVersion}
         ON CONFLICT (certificate_id, bank_id, bank_version, question_id) DO UPDATE
         SET position = excluded.position, body = excluded.body`,
      );
      const updateDraft = db
        .prepare(
          `UPDATE question_bank_versions SET draft_revision = draft_revision + 1
         WHERE ${versionKey} AND checksum = ? AND verified_at IS NULL`,
        )
        .bind(...key, checksum);
      const writes = entries.flatMap((entry) => [
        question.bind(
          ...key,
          entry.question.id,
          entry.position,
          JSON.stringify(entry.question),
          ...key,
          checksum,
        ),
        solution.bind(
          ...key,
          entry.solution.questionId,
          entry.solutionPosition,
          JSON.stringify(entry.solution),
          ...key,
          checksum,
        ),
      ]);
      try {
        await db.batch([...writes, updateDraft]);
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
          throw new ApiError(409, 'bank_position_conflict');
        }
        throw error;
      }
      return findVersion(key);
    },
    async readContents(key, manifest) {
      const [questions, solutions] = await db.batch([
        db
          .prepare(`SELECT body FROM bank_questions WHERE ${versionKey} ORDER BY position`)
          .bind(...key),
        db
          .prepare(`SELECT body FROM bank_solutions WHERE ${versionKey} ORDER BY position`)
          .bind(...key),
      ]);
      return {
        manifest: JSON.parse(manifest),
        questions: questions.results.map(({ body }) => JSON.parse(body)),
        solutions: solutions.results.map(({ body }) => JSON.parse(body)),
      };
    },
    async verifyVersion(key, draftRevision, examReady) {
      const result = await db
        .prepare(
          `UPDATE question_bank_versions SET verified_at = ?, exam_ready = ?
         WHERE ${versionKey} AND draft_revision = ? AND verified_at IS NULL`,
        )
        .bind(new Date().toISOString(), Number(examReady), ...key, draftRevision)
        .run();
      const version = await findVersion(key);
      requireCondition(
        result.meta.changes === 1 || version?.verified_at,
        'bank_draft_changed',
        409,
      );
      return version;
    },
    async activate([certificateId, bankId], bankVersion, previousVersion) {
      const key = [certificateId, bankId];
      const updateBank =
        bankVersion === null
          ? db
              .prepare(
                `UPDATE question_banks SET active_version = NULL WHERE ${bankKey} AND active_version IS ?`,
              )
              .bind(...key, previousVersion)
          : db
              .prepare(
                `UPDATE question_banks SET active_version = ? WHERE ${bankKey} AND active_version IS ?
             AND EXISTS (SELECT 1 FROM question_bank_versions WHERE ${versionKey} AND verified_at IS NOT NULL)`,
              )
              .bind(bankVersion, ...key, previousVersion, ...key, bankVersion);
      const statements = [updateBank];
      if (bankVersion !== null) {
        statements.push(
          db
            .prepare(
              `UPDATE question_bank_versions SET published_at = COALESCE(published_at, ?)
             WHERE ${versionKey} AND EXISTS (
               SELECT 1 FROM question_banks WHERE ${bankKey} AND active_version = ?
             )`,
            )
            .bind(new Date().toISOString(), ...key, bankVersion, ...key, bankVersion),
        );
      }
      // Mark the version as published in the same transaction that changes the
      // active pointer. A concurrent activation cannot publish a losing draft.
      const [updated] = await db.batch(statements);
      if (updated.meta.changes !== 1) {
        const current = await this.getActiveVersion(key);
        requireCondition(current === bankVersion, 'bank_activation_conflict', 409);
      }
    },
  };
}
