import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FavoriteVocabulary,
  FavoriteVocabularyRepository,
} from '../../core/persistence/favorite-vocabulary.repository';
import { FavoriteVocabularyEditor } from './favorite-vocabulary-editor';
import { FavoriteVocabularyService } from './favorite-vocabulary.service';

@Component({
  selector: 'app-saved-vocabulary-page',
  imports: [FormsModule, FavoriteVocabularyEditor],
  template: `
    <div class="page">
      <header class="page-header">
        <p class="eyebrow">Favorite Vocabulary</p>
        <h1>Từ vựng đã lưu</h1>
        <p>
          Nhấn vào từ đã lưu để nghe phát âm. Double-click hoặc giữ 1 giây trên từ tiếng Anh trong
          nội dung học để lưu. Từ vựng được lưu trên thiết bị này, riêng theo chứng chỉ.
        </p>
      </header>
      <form (ngSubmit)="favorites.save({ term: newTerm }); newTerm = ''">
        <label
          >Từ / cụm từ tiếng Anh<input
            name="newTerm"
            required
            maxlength="120"
            [(ngModel)]="newTerm"
        /></label>
        <button class="button button--primary" type="submit">Thêm từ vựng</button>
      </form>
      <label class="search"
        >Tìm từ hoặc nghĩa<input
          type="search"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
      /></label>
      @if (loading()) {
        <p role="status">Đang tải…</p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
        <button type="button" (click)="load()">Thử lại</button>
      }
      <div class="words">
        @for (word of filtered(); track word.term) {
          <article class="surface">
            <h2 lang="en">
              <button
                class="word-audio"
                type="button"
                (click)="speak(word)"
                [attr.aria-label]="'Nghe phát âm ' + word.term"
              >
                {{ word.term }}
              </button>
            </h2>
            <p [attr.lang]="word.pronunciation ? 'en' : 'vi'">
              {{
                word.pronunciation ||
                  (word.enrichment === 'pending' ? 'Đang tra phiên âm…' : 'Chưa có phiên âm')
              }}
            </p>
            @if (word.pronunciationKind === 'word-by-word') {
              <small>Phiên âm từng từ, không phải cách đọc nối âm của cả cụm.</small>
            }
            @if (word.pronunciationSource === 'Free Dictionary API') {
              <small
                >Phiên âm:
                <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener noreferrer"
                  >Free Dictionary API</a
                ></small
              >
            }
            <p [attr.lang]="word.meaningLanguage ?? 'vi'">
              {{
                word.meaning ||
                  (word.enrichment === 'pending' ? 'Đang tra nghĩa…' : 'Chưa có nghĩa')
              }}
            </p>
            @if (word.meaningLanguage === 'en') {
              <small>Nghĩa tiếng Anh · Chưa tìm được bản dịch tiếng Việt.</small>
            }
            <blockquote lang="en">{{ word.example || 'Chưa tìm thấy câu ví dụ' }}</blockquote>
            @if (
              word.enrichment === 'pending' ||
              word.enrichment === 'failed' ||
              word.enrichment === 'partial' ||
              !word.pronunciation ||
              !word.meaning
            ) {
              <p>
                {{
                  word.enrichment === 'pending'
                    ? 'Đang chờ bổ sung thông tin.'
                    : word.enrichmentError ||
                      'Chưa có đủ thông tin từ từ điển. Hãy thử bổ sung lại.'
                }}
              </p>
              <button class="button button--quiet" type="button" (click)="favorites.save(word)">
                Thử bổ sung lại
              </button>
            }
            @if (word.sourceUrl) {
              <p class="source-note">
                Nguồn:
                @if (word.sourceUrl === 'https://dictionaryapi.dev/') {
                  <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener noreferrer"
                    >Free Dictionary API</a
                  >
                } @else {
                  <a href="https://freedictionaryapi.com/" target="_blank" rel="noopener noreferrer"
                    >FreeDictionaryAPI.com</a
                  >
                  ·
                  <a [href]="word.sourceUrl" target="_blank" rel="noopener noreferrer"
                    >Wiktionary</a
                  >
                  ·
                  <a
                    href="https://creativecommons.org/licenses/by-sa/4.0/"
                    target="_blank"
                    rel="noopener noreferrer"
                    >CC BY-SA 4.0</a
                  >
                }
                @if (word.translationSource) {
                  · Bản dịch: {{ word.translationSource }}
                }
              </p>
            }
            <button class="button button--secondary" type="button" (click)="editor.open(word)">
              Chỉnh sửa<span class="sr-only"> {{ word.term }}</span>
            </button>
            <button
              class="button button--quiet"
              type="button"
              [disabled]="removing()"
              (click)="remove(word.term)"
            >
              Bỏ lưu<span class="sr-only"> {{ word.term }}</span>
            </button>
          </article>
        } @empty {
          @if (!loading() && !error()) {
            <p>
              {{
                query()
                  ? 'Không tìm thấy từ phù hợp.'
                  : 'Chưa có từ vựng đã lưu. Thêm từ đầu tiên để bắt đầu ôn tập.'
              }}
            </p>
          }
        }
      </div>
      <app-favorite-vocabulary-editor #editor />
    </div>
  `,
  styles: `
    .search {
      display: grid;
      gap: 0.5rem;
      margin: 1.5rem 0;
    }
    input {
      padding: 0.75rem;
    }
    .words {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
      gap: 1rem;
    }
    article {
      padding: 1.25rem;
      overflow-wrap: anywhere;
    }
    h2 {
      margin-top: 0;
    }
    .word-audio {
      color: inherit;
      font: inherit;
      text-align: left;
      background: transparent;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    blockquote {
      margin: 1rem 0;
      padding-left: 1rem;
      border-left: 3px solid #7294b4;
    }
  `,
})
export class SavedVocabularyPage {
  protected readonly favorites = inject(FavoriteVocabularyService);
  protected newTerm = '';
  private readonly repository = inject(FavoriteVocabularyRepository);
  protected readonly words = signal<FavoriteVocabulary[]>([]);
  protected readonly query = signal('');
  protected readonly error = signal('');
  protected readonly loading = signal(true);
  protected readonly removing = signal(false);
  protected readonly filtered = computed(() => {
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .toLowerCase();
    const query = normalize(this.query().trim());
    return this.words().filter((word) => normalize(`${word.term} ${word.meaning}`).includes(query));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    });
    effect(() => {
      this.repository.revision();
      void this.load();
    });
  }

  protected speak(word: FavoriteVocabulary): void {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      this.error.set(
        'Trình duyệt này chưa hỗ trợ phát âm. Hãy thử trình duyệt có giọng đọc tiếng Anh.',
      );
      return;
    }
    this.error.set('');
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.term);
    utterance.lang = 'en-US';
    utterance.onerror = (event) => {
      if (event.error !== 'canceled' && event.error !== 'interrupted')
        this.error.set(
          'Không phát được âm thanh. Kiểm tra giọng đọc tiếng Anh trên thiết bị rồi thử lại.',
        );
    };
    window.speechSynthesis.speak(utterance);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.words.set(await this.repository.list());
    } catch (error) {
      console.error('Unable to load favorite vocabulary', error);
      this.error.set('Không đọc được từ vựng đã lưu. Hãy thử lại.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async remove(term: string): Promise<void> {
    if (this.removing()) return;
    this.removing.set(true);
    try {
      await this.repository.remove(term);
      await this.load();
    } catch (error) {
      console.error('Unable to remove favorite vocabulary', error);
      this.error.set('Không bỏ lưu được từ vựng. Hãy thử lại.');
    } finally {
      this.removing.set(false);
    }
  }
}
