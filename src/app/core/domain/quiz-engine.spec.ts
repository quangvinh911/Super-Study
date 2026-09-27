import { describe, expect, it } from 'vitest';
import {
  CTFL_EXAM_BLUEPRINT,
  ExamInventoryError,
  filterPracticeQuestions,
  generateCtflExam,
  generateRandomExam,
  hasOfficialCtflMatrix,
  isExactSelectionCorrect,
  meetsCtflPassMark,
  shuffleSeeded,
} from './index';
import { BlueprintManifestCell, Question, QuestionStat, Solution } from '../models';

function questionFor(cell: BlueprintManifestCell, slot: number, variant: 'A' | 'B'): Question {
  const bucket = `CH${cell.chapter}-${cell.kLevel}-${String(slot).padStart(2, '0')}`;
  return {
    id: `${bucket}-${variant}`,
    revision: 1,
    language: 'en',
    stem: [{ kind: 'paragraph', text: `Question ${bucket} ${variant}` }],
    options: [
      { id: 'A', content: [{ kind: 'paragraph', text: 'Correct' }] },
      { id: 'B', content: [{ kind: 'paragraph', text: 'Distractor' }] },
      { id: 'C', content: [{ kind: 'paragraph', text: 'Distractor' }] },
      { id: 'D', content: [{ kind: 'paragraph', text: 'Distractor' }] },
    ],
    interaction: { kind: 'singleChoice', requiredSelections: 1 },
    classification: {
      chapter: cell.chapter,
      section: `Chapter ${cell.chapter}`,
      learningObjective: `FL-${cell.chapter}.${slot}`,
      blueprintBucket: bucket,
      kLevel: cell.kLevel,
      styleTags: ['directKnowledge'],
    },
    shuffleOptions: true,
    provenance: {
      kind: 'original',
      authoringNote: 'Test fixture',
      rightsStatus: 'cleared',
    },
    verification: {
      answerStatus: 'verified',
      reviewedAgainst: 'CTFL v4.0.1',
      reviewedAt: '2026-08-29',
    },
    variant,
  };
}

function fullBank(): { questions: Question[]; solutions: Solution[] } {
  const questions = CTFL_EXAM_BLUEPRINT.flatMap((cell) =>
    Array.from({ length: cell.count }, (_, slot) => [
      questionFor(cell, slot + 1, 'A'),
      questionFor(cell, slot + 1, 'B'),
    ]).flat(),
  );
  const solutions = questions.map((question): Solution => ({
    questionId: question.id,
    correctOptionIds: ['A'],
    explanation: [{ kind: 'paragraph', text: 'A is correct.' }],
    references: [
      {
        title: 'CTFL syllabus',
        version: '4.0.1',
        locator: question.classification.learningObjective!,
      },
    ],
  }));
  return { questions, solutions };
}

describe('exact-set scoring', () => {
  it('ignores order but rejects partial, extra, and duplicate selections', () => {
    expect(isExactSelectionCorrect(['B', 'D'], ['D', 'B'])).toBe(true);
    expect(isExactSelectionCorrect(['B'], ['B', 'D'])).toBe(false);
    expect(isExactSelectionCorrect(['B', 'D', 'A'], ['B', 'D'])).toBe(false);
    expect(isExactSelectionCorrect(['B', 'B'], ['B'])).toBe(false);
  });

  it('uses the official 26/40 pass boundary', () => {
    expect(meetsCtflPassMark(25, 40)).toBe(false);
    expect(meetsCtflPassMark(26, 40)).toBe(true);
  });
});

describe('seeded shuffle and CTFL generator', () => {
  it('is deterministic without mutating its input', () => {
    const source = ['A', 'B', 'C', 'D'];
    const first = shuffleSeeded(source, 'same-seed');
    expect(shuffleSeeded(source, 'same-seed')).toEqual(first);
    expect(source).toEqual(['A', 'B', 'C', 'D']);
  });

  it('selects 40 unique questions, one variant per bucket, in the official matrix', () => {
    const bank = fullBank();
    const first = generateCtflExam(bank.questions, bank.solutions, { seed: 'exam-7' });
    const second = generateCtflExam(bank.questions, bank.solutions, { seed: 'exam-7' });

    expect(first).toEqual(second);
    expect(first).toHaveLength(40);
    expect(new Set(first.map((item) => item.question.id)).size).toBe(40);
    expect(new Set(first.map((item) => item.question.classification.blueprintBucket)).size).toBe(
      40,
    );
    expect(hasOfficialCtflMatrix(first.map((item) => item.question))).toBe(true);
  });

  it('fails clearly when a blueprint cell lacks enough unique buckets', () => {
    const bank = fullBank();
    const reduced = bank.questions.filter(
      (question) =>
        !(question.classification.chapter === 6 && question.classification.kLevel === 'K2'),
    );
    expect(() => generateCtflExam(reduced, bank.solutions, { seed: 'incomplete' })).toThrow(
      ExamInventoryError,
    );
  });

  it('creates a deterministic 40-question exam from the private PDF bank', () => {
    const bank = fullBank();
    const pdfQuestions = bank.questions.map((question, index) => ({
      ...question,
      id: `PDF-Q-${String(index + 1).padStart(3, '0')}`,
      shuffleOptions: false,
      provenance: {
        ...question.provenance,
        kind: 'sourceExcerpt' as const,
        rightsStatus: 'privateUserProvided' as const,
      },
      verification: {
        ...question.verification,
        answerStatus: 'sourcePrinted' as const,
      },
    }));
    const pdfSolutions = pdfQuestions.map((question, index): Solution => ({
      ...bank.solutions[index]!,
      questionId: question.id,
    }));
    const first = generateRandomExam(pdfQuestions, pdfSolutions, { seed: 'pdf-7' });
    const second = generateRandomExam(pdfQuestions, pdfSolutions, { seed: 'pdf-7' });

    expect(first).toEqual(second);
    expect(first).toHaveLength(40);
    expect(new Set(first.map((item) => item.question.id)).size).toBe(40);
  });
});

describe('practice filtering', () => {
  it('ANDs classification filters and ORs selected history states', () => {
    const bank = fullBank();
    const chapterOne = bank.questions.filter((question) => question.classification.chapter === 1);
    const wrong = chapterOne[0]!;
    const bookmarked = chapterOne[1]!;
    const wrongStat: QuestionStat = {
      questionId: wrong.id,
      revision: 1,
      seenCount: 2,
      correctCount: 0,
      incorrectCount: 2,
      currentCorrectStreak: 0,
      lastCorrect: false,
      lastAnsweredAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    };

    const filtered = filterPracticeQuestions(
      bank.questions,
      { chapters: [1], kLevels: ['K1'], history: ['incorrect', 'bookmarked'] },
      {
        stats: new Map([[wrong.id, wrongStat]]),
        bookmarkedQuestionIds: new Set([bookmarked.id]),
      },
    );
    expect(filtered.map((question) => question.id)).toEqual([wrong.id, bookmarked.id]);
  });
});
