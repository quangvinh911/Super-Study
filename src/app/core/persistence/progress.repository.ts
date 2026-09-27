import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
import { CERTIFICATE } from '../../certificates/certificate-context';
import { CTFL } from '../../certificates/registry';
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

export class InvalidProgressExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProgressExportError';
  }
}

function validDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function nonnegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validScoringPolicy(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['kind'] === 'raw' ||
      (value['kind'] === 'threshold' &&
        typeof value['passPercent'] === 'number' &&
        value['passPercent'] >= 0 &&
        value['passPercent'] <= 100))
  );
}

function validateSnapshotRecord(
  record: Record<string, unknown>,
  kind: 'activeSessions' | 'attempts',
): void {
  const fail = (): never => {
    throw new InvalidProgressExportError('Session or attempt data is malformed.');
  };
  if (record['scoringPolicy'] !== undefined && !validScoringPolicy(record['scoringPolicy'])) fail();
  if (
    !['practice', 'exam'].includes(String(record['mode'])) ||
    typeof record['bankVersion'] !== 'string' ||
    typeof record['seed'] !== 'string' ||
    !validDate(record['startedAt']) ||
    !isRecord(record['responses'])
  )
    fail();
  const questions = record['questions'] as Record<string, unknown>[];
  if (!questions.length) fail();
  const ids = new Set<string>();
  for (const item of questions) {
    const question = item['question'];
    const solution = item['solution'];
    if (!isRecord(question) || !isRecord(solution)) fail();
    const q = question as Record<string, unknown>;
    const s = solution as Record<string, unknown>;
    if (
      typeof q['id'] !== 'string' ||
      ids.has(q['id']) ||
      !nonnegativeInteger(q['revision']) ||
      !Array.isArray(q['stem']) ||
      !Array.isArray(q['options']) ||
      !isRecord(q['classification']) ||
      typeof q['classification']['section'] !== 'string' ||
      !isRecord(q['interaction']) ||
      !isRecord(q['provenance']) ||
      !isRecord(q['verification'])
    )
      fail();
    const id = q['id'] as string;
    ids.add(id);
    const optionIds = (q['options'] as unknown[]).map((option) =>
      isRecord(option) && typeof option['id'] === 'string' && Array.isArray(option['content'])
        ? option['id']
        : null,
    );
    if (
      optionIds.length < 2 ||
      optionIds.includes(null) ||
      new Set(optionIds).size !== optionIds.length ||
      s['questionId'] !== id ||
      !Array.isArray(s['correctOptionIds']) ||
      !s['correctOptionIds'].length ||
      !s['correctOptionIds'].every((option) => optionIds.includes(option)) ||
      !Array.isArray(s['explanation']) ||
      !Array.isArray(s['references'])
    )
      fail();
    const response = (record['responses'] as Record<string, unknown>)[id];
    if (
      !isRecord(response) ||
      response['questionId'] !== id ||
      !Array.isArray(response['selectedOptionIds']) ||
      !response['selectedOptionIds'].every((option) => optionIds.includes(option)) ||
      typeof response['checked'] !== 'boolean' ||
      typeof response['flagged'] !== 'boolean'
    )
      fail();
  }
  if (kind === 'activeSessions') {
    if (
      record['schemaVersion'] !== 1 ||
      !['active', 'completed', 'expired'].includes(String(record['status'])) ||
      !validDate(record['createdAt']) ||
      !validDate(record['updatedAt']) ||
      !nonnegativeInteger(record['currentIndex']) ||
      Number(record['currentIndex']) >= questions.length
    )
      fail();
    if (
      record['mode'] === 'exam' &&
      (!validDate(record['deadlineAt']) ||
        !nonnegativeInteger(record['durationMinutes']) ||
        Number(record['durationMinutes']) === 0)
    )
      fail();
  } else {
    const result = record['result'];
    if (
      typeof record['sessionId'] !== 'string' ||
      !validDate(record['completedAt']) ||
      !nonnegativeInteger(record['durationSeconds']) ||
      !['submitted', 'expired'].includes(String(record['completionReason'])) ||
      !isRecord(result)
    )
      fail();
    const r = result as Record<string, unknown>;
    if (
      !nonnegativeInteger(r['score']) ||
      r['total'] !== questions.length ||
      !nonnegativeInteger(r['answered']) ||
      Number(r['answered']) > questions.length ||
      Number(r['score']) > questions.length ||
      typeof r['percent'] !== 'number' ||
      !Number.isFinite(r['percent']) ||
      r['percent'] < 0 ||
      r['percent'] > 100 ||
      !(r['passed'] === null || typeof r['passed'] === 'boolean') ||
      !(r['passMark'] === null || nonnegativeInteger(r['passMark']))
    )
      fail();
    for (const key of ['byChapter', 'byKLevel', 'bySection']) {
      if (key === 'bySection' && r[key] === undefined) continue;
      if (
        !Array.isArray(r[key]) ||
        !(r[key] as unknown[]).every(
          (row) =>
            isRecord(row) &&
            ['string', 'number'].includes(typeof row['key']) &&
            ['total', 'correct', 'answered'].every((field) => nonnegativeInteger(row[field])) &&
            typeof row['percent'] === 'number' &&
            Number.isFinite(row['percent']),
        )
      )
        fail();
    }
  }
  const exam = record['examDefinition'];
  if (record['mode'] === 'exam' && (record['certificateId'] ?? 'ctfl') !== 'ctfl' && !exam) fail();
  if (exam !== undefined) {
    if (
      !isRecord(exam) ||
      !Array.isArray(exam['durations']) ||
      !exam['durations'].every((value) => typeof value === 'number' && value > 0) ||
      !nonnegativeInteger(exam['questionCount']) ||
      typeof exam['label'] !== 'string' ||
      !isRecord(exam['scoring'])
    )
      fail();
    const definition = exam as Record<string, unknown>;
    const scoring = definition['scoring'] as Record<string, unknown>;
    if (!validScoringPolicy(scoring)) fail();
    if (
      definition['sections'] !== undefined &&
      (!Array.isArray(definition['sections']) ||
        !definition['sections'].every(
          (section) =>
            isRecord(section) &&
            typeof section['label'] === 'string' &&
            typeof section['durationMinutes'] === 'number' &&
            section['durationMinutes'] > 0 &&
            Array.isArray(section['parts']) &&
            section['parts'].every(
              (part) =>
                isRecord(part) &&
                typeof part['id'] === 'string' &&
                nonnegativeInteger(part['count']),
            ),
        ))
    )
      fail();
  }
}

