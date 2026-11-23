import { CertificateContext } from '../../certificates/certificate-context';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContentBlocks } from '../../components/content-blocks/content-blocks';
import { ProgressRepository } from '../../core/persistence';
import { QuizSessionStore } from '../../core/state';
import { PracticeExplanationService } from './practice-explanation.service';

@Component({
  selector: 'app-practice-session-page',
  imports: [ContentBlocks, RouterLink],
  templateUrl: './practice-session-page.html',
  styleUrl: './practice-session-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PracticeSessionPage implements OnInit, OnDestroy {
  protected readonly certificate = inject(CertificateContext);
  @ViewChild('questionHeading') private questionHeading?: ElementRef<HTMLElement>;

  protected readonly store = inject(QuizSessionStore);
  private readonly repository = inject(ProgressRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly explanations = inject(PracticeExplanationService);
  private explanationRequest?: AbortController;
  private readonly explanationCache = new Map<string, string>();
  protected readonly aiExplanation = signal('');
  protected readonly aiLoading = signal(false);
  protected readonly aiError = signal('');

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly validationMessage = signal('');
  protected readonly bookmarked = signal(false);
  protected readonly submitting = signal(false);

  async ngOnInit(): Promise<void> {
    const sessionId = this.route.snapshot.paramMap.get('sessionId');
    if (!sessionId) {
      await this.router.navigate(this.certificate.link('practice'));
      return;
    }
    try {
      const restored = await this.store.restore(sessionId);
      if (!restored || this.store.snapshot()?.mode !== 'practice') {
        this.error.set('Phiên luyện tập này không còn hoạt động hoặc không tồn tại.');
        return;
      }
      await this.refreshBookmark();
      void this.loadAiExplanation();
    } catch {
      this.error.set('Không thể khôi phục phiên luyện tập.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.explanationRequest?.abort();
  }

  protected async loadAiExplanation(): Promise<void> {
    this.explanationRequest?.abort();
    this.aiExplanation.set('');
    this.aiError.set('');
    this.aiLoading.set(false);
    const item = this.store.currentQuestion();
    const answer = this.store.currentResponse();
    if (!item || !answer?.checked || this.store.snapshot()?.mode !== 'practice') return;
    const cached = this.explanationCache.get(item.question.id);
    if (cached) {
      this.aiExplanation.set(cached);
      return;
    }
    const controller = new AbortController();
    this.explanationRequest = controller;
    this.aiLoading.set(true);
    try {
      const explanation = await this.explanations.explain(
        this.certificate.id,
        item,
        answer,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.explanationCache.set(item.question.id, explanation);
      this.aiExplanation.set(explanation);
    } catch (error) {
      if (!controller.signal.aborted)
        this.aiError.set(
          error instanceof Error ? error.message : 'Chưa tải được giải thích AI. Hãy thử lại.',
        );
    } finally {
      if (!controller.signal.aborted) this.aiLoading.set(false);
    }
  }

  protected isSelected(optionId: string): boolean {
    return this.store.currentResponse()?.selectedOptionIds.includes(optionId) ?? false;
  }

  protected isCorrectOption(optionId: string): boolean {
    return this.store.currentQuestion()?.solution.correctOptionIds.includes(optionId) ?? false;
  }

  protected optionClass(optionId: string): string {
    const response = this.store.currentResponse();
    if (!response?.checked) {
      return this.isSelected(optionId) ? 'option option--selected' : 'option';
    }
    if (this.isCorrectOption(optionId)) {
      return 'option option--correct';
    }
    if (this.isSelected(optionId)) {
      return 'option option--wrong';
    }
    return 'option option--muted';
  }

  protected optionDisabled(optionId: string): boolean {
    const item = this.store.currentQuestion();
    const response = this.store.currentResponse();
    if (!item || !response) {
      return true;
    }
    if (response.checked) {
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
      this.validationMessage.set('');
    }
  }

  protected async check(): Promise<void> {
    let result: boolean | null;
    try {
      result = await this.store.checkCurrent();
    } catch {
      this.validationMessage.set('Chưa lưu được câu trả lời. Giữ trang mở và thử lưu lại.');
      return;
    }
    if (result === null) {
      const required = this.store.currentQuestion()?.question.interaction.requiredSelections ?? 1;
      this.validationMessage.set(
        required === 1
          ? 'Hãy chọn một đáp án trước khi kiểm tra.'
          : `Hãy chọn đúng ${required} đáp án trước khi kiểm tra.`,
      );
    } else {
      this.validationMessage.set('');
      void this.loadAiExplanation();
    }
  }

  protected async toggleBookmark(): Promise<void> {
    const question = this.store.currentQuestion()?.question;
    if (!question) {
      return;
    }
    try {
      this.bookmarked.set(await this.repository.toggleBookmark(question.id, question.revision));
    } catch {
      this.validationMessage.set('Không thể lưu đánh dấu. Hãy thử lại.');
    }
  }

  protected goTo(index: number): void {
    this.store.goTo(index);
    void this.loadAiExplanation();
    this.validationMessage.set('');
    void this.refreshBookmark();
    this.restoreFocus();
  }

  protected previous(): void {
    const index = (this.store.snapshot()?.currentIndex ?? 0) - 1;
    this.goTo(Math.max(0, index));
  }

  protected next(): void {
    const snapshot = this.store.snapshot();
    if (!snapshot) {
      return;
    }
    this.goTo(Math.min(snapshot.questions.length - 1, snapshot.currentIndex + 1));
  }

  protected async finish(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    const unanswered = this.store.unansweredCount();
    if (
      unanswered > 0 &&
      !globalThis.confirm(`Bạn còn ${unanswered} câu chưa trả lời. Vẫn kết thúc phiên?`)
    ) {
      return;
    }
    this.submitting.set(true);
    try {
      const attempt = await this.store.submit();
      if (attempt) {
        await this.router.navigate(this.certificate.link('results', attempt.id));
      }
    } catch {
      this.validationMessage.set('Chưa lưu được kết quả. Giữ trang mở và thử lưu lại.');
    } finally {
      this.submitting.set(false);
    }
  }

  private async refreshBookmark(): Promise<void> {
    const id = this.store.currentQuestion()?.question.id;
    try {
      this.bookmarked.set(id ? await this.repository.isBookmarked(id) : false);
    } catch {
      this.validationMessage.set('Không thể tải đánh dấu. Hãy kiểm tra kết nối.');
    }
  }

  protected async retrySave(): Promise<void> {
    try {
      const attempt = await this.store.retryPersistence();
      this.validationMessage.set('');
      if (attempt) await this.router.navigate(this.certificate.link('results', attempt.id));
    } catch {
      this.validationMessage.set('Vẫn chưa lưu được. Hãy kiểm tra kết nối và thử lại.');
    }
  }

  private restoreFocus(): void {
    globalThis.setTimeout(() => this.questionHeading?.nativeElement.focus(), 0);
  }
}
