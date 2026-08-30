import {
  PracticeConfig,
  PracticeProgressContext,
  Question,
  QuestionStat,
  SessionQuestionSnapshot,
  Solution,
} from '../models';
import { shuffleSeeded } from './random';
import { isPublishableQuestion } from './blueprint';

function includesIfSpecified<T>(allowed: readonly T[] | undefined, value: T): boolean {
  return !allowed?.length || allowed.includes(value);
}

function statFor(
  stats: PracticeProgressContext['stats'],
  questionId: string,
): QuestionStat | undefined {
  if (!stats) {
    return undefined;
  }
  if (stats instanceof Map) {
    return stats.get(questionId);
  }
  return (stats as Readonly<Record<string, QuestionStat>>)[questionId];
}

function bookmarkSet(
  bookmarked: PracticeProgressContext['bookmarkedQuestionIds'],
): ReadonlySet<string> {
  if (!bookmarked) {
    return new Set();
  }
  return bookmarked instanceof Set ? bookmarked : new Set(bookmarked);
}

export function filterPracticeQuestions(
  questions: readonly Question[],
  config: PracticeConfig = {},
  progress: PracticeProgressContext = {},
): Question[] {
  const bookmarks = bookmarkSet(progress.bookmarkedQuestionIds);
  const filtered = questions.filter((question) => {
    const classification = question.classification;
    const classificationMatches =
      includesIfSpecified(config.chapters, classification.chapter) &&
      includesIfSpecified(config.sections, classification.section) &&
      includesIfSpecified(config.learningObjectives, classification.learningObjective) &&
      includesIfSpecified(config.kLevels, classification.kLevel) &&
      (!config.styleTags?.length ||
        config.styleTags.every((tag) => classification.styleTags.includes(tag)));
    if (!classificationMatches) {
      return false;
    }

    if (!config.history?.length) {
      return true;
    }
    const stat = statFor(progress.stats, question.id);
    return config.history.some((historyFilter) => {
      switch (historyFilter) {
        case 'unseen':
          return !stat || stat.seenCount === 0;
        case 'incorrect':
          return stat?.lastCorrect === false;
        case 'bookmarked':
          return bookmarks.has(question.id);
      }
    });
  });

  const ordered = config.shuffleQuestions
    ? shuffleSeeded(filtered, config.seed ?? 'ctfl-practice')
    : [...filtered];
  return config.questionLimit === undefined
    ? ordered
    : ordered.slice(0, Math.max(0, config.questionLimit));
}

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createPracticeQuestions(
  questions: readonly Question[],
  solutions: readonly Solution[],
  config: PracticeConfig = {},
  progress: PracticeProgressContext = {},
): SessionQuestionSnapshot[] {
  const solutionById = new Map(
    solutions.map((solution) => [solution.questionId, solution]),
  );
  const selected = filterPracticeQuestions(
    questions.filter(
      (question) => isPublishableQuestion(question) && solutionById.has(question.id),
    ),
    config,
    progress,
  );
  const seed = config.seed ?? 'ctfl-practice';
  return selected.map((question) => ({
    question: {
      ...clone(question),
      options: question.shuffleOptions
        ? shuffleSeeded(question.options, `${seed}|${question.id}|options`).map(clone)
        : question.options.map(clone),
    },
    solution: clone(solutionById.get(question.id)!),
  }));
}
