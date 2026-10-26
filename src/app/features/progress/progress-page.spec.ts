import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CERTIFICATE } from '../../certificates/certificate-context';
import { CTFL, findCertificate } from '../../certificates/registry';
import { AuthService } from '../../core/auth/auth.service';
import { calculateAttemptResult } from '../../core/domain';
import {
  Attempt,
  Bookmark,
  CertificateDefinition,
  Question,
  QuestionStat,
  SessionSnapshot,
} from '../../core/models';
import { ProgressRepository } from '../../core/persistence';
import { QuizSessionStore } from '../../core/state';
import { ProgressPage } from './progress-page';

const timestamp = '2026-10-20T08:00:00.000Z';

function question(id: string, revision: number, fields: Partial<Question> = {}): Question {
  return {
    id,
    revision,
    language: 'en',
    stem: [{ kind: 'paragraph', text: 'Stored practice question' }],
    options: [{ id: 'A', content: [{ kind: 'paragraph', text: 'A stored option' }] }],
    interaction: { kind: 'singleChoice', requiredSelections: 1 },
    classification: {
      chapter: 2,
      section: '2.1',
      kLevel: 'K2',
      learningObjective: 'FL-2.1.1',
      styleTags: [],
    },
    shuffleOptions: false,
    provenance: { kind: 'original', authoringNote: 'Test fixture', rightsStatus: 'cleared' },
    verification: {
      answerStatus: 'verified',
      reviewedAgainst: 'Test fixture',
      reviewedAt: '2026-10-20',
    },
    ...fields,
  };
}

function activeSession(questions: readonly Question[]): SessionSnapshot {
  return {
    schemaVersion: 1,
    id: 'session-active',
    mode: 'practice',
    bankVersion: 'stored-bank',
    seed: 'stored-seed',
    status: 'active',
    createdAt: timestamp,
    startedAt: timestamp,
    updatedAt: timestamp,
    currentIndex: 0,
    questions: questions.map((question) => ({
      question,
      solution: {
        questionId: question.id,
        correctOptionIds: ['A'],
        explanation: [],
        references: [],
      },
    })),
    responses: {},
  };
}

function completedAttempt(questions: readonly Question[]): Attempt {
  const session = activeSession(questions);
  return {
    id: 'attempt-completed',
    sessionId: 'session-completed',
    mode: session.mode,
    bankVersion: session.bankVersion,
    seed: session.seed,
    startedAt: timestamp,
    completedAt: timestamp,
    durationSeconds: 60,
    completionReason: 'submitted',
    questions: session.questions,
    responses: {},
    result: calculateAttemptResult(session.questions, {}),
  };
}

function stat(questionId: string, revision: number): QuestionStat {
  return {
    questionId,
    revision,
    seenCount: 1,
    correctCount: 0,
    incorrectCount: 1,
    currentCorrectStreak: 0,
    updatedAt: timestamp,
  };
}

async function render({
  certificate = CTFL,
  sessions = [],
  attempts = [],
  stats = [],
  bookmarks = [],
}: {
  certificate?: CertificateDefinition;
  sessions?: readonly SessionSnapshot[];
  attempts?: readonly Attempt[];
  stats?: readonly QuestionStat[];
  bookmarks?: readonly Bookmark[];
}) {
  await TestBed.configureTestingModule({
    imports: [ProgressPage],
    providers: [
      provideRouter([]),
      { provide: CERTIFICATE, useValue: certificate },
      { provide: AuthService, useValue: { user: signal(null) } },
      { provide: QuizSessionStore, useValue: { close: vi.fn() } },
      {
        provide: ProgressRepository,
        useValue: {
          listActiveSessions: vi.fn().mockResolvedValue(sessions),
          listAttempts: vi.fn().mockResolvedValue(attempts),
          listQuestionStats: vi.fn().mockResolvedValue(stats),
          listBookmarks: vi.fn().mockResolvedValue(bookmarks),
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ProgressPage);
  fixture.detectChanges();
  await fixture.whenStable();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.metric-grid')).not.toBeNull();
  });
  return fixture.nativeElement as HTMLElement;
}

describe('Progress page', () => {
  it('labels each saved revision from its own active or completed question snapshot', async () => {
    const toeic = findCertificate('toeic');
    if (!toeic) throw new Error('TOEIC certificate is missing.');
    const previous = question('stable-question', 1, {
      classification: { section: 'part-5', styleTags: [] },
      provenance: {
        kind: 'sourceExcerpt',
        authoringNote: 'Printed question fixture',
        rightsStatus: 'cleared',
        sourceQuestionNumber: 108,
      },
      order: 8,
    });
    const current = question('stable-question', 2, {
      classification: { section: 'part-6', styleTags: [] },
      order: 133,
    });
    const page = await render({
      certificate: toeic,
      sessions: [activeSession([current])],
      attempts: [completedAttempt([previous])],
      stats: [stat(previous.id, previous.revision), stat(current.id, current.revision)],
      bookmarks: [{ questionId: previous.id, revision: previous.revision, createdAt: timestamp }],
    });
    expect(
      Array.from(page.querySelectorAll('.weak-row strong'), (item) => item.textContent),
    ).toEqual(['Part 5 · Incomplete Sentences · Câu 108', 'Part 6 · Text Completion · Câu 133']);
    expect(page.querySelector('.bookmark-panel strong')?.textContent).toBe(
      'Part 5 · Incomplete Sentences · Câu 108',
    );
  });

  it('uses the current certificate chapter label with the stored authored question order', async () => {
    const stored = question('ctfl-stored-question', 3, { order: 9 });
    const page = await render({
      attempts: [completedAttempt([stored])],
      stats: [stat(stored.id, stored.revision)],
    });
    expect(page.querySelector('.weak-row strong')?.textContent).toBe(
      'Chapter 2 · K2 · FL-2.1.1 · Câu 9',
    );
  });

  it('keeps the actual ID when only a different revision or no snapshot exists', async () => {
    const stored = question('updated-question', 2, { order: 4 });
    const page = await render({
      sessions: [activeSession([stored])],
      stats: [stat(stored.id, 1), stat('missing-question', 1)],
      bookmarks: [{ questionId: stored.id, revision: 3, createdAt: timestamp }],
    });
    expect(
      Array.from(page.querySelectorAll('.weak-row strong'), (item) => item.textContent),
    ).toEqual(['updated-question', 'missing-question']);
    expect(page.querySelector('.bookmark-panel strong')?.textContent).toBe('updated-question');
  });

  it('shows the resumable session before metrics and keeps data management collapsed', async () => {
    const page = await render({ sessions: [activeSession([question('active-question', 1)])] });
    const sections = page.querySelectorAll('.progress-page > section');
    expect(sections[0]?.getAttribute('aria-labelledby')).toBe('active-title');
    expect(sections[1]?.getAttribute('aria-label')).toBe('Tổng quan tiến độ');
    expect(page.querySelector('.session-card a')?.getAttribute('href')).toBe(
      '/certificates/ctfl/practice/session-active',
    );
    expect(page.querySelector('.session-card')?.closest('details')).toBeNull();
    expect(page.querySelector<HTMLDetailsElement>('.data-tools')?.open).toBe(false);
  });
});
