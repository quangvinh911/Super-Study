import type { LoadedQuestionBank, Question, Solution } from '../models';
import { findCertificate } from '../../certificates/registry';

/** Synthetic data for tests only. Never publish as exam content. */
export function toeicFixture(formId = 'test-form'): LoadedQuestionBank {
  let order = 0;
  const questions: Question[] = findCertificate('toeic')!.exam.sections!.flatMap((section) =>
    section.parts.flatMap((part) =>
      Array.from({ length: part.count }, (): Question => {
        order++;
        return {
          id: `${formId}-${order}`,
          certificateId: 'toeic',
          formId,
          order,
          revision: 1,
          language: 'en',
          stem: [{ kind: 'paragraph', text: `Synthetic test item ${order}` }],
          stimulus:
            part.id === 'part-3'
              ? {
                  id: `${formId}-conversation-${Math.ceil((order - 31) / 3)}`,
                  content: [
                    { kind: 'audio', src: '/audio/toeic/test.mp3', label: 'Test conversation' },
                  ],
                }
              : undefined,
          options: ['A', 'B', 'C', 'D'].map((id) => ({
            id,
            content: [{ kind: 'paragraph', text: `Option ${id}` }],
          })),
          interaction: { kind: 'singleChoice', requiredSelections: 1 },
          classification: { section: part.id, styleTags: [] },
          shuffleOptions: false,
          provenance: {
            kind: 'original',
            authoringNote: 'Synthetic test fixture, not learning material',
            rightsStatus: 'cleared',
          },
          verification: {
            answerStatus: 'verified',
            reviewedAgainst: 'Test fixture',
            reviewedAt: '2026-09-27',
          },
        };
      }),
    ),
  );
  const solutions: Solution[] = questions.map((question) => ({
    questionId: question.id,
    correctOptionIds: ['A'],
    explanation: [{ kind: 'paragraph', text: 'Synthetic explanation for testing.' }],
    references: [],
  }));
  return {
    manifest: {
      certificateId: 'toeic',
      schemaVersion: '1.0.0',
      bankVersion: 'test-only',
      publishedAt: '2026-09-27',
      syllabusVersion: 'TOEIC L&R',
      language: 'en',
      questionCount: 200,
      solutionCount: 200,
      blueprint: [],
      files: { questions: 'questions.json', solutions: 'solutions.json' },
    },
    questions,
    solutions,
  };
}
