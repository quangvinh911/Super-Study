import { CertificateContext } from '../../certificates/certificate-context';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AvailableQuestionBank, QuestionBankService } from '../../core/data';
import { LoadedQuestionBank, QuestionBankSource } from '../../core/models';
import { ProgressRepository } from '../../core/persistence';
import { QuizSessionStore } from '../../core/state';
import { canGenerateExam } from '../../core/domain/exam-generator';
import { AuthService } from '../../core/auth/auth.service';
import { LoginDialogService } from '../../core/auth/login-dialog.service';

@Component({
  selector: 'app-mock-exam-setup-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './mock-exam-setup-page.html',
  styleUrl: './mock-exam-setup-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockExamSetupPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly loginDialog = inject(LoginDialogService);
  protected readonly certificate = inject(CertificateContext);
  private readonly bankService = inject(QuestionBankService);
  private readonly repository = inject(ProgressRepository);
  private readonly store = inject(QuizSessionStore);
  private readonly router = inject(Router);

  protected readonly availableSources = signal<readonly AvailableQuestionBank[]>([]);
  protected readonly selectedBank = signal<LoadedQuestionBank | null>(null);
  protected readonly loading = signal(true);
  protected readonly starting = signal(false);
  protected readonly error = signal('');
  protected durationMinutes = this.certificate.definition.exam.durations[0]!;
  protected bankSource: QuestionBankSource = '';
  private bankRequest = 0;

  protected isPdfSource(): boolean {
    return this.bankSource === 'pdf';
  }

  protected readonly inventoryReady = computed(() => {
    const bank = this.selectedBank();
    return bank !== null && canGenerateExam(bank, this.certificate.definition.exam);
  });

  protected async retry(): Promise<void> {
    if (this.bankSource && this.availableSources().length)
      await this.sourceChanged(this.bankSource);
    else await this.ngOnInit();
  }

  protected passMark(): number | null {
    const exam = this.certificate.definition.exam;
    return exam.scoring.kind === 'threshold'
      ? Math.ceil((exam.questionCount * exam.scoring.passPercent) / 100)
      : null;
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [sources, preferredDuration, preferredSource] = await Promise.all([
        this.bankService.listBanks(this.certificate.definition),
        this.repository.getSetting<number>('preferredExamDurationMinutes'),
        this.repository.getSetting<QuestionBankSource>('lastQuestionBankSource'),
      ]);
      this.availableSources.set(sources);
      if (
        preferredDuration &&
        this.certificate.definition.exam.durations.includes(preferredDuration)
      ) {
        this.durationMinutes = preferredDuration;
      }
      const source = sources.find((bank) => bank.id === preferredSource) ?? sources[0];
      if (source) {
        await this.sourceChanged(source.id);
        return;
      }
      this.loading.set(false);
    } catch {
      this.error.set('Không thể tải ngân hàng câu hỏi. Hãy thử tải lại trang.');
      this.loading.set(false);
    }
  }

  protected async sourceChanged(id: QuestionBankSource): Promise<void> {
    if (this.starting()) return;
    const source = this.availableSources().find((bank) => bank.id === id);
    if (!source) return;
    const request = ++this.bankRequest;
    this.bankSource = id;
    this.loading.set(true);
    this.selectedBank.set(null);
    this.error.set('');
    try {
      const bank = await this.bankService.loadBank(source, this.certificate.id);
      if (request === this.bankRequest) this.selectedBank.set(bank);
    } catch {
      if (request === this.bankRequest)
        this.error.set('Không thể tải bộ câu hỏi này. Hãy thử lại.');
    } finally {
      if (request === this.bankRequest) this.loading.set(false);
    }
  }

  protected async start(): Promise<void> {
    if (!this.auth.user()) {
      this.loginDialog.open();
      return;
    }
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