function validateProgressExport(value: unknown, certificateId: string): ProgressExport {
  if (!isRecord(value)) {
    throw new InvalidProgressExportError('Progress import must be a JSON object.');
  }
  const legacy = value['format'] === 'ctfl-practice-progress' && value['schemaVersion'] === 1;
  if (!legacy && (value['format'] !== EXPORT_FORMAT || value['schemaVersion'] !== 2)) {
    throw new InvalidProgressExportError('Unsupported progress export format or version.');
  }
  if ((legacy ? 'ctfl' : value['certificateId']) !== certificateId) {
    throw new InvalidProgressExportError('This export belongs to a different certificate.');
  }
  for (const field of ['activeSessions', 'attempts', 'questionStats', 'bookmarks'] as const) {
    if (!Array.isArray(value[field])) {
      throw new InvalidProgressExportError(`Progress field "${field}" must be an array.`);
    }
    for (const record of value[field] as unknown[]) {
      if (!isRecord(record)) throw new InvalidProgressExportError('Invalid progress record.');
      if (field === 'activeSessions' || field === 'attempts') {
        if (
          (record['certificateId'] ?? 'ctfl') !== certificateId ||
          typeof record['id'] !== 'string' ||
          !Array.isArray(record['questions'])
        ) {
          throw new InvalidProgressExportError(
            'Session belongs to a different certificate or is malformed.',
          );
        }
        for (const item of record['questions']) {
          if (
            !isRecord(item) ||
            !isRecord(item['question']) ||
            (item['question']['certificateId'] ?? 'ctfl') !== certificateId
          ) {
            throw new InvalidProgressExportError('Question belongs to a different certificate.');
          }
        }
        validateSnapshotRecord(record, field);
      } else if (
        typeof record['questionId'] !== 'string' ||
        !Number.isInteger(record['revision'])
      ) {
        throw new InvalidProgressExportError('Invalid question progress record.');
      } else if (
        field === 'questionStats' &&
        (!['seenCount', 'correctCount', 'incorrectCount', 'currentCorrectStreak'].every((key) =>
          nonnegativeInteger(record[key]),
        ) ||
          !validDate(record['updatedAt']))
      ) {
        throw new InvalidProgressExportError('Invalid question counters.');
      } else if (field === 'bookmarks' && !validDate(record['createdAt'])) {
        throw new InvalidProgressExportError('Invalid bookmark timestamp.');
      }
    }
  }
  if (!isRecord(value['settings']) || typeof value['exportedAt'] !== 'string') {
    throw new InvalidProgressExportError('Progress settings or export timestamp is invalid.');
  }
  return clone(value) as unknown as ProgressExport;
}

