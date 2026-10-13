import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
