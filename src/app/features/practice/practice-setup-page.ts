import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Chapter,
  KLevel,
  LoadedQuestionBank,
  PracticeHistoryFilter,
  QuestionStyleTag,
} from '../../core/models';
import { QuestionBankService } from '../../core/data';
import { ProgressRepository } from '../../core/persistence';
import { QuizSessionStore } from '../../core/state';

@Component({
  selector: 'app-practice-setup-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './practice-setup-page.html',
  styleUrl: './practice-setup-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PracticeSetupPage implements OnInit {
  private readonly bankService = inject(QuestionBankService);
  private readonly repository = inject(ProgressRepository);
  private readonly store = inject(QuizSessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(true);
  protected readonly starting = signal(false);
  protected readonly error = signal('');
  protected readonly bank = signal<LoadedQuestionBank | null>(null);
  protected readonly chapters: readonly Chapter[] = [1, 2, 3, 4, 5, 6];
  protected readonly kLevels: readonly KLevel[] = ['K1', 'K2', 'K3'];
  protected readonly styles: readonly { value: QuestionStyleTag; label: string }[] = [
    { value: 'directKnowledge', label: 'Kiến thức trực tiếp' },
    { value: 'scenario', label: 'Tình huống' },
    { value: 'statementEvaluation', label: 'Đánh giá phát biểu' },
    { value: 'calculation', label: 'Tính toán' },
    { value: 'ordering', label: 'Sắp xếp' },
    { value: 'tableOrDiagram', label: 'Bảng hoặc sơ đồ' },
  ];

  protected chapter: 'all' | Chapter = 'all';
  protected kLevel: 'all' | KLevel = 'all';
  protected learningObjective = 'all';
  protected style: 'all' | QuestionStyleTag = 'all';
  protected history: 'all' | PracticeHistoryFilter = 'all';
  protected questionLimit = 10;

  protected availableLearningObjectives(): string[] {
    const questions = this.bank()?.questions ?? [];
    return [
      ...new Set(
        questions
          .filter(
            (question) =>
              this.chapter === 'all' || question.classification.chapter === this.chapter,
          )
          .map((question) => question.classification.learningObjective),
      ),
    ].sort();
  }

  async ngOnInit(): Promise<void> {
    const requestedHistory = this.route.snapshot.queryParamMap.get('history');
    if (
      requestedHistory === 'unseen' ||
      requestedHistory === 'incorrect' ||
      requestedHistory === 'bookmarked'
    ) {
      this.history = requestedHistory;
    }
    try {
      this.bank.set(await this.bankService.load());
    } catch {
      this.error.set('Không thể tải ngân hàng câu hỏi. Hãy thử tải lại trang.');
    } finally {
      this.loading.set(false);
    }
  }

  protected chapterChanged(): void {
    if (
      this.learningObjective !== 'all' &&
      !this.availableLearningObjectives().includes(this.learningObjective)
    ) {
      this.learningObjective = 'all';
    }
  }

  protected async start(): Promise<void> {
    const bank = this.bank();
    if (!bank || this.starting()) {
      return;
    }
    this.starting.set(true);
    this.error.set('');
    try {
      const [stats, bookmarks] = await Promise.all([
        this.repository.latestQuestionStats(),
        this.repository.listBookmarks(),
      ]);
      const snapshot = await this.store.startPractice({
        bankVersion: bank.manifest.bankVersion,
        questions: bank.questions,
        solutions: bank.solutions,
        config: {
          chapters: this.chapter === 'all' ? undefined : [this.chapter],
          learningObjectives:
            this.learningObjective === 'all' ? undefined : [this.learningObjective],
          kLevels: this.kLevel === 'all' ? undefined : [this.kLevel],
          styleTags: this.style === 'all' ? undefined : [this.style],
          history: this.history === 'all' ? undefined : [this.history],
          questionLimit: this.questionLimit,
          shuffleQuestions: true,
        },
        progress: {
          stats,
          bookmarkedQuestionIds: bookmarks.map((bookmark) => bookmark.questionId),
        },
      });
      await this.repository.setSetting('lastPracticeConfig', snapshot.practiceConfig);
      await this.router.navigate(['/practice', snapshot.id]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      this.error.set(
        message.includes('match the practice filters')
          ? 'Không có đủ câu hỏi phù hợp với bộ lọc này. Hãy nới bộ lọc và thử lại.'
          : 'Không thể bắt đầu phiên luyện tập. Hãy thử lại.',
      );
    } finally {
      this.starting.set(false);
    }
  }
}
