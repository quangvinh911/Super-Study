import type { ProgressExport } from '../models/progress.models';
const EXPORT_FORMAT = 'certificate-practice-progress';
function clone<T>(value: T): T {
  return structuredClone(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

export function validateSnapshotRecord(
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

export function validateProgressExport(value: unknown, certificateId: string): ProgressExport {
  if (!isRecord(value)) {
    throw new InvalidProgressExportError('Progress import must be a JSON object.');
  }
  const legacy = value['format'] === 'ctfl-practice-progress' && value['schemaVersion'] === 1;
  if (
    !legacy &&
    (value['format'] !== EXPORT_FORMAT ||
      (value['schemaVersion'] !== 2 && value['schemaVersion'] !== 3))
  ) {
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
