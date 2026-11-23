import {
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    usernameKey: text('username_key').notNull(),
    email: text('email'),
    role: text('role', { enum: ['admin', 'user'] }).notNull(),
    passwordHash: text('password_hash').notNull(),
    deletedAt: text('deleted_at'),
    tokenVersion: integer('token_version').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('users_username_key_unique').on(table.usernameKey)],
);

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  refreshHash: text('refresh_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
});
export const authLimits = sqliteTable('auth_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: integer('reset_at').notNull(),
});
export const learningScopes = sqliteTable(
  'learning_scopes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    certificateId: text('certificate_id').notNull(),
    version: integer('version').notNull().default(0),
    operationId: text('operation_id').notNull().default(''),
  },
  (table) => [primaryKey({ columns: [table.userId, table.certificateId] })],
);
export const learningRecords = sqliteTable(
  'learning_records',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    certificateId: text('certificate_id').notNull(),
    generation: text('generation').notNull().default(''),
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    body: text('body').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.certificateId, table.generation, table.kind, table.key],
    }),
  ],
);

export const questionBanks = sqliteTable(
  'question_banks',
  {
    certificateId: text('certificate_id').notNull(),
    bankId: text('bank_id').notNull(),
    activeVersion: text('active_version'),
  },
  (table) => [primaryKey({ columns: [table.certificateId, table.bankId] })],
);

export const questionBankVersions = sqliteTable(
  'question_bank_versions',
  {
    certificateId: text('certificate_id').notNull(),
    bankId: text('bank_id').notNull(),
    bankVersion: text('bank_version').notNull(),
    checksum: text('checksum').notNull(),
    manifest: text('manifest').notNull(),
    questionCount: integer('question_count').notNull(),
    createdAt: text('created_at').notNull(),
    draftRevision: integer('draft_revision').notNull().default(0),
    verifiedAt: text('verified_at'),
    publishedAt: text('published_at'),
    examReady: integer('exam_ready', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.certificateId, table.bankId, table.bankVersion] }),
    foreignKey({
      columns: [table.certificateId, table.bankId],
      foreignColumns: [questionBanks.certificateId, questionBanks.bankId],
    }),
  ],
);

export const bankQuestions = sqliteTable(
  'bank_questions',
  {
    certificateId: text('certificate_id').notNull(),
    bankId: text('bank_id').notNull(),
    bankVersion: text('bank_version').notNull(),
    questionId: text('question_id').notNull(),
    position: integer('position').notNull(),
    body: text('body').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.certificateId, table.bankId, table.bankVersion, table.questionId],
    }),
    uniqueIndex('bank_questions_position').on(
      table.certificateId,
      table.bankId,
      table.bankVersion,
      table.position,
    ),
    foreignKey({
      columns: [table.certificateId, table.bankId, table.bankVersion],
      foreignColumns: [
        questionBankVersions.certificateId,
        questionBankVersions.bankId,
        questionBankVersions.bankVersion,
      ],
    }),
  ],
);

export const bankSolutions = sqliteTable(
  'bank_solutions',
  {
    certificateId: text('certificate_id').notNull(),
    bankId: text('bank_id').notNull(),
    bankVersion: text('bank_version').notNull(),
    questionId: text('question_id').notNull(),
    position: integer('position').notNull(),
    body: text('body').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.certificateId, table.bankId, table.bankVersion, table.questionId],
    }),
    uniqueIndex('bank_solutions_position').on(
      table.certificateId,
      table.bankId,
      table.bankVersion,
      table.position,
    ),
    foreignKey({
      columns: [table.certificateId, table.bankId, table.bankVersion, table.questionId],
      foreignColumns: [
        bankQuestions.certificateId,
        bankQuestions.bankId,
        bankQuestions.bankVersion,
        bankQuestions.questionId,
      ],
    }),
  ],
);
