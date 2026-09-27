import { CertificateContext } from '../../certificates/certificate-context';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Attempt, Bookmark, QuestionStat, SessionSnapshot } from '../../core/models';
import { ProgressRepository } from '../../core/persistence';
import { QuizSessionStore } from '../../core/state';

@Component({
  selector: 'app-progress-page',
  imports: [RouterLink],
  templateUrl: './progress-page.html',
  styleUrl: './progress-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressPage implements OnInit {
  protected readonly certificate = inject(CertificateContext);
  private readonly repository = inject(ProgressRepository);
  private readonly store = inject(QuizSessionStore);

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly attempts = signal<readonly Attempt[]>([]);
  protected readonly activeSessions = signal<readonly SessionSnapshot[]>([]);
  protected readonly stats = signal<readonly QuestionStat[]>([]);
  protected readonly bookmarks = signal<readonly Bookmark[]>([]);
  protected importMode: 'merge' | 'replace' = 'merge';

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected totalAnswered(): number {
    return this.stats().reduce((sum, item) => sum + item.seenCount, 0);
  }

  protected totalCorrect(): number {
    return this.stats().reduce((sum, item) => sum + item.correctCount, 0);
  }

  protected accuracy(): number {
    const answered = this.totalAnswered();
    return answered === 0 ? 0 : Math.round((this.totalCorrect() / answered) * 100);
  }

  protected weakQuestions(): readonly QuestionStat[] {
    return [...this.stats()]
      .filter((item) => item.incorrectCount > 0)
      .sort((left, right) => {
        const leftRate = left.incorrectCount / left.seenCount;
        const rightRate = right.incorrectCount / right.seenCount;
        return rightRate - leftRate || right.incorrectCount - left.incorrectCount;
      })
      .slice(0, 8);
  }

  protected questionAccuracy(item: QuestionStat): number {
    return item.seenCount === 0 ? 0 : Math.round((item.correctCount / item.seenCount) * 100);
  }

  protected resumeLink(session: SessionSnapshot): readonly string[] {
    return this.certificate.link(session.mode === 'exam' ? 'mock-exam' : 'practice', session.id);
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  protected async exportData(): Promise<void> {
    this.clearStatus();
    try {
      const data = await this.repository.exportProgress();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${this.certificate.id}-practice-progress-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.message.set('Đã xuất bản sao dữ liệu học tập.');
    } catch {
      this.error.set('Không thể xuất dữ liệu.');
    }
  }

  protected async importData(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.busy.set(true);
    this.clearStatus();
    try {
      const data = JSON.parse(await file.text()) as unknown;
      this.repository.validateImport(data);
      await this.store.close();
      await this.repository.importProgress(data, this.importMode);
      await this.reload(false);
      this.message.set(
        this.importMode === 'replace'
          ? 'Đã thay thế dữ liệu bằng bản sao đã chọn.'
          : 'Đã gộp dữ liệu từ bản sao.',
      );
    } catch {
      this.error.set(
        `Tệp không phải bản sao ${this.certificate.name} hợp lệ hoặc thuộc chứng chỉ khác. Dữ liệu hiện tại không thay đổi.`,
      );
    } finally {
      input.value = '';
      this.busy.set(false);
    }
  }

  protected async resetData(): Promise<void> {
    if (
      !globalThis.confirm(
        `Xoá toàn bộ phiên đang làm, lịch sử, thống kê và bookmark của ${this.certificate.name} trên trình duyệt này? Hành động này không thể hoàn tác nếu chưa xuất bản sao.`,
      )
    ) {
      return;
    }
    this.busy.set(true);
    this.clearStatus();
    try {
      await this.store.close();
      await this.repository.reset();
      await this.reload(false);
      this.message.set(`Đã xoá dữ liệu học tập ${this.certificate.name} trên thiết bị này.`);
    } catch {
      this.error.set('Không thể xoá dữ liệu. Hãy đóng các tab luyện thi khác rồi thử lại.');
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(showLoading = true): Promise<void> {
    if (showLoading) this.loading.set(true);
    this.error.set('');
    try {
      const [attempts, activeSessions, stats, bookmarks] = await Promise.all([
        this.repository.listAttempts(),
        this.repository.listActiveSessions(),
        this.repository.listQuestionStats(),
        this.repository.listBookmarks(),
      ]);
      this.attempts.set(attempts);
      this.activeSessions.set(activeSessions);
      this.stats.set(stats);
      this.bookmarks.set(bookmarks);
    } catch {
      this.error.set('Không thể đọc dữ liệu học tập trên trình duyệt này.');
    } finally {
      this.loading.set(false);
    }
  }

  private clearStatus(): void {
    this.message.set('');
    this.error.set('');
  }
}
