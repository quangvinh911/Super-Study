import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { QuestionBankService } from '../../core/data';
import { LoadedQuestionBank, QuestionBankSource } from '../../core/models';
import { ProgressRepository } from '../../core/persistence';
import { QuizSessionStore } from '../../core/state';

@Component({
  selector: 'app-mock-exam-setup-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './mock-exam-setup-page.html',
  styleUrl: './mock-exam-setup-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockExamSetupPage implements OnInit {
  private readonly bankService = inject(QuestionBankService);
  private readonly repository = inject(ProgressRepository);
  private readonly store = inject(QuizSessionStore);
  private readonly router = inject(Router);

  protected readonly banks = signal<Readonly<Partial<Record<QuestionBankSource, LoadedQuestionBank>>>>({});
  protected readonly loading = signal(true);
  protected readonly starting = signal(false);
  protected readonly error = signal('');
  protected durationMinutes: 60 | 75 = 60;
  protected bankSource: QuestionBankSource = 'original';

  protected selectedBank(): LoadedQuestionBank | null {
    return this.banks()[this.bankSource] ?? null;
  }

  protected isPdfSource(): boolean {
    return this.bankSource === 'pdf';
  }

  async ngOnInit(): Promise<void> {
    try {
      const [original, pdf, preferredDuration, preferredSource] = await Promise.all([
        this.bankService.load(),
        this.bankService.load('/data/pdf-manifest.json'),
        this.repository.getSetting<60 | 75>('preferredExamDurationMinutes'),
        this.repository.getSetting<QuestionBankSource>('lastQuestionBankSource'),
      ]);
      this.banks.set({ original, pdf });
      if (preferredSource === 'original' || preferredSource === 'pdf') {
        this.bankSource = preferredSource;
      }
      if (preferredDuration === 60 || preferredDuration === 75) {
        this.durationMinutes = preferredDuration;
      }
    } catch {
      this.error.set('Không thể tải ngân hàng câu hỏi. Hãy thử tải lại trang.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async start(): Promise<void> {
    const bank = this.selectedBank();
    if (!bank || this.starting()) {
      return;
    }
    this.starting.set(true);
    this.error.set('');
    try {
      const snapshot = await this.store.startExam({
        bankVersion: bank.manifest.bankVersion,
        bankSource: this.bankSource,
        questions: bank.questions,
        solutions: bank.solutions,
        durationMinutes: this.durationMinutes,
        generation: this.isPdfSource() ? 'random40' : 'blueprint',
      });
      await this.repository.setSetting(
        'preferredExamDurationMinutes',
        this.durationMinutes,
      );
      await this.repository.setSetting('lastQuestionBankSource', this.bankSource);
      await this.router.navigate(['/mock-exam', snapshot.id]);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      this.error.set(
        detail.includes('inventory') || detail.includes('blueprint')
          ? 'Ngân hàng hiện chưa đủ câu cho đúng ma trận đề thi 40 câu.'
          : 'Không thể bắt đầu đề thi. Hãy thử lại.',
      );
    } finally {
      this.starting.set(false);
    }
  }
}
