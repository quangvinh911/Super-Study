import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContentBlocks } from '../../components/content-blocks/content-blocks';
import {
  Attempt,
  SessionQuestionSnapshot,
  SessionResponse,
} from '../../core/models';
import { ProgressRepository } from '../../core/persistence/progress.repository';

@Component({
  selector: 'app-results-page',
  imports: [RouterLink, ContentBlocks],
  templateUrl: './results-page.html',
  styleUrl: './results-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly progressRepository = inject(ProgressRepository);

  readonly attempt = signal<Attempt | undefined>(undefined);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | undefined>(undefined);

  async ngOnInit(): Promise<void> {
    const attemptId =
      this.route.snapshot.paramMap.get('sessionId') ??
      this.route.snapshot.paramMap.get('id');

    if (!attemptId) {
      this.errorMessage.set('Đường dẫn kết quả không hợp lệ.');
      this.loading.set(false);
      return;
    }

    try {
      const attempt = await this.progressRepository.getAttempt(attemptId);
      if (!attempt) {
        this.errorMessage.set(
          'Không tìm thấy kết quả này trên trình duyệt. Dữ liệu có thể đã được xoá hoặc thuộc một thiết bị khác.',
        );
      } else {
        this.attempt.set(attempt);
      }
    } catch {
      this.errorMessage.set('Không thể đọc kết quả đã lưu. Vui lòng thử tải lại trang.');
    } finally {
      this.loading.set(false);
    }
  }

  responseFor(
    attempt: Attempt,
    item: SessionQuestionSnapshot,
  ): SessionResponse | undefined {
    return attempt.responses[item.question.id];
  }

  isSelected(response: SessionResponse | undefined, optionId: string): boolean {
    return response?.selectedOptionIds.includes(optionId) ?? false;
  }

  isCorrectOption(item: SessionQuestionSnapshot, optionId: string): boolean {
    return item.solution.correctOptionIds.includes(optionId);
  }

  isQuestionCorrect(
    item: SessionQuestionSnapshot,
    response: SessionResponse | undefined,
  ): boolean {
    if (!response) {
      return false;
    }
    const selected = new Set(response.selectedOptionIds);
    const correct = new Set(item.solution.correctOptionIds);
    return selected.size === correct.size && [...selected].every((id) => correct.has(id));
  }

  optionStateClass(
    item: SessionQuestionSnapshot,
    response: SessionResponse | undefined,
    optionId: string,
  ): string {
    if (this.isCorrectOption(item, optionId)) {
      return 'review-option--correct';
    }
    if (this.isSelected(response, optionId)) {
      return 'review-option--incorrect';
    }
    return '';
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} phút ${seconds.toString().padStart(2, '0')} giây`;
  }

  optionLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }

  trackItem(_index: number, item: SessionQuestionSnapshot): string {
    return `${item.question.id}@${item.question.revision}`;
  }
}
