import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CTFL_EXAM_BLUEPRINT } from '../domain';
import { Question, Solution } from '../models';
import { ProgressRepository } from '../persistence';
import { QuizSessionStore } from './quiz-session.store';

function examBank(): { questions: Question[]; solutions: Solution[] } {
  const questions = CTFL_EXAM_BLUEPRINT.flatMap((cell) =>
    Array.from({ length: cell.count }, (_, index) =>
      (['A', 'B'] as const).map((variant): Question => {
        const bucket = `C${cell.chapter}-${cell.kLevel}-${String(index + 1).padStart(2, '0')}`;
        return {
          id: `TEST-${bucket}-${variant}`,
          revision: 1,
          variant,
          language: 'en',
          stem: [{ kind: 'paragraph', text: `Question ${bucket} ${variant}` }],
          options: [
            { id: 'A', content: [{ kind: 'paragraph', text: 'Correct' }] },
            { id: 'B', content: [{ kind: 'paragraph', text: 'Wrong' }] },
            { id: 'C', content: [{ kind: 'paragraph', text: 'Wrong' }] },
            { id: 'D', content: [{ kind: 'paragraph', text: 'Wrong' }] },
          ],
          interaction: { kind: 'singleChoice', requiredSelections: 1 },
          classification: {
            chapter: cell.chapter,
            section: `Chapter ${cell.chapter}`,
            learningObjective: `FL-${cell.chapter}.1.1`,
            blueprintBucket: bucket,
            kLevel: cell.kLevel,
            styleTags: ['directKnowledge'],
          },
          shuffleOptions: true,
          provenance: {
            kind: 'original',
            authoringNote: 'Original timer fixture for the local unit test.',
            rightsStatus: 'cleared',
          },
          verification: {
            answerStatus: 'verified',
            reviewedAgainst: 'CTFL v4.0.1',
            reviewedAt: '2026-08-30',
          },
        };
      }),
    ).flat(),
  );
  const solutions = questions.map(
    (question): Solution => ({
      questionId: question.id,
      correctOptionIds: ['A'],
      explanation: [{ kind: 'paragraph', text: 'A is correct.' }],
      references: [
        {
          title: 'CTFL syllabus',
          version: '4.0.1',
          locator: question.classification.learningObjective,
        },
      ],
    }),
  );
  return { questions, solutions };
}

describe('QuizSessionStore exam deadline', () => {
  it('warns at ten minutes and atomically auto-submits at the absolute deadline', async () => {
    const repository = new ProgressRepository(
      `ctfl-timer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const store = new QuizSessionStore(repository);
    const bank = examBank();
    const startedAt = new Date('2026-08-30T00:00:00.000Z');
    const warnings: number[] = [];
    store.setDeadlineHooks({ onWarning: (minutes) => warnings.push(minutes) });

    const session = await store.startExam({
      bankVersion: 'test-bank',
      questions: bank.questions,
      solutions: bank.solutions,
      durationMinutes: 60,
      seed: 'timer-test',
      now: startedAt,
    });
    expect(session.questions).toHaveLength(40);
    expect(store.remainingMs()).toBe(60 * 60_000);

    await store.tick(new Date(startedAt.getTime() + 50 * 60_000));
    expect(warnings).toEqual([10]);

    const attempt = await store.tick(new Date(startedAt.getTime() + 60 * 60_000));
    expect(attempt).toMatchObject({ completionReason: 'expired' });
    expect(attempt?.result).toMatchObject({ total: 40, passMark: 26, passed: false });
    expect(await repository.getActiveSession(session.id)).toBeUndefined();
    expect(await repository.getAttempt(session.id)).toEqual(attempt);
  });
});
