import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CertificateContext } from '../../certificates/certificate-context';
import { QuestionBankService } from '../../core/data';
import { ProgressRepository } from '../../core/persistence';
import { SessionSnapshot } from '../../core/models';
import { generateExam } from '../../core/domain/exam-generator';
import { StudyIcon } from '../../components/study-icon/study-icon';

@Component({
  selector: 'app-certificate-page',
  imports: [RouterLink, StudyIcon],
  styleUrl: './certificate-page.scss',
  templateUrl: './certificate-page.html',
})
export class CertificatePage implements OnInit {
  protected readonly certificate = inject(CertificateContext);
  private readonly banks = inject(QuestionBankService);
  private readonly repository = inject(ProgressRepository);
  protected readonly count = signal(0);
  protected readonly examReady = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly resume = signal<SessionSnapshot | undefined>(undefined);
  async ngOnInit(): Promise<void> {
    try {
      const [banksResult, sessionsResult] = await Promise.allSettled([
        Promise.all(
          this.certificate.definition.banks.map((bank) =>
            this.banks.load(bank.manifestUrl, this.certificate.id),
          ),
        ),
        this.repository.listActiveSessions(),
      ]);
      if (banksResult.status === 'fulfilled') {
        const banks = banksResult.value;
        this.count.set(banks.reduce((count, bank) => count + bank.questions.length, 0));
        this.examReady.set(
          banks.some((bank) => {
            try {
              generateExam(
                bank.questions,
                bank.solutions,
                this.certificate.definition.exam,
                'overview-check',
              );
              return true;
            } catch {
              return false;
            }
          }),
        );
      } else {
        this.error.set('Chưa tải được ngân hàng câu hỏi. Hãy thử tải lại trang.');
      }
      if (sessionsResult.status === 'fulfilled') {
        this.resume.set(
          sessionsResult.value
            .filter((session) => session.status === 'active')
            .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))[0],
        );
      } else {
        this.error.set('Chưa đọc được tiến độ trên thiết bị này. Hãy thử tải lại trang.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
