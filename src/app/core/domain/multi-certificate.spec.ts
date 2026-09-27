import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findCertificate } from '../../certificates/registry';
import { generateExam } from './exam-generator';
import { calculateAttemptResult } from './results';
import { ProgressRepository } from '../persistence';
import { QuizSessionStore } from '../state';
import { toeicFixture } from '../testing/toeic-fixture';
import { createPracticeQuestions } from './practice-filter';

const toeic = findCertificate('toeic')!;
const repositories: ProgressRepository[] = [];
const stores: QuizSessionStore[] = [];
function repository(certificate = findCertificate('ctfl')!) {
  const value = new ProgressRepository(
    `test-${certificate.id}-${crypto.randomUUID()}`,
    certificate,
  );
  repositories.push(value);
  return value;
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const item of repositories.splice(0)) item.close();
  vi.useRealTimers();
});

describe('certificate exam policies', () => {
  it('uses one complete form, preserving parts, shared stimuli, options and seed', () => {
    const a = toeicFixture('form-a');
    const b = toeicFixture('form-b');
    const questions = [...a.questions, ...b.questions];
    const solutions = [...a.solutions, ...b.solutions];
    const exam = generateExam(questions, solutions, toeic.exam, 'fixed');
    expect(exam).toHaveLength(200);
    expect(new Set(exam.map((item) => item.question.formId)).size).toBe(1);
    expect(exam.map((item) => item.question.order)).toEqual(
      Array.from({ length: 200 }, (_, i) => i + 1),
    );
    expect(exam[31]!.question.stimulus?.id).toBe(exam[33]!.question.stimulus?.id);
    expect(exam[0]!.question.options.map((option) => option.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(generateExam(questions, solutions, toeic.exam, 'fixed')).toEqual(exam);
    expect(() => generateExam(a.questions.slice(1), a.solutions, toeic.exam, 'fixed')).toThrow(
      /inventory/,
    );
    expect(() => generateExam([], [], toeic.exam, 'fixed')).toThrow(/inventory/);
  });

  it('filters TOEIC by Part without requiring CTFL chapter, LO or K-level', () => {
    const bank = toeicFixture();
    const practice = createPracticeQuestions(bank.questions, bank.solutions, {
      sections: ['part-6'],
    });
    expect(practice).toHaveLength(16);
    const result = calculateAttemptResult(practice, {}, toeic.exam.scoring);
    expect(result).toMatchObject({
      passed: null,
      passMark: null,
      score: 0,
      byChapter: [],
      byKLevel: [],
    });
    expect(result.bySection).toEqual([
      { key: 'part-6', total: 16, answered: 0, correct: 0, percent: 0 },
    ]);
  });

  it('restores absolute section deadlines, locks previous sections and expires at 120 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const started = new Date('2026-09-27T00:00:00Z');
    vi.setSystemTime(started);
    const repo = repository(toeic);
    const first = new QuizSessionStore(repo);
    stores.push(first);
    const bank = toeicFixture();
    const session = await first.startExam({
      certificateId: 'toeic',
      examDefinition: toeic.exam,
      bankVersion: 'test',
      questions: bank.questions,
      solutions: bank.solutions,
      durationMinutes: 120,
      now: started,
    });
    expect(first.canNavigateTo(100)).toBe(false);
    first.selectOption('A', true);
    await first.close();
    vi.setSystemTime(new Date(started.getTime() + 46 * 60_000));
    const restored = new QuizSessionStore(repo);
    stores.push(restored);
    expect(await restored.restore(session.id)).toBe(true);
    expect(restored.activeExamSection()?.id).toBe('reading');
    expect(restored.snapshot()?.currentIndex).toBe(100);
    expect(restored.remainingMs()).toBe(74 * 60_000);
    expect(restored.canNavigateTo(99)).toBe(false);
    restored.goTo(0);
    expect(restored.snapshot()?.currentIndex).toBe(100);
    const attempt = await restored.tick(new Date(started.getTime() + 120 * 60_000));
    expect(attempt).toMatchObject({
      certificateId: 'toeic',
      completionReason: 'expired',
      result: { total: 200, score: 1, passMark: null, passed: null },
    });
    expect(await repo.listQuestionStats()).toHaveLength(200);
    await repo.completeSession(attempt!);
    expect((await repo.getQuestionStat(bank.questions[0]!.id, 1))?.seenCount).toBe(1);
  });
});

describe('certificate progress isolation', () => {
  it('keeps a legacy completed result and its snapshot unchanged through v1 import', async () => {
    const repo = repository();
    const bank = toeicFixture();
    const question = { ...bank.questions[0]!, certificateId: undefined };
    const questions = [{ question, solution: bank.solutions[0]! }];
    const responses = {
      [question.id]: {
        questionId: question.id,
        selectedOptionIds: ['A'],
        checked: true,
        flagged: false,
      },
    };
    const attempt = {
      id: 'legacy',
      sessionId: 'legacy',
      mode: 'practice' as const,
      bankVersion: 'old-bank',
      seed: 'old',
      startedAt: '2026-08-29T00:00:00Z',
      completedAt: '2026-08-29T00:01:00Z',
      durationSeconds: 60,
      completionReason: 'submitted' as const,
      questions,
      responses,
      result: calculateAttemptResult(questions, responses),
    };
    const exported = await repo.exportProgress();
    await repo.importProgress({
      ...exported,
      format: 'ctfl-practice-progress',
      schemaVersion: 1,
      certificateId: undefined,
      attempts: [attempt],
    });
    expect(await repo.getAttempt('legacy')).toEqual(attempt);
  });

  it('rejects malformed same-certificate replacement before clearing valid data', async () => {
    const repo = repository(toeic);
    await repo.toggleBookmark('keep', 1);
    const exported = await repo.exportProgress();
    const malformed = {
      ...exported,
      attempts: [
        {
          id: 'broken',
          certificateId: 'toeic',
          questions: [],
          completedAt: '2026-09-27T00:00:00Z',
        },
      ],
    };
    await expect(repo.importProgress(malformed, 'replace')).rejects.toThrow(/malformed/);
    expect(await repo.isBookmarked('keep')).toBe(true);
    await expect(
      repo.importProgress(
        { ...exported, questionStats: [{ questionId: 'bad', revision: 1 }] },
        'replace',
      ),
    ).rejects.toThrow(/counters/);
    expect(await repo.isBookmarked('keep')).toBe(true);
  });

  it('serializes close and restore when rapidly switching certificate routes', async () => {
    const repo = repository(toeic);
    const store = new QuizSessionStore(repo);
    stores.push(store);
    const bank = toeicFixture();
    const session = await store.startPractice({
      certificateId: 'toeic',
      bankVersion: 'test',
      questions: bank.questions,
      solutions: bank.solutions,
      config: { questionLimit: 2 },
    });
    store.selectOption('A', true);
    const closing = store.close();
    const restoring = store.restore(session.id);
    await closing;
    expect(await restoring).toBe(true);
    expect(store.snapshot()?.id).toBe(session.id);
    expect(store.currentResponse()?.selectedOptionIds).toEqual(['A']);
  });

  it('isolates identical question IDs, settings and reset between certificates', async () => {
    const ctfl = repository();
    const other = repository(toeic);
    await ctfl.recordQuestionResult('same-id', 1, true);
    await other.recordQuestionResult('same-id', 1, false);
    await ctfl.toggleBookmark('same-id', 1);
    await other.setSetting('preferredExamDurationMinutes', 120);
    expect((await other.getQuestionStat('same-id', 1))?.correctCount).toBe(0);
    expect(await other.isBookmarked('same-id')).toBe(false);
    expect(await ctfl.getSetting('preferredExamDurationMinutes')).toBeUndefined();
    await other.reset();
    expect((await ctfl.getQuestionStat('same-id', 1))?.correctCount).toBe(1);
    expect(await ctfl.isBookmarked('same-id')).toBe(true);
  });

  it('rejects cross-certificate and legacy imports before replacing data', async () => {
    const ctfl = repository();
    const other = repository(toeic);
    await ctfl.toggleBookmark('keep', 1);
    await other.toggleBookmark('toeic-keep', 1);
    const ctflExport = await ctfl.exportProgress();
    await expect(other.importProgress(ctflExport, 'replace')).rejects.toThrow(
      /different certificate/,
    );
    const legacy = {
      ...ctflExport,
      format: 'ctfl-practice-progress',
      schemaVersion: 1,
      certificateId: undefined,
    };
    await expect(other.importProgress(legacy, 'replace')).rejects.toThrow(/different certificate/);
    expect(await other.isBookmarked('toeic-keep')).toBe(true);
    await ctfl.reset();
    await ctfl.importProgress(legacy);
    expect(await ctfl.isBookmarked('keep')).toBe(true);
  });
});
