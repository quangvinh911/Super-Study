import { Component, inject } from '@angular/core';
import { FavoriteVocabularyService } from './favorite-vocabulary.service';

@Component({
  selector: 'app-favorite-vocabulary-notice',
  template: `
    <div class="notice-region" role="status" aria-live="polite" aria-atomic="true">
      @if (favorites.notice(); as notice) {
        <div class="notice" [class.notice--error]="notice.error">
          <span>{{ notice.text }}</span>
          <button type="button" aria-label="Đóng thông báo" (click)="favorites.dismiss()">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .notice-region {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 1000;
      width: min(25rem, calc(100vw - 2rem));
    }
    .notice {
      display: flex;
      align-items: start;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--color-surface, white);
      color: var(--color-ink);
      border: 1px solid var(--color-teal);
      border-radius: 0.75rem;
      box-shadow: 0 4px 20px #0002;
    }
    .notice--error {
      border-color: #b45309;
    }
    button {
      flex: none;
      margin-left: auto;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 1.5rem;
    }
  `,
})
export class FavoriteVocabularyNotice {
  protected readonly favorites = inject(FavoriteVocabularyService);
}
