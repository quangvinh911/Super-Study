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
        <h1>Từ vựng TOEIC</h1>
        <p>Chọn bộ tài liệu để học từ, cụm từ và cách dùng trong ngữ cảnh.</p>
      </header>
      <div class="library-heading">
        <h2>Bộ tài liệu</h2>
        <span>{{ collections.length }} bộ</span>
      </div>
      <section class="collection-grid" aria-label="Bộ tài liệu">
        @for (collection of collections; track collection.id) {
          <a class="surface collection-card" [routerLink]="[collection.id]">
            <div>
              <h2>{{ collection.title }}</h2>
              <p>{{ collection.description }}</p>
            </div>
            <span class="collection-open">Mở bộ từ <span aria-hidden="true">→</span></span>
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
