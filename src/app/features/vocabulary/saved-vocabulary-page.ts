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
    <div class="page saved-vocabulary-page">
      <header class="page-header">
        <p class="eyebrow">Sổ tay từ vựng</p>
        <h1>Từ vựng đã lưu</h1>
        <p class="page-subtitle">Lưu từ mới, nghe phát âm và ôn lại theo cách của bạn.</p>
        <details class="vocabulary-help">
          <summary>Cách lưu và ôn từ vựng</summary>
          <p>
            Nhấn vào từ đã lưu để nghe phát âm. Double-click một từ hoặc bôi đen cụm từ trong nội
            dung học, rồi nhấn biểu tượng từ điển để xem nghĩa, phiên âm và câu ví dụ. Trong popup,
            nhấn “Thêm vào từ vựng yêu thích” để lưu. Trên điện thoại, giữ từ trong 1 giây để hiện
            biểu tượng.
          </p>
        </details>
      </header>
      <section class="vocabulary-controls surface" aria-label="Thêm và tìm từ vựng">
        <form class="add-word-form" (ngSubmit)="favorites.save({ term: newTerm }); newTerm = ''">
          <label class="vocabulary-field"
            >Từ / cụm từ tiếng Anh
            <input
              name="newTerm"
              required
              maxlength="120"
              placeholder="Ví dụ: shipment, on schedule…"
              lang="en"
              [(ngModel)]="newTerm"
            />
          </label>
          <button class="button button--primary" type="submit">
            <span aria-hidden="true">+</span> Thêm từ vựng
          </button>
        </form>
        <label class="vocabulary-field search"
          >Tìm trong từ vựng đã lưu
          <input
            type="search"
            placeholder="Tìm từ hoặc nghĩa…"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
          />
        </label>
      </section>
      <div class="vocabulary-meta">
        <h2>Từ vựng của bạn</h2>
        @if (!loading() && !error()) {
          <span>{{ filtered().length }} từ đã lưu</span>
        }
      </div>
      @if (loading()) {
        <p class="vocabulary-status" role="status">Đang tải…</p>
      }
      @if (error()) {
        <div class="vocabulary-error">
          <p role="alert">{{ error() }}</p>
          <button class="button button--secondary" type="button" (click)="load()">Thử lại</button>
        </div>
      }
      <div class="words">
        @for (word of filtered(); track word.term) {
          <article class="word-card surface">
            <h2 lang="en">
              <button
                class="word-audio"
                [attr.data-vocabulary-term]="word.term"
                [attr.data-vocabulary-example]="word.example"
                type="button"
                (click)="speak(word)"
                [attr.aria-label]="'Nghe phát âm ' + word.term"
              >
                {{ word.term }}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                  <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
                </svg>
              </button>
            </h2>
            <p class="word-pronunciation" [attr.lang]="word.pronunciation ? 'en' : 'vi'">
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
            <p class="word-meaning" [attr.lang]="word.meaningLanguage ?? 'vi'">
              {{
                word.meaning ||
                  (word.enrichment === 'pending' ? 'Đang tra nghĩa…' : 'Chưa có nghĩa')
              }}
            </p>
            @if (word.meaningLanguage === 'en') {
              <small>Nghĩa tiếng Anh · Chưa tìm được bản dịch tiếng Việt.</small>
            }
            <blockquote lang="en">{{ word.example || 'Chưa tìm thấy câu ví dụ' }}</blockquote>
            @if (word.exampleSource === 'Free Dictionary API') {
              <small
                >Câu ví dụ:
                <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener noreferrer"
                  >Free Dictionary API</a
                ></small
              >
            }
            @if (word.exampleSource === 'Tatoeba') {
              <small>
                Câu ví dụ:
                <a [href]="word.exampleSourceUrl" target="_blank" rel="noopener noreferrer"
                  >Tatoeba</a
                >
                · {{ word.exampleAuthor }} ·
                <a
                  href="https://creativecommons.org/licenses/by/2.0/fr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  >CC BY 2.0 FR</a
                >
              </small>
            }
            @if (
              word.enrichment === 'pending' ||
              word.enrichment === 'failed' ||
              word.enrichment === 'partial' ||
              !word.pronunciation ||
              !word.meaning ||
              !word.example
            ) {
              <p class="word-status">
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
            <div class="word-actions">
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
            </div>
          </article>
        } @empty {
          @if (!loading() && !error()) {
            <p class="vocabulary-empty surface">
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
  styleUrl: './saved-vocabulary-page.scss',
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
