import { BlueprintManifestCell, Question, SessionQuestionSnapshot, Solution } from '../models';
import { shuffleSeeded } from './random';

export const CTFL_EXAM_BLUEPRINT: readonly BlueprintManifestCell[] = Object.freeze([
  { chapter: 1, kLevel: 'K1', count: 2 },
  { chapter: 1, kLevel: 'K2', count: 6 },
  { chapter: 2, kLevel: 'K1', count: 2 },
  { chapter: 2, kLevel: 'K2', count: 4 },
  { chapter: 3, kLevel: 'K1', count: 2 },
  { chapter: 3, kLevel: 'K2', count: 2 },
  { chapter: 4, kLevel: 'K2', count: 6 },
  { chapter: 4, kLevel: 'K3', count: 5 },
  { chapter: 5, kLevel: 'K1', count: 1 },
  { chapter: 5, kLevel: 'K2', count: 5 },
  { chapter: 5, kLevel: 'K3', count: 3 },
  { chapter: 6, kLevel: 'K1', count: 1 },
  { chapter: 6, kLevel: 'K2', count: 1 },
]);

export const CTFL_EXAM_QUESTION_COUNT = 40;

export interface InventoryShortage {
  readonly chapter: number;
  readonly kLevel: string;
  readonly requiredBuckets: number;
  readonly availableBuckets: number;
}

export class ExamInventoryError extends Error {
  constructor(readonly shortages: readonly InventoryShortage[]) {
    super(
      `Question inventory cannot satisfy the CTFL blueprint: ${shortages
        .map(
          (item) =>
            `chapter ${item.chapter}/${item.kLevel} needs ${item.requiredBuckets} buckets, found ${item.availableBuckets}`,
        )
        .join('; ')}`,
    );
    this.name = 'ExamInventoryError';
  }
}

export interface GenerateExamOptions {
  readonly seed: string | number;
  readonly blueprint?: readonly BlueprintManifestCell[];
}

export function isPublishableQuestion(question: Question): boolean {
  const publicQuestion =
    question.provenance.rightsStatus === 'cleared' &&
    question.verification.answerStatus === 'verified';
  const privatePdfQuestion =
    question.provenance.rightsStatus === 'privateUserProvided' &&
    (question.verification.answerStatus === 'sourcePrinted' ||
      question.verification.answerStatus === 'sourceAnomalyCorrected');
  return publicQuestion || privatePdfQuestion;
}

function keyForCell(cell: { readonly chapter?: number; readonly kLevel?: string }): string {
  return `${cell.chapter}:${cell.kLevel}`;
}

function cloneWithShuffledOptions(question: Question, seed: string): Question {
  if (!question.shuffleOptions) {
    return structuredCloneSafe(question);
  }
  return {
    ...structuredCloneSafe(question),
    options: shuffleSeeded(question.options, seed).map((option) => structuredCloneSafe(option)),
  };
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Generates one question per blueprint bucket. With an A/B bank this ensures
 * variants of the same slot never appear together in a mock exam.
 */
export function generateCtflExam(
  questions: readonly Question[],
  solutions: readonly Solution[],
  options: GenerateExamOptions,
): SessionQuestionSnapshot[] {
  const blueprint = options.blueprint ?? CTFL_EXAM_BLUEPRINT;
  const solutionByQuestion = new Map(solutions.map((solution) => [solution.questionId, solution]));
  const eligible = questions.filter(
    (question) => isPublishableQuestion(question) && solutionByQuestion.has(question.id),
  );

  const shortages: InventoryShortage[] = [];
  const selected: Question[] = [];

  for (const cell of blueprint) {
    const candidates = eligible.filter(
      (question) => keyForCell(question.classification) === keyForCell(cell),
    );
    const byBucket = new Map<string, Question[]>();
    for (const candidate of candidates) {
      const bucket = candidate.classification.blueprintBucket;
      if (!bucket) continue;
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), candidate]);
    }

    if (byBucket.size < cell.count) {
      shortages.push({
        chapter: cell.chapter,
        kLevel: cell.kLevel,
        requiredBuckets: cell.count,
        availableBuckets: byBucket.size,
      });
      continue;
    }

    const bucketIds = shuffleSeeded(
      [...byBucket.keys()],
      `${options.seed}|${keyForCell(cell)}|buckets`,
    ).slice(0, cell.count);
    for (const bucketId of bucketIds) {
      const variants = byBucket.get(bucketId)!;
      const picked = shuffleSeeded(variants, `${options.seed}|${bucketId}|variant`)[0]!;
      selected.push(picked);
    }
  }

  if (shortages.length > 0) {
    throw new ExamInventoryError(shortages);
  }

  const ordered = shuffleSeeded(selected, `${options.seed}|question-order`);
  const ids = new Set(ordered.map((question) => question.id));
  if (ids.size !== ordered.length) {
    throw new Error('Generated exam contains duplicate question IDs.');
  }

  return ordered.map((question) => ({
    question: cloneWithShuffledOptions(question, `${options.seed}|${question.id}|options`),
    solution: structuredCloneSafe(solutionByQuestion.get(question.id)!),
  }));
}

export function generateRandomExam(
  questions: readonly Question[],
  solutions: readonly Solution[],
  options: { readonly seed: string | number; readonly count?: number },
): SessionQuestionSnapshot[] {
  const count = options.count ?? CTFL_EXAM_QUESTION_COUNT;
  const solutionByQuestion = new Map(solutions.map((solution) => [solution.questionId, solution]));
  const eligible = questions.filter(
    (question) => isPublishableQuestion(question) && solutionByQuestion.has(question.id),
  );
  if (eligible.length < count) {
    throw new ExamInventoryError([
      {
        chapter: 0,
        kLevel: 'source',
        requiredBuckets: count,
        availableBuckets: eligible.length,
      },
    ]);
  }
  return shuffleSeeded(eligible, `${options.seed}|random-question-order`)
    .slice(0, count)
    .map((question) => ({
      question: cloneWithShuffledOptions(question, `${options.seed}|${question.id}|options`),
      solution: structuredCloneSafe(solutionByQuestion.get(question.id)!),
    }));
}

export function hasOfficialCtflMatrix(
  questions: readonly Pick<Question, 'classification'>[],
): boolean {
  if (questions.length !== CTFL_EXAM_QUESTION_COUNT) {
    return false;
  }
  return CTFL_EXAM_BLUEPRINT.every(
    (cell) =>
      questions.filter((question) => keyForCell(question.classification) === keyForCell(cell))
        .length === cell.count,
  );
}
