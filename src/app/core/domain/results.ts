import {
  AttemptResult,
  Chapter,
  KLevel,
  ResultBreakdownItem,
  SessionQuestionSnapshot,
  SessionResponse,
} from '../models';
import { meetsCtflPassMark, scoreQuestion } from './scoring';

function percent(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * 1000) / 10;
}

function breakdown<T extends string | number>(
  questions: readonly SessionQuestionSnapshot[],
  responses: Readonly<Record<string, SessionResponse>>,
  keyOf: (item: SessionQuestionSnapshot) => T,
): ResultBreakdownItem<T>[] {
  const groups = new Map<T, SessionQuestionSnapshot[]>();
  for (const item of questions) {
    const key = keyOf(item);
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
): AttemptResult {
  const total = questions.length;
  const answered = questions.filter(
    (item) => (responses[item.question.id]?.selectedOptionIds.length ?? 0) > 0,
  ).length;
  const score = questions.filter((item) =>
    scoreQuestion(item.solution, responses[item.question.id]),
  ).length;
  const passMark = total === 40 ? 26 : Math.ceil(total * 0.65);
  return {
    score,
    total,
    answered,
    percent: percent(score, total),
    passMark,
    passed: meetsCtflPassMark(score, total),
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
