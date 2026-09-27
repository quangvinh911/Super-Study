import {
  AttemptResult,
  Chapter,
  KLevel,
  ResultBreakdownItem,
  SessionQuestionSnapshot,
  SessionResponse,
  ScoringPolicy,
} from '../models';
import { scoreQuestion } from './scoring';

function percent(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * 1000) / 10;
}

function breakdown<T extends string | number>(
  questions: readonly SessionQuestionSnapshot[],
  responses: Readonly<Record<string, SessionResponse>>,
  keyOf: (item: SessionQuestionSnapshot) => T | undefined,
): ResultBreakdownItem<T>[] {
  const groups = new Map<T, SessionQuestionSnapshot[]>();
  for (const item of questions) {
    const key = keyOf(item);
    if (key === undefined) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([key, items]) => {
      const answered = items.filter(
        (item) => (responses[item.question.id]?.selectedOptionIds.length ?? 0) > 0,
      ).length;
      const correct = items.filter((item) =>
        scoreQuestion(item.solution, responses[item.question.id]),
      ).length;
      return {
        key,
        total: items.length,
        answered,
        correct,
        percent: percent(correct, items.length),
      };
    });
}

export function calculateAttemptResult(
  questions: readonly SessionQuestionSnapshot[],
  responses: Readonly<Record<string, SessionResponse>>,
  scoring: ScoringPolicy = { kind: 'threshold', passPercent: 65 },
): AttemptResult {
  const total = questions.length;
  const answered = questions.filter(
    (item) => (responses[item.question.id]?.selectedOptionIds.length ?? 0) > 0,
  ).length;
  const score = questions.filter((item) =>
    scoreQuestion(item.solution, responses[item.question.id]),
  ).length;
  const passMark =
    scoring.kind === 'threshold' ? Math.ceil((total * scoring.passPercent) / 100) : null;
  return {
    score,
    total,
    answered,
    percent: percent(score, total),
    passMark,
    passed: passMark === null ? null : total > 0 && score >= passMark,
    bySection: breakdown(questions, responses, (item) => item.question.classification.section),
    byChapter: breakdown<Chapter>(
      questions,
      responses,
      (item) => item.question.classification.chapter,
    ),
    byKLevel: breakdown<KLevel>(
      questions,
      responses,
      (item) => item.question.classification.kLevel,
    ),
  };
}
