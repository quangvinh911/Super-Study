import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateAttemptResult } from '../domain';
import {
  Attempt,
  Question,
  SessionQuestionSnapshot,
  SessionSnapshot,
  Solution,
} from '../models';
import {
  InvalidProgressExportError,
  ProgressRepository,
} from './progress.repository';

function fixtureItem(): SessionQuestionSnapshot {
  const question: Question = {
    id: 'Q-1',
    revision: 1,
    language: 'en',
    stem: [{ kind: 'paragraph', text: 'A question' }],
    options: [
      { id: 'A', content: [{ kind: 'paragraph', text: 'Correct' }] },
      { id: 'B', content: [{ kind: 'paragraph', text: 'Incorrect' }] },
    ],
    interaction: { kind: 'singleChoice', requiredSelections: 1 },
    classification: {
      chapter: 1,
      section: '1.1',
      learningObjective: 'FL-1.1.1',
      blueprintBucket: 'CH1-K1-01',
      kLevel: 'K1',
      styleTags: ['directKnowledge'],
    },
    shuffleOptions: false,
    provenance: {
      kind: 'original',
      authoringNote: 'Fixture',
      rightsStatus: 'cleared',
    },
    verification: {
      answerStatus: 'verified',
      reviewedAgainst: 'CTFL 4.0.1',
      reviewedAt: '2026-08-29',
    },
  };
  const solution: Solution = {
    questionId: question.id,
    correctOptionIds: ['A'],
    explanation: [{ kind: 'paragraph', text: 'Because A.' }],
    references: [
      { title: 'Syllabus', version: '4.0.1', locator: 'FL-1.1.1' },
    ],
  };
  return { question, solution };
}

function fixtureSession(): SessionSnapshot {
  const item = fixtureItem();
  return {
    schemaVersion: 1,
    id: 'session-1',
    mode: 'practice',
    bankVersion: 'bank-1',
    seed: 'seed-1',
    status: 'active',
    createdAt: '2026-08-29T00:00:00.000Z',
    startedAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
    currentIndex: 0,
    questions: [item],
    responses: {
      'Q-1': {
        questionId: 'Q-1',
        selectedOptionIds: ['A'],
        checked: true,
        flagged: false,
        isCorrect: true,
        answeredAt: '2026-08-29T00:00:10.000Z',
      },
    },
  };
}

function fixtureAttempt(session: SessionSnapshot): Attempt {
  return {
    id: session.id,
    sessionId: session.id,
    mode: session.mode,
    bankVersion: session.bankVersion,
    seed: session.seed,
    startedAt: session.startedAt,
    completedAt: '2026-08-29T00:01:00.000Z',
    durationSeconds: 60,
    completionReason: 'submitted',
    questions: session.questions,
    responses: session.responses,
    result: calculateAttemptResult(session.questions, session.responses),
  };
}

describe('ProgressRepository', () => {
  let repository: ProgressRepository;

  beforeEach(() => {
    repository = new ProgressRepository(
      `ctfl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
  });

  it('stores cloned active snapshots and atomically replaces them with attempts', async () => {
    const session = fixtureSession();
    await repository.saveActiveSession(session);
    const restored = await repository.getActiveSession(session.id);
    expect(restored).toEqual(session);
    expect(restored).not.toBe(session);

    const attempt = fixtureAttempt(session);
    await repository.completeSession(attempt);
    expect(await repository.getActiveSession(session.id)).toBeUndefined();
    expect(await repository.getAttempt(session.id)).toEqual(attempt);
  });

  it('tracks revision-aware stats and bookmarks', async () => {
    await repository.recordQuestionResult(
      'Q-1',
      1,
      false,
      '2026-08-29T00:00:00.000Z',
    );
    const stat = await repository.recordQuestionResult(
      'Q-1',
      1,
      true,
      '2026-08-29T00:01:00.000Z',
    );
    expect(stat).toMatchObject({
      seenCount: 2,
      correctCount: 1,
      incorrectCount: 1,
      currentCorrectStreak: 1,
      lastCorrect: true,
    });

    expect(await repository.toggleBookmark('Q-1', 1)).toBe(true);
    expect(await repository.isBookmarked('Q-1')).toBe(true);
    expect(await repository.toggleBookmark('Q-1', 1)).toBe(false);
  });

  it('round-trips a versioned export and rejects an unknown format', async () => {
    await repository.saveActiveSession(fixtureSession());
    await repository.setSetting('exam-duration', 75);
    const exported = await repository.exportProgress(
      new Date('2026-08-29T12:00:00.000Z'),
    );
    expect(exported).toMatchObject({
      format: 'ctfl-practice-progress',
      schemaVersion: 1,
      settings: { 'exam-duration': 75 },
    });

    await repository.reset();
    expect(await repository.listActiveSessions()).toHaveLength(0);
    await repository.importProgress(exported, 'replace');
    expect(await repository.getActiveSession('session-1')).toEqual(fixtureSession());

    await expect(
      repository.importProgress({ ...exported, schemaVersion: 2 }),
    ).rejects.toBeInstanceOf(InvalidProgressExportError);
  });

  it('uses an atomic expiring lease to block a second exam tab', async () => {
    const databaseName = `ctfl-lock-${Date.now()}-${Math.random()}`;
    const first = new ProgressRepository(databaseName);
    const second = new ProgressRepository(databaseName);
    expect(await first.acquireSessionLease('exam-1', 'tab-a', 1000, 10_000)).toBe(
      true,
    );
    expect(await second.acquireSessionLease('exam-1', 'tab-b', 1000, 10_500)).toBe(
      false,
    );
    expect(await second.acquireSessionLease('exam-1', 'tab-b', 1000, 11_001)).toBe(
      true,
    );
  });
});
