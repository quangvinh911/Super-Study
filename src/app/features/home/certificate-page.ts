import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CertificateContext } from '../../certificates/certificate-context';
import { QuestionBankService } from '../../core/data';
import { ProgressRepository } from '../../core/persistence';
import { SessionSnapshot } from '../../core/models';
import { generateExam } from '../../core/domain/exam-generator';

@Component({
  selector: 'app-certificate-page',
  imports: [RouterLink],
  styleUrl: './home-page.scss',
  template: `
    <div class="page">
      <header class="page-header">
        <p class="eyebrow">{{ certificate.definition.subtitle }}</p>
        <h1>Học {{ certificate.name }}</h1>
        <p>{{ certificate.definition.description }}</p>
      </header>

      @if (resume(); as session) {
        <section class="surface recent-certificate" aria-labelledby="resume-title">
          <div>
            <p class="eyebrow">Học tiếp</p>
            <h2 id="resume-title">Tiếp tục phiên đang làm</h2>
            <p>
              {{ session.mode === 'exam' ? 'Thi thử' : 'Luyện tập' }} · Câu
              {{ session.currentIndex + 1 }}/{{ session.questions.length }}
            </p>
          </div>
          <a
            class="button"
            [routerLink]="
              certificate.link(session.mode === 'exam' ? 'mock-exam' : 'practice', session.id)
            "
            >Tiếp tục</a
          >
        </section>
      }

      <section class="catalog-group" aria-labelledby="start-title">
        <div class="catalog-group__heading">
          <p class="eyebrow">Bắt đầu học</p>
          <h2 id="start-title">Chọn cách học</h2>
        </div>
        @if (loading()) {
          <p role="status">Đang tải ngân hàng câu hỏi…</p>
        } @else if (error()) {
          <p role="alert">{{ error() }}</p>
        } @else {
          <p>{{ count() }} câu hỏi có sẵn để luyện tập.</p>
        }
        <div class="certificate-grid">
          @for (resource of certificate.definition.learningResources ?? []; track resource.path) {
            <article class="surface certificate-card certificate-card--toeic">
              <p class="eyebrow">Kiến thức</p>
              <h3>{{ resource.label }}</h3>
              <p>{{ resource.description }}</p>
              <a class="button" [routerLink]="certificate.link(resource.path)"
                >Mở {{ resource.label }}</a
              >
            </article>
          }
          <article class="surface certificate-card">
            <p class="eyebrow">Luyện tập</p>
            <h3>Ôn theo chủ đề</h3>
            <p>Chọn phạm vi, luyện câu sai hoặc bookmark. Xem giải thích sau mỗi lần kiểm tra.</p>
            <a class="button" [routerLink]="certificate.link('practice')"
              >Luyện tập {{ certificate.name }}</a
            >
          </article>
          <article class="surface certificate-card">
            <p class="eyebrow">Thi thử</p>
            <h3>
              {{ certificate.definition.exam.questionCount }} câu ·
              {{ certificate.definition.exam.durations[0] }} phút
            </h3>
            <p>
              {{
                examReady()
                  ? 'Làm đề có giới hạn thời gian và xem kết quả sau khi nộp.'
                  : 'Xem cấu trúc bài thi. Đề đầy đủ sẽ mở khi có đủ câu hỏi.'
              }}
            </p>
            <a class="button button--secondary" [routerLink]="certificate.link('mock-exam')">{{
              examReady() ? 'Thi thử ' + certificate.name : 'Xem cấu trúc thi'
            }}</a>
          </article>
        </div>
      </section>

      <section class="catalog-group" aria-labelledby="review-title">
        <div class="catalog-group__heading">
          <p class="eyebrow">Ôn lại</p>
          <h2 id="review-title">Tiếp tục củng cố</h2>
        </div>
        <div class="review-links surface">
          <a [routerLink]="certificate.link('practice')" [queryParams]="{ history: 'incorrect' }"
            >Luyện câu từng làm sai →</a
          >
          <a [routerLink]="certificate.link('practice')" [queryParams]="{ history: 'bookmarked' }"
            >Luyện câu đã đánh dấu →</a
          >
          <a [routerLink]="certificate.link('progress')">Xem tiến độ {{ certificate.name }} →</a>
        </div>
      </section>

      <section class="catalog-group" aria-labelledby="exam-info-title">
        <div class="catalog-group__heading">
          <h2 id="exam-info-title">Thông tin kỳ thi</h2>
        </div>
        <p>
          {{ certificate.definition.exam.label }} ·
          {{ certificate.definition.exam.questionCount }} câu ·
          {{ certificate.definition.exam.durations[0] }} phút
        </p>
        <a [routerLink]="certificate.link('methodology')">Xem hướng dẫn và nguồn tham khảo</a>
      </section>
    </div>
  `,
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
