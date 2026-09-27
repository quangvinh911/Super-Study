import { CertificateContext } from '../../certificates/certificate-context';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContentBlocks } from '../../components/content-blocks/content-blocks';
import { SessionResponse } from '../../core/models';
import { QuizSessionStore, SessionLockedError } from '../../core/state';

@Component({
  selector: 'app-mock-exam-session-page',
  imports: [ContentBlocks, RouterLink],
  templateUrl: './mock-exam-session-page.html',
  styleUrl: './mock-exam-session-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockExamSessionPage implements OnInit, OnDestroy {
  protected readonly certificate = inject(CertificateContext);
  @ViewChild('questionHeading') private questionHeading?: ElementRef<HTMLElement>;

  protected readonly store = inject(QuizSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly warning = signal('');
  protected readonly selectionMessage = signal('');
  protected readonly submitting = signal(false);

  async ngOnInit(): Promise<void> {
    const sessionId = this.route.snapshot.paramMap.get('sessionId');
    if (!sessionId) {
      await this.router.navigate(this.certificate.link('mock-exam'));
      return;
    }

    this.store.setDeadlineHooks({
      onSectionChange: () => this.warning.set(''),
      onWarning: (minutes) =>
        this.warning.set(`Còn ${minutes} phút. Hãy kiểm tra các câu đã đánh dấu và chưa trả lời.`),
      onAutoSubmit: (attempt) =>
        void this.router.navigate(this.certificate.link('results', attempt.id)),
    });

    try {
      const restored = await this.store.restore(sessionId);
      const attempt = this.store.lastAttempt();
      if (attempt) {
        await this.router.navigate(this.certificate.link('results', attempt.id));
        return;
      }
      if (!restored || this.store.snapshot()?.mode !== 'exam') {
        this.error.set('Bài thi này không còn hoạt động hoặc không tồn tại.');
      }
    } catch (cause) {
      this.error.set(
        cause instanceof SessionLockedError
          ? 'Bài thi đang được mở trong một tab khác. Hãy đóng tab kia rồi thử lại.'
          : 'Không thể khôi phục bài thi.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.store.setDeadlineHooks({});
    void this.store.flushPersistence();
  }

  @HostListener('window:beforeunload')
  protected persistBeforeUnload(): void {
    void this.store.flushPersistence();
  }

  protected formatTime(milliseconds: number | null): string {
    const totalSeconds = Math.max(0, Math.ceil((milliseconds ?? 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  protected isUrgent(): boolean {
    const remaining = this.store.remainingMs();
    return remaining !== null && remaining <= 5 * 60_000;
  }

  protected isSelected(optionId: string): boolean {
    return this.store.currentResponse()?.selectedOptionIds.includes(optionId) ?? false;
  }

  protected optionDisabled(optionId: string): boolean {
    const item = this.store.currentQuestion();
    const response = this.store.currentResponse();
    if (!item || !response) {
      return true;
    }
    return (
      item.question.interaction.kind === 'multiSelect' &&
      response.selectedOptionIds.length >= item.question.interaction.requiredSelections &&
      !response.selectedOptionIds.includes(optionId)
    );
  }

  protected selectOption(optionId: string, selected: boolean): void {
    if (this.store.selectOption(optionId, selected)) {
      this.selectionMessage.set('');
    } else {
      const required = this.store.currentQuestion()?.question.interaction.requiredSelections ?? 1;
      this.selectionMessage.set(`Câu này yêu cầu đúng ${required} lựa chọn.`);
    }
  }

  protected responseFor(questionId: string): SessionResponse | undefined {
    return this.store.snapshot()?.responses[questionId];
  }

  protected navigatorClass(index: number, questionId: string): string {
    const snapshot = this.store.snapshot();
    const response = this.responseFor(questionId);
    const classes = ['navigator-button'];
    if ((response?.selectedOptionIds.length ?? 0) > 0) classes.push('navigator-button--answered');
    if (response?.flagged) classes.push('navigator-button--flagged');
    if (snapshot?.currentIndex === index) classes.push('navigator-button--current');
    return classes.join(' ');
  }

  protected goTo(index: number): void {
    this.store.goTo(index);
    this.selectionMessage.set('');
    this.restoreFocus();
  }

  protected previous(): void {
    this.goTo(Math.max(0, (this.store.snapshot()?.currentIndex ?? 0) - 1));
  }

  protected next(): void {
    const snapshot = this.store.snapshot();
    if (snapshot) {
      this.goTo(Math.min(snapshot.questions.length - 1, snapshot.currentIndex + 1));
    }
  }

  protected toggleFlag(): void {
    this.store.toggleFlag();
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    const unanswered = this.store.unansweredCount();
    const prompt = unanswered
      ? `Bạn còn ${unanswered} câu chưa trả lời. Nộp bài ngay?`
      : 'Bạn đã trả lời tất cả câu. Nộp bài ngay?';
    if (!globalThis.confirm(prompt)) {
      return;
    }
    this.submitting.set(true);
    try {
      const attempt = await this.store.submit();
      if (attempt) {
        await this.router.navigate(this.certificate.link('results', attempt.id));
      }
    } finally {
      this.submitting.set(false);
    }
  }

  private restoreFocus(): void {
    globalThis.setTimeout(() => this.questionHeading?.nativeElement.focus(), 0);
  }
}
