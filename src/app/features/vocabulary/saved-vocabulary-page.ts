import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import {
  FavoriteVocabulary,
  FavoriteVocabularyRepository,
  vocabularyKey,
} from '../../core/persistence/favorite-vocabulary.repository';
import { FavoriteVocabularyEditor } from './favorite-vocabulary-editor';
import { FavoriteVocabularyService } from './favorite-vocabulary.service';

@Component({
  selector: 'app-saved-vocabulary-page',
  imports: [FormsModule, FavoriteVocabularyEditor],
  template: `
    <div class="page saved-vocabulary-page">
      <header class="page-header">
        <h1>Từ vựng đã lưu</h1>
        <p class="page-subtitle">Nghe phát âm, xem cách dùng và bổ sung sổ tay của bạn.</p>
        <details class="vocabulary-help">
          <summary>Cách lưu từ khi học</summary>
          <p>
            Double-click một từ hoặc bôi đen cụm từ trong nội dung học, rồi nhấn biểu tượng từ điển.
            Trong cửa sổ tra từ, nhấn “Thêm vào từ vựng yêu thích” để lưu. Trên điện thoại, giữ từ
            trong 1 giây để hiện biểu tượng.
          </p>
        </details>
      </header>
      <section class="vocabulary-controls" aria-label="Thêm và tìm từ vựng">
        <label class="vocabulary-field search"
          >Tìm từ đã lưu
          <input
            type="search"
            placeholder="Tìm từ hoặc nghĩa…"
            [ngModel]="query()"
            (ngModelChange)="search($event)"
          />
        </label>
        <form class="add-word-form" (ngSubmit)="favorites.save({ term: newTerm }); newTerm = ''">
          <label class="vocabulary-field"
            >Thêm từ / cụm từ tiếng Anh
            <input
              name="newTerm"
              required
              maxlength="120"
              placeholder="Ví dụ: shipment, on schedule…"
              lang="en"
              [(ngModel)]="newTerm"
            />
          </label>
          <button class="button button--primary" type="submit">Thêm từ</button>
        </form>
      </section>
      @if (loading()) {
        <p class="vocabulary-status" role="status">Đang tải từ vựng…</p>
      }
      @if (error()) {
        <div class="vocabulary-error">
          <p role="alert">{{ error() }}</p>
          <button class="button button--secondary" type="button" (click)="load()">Thử lại</button>
        </div>
      }
      <div class="vocabulary-workspace surface" [class.is-detail-open]="detailOpen() && selected()">
        <section class="word-library" aria-label="Danh sách từ đã lưu">
          <div class="vocabulary-meta">
            <h2>Sổ tay của bạn</h2>
            @if (!loading() && !error()) {
              <span role="status">{{ filtered().length }} từ</span>
            }
          </div>
          <ul class="words">
            @for (word of filtered(); track word.term) {
              <li class="word-row" [class.is-selected]="selected()?.term === word.term">
                <button
                  #wordSelect
                  class="word-select"
                  type="button"
                  [attr.data-term]="word.term"
                  [attr.aria-pressed]="selected()?.term === word.term"
                  (click)="select(word)"
                >
                  <strong lang="en">{{ word.term }}</strong>
                  <span class="word-list-pronunciation" lang="en">{{ word.pronunciation }}</span>
                  <span class="word-preview" [attr.lang]="word.meaningLanguage ?? 'vi'">
                    {{
                      word.meaning ||
                        (word.enrichment === 'pending' ? 'Đang tra nghĩa…' : 'Chưa có nghĩa')
                    }}
                  </span>
                </button>
                <button
                  class="word-audio"
                  type="button"
                  (click)="speak(word)"
                  [attr.aria-label]="'Nghe phát âm ' + word.term"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                    <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
                  </svg>
                </button>
              </li>
            } @empty {
              @if (!loading() && !error()) {
                <li class="vocabulary-empty">
                  {{
                    query()
                      ? 'Không tìm thấy từ phù hợp.'
                      : 'Chưa có từ đã lưu. Thêm từ đầu tiên để bắt đầu.'
                  }}
                </li>
              }
            }
          </ul>
        </section>
        @if (selected(); as word) {
          <article class="word-detail" aria-labelledby="saved-word-detail-title">
            <button class="back-to-list button button--quiet" type="button" (click)="showList()">
              ← Danh sách từ
            </button>
            <header class="word-detail-header">
              <div>
                <h2 #detailTitle id="saved-word-detail-title" lang="en" tabindex="-1">
                  {{ word.term }}
                </h2>
                <p class="word-pronunciation" [attr.lang]="word.pronunciation ? 'en' : 'vi'">
                  {{
                    word.pronunciation ||
                      (word.enrichment === 'pending' ? 'Đang tra phiên âm…' : 'Chưa có phiên âm')
                  }}
                </p>
              </div>
              <button
                class="word-audio word-audio--detail"
                type="button"
                (click)="speak(word)"
                [attr.aria-label]="'Nghe phát âm ' + word.term"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                  <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
                </svg>
              </button>
            </header>
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
            <section class="word-definition" aria-label="Nghĩa của từ">
              <h3>Nghĩa</h3>
              <p class="word-meaning" [attr.lang]="word.meaningLanguage ?? 'vi'">
                {{
                  word.meaning ||
                    (word.enrichment === 'pending' ? 'Đang tra nghĩa…' : 'Chưa có nghĩa')
                }}
              </p>
              @if (word.meaningLanguage === 'en') {
                <small>Nghĩa tiếng Anh · Chưa tìm được bản dịch tiếng Việt.</small>
              }
              @if (word.englishMeaning && word.englishMeaning !== word.meaning) {
                <p class="word-english-meaning" lang="en">{{ word.englishMeaning }}</p>
              }
            </section>
            <section class="word-example" aria-label="Câu ví dụ">
              <h3>Cách dùng</h3>
              @if (word.example) {
                <blockquote lang="en">{{ word.example }}</blockquote>
              } @else {
                <p class="word-status">
                  {{
                    word.enrichment === 'pending'
                      ? 'Đang tìm câu ví dụ…'
                      : 'Chưa tìm thấy câu ví dụ.'
                  }}
                </p>
              }
              @if (word.exampleSource === 'Free Dictionary API') {
                <small
                  >Câu ví dụ:
                  <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener noreferrer"
                    >Free Dictionary API</a
                  ></small
                >
              }
              @if (word.exampleSource === 'Tatoeba') {
                <small
                  >Câu ví dụ:
                  <a [href]="word.exampleSourceUrl" target="_blank" rel="noopener noreferrer"
                    >Tatoeba</a
                  >
                  · {{ word.exampleAuthor }} ·
                  <a
                    href="https://creativecommons.org/licenses/by/2.0/fr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    >CC BY 2.0 FR</a
                  ></small
                >
              }
            </section>
            @if (
              word.enrichment === 'pending' ||
              word.enrichment === 'failed' ||
              word.enrichment === 'partial' ||
              !word.pronunciation ||
              !word.meaning ||
              !word.example
            ) {
              <div class="enrichment-status">
                <p class="word-status" role="status">
                  {{
                    word.enrichment === 'pending'
                      ? 'Đang chờ bổ sung thông tin.'
                      : word.enrichmentError ||
                        'Chưa có đủ thông tin từ từ điển. Hãy thử bổ sung lại.'
                  }}
                </p>
                <button
                  class="button button--quiet"
                  type="button"
                  [disabled]="word.enrichment === 'pending'"
                  (click)="favorites.save(word)"
                >
                  Thử bổ sung lại
                </button>
              </div>
            }
            @if (word.sourceUrl) {
              <div class="source-note">
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
              </div>
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
        } @else {
          <div class="word-detail-placeholder">
            <p>
              {{
                query()
                  ? 'Thử tìm từ khác trong sổ tay.'
                  : 'Các từ bạn lưu khi học sẽ xuất hiện tại đây.'
              }}
            </p>
          </div>
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
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly detailTitle = viewChild<ElementRef<HTMLElement>>('detailTitle');
  private readonly wordButtons = viewChildren<ElementRef<HTMLButtonElement>>('wordSelect');
  private readonly owner = computed(() => this.auth.user()?.id ?? 'guest');
  private readonly wordsOwner = signal<string | null>(null);
  private readonly selectedTerm = signal('');
  private requestId = 0;
  protected readonly words = signal<FavoriteVocabulary[]>([]);
  protected readonly query = signal('');
  protected readonly error = signal('');
  protected readonly loading = signal(true);
  protected readonly removing = signal(false);
  protected readonly detailOpen = signal(false);
  protected readonly filtered = computed(() => {
    if (this.wordsOwner() !== this.owner()) return [];
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .toLowerCase();
    const query = normalize(this.query().trim());
    return this.words().filter((word) => normalize(`${word.term} ${word.meaning}`).includes(query));
  });
  protected readonly selected = computed(() => {
    const words = this.filtered();
    return (
      words.find((word) => vocabularyKey(word.term) === this.selectedTerm()) ?? words[0] ?? null
    );
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.requestId++;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    });
    effect(() => {
      this.repository.revision();
      this.owner();
      untracked(() => void this.load());
    });
  }

  protected select(word: FavoriteVocabulary): void {
    this.selectedTerm.set(vocabularyKey(word.term));
    this.detailOpen.set(true);
    afterNextRender(() => this.detailTitle()?.nativeElement.focus(), { injector: this.injector });
  }

  protected showList(): void {
    this.detailOpen.set(false);
    const term = this.selected()?.term;
    afterNextRender(
      () => {
        this.wordButtons()
          .find((button) => button.nativeElement.dataset['term'] === term)
          ?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  protected search(query: string): void {
    this.query.set(query);
    this.detailOpen.set(false);
  }

  protected speak(word: FavoriteVocabulary): void {
    const owner = this.owner();
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
      if (owner === this.owner() && event.error !== 'canceled' && event.error !== 'interrupted')
        this.error.set(
          'Không phát được âm thanh. Kiểm tra giọng đọc tiếng Anh trên thiết bị rồi thử lại.',
        );
    };
    window.speechSynthesis.speak(utterance);
  }

  protected async load(): Promise<void> {
    const id = ++this.requestId;
    const owner = this.owner();
    if (this.wordsOwner() !== owner) {
      if (this.wordsOwner() !== null && 'speechSynthesis' in window)
        window.speechSynthesis.cancel();
      this.words.set([]);
      this.wordsOwner.set(owner);
      this.selectedTerm.set('');
      this.detailOpen.set(false);
      this.query.set('');
      this.newTerm = '';
      this.removing.set(false);
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const words = await this.repository.list();
      // An earlier response must never replace the active account's vocabulary.
      if (id === this.requestId && owner === this.owner()) this.words.set(words);
    } catch (error) {
      if (id === this.requestId && owner === this.owner()) {
        console.error('Unable to load favorite vocabulary', error);
        this.error.set('Không đọc được từ vựng đã lưu. Hãy thử lại.');
      }
    } finally {
      if (id === this.requestId && owner === this.owner()) this.loading.set(false);
    }
  }

  protected async remove(term: string): Promise<void> {
    if (this.removing()) return;
    const owner = this.owner();
    this.removing.set(true);
    try {
      await this.repository.remove(term);
      if (owner !== this.owner()) return;
      await this.load();
      if (!this.selected()) this.detailOpen.set(false);
    } catch (error) {
      if (owner === this.owner()) {
        console.error('Unable to remove favorite vocabulary', error);
        this.error.set('Không bỏ lưu được từ vựng. Hãy thử lại.');
      }
    } finally {
      if (owner === this.owner()) this.removing.set(false);
    }
  }
}
