import { createHash } from 'node:crypto';
import { validateProgressExport } from '../src/app/core/domain/progress-validation.ts';
import { ApiError, requireCondition, record } from './errors.mjs';

const progressKinds = ['activeSessions', 'attempts', 'questionStats', 'bookmarks', 'settings'];
const readActions = new Set([
  'getActiveSession',
  'listActiveSessions',
  'getAttempt',
  'listAttempts',
  'getQuestionStat',
  'listQuestionStats',
  'getSetting',
  'isBookmarked',
  'listBookmarks',
  'exportProgress',
  'listWords',
]);
function stat(previous, id, revision, correct, at) {
  return {
    questionId: id,
    revision,
    seenCount: (previous?.seenCount ?? 0) + 1,
    correctCount: (previous?.correctCount ?? 0) + (correct ? 1 : 0),
    incorrectCount: (previous?.incorrectCount ?? 0) + (correct ? 0 : 1),
    currentCorrectStreak: correct ? (previous?.currentCorrectStreak ?? 0) + 1 : 0,
    lastCorrect: correct,
    lastAnsweredAt: at,
    updatedAt: at,
  };
}
const termKey = (term) => term.trim().toLowerCase().replace(/\s+/g, ' ');
function validWord(entry) {
  requireCondition(
    record(entry) &&
      typeof entry.term === 'string' &&
      entry.term.trim().length > 0 &&
      entry.term.length <= 120,
    'invalid_word',
  );
  for (const [name, maximum] of [
    ['meaning', 2000],
    ['pronunciation', 200],
    ['example', 4000],
  ]) {
    requireCondition(
      typeof entry[name] === 'string' && entry[name].length <= maximum,
      'invalid_word',
    );
  }
  requireCondition(
    entry.englishMeaning === undefined ||
      (typeof entry.englishMeaning === 'string' && entry.englishMeaning.length <= 2000),
    'invalid_word',
  );
  requireCondition(
    ['pending', 'failed', 'partial'].includes(entry.enrichment) ||
      [entry.meaning, entry.pronunciation, entry.example].every((item) => item.trim()),
    'invalid_word',
  );
  requireCondition(
    !entry.sourceUrl ||
      (typeof entry.sourceUrl === 'string' && /^https:\/\//.test(entry.sourceUrl)),
    'invalid_word',
  );
  requireCondition(
    entry.exampleSource === undefined ||
      ['Free Dictionary API', 'Tatoeba'].includes(entry.exampleSource),
    'invalid_word',
  );
  requireCondition(
    entry.exampleSourceUrl === undefined ||
      (typeof entry.exampleSourceUrl === 'string' &&
        /^https:\/\/tatoeba\.org\/en\/sentences\/show\/[1-9]\d*$/.test(entry.exampleSourceUrl)),
    'invalid_word',
  );
  requireCondition(
    entry.exampleAuthor === undefined ||
      (typeof entry.exampleAuthor === 'string' &&
        entry.exampleAuthor.trim() &&
        entry.exampleAuthor.length <= 100),
    'invalid_word',
  );
  requireCondition(
    entry.exampleSource !== 'Tatoeba' || (entry.exampleSourceUrl && entry.exampleAuthor),
    'invalid_word',
  );
}
function clean(value) {
  if (!value) return value;
  const { _snapshotKey, ...body } = value;
  return body;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
function equal(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function validateSnapshot(value, kind, certificateId) {
  const empty = {
    format: 'certificate-practice-progress',
    schemaVersion: 3,
    certificateId,
    exportedAt: new Date().toISOString(),
    activeSessions: [],
    attempts: [],
    questionStats: [],
    bookmarks: [],
    settings: {},
  };
  try {
    validateProgressExport({ ...empty, [kind]: [value] }, certificateId);
  } catch {
    throw new ApiError(400, 'invalid_progress');
  }
}

export function createLearningService(repository, snapshots) {
  async function load(userId, certificateId, action, args) {
    const state = await repository.load(userId, certificateId);
    for (const item of state.records) {
      const all = action === 'exportProgress' || action === 'importProgress';
      const active =
        item.kind === 'activeSessions' &&
        (all ||
          action === 'listActiveSessions' ||
          (action === 'getActiveSession' && item.key === args[0]) ||
          (action === 'saveActiveSession' && item.key === args[0]?.id) ||
          (action === 'completeSession' && item.key === args[0]?.sessionId) ||
          (action === 'recordQuestionResult' && item.key === args[4]));
      const attempt =
        item.kind === 'attempts' &&
        (all ||
          action === 'listAttempts' ||
          (action === 'getAttempt' && item.key === args[0]) ||
          (['saveAttempt', 'completeSession'].includes(action) && item.key === args[0]?.id));
      if ((active || attempt) && item.value._snapshotKey) {
        item.value.questions = await snapshots.get(userId, certificateId, item.value._snapshotKey);
      }
    }
    return state;
  }
  async function commit(userId, certificateId, state) {
    const records = [];
    for (const item of state.records) {
      if (item.kind !== 'activeSessions' && item.kind !== 'attempts') {
        records.push(item);
        continue;
      }
      const { questions, ...metadata } = item.value;
      const key = metadata._snapshotKey || (await snapshots.put(userId, certificateId, questions));
      records.push({ ...item, value: { ...metadata, _snapshotKey: key } });
    }
    return repository.commit(userId, certificateId, state.version, records);
  }
  return async function perform(userId, certificateId, input) {
    requireCondition(['ctfl', 'toeic'].includes(certificateId), 'unknown_certificate', 404);
    requireCondition(
      record(input) &&
        typeof input.action === 'string' &&
        Array.isArray(input.args) &&
        input.args.length <= 6,
    );
    const { action, args } = input;
    for (let retry = 0; retry < 5; retry++) {
      const state = await load(userId, certificateId, action, args);
      const find = (kind, key) =>
        state.records.find((item) => item.kind === kind && item.key === String(key))?.value;
      const list = (kind) =>
        state.records.filter((item) => item.kind === kind).map((item) => clean(item.value));
      const remove = (kind, key) => {
        state.records = state.records.filter(
          (item) => item.kind !== kind || item.key !== String(key),
        );
      };
      const put = (kind, key, value) => {
        remove(kind, key);
        state.records.push({ kind, key: String(key), value });
      };
      const key = args[0];
      let result = null;
      requireCondition(args.every((value) => value !== undefined));
      switch (action) {
        case 'getActiveSession':
          result = clean(find('activeSessions', key));
          break;
        case 'listActiveSessions':
          result = list('activeSessions').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          break;
        case 'getAttempt':
          result = clean(find('attempts', key));
          break;
        case 'listAttempts':
          result = list('attempts').sort((a, b) => b.completedAt.localeCompare(a.completedAt));
          break;
        case 'getQuestionStat':
          result = find('questionStats', JSON.stringify([key, args[1]]));
          break;
        case 'listQuestionStats':
          result = list('questionStats');
          break;
        case 'getSetting':
          requireCondition(typeof key === 'string' && !key.startsWith('session-lock:'));
          result = find('settings', key);
          break;
        case 'isBookmarked':
          result = Boolean(find('bookmarks', key));
          break;
        case 'listBookmarks':
          result = list('bookmarks').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          break;
        case 'listWords':
          result = list('words').sort((a, b) => a.term.localeCompare(b.term));
          break;
        case 'saveActiveSession': {
          const value = clean(args[0]);
          validateSnapshot(value, 'activeSessions', certificateId);
          requireCondition(!find('attempts', value.id), 'session_completed', 409);
          const existing = find('activeSessions', value.id);
          if (existing) {
            requireCondition(
              equal(existing.questions, value.questions) &&
                existing.startedAt === value.startedAt &&
                existing.deadlineAt === value.deadlineAt &&
                equal(existing.examDefinition, value.examDefinition),
              'immutable_session',
              409,
            );
            requireCondition(existing.updatedAt <= value.updatedAt, 'stale_session', 409);
          }
          if (value.mode === 'exam') {
            const lease = find('settings', `session-lock:${value.id}`);
            requireCondition(
              lease && lease.ownerId === args[1] && lease.expiresAt > Date.now(),
              'session_locked',
              409,
            );
          }
          put('activeSessions', value.id, {
            ...value,
            ...(existing?._snapshotKey ? { _snapshotKey: existing._snapshotKey } : {}),
          });
          break;
        }
        case 'deleteActiveSession':
          remove('activeSessions', key);
          break;
        case 'saveAttempt':
        case 'completeSession': {
          const attempt = clean(args[0]);
          validateSnapshot(attempt, 'attempts', certificateId);
          const previous = find('attempts', attempt.id);
          if (previous) {
            requireCondition(equal(clean(previous), attempt), 'immutable_attempt', 409);
            break;
          }
          const active = find('activeSessions', attempt.sessionId);
          if (action === 'completeSession') {
            requireCondition(
              active && equal(active.questions, attempt.questions),
              'invalid_session',
              409,
            );
            if (attempt.mode === 'exam') {
              const lease = find('settings', `session-lock:${attempt.sessionId}`);
              requireCondition(
                lease && lease.ownerId === args[1] && lease.expiresAt > Date.now(),
                'session_locked',
                409,
              );
            }
          }
          put('attempts', attempt.id, {
            ...attempt,
            ...(active?._snapshotKey ? { _snapshotKey: active._snapshotKey } : {}),
          });
          if (action === 'completeSession') {
            remove('activeSessions', attempt.sessionId);
            remove('settings', `session-lock:${attempt.sessionId}`);
            if (attempt.mode === 'exam')
              for (const { question } of attempt.questions) {
                const statKey = JSON.stringify([question.id, question.revision]);
                put(
                  'questionStats',
                  statKey,
                  stat(
                    find('questionStats', statKey),
                    question.id,
                    question.revision,
                    attempt.responses[question.id]?.isCorrect ?? false,
                    attempt.completedAt,
                  ),
                );
              }
          }
          break;
        }
        case 'recordQuestionResult': {
          const [id, revision, correct, answeredAt, sessionId] = args;
          requireCondition(typeof sessionId === 'string', 'session_required');
          const active = find('activeSessions', sessionId);
          const question = active?.questions.find((item) => item.question.id === id)?.question;
          requireCondition(
            active?.mode === 'practice' &&
              question?.revision === revision &&
              typeof correct === 'boolean' &&
              Number.isFinite(Date.parse(answeredAt)),
            'invalid_question_result',
          );
          const eventKey = `practice-result:${sessionId}:${id}`;
          const statKey = JSON.stringify([id, revision]);
          if (!find('settings', eventKey)) {
            const response = active.responses[id];
            const solution = active.questions.find((item) => item.question.id === id).solution;
            const actual = equal(
              [...response.selectedOptionIds].sort(),
              [...solution.correctOptionIds].sort(),
            );
            requireCondition(response.checked && actual === correct, 'invalid_question_result');
            put(
              'questionStats',
              statKey,
              stat(find('questionStats', statKey), id, revision, correct, answeredAt),
            );
            put('settings', eventKey, true);
          }
          result = find('questionStats', statKey);
          break;
        }
        case 'setBookmark':
          validateSnapshotBookmark(args[0]);
          put('bookmarks', args[0].questionId, args[0]);
          break;
        case 'removeBookmark':
          remove('bookmarks', key);
          break;
        case 'toggleBookmark': {
          const [id, revision, createdAt] = args;
          result = !find('bookmarks', id);
          if (result) {
            const bookmark = { questionId: id, revision, createdAt };
            validateSnapshotBookmark(bookmark);
            put('bookmarks', id, bookmark);
          } else remove('bookmarks', id);
          break;
        }
        case 'setSetting':
          requireCondition(
            typeof key === 'string' &&
              key.length <= 200 &&
              !key.startsWith('session-lock:') &&
              !key.startsWith('practice-result:'),
          );
          put('settings', key, args[1]);
          break;
        case 'acquireSessionLease':
        case 'renewSessionLease': {
          const [id, ownerId, ttlMs] = args;
          requireCondition(
            typeof id === 'string' &&
              typeof ownerId === 'string' &&
              Number.isInteger(ttlMs) &&
              ttlMs >= 1000 &&
              ttlMs <= 60_000,
          );
          const lockKey = `session-lock:${id}`;
          const lease = find('settings', lockKey);
          const now = Date.now();
          result =
            action === 'renewSessionLease'
              ? lease?.ownerId === ownerId && lease.expiresAt > now
              : !lease || lease.ownerId === ownerId || lease.expiresAt <= now;
          if (result) put('settings', lockKey, { ownerId, expiresAt: now + ttlMs });
          break;
        }
        case 'releaseSessionLease': {
          const lockKey = `session-lock:${key}`;
          if (find('settings', lockKey)?.ownerId === args[1]) remove('settings', lockKey);
          break;
        }
        case 'saveWord':
          validWord(args[0]);
          put('words', termKey(args[0].term), args[0]);
          break;
        case 'removeWord':
          requireCondition(typeof key === 'string');
          remove('words', termKey(key));
          break;
        case 'updateWordEnrichment': {
          const [entry, expected] = args;
          validWord(entry);
          validWord(expected);
          requireCondition(termKey(entry.term) === termKey(expected.term));
          const current = find('words', termKey(entry.term));
          result =
            current?.enrichment === 'pending' &&
            ['meaning', 'pronunciation', 'example'].every(
              (field) => current[field] === expected[field],
            );
          if (result) put('words', termKey(entry.term), entry);
          break;
        }
        case 'exportProgress':
          result = {
            format: 'certificate-practice-progress',
            schemaVersion: 3,
            certificateId,
            exportedAt: new Date().toISOString(),
            activeSessions: list('activeSessions'),
            attempts: list('attempts'),
            questionStats: list('questionStats'),
            bookmarks: list('bookmarks'),
            settings: Object.fromEntries(
              state.records
                .filter(
                  (item) =>
                    item.kind === 'settings' &&
                    !item.key.startsWith('session-lock:') &&
                    !item.key.startsWith('practice-result:'),
                )
                .map((item) => [item.key, item.value]),
            ),
          };
          break;
        case 'importProgress': {
          let progress;
          try {
            progress = validateProgressExport(args[0], certificateId);
          } catch {
            throw new ApiError(400, 'invalid_progress');
          }
          requireCondition(args[1] === 'merge' || args[1] === 'replace');
          // Historical attempts can never be silently overwritten, even in replace mode.
          for (const attempt of progress.attempts) {
            const previous = find('attempts', attempt.id);
            if (previous)
              requireCondition(equal(clean(previous), attempt), 'immutable_attempt', 409);
          }
          if (args[1] === 'replace')
            state.records = state.records.filter((item) => item.kind === 'words');
          for (const kind of ['activeSessions', 'attempts', 'questionStats', 'bookmarks'])
            for (const value of progress[kind]) {
              const id =
                kind === 'questionStats'
                  ? JSON.stringify([value.questionId, value.revision])
                  : kind === 'bookmarks'
                    ? value.questionId
                    : value.id;
              const previous = find(kind, id);
              if (
                !previous ||
                kind === 'attempts' ||
                (value.updatedAt && previous.updatedAt <= value.updatedAt) ||
                (kind === 'bookmarks' && previous.createdAt > value.createdAt)
              )
                put(kind, id, clean(value));
            }
          for (const [name, value] of Object.entries(progress.settings))
            if (!name.startsWith('session-lock:') && !name.startsWith('practice-result:'))
              put('settings', name, value);
          result = progress;
          break;
        }
        case 'reset':
          state.records = state.records.filter((item) => !progressKinds.includes(item.kind));
          break;
        default:
          throw new ApiError(400, 'unknown_action');
      }
      if (readActions.has(action)) return result ?? null;
      if (await commit(userId, certificateId, state)) return result ?? null;
    }
    throw new ApiError(409, 'concurrent_learning_change');
  };
}
function validateSnapshotBookmark(value) {
  requireCondition(
    record(value) &&
      typeof value.questionId === 'string' &&
      Number.isInteger(value.revision) &&
      value.revision >= 0 &&
      Number.isFinite(Date.parse(value.createdAt)),
    'invalid_bookmark',
  );
}
