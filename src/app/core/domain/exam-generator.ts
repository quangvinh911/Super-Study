import { ExamDefinition, Question, SessionQuestionSnapshot, Solution } from '../models';
import { generateCtflExam, generateRandomExam, isPublishableQuestion } from './blueprint';
import { shuffleSeeded } from './random';

/** Complete authored forms preserve linked audio/passages and the order of parts. */
export function completeExamForms(
  questions: readonly Question[],
  solutions: readonly Solution[],
  exam: ExamDefinition,
): Question[][] {
  const solutionIds = new Set(solutions.map((solution) => solution.questionId));
  const forms = new Map<string, Question[]>();
  for (const question of questions) {
    if (!question.formId || !isPublishableQuestion(question) || !solutionIds.has(question.id))
      continue;
    forms.set(question.formId, [...(forms.get(question.formId) ?? []), question]);
  }
  const expectedParts =
    exam.sections?.flatMap((section) =>
      section.parts.flatMap((part) => Array<string>(part.count).fill(part.id)),
    ) ?? [];
  return [...forms.values()]
    .filter((form) => {
      if (form.length !== exam.questionCount || new Set(form.map((q) => q.id)).size !== form.length)
        return false;
      const ordered = [...form].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return ordered.every(
        (question, index) =>
          question.order === index + 1 && question.classification.section === expectedParts[index],
      );
    })
    .map((form) => [...form].sort((a, b) => a.order! - b.order!));
}

export function generateExam(
  questions: readonly Question[],
  solutions: readonly Solution[],
  exam: ExamDefinition,
  seed: string,
): SessionQuestionSnapshot[] {
  if (exam.generation === 'ctflBlueprint') return generateCtflExam(questions, solutions, { seed });
  if (exam.generation === 'random')
    return generateRandomExam(questions, solutions, { seed, count: exam.questionCount });
  const form = shuffleSeeded(completeExamForms(questions, solutions, exam), seed)[0];
  if (!form)
    throw new Error('Question inventory needs a complete exam form with every section and part.');
  const solutionsById = new Map(solutions.map((solution) => [solution.questionId, solution]));
  return structuredClone(
    form.map((question) => ({ question, solution: solutionsById.get(question.id)! })),
  );
}
