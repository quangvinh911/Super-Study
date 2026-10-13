import { InvalidProgressExportError, validateProgressExport } from '../domain/progress-validation';
export { InvalidProgressExportError } from '../domain/progress-validation';
import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
import { CERTIFICATE } from '../../certificates/certificate-context';
import { CTFL } from '../../certificates/registry';
import { AuthService } from '../auth/auth.service';
import { AccountLearningClient } from '../auth/account-learning.client';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import {
  Attempt,
  Bookmark,
  ProgressExport,
  QuestionStat,
  SessionSnapshot,
  CertificateDefinition,
} from '../models';

export const PROGRESS_DATABASE_NAME = new InjectionToken<string>('CTFL progress database name', {
  factory: () => 'ctfl-practice',
});

const DATABASE_VERSION = 1;
const EXPORT_FORMAT = 'certificate-practice-progress' as const;
const SESSION_LOCK_PREFIX = 'session-lock:';

interface SettingRecord {
  readonly key: string;
  readonly value: unknown;
}

interface SessionLease {
  readonly ownerId: string;
  readonly expiresAt: number;
}

interface CtflDatabase extends DBSchema {
  activeSessions: {
    key: string;
    value: SessionSnapshot;
    indexes: { 'by-updated-at': string };
  };
  attempts: {
    key: string;
    value: Attempt;
    indexes: { 'by-completed-at': string; 'by-mode': string };
  };
  questionStats: {
    key: [string, number];
    value: QuestionStat;
    indexes: { 'by-question-id': string; 'by-updated-at': string };
  };
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: { 'by-created-at': string };
  };
  settings: {
    key: string;
    value: SettingRecord;
  };
}

