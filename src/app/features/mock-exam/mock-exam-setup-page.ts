import { CertificateContext } from '../../certificates/certificate-context';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { QuestionBankService } from '../../core/data';
import { LoadedQuestionBank, QuestionBankSource } from '../../core/models';
import { ProgressRepository } from '../../core/persistence';
import { QuizSessionStore } from '../../core/state';
import { generateExam } from '../../core/domain/exam-generator';

@Component({
  selector: 'app-mock-exam-setup-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './mock-exam-setup-page.html',
  styleUrl: './mock-exam-setup-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockExamSetupPage implements OnInit {
  protected readonly certificate = inject(CertificateContext);
  private readonly bankService = inject(QuestionBankService);
  private readonly repository = inject(ProgressRepository);
  private readonly store = inject(QuizSessionStore);
  private readonly router = inject(Router);

  protected readonly banks = signal<
    Readonly<Partial<Record<QuestionBankSource, LoadedQuestionBank>>>
  >({});
  protected readonly loading = signal(true);
  protected readonly starting = signal(false);
  protected readonly error = signal('');
  protected durationMinutes = this.certificate.definition.exam.durations[0]!;
  protected bankSource: QuestionBankSource = this.certificate.definition.banks[0]!.id;

  protected selectedBank(): LoadedQuestionBank | null {
    return this.banks()[this.bankSource] ?? null;
  }

  protected isPdfSource(): boolean {
    return this.bankSource === 'pdf';
  }

  protected inventoryReady(): boolean {
    const bank = this.selectedBank();
    if (!bank?.questions.length) return false;
    try {
      generateExam(
        bank.questions,
        bank.solutions,
        this.certificate.definition.exam,
        'inventory-check',
      );
      return true;
    } catch {
      return false;
    }
  }

  protected passMark(): number | null {
    const exam = this.certificate.definition.exam;
    return exam.scoring.kind === 'threshold'
      ? Math.ceil((exam.questionCount * exam.scoring.passPercent) / 100)
      : null;
  }

  async ngOnInit(): Promise<void> {
    try {
      const [entries, preferredDuration, preferredSource] = await Promise.all([
        Promise.all(
          this.certificate.definition.banks.map(
            async (bank) =>
              [
                bank.id,
                await this.bankService.load(bank.manifestUrl, this.certificate.id),
              ] as const,
          ),
        ),
        this.repository.getSetting<number>('preferredExamDurationMinutes'),
        this.repository.getSetting<QuestionBankSource>('lastQuestionBankSource'),
      ]);
      this.banks.set(Object.fromEntries(entries));
      if (
        preferredSource &&
        this.certificate.definition.banks.some((bank) => bank.id === preferredSource)
      ) {
        this.bankSource = preferredSource;
      }
      if (
        preferredDuration &&
        this.certificate.definition.exam.durations.includes(preferredDuration)
      ) {
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
    if (!bank || !this.inventoryReady() || this.starting()) {
      return;
    }
    this.starting.set(true);
    this.error.set('');
    try {
      const snapshot = await this.store.startExam({
        certificateId: this.certificate.id,
        examDefinition: this.certificate.definition.exam,
        bankVersion: bank.manifest.bankVersion,
        bankSource: this.bankSource,
        questions: bank.questions,
        solutions: bank.solutions,
        durationMinutes: this.durationMinutes,
        generation: 'blueprint',
      });
      await this.repository.setSetting('preferredExamDurationMinutes', this.durationMinutes);
      await this.repository.setSetting('lastQuestionBankSource', this.bankSource);
      await this.router.navigate(this.certificate.link('mock-exam', snapshot.id));
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      this.error.set(
        detail.includes('inventory') || detail.includes('blueprint')
          ? 'Ngân hàng hiện chưa có bộ đề đầy đủ theo cấu trúc của chứng chỉ.'
          : 'Không thể bắt đầu đề thi. Hãy thử lại.',
      );
    } finally {
      this.starting.set(false);
    }
  }
}
