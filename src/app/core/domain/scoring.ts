import { Question, SessionResponse, Solution } from '../models';

function uniqueOptionIds(ids: readonly string[]): Set<string> {
  return new Set(ids);
}

/** Exact-set comparison: order is irrelevant and partial credit is never awarded. */
export function isExactSelectionCorrect(
  selectedOptionIds: readonly string[],
  correctOptionIds: readonly string[],
): boolean {
  const selected = uniqueOptionIds(selectedOptionIds);
  const correct = uniqueOptionIds(correctOptionIds);
  if (selected.size !== selectedOptionIds.length || selected.size !== correct.size) {
    return false;
  }
  for (const optionId of selected) {
    if (!correct.has(optionId)) {
      return false;
    }
  }
  return true;
}

export function scoreQuestion(
  solution: Solution,
  response: Pick<SessionResponse, 'selectedOptionIds'> | undefined,
): boolean {
  return isExactSelectionCorrect(
    response?.selectedOptionIds ?? [],
    solution.correctOptionIds,
  );
}

export function validateSelection(
  question: Question,
  selectedOptionIds: readonly string[],
): boolean {
  const selected = new Set(selectedOptionIds);
  const optionIds = new Set(question.options.map((option) => option.id));
  return (
    selected.size === selectedOptionIds.length &&
    selected.size === question.interaction.requiredSelections &&
    [...selected].every((id) => optionIds.has(id))
  );
}

export function meetsCtflPassMark(score: number, total = 40): boolean {
  // Official 40-question exams pass at 26. Pro-rate only for practice summaries.
  const passMark = total === 40 ? 26 : Math.ceil(total * 0.65);
  return score >= passMark;
}