@Injectable({ providedIn: 'root' })
export class ProgressRepository {
  readonly certificateId: string;
  private databasePromise?: Promise<IDBPDatabase<CtflDatabase>>;

  constructor(
    @Inject(PROGRESS_DATABASE_NAME) private readonly databaseName: string,
    @Optional() @Inject(CERTIFICATE) certificate: CertificateDefinition = CTFL,
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

  async saveActiveSession(snapshot: SessionSnapshot): Promise<void> {
    this.assertCertificate(snapshot);
    const database = await this.database();
    await database.put('activeSessions', clone(snapshot));
  }

  async getActiveSession(sessionId: string): Promise<SessionSnapshot | undefined> {
    const database = await this.database();
    const snapshot = await database.get('activeSessions', sessionId);
    return snapshot ? clone(snapshot) : undefined;
  }

  async listActiveSessions(): Promise<SessionSnapshot[]> {
    const database = await this.database();
    const sessions = await database.getAllFromIndex('activeSessions', 'by-updated-at');
    return sessions.reverse().map(clone);
  }

  async deleteActiveSession(sessionId: string): Promise<void> {
    const database = await this.database();
    await database.delete('activeSessions', sessionId);
  }

  async saveAttempt(attempt: Attempt): Promise<void> {
    this.assertCertificate(attempt);
    const database = await this.database();
    await database.put('attempts', clone(attempt));
  }

  /** Atomically replaces an active session with its immutable attempt record. */
  async completeSession(attempt: Attempt): Promise<void> {
    this.assertCertificate(attempt);
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
    const database = await this.database();
    const attempt = await database.get('attempts', attemptId);
    return attempt ? clone(attempt) : undefined;
  }

  async listAttempts(): Promise<Attempt[]> {
    const database = await this.database();
    const attempts = await database.getAllFromIndex('attempts', 'by-completed-at');
    return attempts.reverse().map(clone);
  }

  async getQuestionStat(questionId: string, revision: number): Promise<QuestionStat | undefined> {
    const database = await this.database();
    const stat = await database.get('questionStats', [questionId, revision]);
    return stat ? clone(stat) : undefined;
  }

  async listQuestionStats(): Promise<QuestionStat[]> {
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
  ): Promise<QuestionStat> {
    const database = await this.database();
    const transaction = database.transaction('questionStats', 'readwrite');
    const store = transaction.objectStore('questionStats');
    const previous = await store.get([questionId, revision]);
    const stat = nextQuestionStat(previous, questionId, revision, correct, answeredAt);
    await store.put(stat);
    await transaction.done;
    return clone(stat);
  }

  async setBookmark(bookmark: Bookmark): Promise<void> {
    const database = await this.database();
    await database.put('bookmarks', clone(bookmark));
  }

  async removeBookmark(questionId: string): Promise<void> {
    const database = await this.database();
    await database.delete('bookmarks', questionId);
  }

  async isBookmarked(questionId: string): Promise<boolean> {
    const database = await this.database();
    return (await database.count('bookmarks', questionId)) > 0;
  }

  async listBookmarks(): Promise<Bookmark[]> {
    const database = await this.database();
    return (await database.getAllFromIndex('bookmarks', 'by-created-at')).reverse().map(clone);
  }

  async toggleBookmark(
    questionId: string,
    revision: number,
    now = new Date().toISOString(),
  ): Promise<boolean> {
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
    const database = await this.database();
    const record = await database.get('settings', key);
    return record ? clone(record.value as T) : undefined;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    if (key.startsWith(SESSION_LOCK_PREFIX)) {
      throw new Error('Session lock keys are reserved.');
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
        .filter((record) => !record.key.startsWith(SESSION_LOCK_PREFIX))
        .map((record) => [record.key, clone(record.value)]),
    );
    return {
      format: EXPORT_FORMAT,
      schemaVersion: 2,
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
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES, 'readwrite');
    await Promise.all(STORE_NAMES.map((name) => transaction.objectStore(name).clear()));
    await transaction.done;
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = undefined;
  }

  private assertCertificate(record: { readonly certificateId?: string }): void {
    if ((record.certificateId ?? 'ctfl') !== this.certificateId) {
      throw new Error('Cannot save progress for another certificate.');
    }
  }
}
