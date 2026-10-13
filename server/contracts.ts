/** Runtime-independent storage ports. A Node/PostgreSQL adapter must preserve these semantics. */
export interface UserRecord {
  id: string;
  username: string;
  usernameKey: string;
  email: string | null;
  role: 'admin' | 'user';
  passwordHash: string;
  deletedAt: string | null;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
}
export interface AuthRepository {
  findUser(id: string): Promise<UserRecord | null>;
  findUsername(username: string): Promise<UserRecord | null>;
  createUser(user: UserRecord, bootstrap?: boolean): Promise<boolean>;
  updateUser(user: UserRecord, expectedVersion: number): Promise<void>;
  listUsers(options: {
    search?: string;
    deleted?: boolean;
    page?: number;
  }): Promise<{ users: UserRecord[]; total: number; page: number }>;
  findSession(id: string): Promise<AuthSession | null>;
  createSession(session: AuthSession): Promise<void>;
  rotateSession(id: string, oldHash: string, newHash: string, now: number): Promise<boolean>;
  revokeSession(id: string): Promise<void>;
  consumeLimit(key: string, now: number, limit: number, windowMs: number): Promise<boolean>;
  exportPage(
    table: string,
    offset: number,
  ): Promise<{ table: string; rows: unknown[]; total: number; offset: number }>;
}
export interface AuthSession {
  id: string;
  userId: string;
  refreshHash: string;
  expiresAt: number;
  revokedAt: number | null;
}
export interface LearningRecord {
  kind: 'activeSessions' | 'attempts' | 'questionStats' | 'bookmarks' | 'settings' | 'words';
  key: string;
  value: unknown;
}
export interface LearningRepository {
  load(
    userId: string,
    certificateId: string,
  ): Promise<{ version: number; records: LearningRecord[] }>;
  /** All records commit atomically, only if the supplied version still matches. */
  commit(
    userId: string,
    certificateId: string,
    version: number,
    records: LearningRecord[],
  ): Promise<boolean>;
}
export interface SnapshotStorage {
  put(userId: string, certificateId: string, questions: unknown[]): Promise<string>;
  get(userId: string, certificateId: string, key: string): Promise<unknown[]>;
}
