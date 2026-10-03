import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VOCABULARY_COLLECTIONS } from './vocabulary-data';

@Component({
  selector: 'app-vocabulary-overview-page',
  imports: [RouterLink],
  template: `
    <div class="page vocabulary-page">
      <header class="page-header">
        <a routerLink="/certificates/toeic">← TOEIC</a>
        <p class="eyebrow">Kiến thức · Từ vựng</p>
        <h1>Học từ trong ngữ cảnh TOEIC</h1>
        <p>Chọn bộ tài liệu để học từ vựng, thành ngữ và cụm từ trước khi luyện đề.</p>
      </header>
      <section class="collection-grid" aria-label="Bộ tài liệu">
        @for (collection of collections; track collection.id) {
          <a class="surface collection-card" [routerLink]="[collection.id]">
            <p class="eyebrow">Bộ tài liệu TOEIC</p>
            <h2>{{ collection.title }}</h2>
            <p>{{ collection.description }}</p>
            <strong>Mở bộ từ vựng →</strong>
          </a>
        }
      </section>
      <p class="library-note">
        Các bộ tài liệu sẽ được bổ sung riêng tại đây. Hoạt động ôn từ không tính vào điểm thi hoặc
        tiến độ luyện đề.
      </p>
    </div>
  `,
  styleUrl: './vocabulary-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VocabularyOverviewPage {
  protected readonly collections = VOCABULARY_COLLECTIONS;
}