const STORE_NAMES = [
  'activeSessions',
  'attempts',
  'questionStats',
  'bookmarks',
  'settings',
] as const;

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function nextQuestionStat(
  previous: QuestionStat | undefined,
  questionId: string,
  revision: number,
  correct: boolean,
  answeredAt: string,
): QuestionStat {
  return {
    questionId,
    revision,
    seenCount: (previous?.seenCount ?? 0) + 1,
    correctCount: (previous?.correctCount ?? 0) + (correct ? 1 : 0),
    incorrectCount: (previous?.incorrectCount ?? 0) + (correct ? 0 : 1),
    currentCorrectStreak: correct ? (previous?.currentCorrectStreak ?? 0) + 1 : 0,
    lastCorrect: correct,
    lastAnsweredAt: answeredAt,
    updatedAt: answeredAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSessionLease(value: unknown): value is SessionLease {
  return (
    isRecord(value) &&
    typeof value['ownerId'] === 'string' &&
    typeof value['expiresAt'] === 'number'
  );
}

@Injectable({ providedIn: 'root' })
export class ProgressRepository {
  readonly certificateId: string;
  private databasePromise?: Promise<IDBPDatabase<CtflDatabase>>;

  constructor(
    @Inject(PROGRESS_DATABASE_NAME) private readonly databaseName: string,
    @Optional() @Inject(CERTIFICATE) certificate: CertificateDefinition = CTFL,
    @Optional() @Inject(AuthService) private readonly auth: AuthService | null = null,
    @Optional()
    @Inject(AccountLearningClient)
    private readonly accountClient: AccountLearningClient | null = null,
  ) {
    this.certificateId = (certificate ?? CTFL).id;
  }

  private database(): Promise<IDBPDatabase<CtflDatabase>> {
    this.databasePromise ??= openDB<CtflDatabase>(this.databaseName, DATABASE_VERSION, {
      upgrade(database) {
        const sessions = database.createObjectStore('activeSessions', { keyPath: 'id' });
        sessions.createIndex('by-updated-at', 'updatedAt');

        const attempts = database.createObjectStore('attempts', { keyPath: 'id' });
        attempts.createIndex('by-completed-at', 'completedAt');
        attempts.createIndex('by-mode', 'mode');

        const stats = database.createObjectStore('questionStats', {
          keyPath: ['questionId', 'revision'],
        });
        stats.createIndex('by-question-id', 'questionId');
        stats.createIndex('by-updated-at', 'updatedAt');

        const bookmarks = database.createObjectStore('bookmarks', {
          keyPath: 'questionId',
        });
        bookmarks.createIndex('by-created-at', 'createdAt');

        database.createObjectStore('settings', { keyPath: 'key' });
      },
    });
    return this.databasePromise;
  }

  async saveActiveSession(snapshot: SessionSnapshot, ownerId?: string): Promise<void> {
    this.assertCertificate(snapshot);
    if (this.remote()) {
      await this.account.call(this.certificateId, 'saveActiveSession', [snapshot, ownerId ?? null]);
      return;
    }
    const database = await this.database();
    await database.put('activeSessions', clone(snapshot));
  }

  async getActiveSession(sessionId: string): Promise<SessionSnapshot | undefined> {
    if (this.remote()) {
      const value = await this.account.call(this.certificateId, 'getActiveSession', [sessionId]);
      return value === null
        ? undefined
        : this.account.parseProgressField(this.certificateId, 'activeSessions', [value])[0];
    }
    const database = await this.database();
    const snapshot = await database.get('activeSessions', sessionId);
    return snapshot ? clone(snapshot) : undefined;
  }

  async listActiveSessions(): Promise<SessionSnapshot[]> {
    if (this.remote())
      return this.account.parseProgressField(
        this.certificateId,
        'activeSessions',
        await this.account.call(this.certificateId, 'listActiveSessions'),
      );
    const database = await this.database();
    const sessions = await database.getAllFromIndex('activeSessions', 'by-updated-at');
    return sessions.reverse().map(clone);
  }

  async deleteActiveSession(sessionId: string): Promise<void> {
    if (this.remote()) {
      await this.account.call(this.certificateId, 'deleteActiveSession', [sessionId]);
      return;
    }
    const database = await this.database();
    await database.delete('activeSessions', sessionId);
  }

  async saveAttempt(attempt: Attempt): Promise<void> {
    this.assertCertificate(attempt);
    if (this.remote()) {
      await this.account.call(this.certificateId, 'saveAttempt', [attempt]);
      return;
    }
    const database = await this.database();
    await database.put('attempts', clone(attempt));
  }

  /** Atomically replaces an active session with its immutable attempt record. */
  async completeSession(attempt: Attempt, ownerId?: string): Promise<void> {
    this.assertCertificate(attempt);
    if (this.remote()) {
      await this.account.call(this.certificateId, 'completeSession', [attempt, ownerId ?? null]);
      return;
    }
    const database = await this.database();
    const transaction = database.transaction(
      ['activeSessions', 'attempts', 'questionStats'],
      'readwrite',
    );
    if (await transaction.objectStore('attempts').get(attempt.id)) {
      await transaction.done;
      return;
    }
    await transaction.objectStore('attempts').put(clone(attempt));
    await transaction.objectStore('activeSessions').delete(attempt.sessionId);
    if (attempt.mode === 'exam') {
      const stats = transaction.objectStore('questionStats');
      await Promise.all(
        attempt.questions.map(async ({ question }) => {
          const previous = await stats.get([question.id, question.revision]);
          await stats.put(
            nextQuestionStat(
              previous,
              question.id,
              question.revision,
              attempt.responses[question.id]?.isCorrect ?? false,
              attempt.completedAt,
            ),
          );
        }),
      );
    }
    await transaction.done;
  }

  async getAttempt(attemptId: string): Promise<Attempt | undefined> {
    if (this.remote()) {
      const value = await this.account.call(this.certificateId, 'getAttempt', [attemptId]);
      return value === null
        ? undefined
        : this.account.parseProgressField(this.certificateId, 'attempts', [value])[0];
    }
    const database = await this.database();
    const attempt = await database.get('attempts', attemptId);
    return attempt ? clone(attempt) : undefined;
  }

  async listAttempts(): Promise<Attempt[]> {
    if (this.remote())
      return this.account.parseProgressField(
        this.certificateId,
        'attempts',
        await this.account.call(this.certificateId, 'listAttempts'),
      );
    const database = await this.database();
    const attempts = await database.getAllFromIndex('attempts', 'by-completed-at');
    return attempts.reverse().map(clone);
  }

  async getQuestionStat(questionId: string, revision: number): Promise<QuestionStat | undefined> {
    if (this.remote()) {
      const value = await this.account.call(this.certificateId, 'getQuestionStat', [
        questionId,
        revision,
      ]);
      return value === null
        ? undefined
        : this.account.parseProgressField(this.certificateId, 'questionStats', [value])[0];
    }
    const database = await this.database();
    const stat = await database.get('questionStats', [questionId, revision]);
    return stat ? clone(stat) : undefined;
  }

  async listQuestionStats(): Promise<QuestionStat[]> {
    if (this.remote())
      return this.account.parseProgressField(
        this.certificateId,
        'questionStats',
        await this.account.call(this.certificateId, 'listQuestionStats'),
      );
    const database = await this.database();
    return (await database.getAll('questionStats')).map(clone);
  }

  async latestQuestionStats(): Promise<Map<string, QuestionStat>> {
    const latest = new Map<string, QuestionStat>();
    for (const stat of await this.listQuestionStats()) {
      const existing = latest.get(stat.questionId);
      if (!existing || stat.revision > existing.revision) {
        latest.set(stat.questionId, stat);
      }
    }
    return latest;
  }

  async recordQuestionResult(
    questionId: string,
    revision: number,
    correct: boolean,
    answeredAt = new Date().toISOString(),
    sessionId?: string,
  ): Promise<QuestionStat> {
    if (this.remote())
      return this.account.parseProgressField(this.certificateId, 'questionStats', [
        await this.account.call(this.certificateId, 'recordQuestionResult', [
          questionId,
          revision,
          correct,
          answeredAt,
          sessionId ?? null,
        ]),
      ])[0];
    const database = await this.database();
    const transaction = database.transaction(['questionStats', 'settings'], 'readwrite');
    const store = transaction.objectStore('questionStats');
    const previous = await store.get([questionId, revision]);
    const marker = sessionId ? `practice-result:${sessionId}:${questionId}` : null;
    const settings = transaction.objectStore('settings');
    if (marker && (await settings.get(marker)) && previous) {
      await transaction.done;
      return clone(previous);
    }
    const stat = nextQuestionStat(previous, questionId, revision, correct, answeredAt);
    await store.put(stat);
    if (marker) await settings.put({ key: marker, value: true });
    await transaction.done;
    return clone(stat);
  }

  async setBookmark(bookmark: Bookmark): Promise<void> {
    if (this.remote()) {
      await this.account.call(this.certificateId, 'setBookmark', [bookmark]);
      return;
    }
    const database = await this.database();
    await database.put('bookmarks', clone(bookmark));
  }

  async removeBookmark(questionId: string): Promise<void> {
    if (this.remote()) {
      await this.account.call(this.certificateId, 'removeBookmark', [questionId]);
      return;
    }
    const database = await this.database();
    await database.delete('bookmarks', questionId);
  }

  async isBookmarked(questionId: string): Promise<boolean> {
    if (this.remote()) return this.remoteBoolean('isBookmarked', [questionId]);
    const database = await this.database();
    return (await database.count('bookmarks', questionId)) > 0;
  }

  async listBookmarks(): Promise<Bookmark[]> {
    if (this.remote())
      return this.account.parseProgressField(
        this.certificateId,
        'bookmarks',
        await this.account.call(this.certificateId, 'listBookmarks'),
      );
    const database = await this.database();
    return (await database.getAllFromIndex('bookmarks', 'by-created-at')).reverse().map(clone);
  }

  async toggleBookmark(
    questionId: string,
    revision: number,
    now = new Date().toISOString(),
  ): Promise<boolean> {
    if (this.remote()) return this.remoteBoolean('toggleBookmark', [questionId, revision, now]);
    const database = await this.database();
    const transaction = database.transaction('bookmarks', 'readwrite');
    const existing = await transaction.store.get(questionId);
    if (existing) {
      await transaction.store.delete(questionId);
    } else {
      await transaction.store.put({ questionId, revision, createdAt: now });
    }
    await transaction.done;
    return !existing;
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    if (this.remote()) {
      const value = await this.account.call(this.certificateId, 'getSetting', [key]);
      return value === null ? undefined : (value as T);
    }
    const database = await this.database();
    const record = await database.get('settings', key);
    return record ? clone(record.value as T) : undefined;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    if (key.startsWith(SESSION_LOCK_PREFIX)) {
      throw new Error('Session lock keys are reserved.');
    }
    if (this.remote()) {
      await this.account.call(this.certificateId, 'setSetting', [key, value]);
      return;
    }
    const database = await this.database();
    await database.put('settings', { key, value: clone(value) });
  }

  async acquireSessionLease(
    sessionId: string,
    ownerId: string,
    ttlMs = 15_000,
    now = Date.now(),
  ): Promise<boolean> {
    if (this.remote())
      return this.remoteBoolean('acquireSessionLease', [sessionId, ownerId, ttlMs]);
    const database = await this.database();
    const transaction = database.transaction('settings', 'readwrite');
    const key = `${SESSION_LOCK_PREFIX}${sessionId}`;
    const existing = (await transaction.store.get(key))?.value;
    if (isSessionLease(existing) && existing.ownerId !== ownerId && existing.expiresAt > now) {
      await transaction.done;
      return false;
    }
    await transaction.store.put({ key, value: { ownerId, expiresAt: now + ttlMs } });
    await transaction.done;
    return true;
  }

  async renewSessionLease(
    sessionId: string,
    ownerId: string,
    ttlMs = 15_000,
    now = Date.now(),
  ): Promise<boolean> {
    if (this.remote()) return this.remoteBoolean('renewSessionLease', [sessionId, ownerId, ttlMs]);
    const database = await this.database();
    const transaction = database.transaction('settings', 'readwrite');
    const key = `${SESSION_LOCK_PREFIX}${sessionId}`;
    const existing = (await transaction.store.get(key))?.value;
    if (!isSessionLease(existing) || existing.ownerId !== ownerId) {
      await transaction.done;
      return false;
    }
    await transaction.store.put({ key, value: { ownerId, expiresAt: now + ttlMs } });
    await transaction.done;
    return true;
  }

  async releaseSessionLease(sessionId: string, ownerId: string): Promise<void> {
    if (this.remote()) {
      await this.account.call(this.certificateId, 'releaseSessionLease', [sessionId, ownerId]);
      return;
    }
    const database = await this.database();
    const transaction = database.transaction('settings', 'readwrite');
    const key = `${SESSION_LOCK_PREFIX}${sessionId}`;
    const existing = (await transaction.store.get(key))?.value;
    if (isSessionLease(existing) && existing.ownerId === ownerId) {
      await transaction.store.delete(key);
    }
    await transaction.done;
  }

  async exportProgress(now = new Date()): Promise<ProgressExport> {
    if (this.remote())
      return validateProgressExport(
        await this.account.call(this.certificateId, 'exportProgress'),
        this.certificateId,
      );
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES, 'readonly');
    const [activeSessions, attempts, questionStats, bookmarks, settingRecords] = await Promise.all([
      transaction.objectStore('activeSessions').getAll(),
      transaction.objectStore('attempts').getAll(),
      transaction.objectStore('questionStats').getAll(),
      transaction.objectStore('bookmarks').getAll(),
      transaction.objectStore('settings').getAll(),
    ]);
    await transaction.done;
    const settings = Object.fromEntries(
      settingRecords
        .filter(
          (record) =>
            !record.key.startsWith(SESSION_LOCK_PREFIX) &&
            !record.key.startsWith('practice-result:'),
        )
        .map((record) => [record.key, clone(record.value)]),
    );
    return {
      format: EXPORT_FORMAT,
      schemaVersion: 3,
      certificateId: this.certificateId,
      exportedAt: now.toISOString(),
      activeSessions: activeSessions.map(clone),
      attempts: attempts.map(clone),
      questionStats: questionStats.map(clone),
      bookmarks: bookmarks.map(clone),
      settings,
    };
  }

  async importProgress(
    input: unknown,
    mode: 'merge' | 'replace' = 'merge',
  ): Promise<ProgressExport> {
    const progress = validateProgressExport(input, this.certificateId);
    if (this.remote())
      return validateProgressExport(
        await this.account.call(this.certificateId, 'importProgress', [progress, mode]),
        this.certificateId,
      );
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES, 'readwrite');

    if (mode === 'replace') {
      await Promise.all(STORE_NAMES.map((name) => transaction.objectStore(name).clear()));
    }

    for (const session of progress.activeSessions) {
      const existing = await transaction.objectStore('activeSessions').get(session.id);
      if (!existing || existing.updatedAt <= session.updatedAt) {
        await transaction.objectStore('activeSessions').put(clone(session));
      }
    }
    for (const attempt of progress.attempts) {
      await transaction.objectStore('attempts').put(clone(attempt));
    }
    for (const stat of progress.questionStats) {
      const store = transaction.objectStore('questionStats');
      const existing = await store.get([stat.questionId, stat.revision]);
      if (!existing || existing.updatedAt <= stat.updatedAt) {
        await store.put(clone(stat));
      }
    }
    for (const bookmark of progress.bookmarks) {
      const store = transaction.objectStore('bookmarks');
      const existing = await store.get(bookmark.questionId);
      if (!existing || existing.createdAt > bookmark.createdAt) {
        await store.put(clone(bookmark));
      }
    }
    for (const [key, value] of Object.entries(progress.settings)) {
      if (!key.startsWith(SESSION_LOCK_PREFIX)) {
        await transaction.objectStore('settings').put({ key, value: clone(value) });
      }
    }
    await transaction.done;
    return clone(progress);
  }

  validateImport(input: unknown): void {
    validateProgressExport(input, this.certificateId);
  }

  async reset(): Promise<void> {
    if (this.remote()) {
      await this.account.call(this.certificateId, 'reset');
      return;
    }
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES, 'readwrite');
    await Promise.all(STORE_NAMES.map((name) => transaction.objectStore(name).clear()));
    await transaction.done;
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = undefined;
  }

  private remote(): boolean {
    if (this.auth?.user() && !this.accountClient)
      throw new Error('Account storage is not configured.');
    return Boolean(this.auth?.user());
  }

  private get account(): AccountLearningClient {
    if (!this.accountClient) throw new Error('Account storage is not configured.');
    return this.accountClient;
  }

  private async remoteBoolean(action: string, args: readonly unknown[]): Promise<boolean> {
    const result = await this.account.call(this.certificateId, action, args);
    if (typeof result !== 'boolean') throw new Error('Invalid learning response');
    return result;
  }

  private assertCertificate(record: { readonly certificateId?: string }): void {
    if ((record.certificateId ?? 'ctfl') !== this.certificateId) {
      throw new Error('Cannot save progress for another certificate.');
    }
  }
}
