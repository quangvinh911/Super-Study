import { CertificateContext } from '../../certificates/certificate-context';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Chapter,
  KLevel,
  LoadedQuestionBank,
  PracticeHistoryFilter,
  QuestionBankSource,
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
  protected readonly certificate = inject(CertificateContext);
  private readonly bankService = inject(QuestionBankService);
  private readonly repository = inject(ProgressRepository);
  private readonly store = inject(QuizSessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(true);
  protected readonly starting = signal(false);
  protected readonly error = signal('');
  protected readonly banks = signal<
    Readonly<Partial<Record<QuestionBankSource, LoadedQuestionBank>>>
  >({});
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
  protected section = 'all';
  protected style: 'all' | QuestionStyleTag = 'all';
  protected history: 'all' | PracticeHistoryFilter = 'all';
  protected questionLimit = 10;
  protected bankSource: QuestionBankSource = this.certificate.definition.banks[0]!.id;

  protected selectedBank(): LoadedQuestionBank | null {
    return this.banks()[this.bankSource] ?? null;
  }

  protected isPdfSource(): boolean {
    return this.bankSource === 'pdf';
  }

  protected availableLearningObjectives(): string[] {
    const questions = this.selectedBank()?.questions ?? [];
    return [
      ...new Set(
        questions
          .filter(
            (question) =>
              this.chapter === 'all' || question.classification.chapter === this.chapter,
          )
          .map((question) => question.classification.learningObjective)
          .filter((objective): objective is string => Boolean(objective)),
      ),
    ].sort();
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const requestedHistory = this.route.snapshot.queryParamMap.get('history');
    if (
      this.route.snapshot.queryParamMap.get('source') === 'pdf' &&
      this.certificate.definition.banks.some((bank) => bank.id === 'pdf')
    ) {
      this.bankSource = 'pdf';
    }
    if (
      requestedHistory === 'unseen' ||
      requestedHistory === 'incorrect' ||
      requestedHistory === 'bookmarked'
    ) {
      this.history = requestedHistory;
    }
    try {
      const entries = await Promise.all(
        this.certificate.definition.banks.map(
          async (bank) =>
            [bank.id, await this.bankService.load(bank.manifestUrl, this.certificate.id)] as const,
        ),
      );
      this.banks.set(Object.fromEntries(entries));
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

  protected sourceChanged(): void {
    this.chapter = 'all';
    this.learningObjective = 'all';
    this.kLevel = 'all';
    this.style = 'all';
  }

  protected async start(): Promise<void> {
    const bank = this.selectedBank();
    if (!bank?.questions.length || this.starting()) {
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
        certificateId: this.certificate.id,
        scoringPolicy: this.certificate.definition.exam.scoring,
        bankVersion: bank.manifest.bankVersion,
        bankSource: this.bankSource,
        questions: bank.questions,
        solutions: bank.solutions,
        config: {
          sections: this.section === 'all' ? undefined : [this.section],
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
      await this.repository.setSetting('lastQuestionBankSource', this.bankSource);
      await this.router.navigate(this.certificate.link('practice', snapshot.id));
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
