import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CERTIFICATE } from '../../certificates/certificate-context';
import { findCertificate } from '../../certificates/registry';
import { ProgressRepository } from '../../core/persistence';
import { QuizSessionStore } from '../../core/state';
import { toeicFixture } from '../../core/testing/toeic-fixture';
import { PracticeSessionPage } from './practice-session-page';
import { PracticeExplanationService } from './practice-explanation.service';

describe('Practice answer explanations', () => {
  let repository: ProgressRepository | undefined;
  let store: QuizSessionStore | undefined;
  const explain = vi.fn();
  afterEach(async () => {
    TestBed.resetTestingModule();
    await store?.close();
    repository?.close();
    explain.mockReset();
  });

  async function setup(questionCount = 1) {
    explain.mockResolvedValue('Lời giải AI: phân tích chi tiết từng đáp án.');
    const certificate = findCertificate('toeic');
    if (!certificate) throw new Error('Missing TOEIC certificate');
    repository = new ProgressRepository(`practice-feedback-${crypto.randomUUID()}`, certificate);
    const sessionStore = new QuizSessionStore(repository);
    store = sessionStore;
    const bank = toeicFixture();
    const questions = bank.questions.slice(100, 100 + questionCount);
    const solution = {
      ...bank.solutions[100],
      explanation: [{ kind: 'paragraph' as const, text: 'Detailed explanation of the answer.' }],
      optionRationales: {
        A: [{ kind: 'paragraph' as const, text: 'A fits the sentence structure.' }],
        B: [{ kind: 'paragraph' as const, text: 'B has the wrong grammatical role.' }],
      },
    };
    const session = await sessionStore.startPractice({
      certificateId: 'toeic',
      bankVersion: 'test',
      questions,
      solutions: questions.map((question) => ({ ...solution, questionId: question.id })),
      config: { questionLimit: questionCount, shuffleQuestions: false },
    });
    await TestBed.configureTestingModule({
      imports: [PracticeSessionPage],
      providers: [
        provideRouter([]),
        { provide: CERTIFICATE, useValue: certificate },
        { provide: QuizSessionStore, useValue: sessionStore },
        { provide: ProgressRepository, useValue: repository },
        { provide: PracticeExplanationService, useValue: { explain } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ sessionId: session.id }) } },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PracticeSessionPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.querySelectorAll('.options input')).toHaveLength(4);
    });
    return { fixture, element };
  }

  for (const selected of ['A', 'B']) {
    it(`shows the explanation and option reasons immediately after checking ${selected}`, async () => {
      const { fixture, element } = await setup();
      expect(element.querySelector('.feedback')).toBeNull();
      expect(explain).not.toHaveBeenCalled();
      const inputs = element.querySelectorAll<HTMLInputElement>('.options input');
      inputs[selected === 'A' ? 0 : 1].click();
      fixture.detectChanges();
      await fixture.whenStable();
      element.querySelector<HTMLButtonElement>('.check-button')?.click();
      await fixture.whenStable();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(element.querySelector('.ai-explanation')?.textContent).toContain('Lời giải AI:');
      });
      const feedback = element.querySelector('.feedback');
      expect(feedback?.textContent).toContain('Lời giải AI: phân tích chi tiết từng đáp án.');
      expect(explain).toHaveBeenCalledTimes(1);
      expect(feedback?.textContent).toContain('Detailed explanation of the answer.');
      expect(feedback?.textContent).toContain('A fits the sentence structure.');
      expect(feedback?.textContent).toContain('B has the wrong grammatical role.');
      expect(feedback?.querySelector('details .option-rationales')).toBeNull();
      const answers = feedback?.querySelector('.answer-summary');
      expect(answers?.textContent).toContain('Option A');
      expect(answers?.textContent).toContain('Bạn đã chọn');
      expect(answers?.querySelectorAll('li')).toHaveLength(selected === 'A' ? 1 : 2);
      expect(element.querySelector('.check-button')).toBeNull();
    });
  }

  it('keeps explanations hidden when checking without an answer', async () => {
    const { fixture, element } = await setup();
    element.querySelector<HTMLButtonElement>('.check-button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('.feedback')).toBeNull();
    expect(explain).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Hãy chọn một đáp án');
  });

  it('offers retry when AI fails while preserving the graded answer', async () => {
    const { fixture, element } = await setup();
    explain.mockRejectedValueOnce(new Error('Dịch vụ AI tạm thời không khả dụng.'));
    element.querySelector<HTMLInputElement>('.options input')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('.check-button')?.click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.querySelector('.ai-explanation')?.textContent).toContain(
        'Dịch vụ AI tạm thời',
      );
    });
    expect(element.querySelector('.ai-explanation')?.textContent).toContain('Dịch vụ AI tạm thời');
    expect(element.querySelector('.answer-summary')?.textContent).toContain('Đáp án đúng');
    element.querySelector<HTMLButtonElement>('.ai-explanation button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('.ai-explanation')?.textContent).toContain('Lời giải AI:');
  });

  it('cancels an explanation on navigation and ignores a late response', async () => {
    const { fixture, element } = await setup(2);
    let resolveExplanation: (value: string) => void = () => {
      throw new Error('Request not started');
    };
    explain.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveExplanation = resolve;
        }),
    );
    element.querySelector<HTMLInputElement>('.options input')?.click();
    element.querySelector<HTMLButtonElement>('.check-button')?.click();
    await vi.waitFor(() => expect(explain).toHaveBeenCalledTimes(1));
    const signal: AbortSignal = explain.mock.calls[0][3];
    fixture.detectChanges();
    expect(element.querySelector('.ai-explanation')?.textContent).toContain('Đang phân tích');
    element.querySelectorAll<HTMLButtonElement>('.quiz-actions button')[1].click();
    fixture.detectChanges();
    expect(signal.aborted).toBe(true);
    resolveExplanation('Late explanation of the previous question.');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Late explanation');
    expect(element.querySelector('.feedback')).toBeNull();
  });

  it('reuses a successful explanation when returning to a checked question', async () => {
    const { fixture, element } = await setup(2);
    element.querySelector<HTMLInputElement>('.options input')?.click();
    element.querySelector<HTMLButtonElement>('.check-button')?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.querySelector('.ai-explanation')?.textContent).toContain('Lời giải AI:');
    });
    element.querySelectorAll<HTMLButtonElement>('.quiz-actions button')[1].click();
    fixture.detectChanges();
    element.querySelectorAll<HTMLButtonElement>('.quiz-actions button')[0].click();
    fixture.detectChanges();
    expect(element.querySelector('.ai-explanation')?.textContent).toContain('Lời giải AI:');
    expect(explain).toHaveBeenCalledTimes(1);
  });
});
