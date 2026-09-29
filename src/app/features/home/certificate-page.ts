import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CertificateContext } from '../../certificates/certificate-context';
import { QuestionBankService } from '../../core/data';
import { ProgressRepository } from '../../core/persistence';
import { SessionSnapshot } from '../../core/models';

@Component({
  selector: 'app-certificate-page',
  imports: [RouterLink],
  styleUrl: './home-page.scss',
  template: `
    <div class="page">
      <header class="page-header">
        <a routerLink="/">← Tất cả chứng chỉ</a>
        <p class="eyebrow">{{ certificate.definition.subtitle }}</p>
        <h1>Luyện thi {{ certificate.name }}</h1>
        <p>{{ certificate.definition.description }}</p>
      </header>
      @if (loading()) {
        <p role="status">Đang tải ngân hàng câu hỏi…</p>
      } @else if (error()) {
        <p role="alert">{{ error() }}</p>
      } @else if (count() === 0) {
        <section class="surface empty-bank" role="status">
          <h2>Chưa có bộ đề {{ certificate.name }}</h2>
          <p>Bạn có thể xem cấu trúc luyện tập và thi thử. Bài làm sẽ mở khi bộ đề được bổ sung.</p>
        </section>
      } @else {
        <p>{{ count() }} câu hỏi có sẵn để luyện tập.</p>
      }
      @if (resume(); as session) {
        <section class="surface empty-bank">
          <h2>Tiếp tục phiên đang làm</h2>
          <p>
            {{ session.mode === 'exam' ? 'Thi thử' : 'Luyện tập' }} · Câu
            {{ session.currentIndex + 1 }}/{{ session.questions.length }}
          </p>
          <a
            class="button"
            [routerLink]="
              certificate.link(session.mode === 'exam' ? 'mock-exam' : 'practice', session.id)
            "
            >Tiếp tục</a
          >
        </section>
      }
      <section class="certificate-grid" aria-label="Chọn cách học">
        @if (certificate.id === 'toeic') {
          <article class="surface certificate-card certificate-card--toeic">
            <p class="eyebrow">Học ngữ pháp</p>
            <h2>16 bài theo lộ trình</h2>
            <p>Quy tắc ngắn, ví dụ trong công việc, sơ đồ và câu tự kiểm tra cho Part 5–6.</p>
            <a class="button" [routerLink]="certificate.link('grammar')">Mở thư viện ngữ pháp</a>
          </article>
        }
        <article class="surface certificate-card">
          <p class="eyebrow">Luyện tập</p>
          <h2>Ôn theo chủ đề</h2>
          <p>Chọn phạm vi, luyện câu sai hoặc bookmark. Xem giải thích sau mỗi lần kiểm tra.</p>
          <a class="button" [routerLink]="certificate.link('practice')"
            >Luyện tập {{ certificate.name }}</a
          >
        </article>
        <article class="surface certificate-card">
          <p class="eyebrow">Thi thử</p>
          <h2>
            {{ certificate.definition.exam.questionCount }} câu ·
            {{ certificate.definition.exam.durations[0] }} phút
          </h2>
          <p>Làm bài có giới hạn thời gian, đánh dấu câu cần xem lại và xem kết quả sau khi nộp.</p>
          <a class="button button--secondary" [routerLink]="certificate.link('mock-exam')"
            >Thi thử {{ certificate.name }}</a
          >
        </article>
      </section>
      <p>
        <a [routerLink]="certificate.link('progress')">Xem tiến độ {{ certificate.name }}</a>
      </p>
    </div>
  `,
})
export class CertificatePage implements OnInit {
  protected readonly certificate = inject(CertificateContext);
  private readonly banks = inject(QuestionBankService);
  private readonly repository = inject(ProgressRepository);
  protected readonly count = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly resume = signal<SessionSnapshot | undefined>(undefined);
  async ngOnInit(): Promise<void> {
    try {
      const [banks, sessions] = await Promise.all([
        Promise.all(
          this.certificate.definition.banks.map((bank) =>
            this.banks.load(bank.manifestUrl, this.certificate.id),
          ),
        ),
        this.repository.listActiveSessions(),
      ]);
      this.count.set(banks.reduce((count, bank) => count + bank.questions.length, 0));
      this.resume.set(sessions.find((session) => session.status === 'active'));
    } catch {
      this.error.set('Chưa tải được dữ liệu. Hãy thử tải lại trang.');
    } finally {
      this.loading.set(false);
    }
  }
}
