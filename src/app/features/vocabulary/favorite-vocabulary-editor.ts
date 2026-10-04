import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FavoriteVocabulary,
  FavoriteVocabularyRepository,
  vocabularyKey,
} from '../../core/persistence/favorite-vocabulary.repository';

@Component({
  selector: 'app-favorite-vocabulary-editor',
  imports: [FormsModule],
  template: `
    <dialog #dialog (close)="restoreFocus()" [attr.aria-labelledby]="titleId">
      <form (ngSubmit)="save()">
        <h2 [id]="titleId">Chỉnh sửa từ vựng đã lưu</h2>
        <p>Bạn có thể điều chỉnh nghĩa, phiên âm và câu ví dụ trước khi lưu thay đổi.</p>
        <label
          >Từ / cụm từ tiếng Anh<input name="term" required maxlength="120" [(ngModel)]="term"
        /></label>
        <label
          >Nghĩa tiếng Việt<textarea
            name="meaning"
            required
            maxlength="2000"
            [(ngModel)]="meaning"
          ></textarea>
        </label>
        <label
          >Phiên âm<input
            name="pronunciation"
            required
            maxlength="200"
            placeholder="Ví dụ: /ˈʃɪpmənt/"
            [(ngModel)]="pronunciation"
        /></label>
        <label
          >Câu ví dụ<textarea
            name="example"
            required
            maxlength="4000"
            lang="en"
            [(ngModel)]="example"
          ></textarea>
        </label>
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <button class="button button--primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Đang lưu…' : 'Lưu từ vựng' }}
          </button>
          <button
            class="button button--quiet"
            type="button"
            [disabled]="busy()"
            (click)="dialog.close()"
          >
            Hủy
          </button>
        </div>
      </form>
    </dialog>
    <p role="status">{{ message() }}</p>
  `,
  styles: `
    dialog {
      width: min(32rem, calc(100vw - 2rem));
      max-height: 90vh;
      overflow: auto;
      border: 1px solid #b8c5d5;
      border-radius: 1rem;
      padding: 1.5rem;
    }
    dialog::backdrop {
      background: #10213999;
    }
    form,
    label {
      display: grid;
      gap: 0.5rem;
    }
    form {
      gap: 1rem;
    }
    h2,
    p {
      margin: 0;
    }
    input,
    textarea {
      width: 100%;
      padding: 0.65rem;
      box-sizing: border-box;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    :host > p:empty {
      display: none;
    }
  `,
})
export class FavoriteVocabularyEditor {
  private readonly repository = inject(FavoriteVocabularyRepository);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private previousFocus: HTMLElement | null = null;
  private sourceMetadata: Pick<FavoriteVocabulary, 'sourceUrl' | 'translationSource'> = {};
  protected readonly titleId = `favorite-title-${crypto.randomUUID()}`;
  protected term = '';
  protected meaning = '';
  protected pronunciation = '';
  protected example = '';
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly busy = signal(false);

  async open(entry: Partial<FavoriteVocabulary> & { term: string }): Promise<void> {
    if (this.busy() || this.dialog().nativeElement.open) return;
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.term = entry.term;
    this.meaning = entry.meaning ?? '';
    this.pronunciation = entry.pronunciation ?? '';
    this.example = entry.example ?? '';
    this.sourceMetadata = {
      ...(entry.sourceUrl ? { sourceUrl: entry.sourceUrl } : {}),
      ...(entry.translationSource ? { translationSource: entry.translationSource } : {}),
    };
    this.error.set('');
    this.message.set('');
    this.dialog().nativeElement.showModal();
    this.busy.set(true);
    try {
      const existing = (await this.repository.list()).find(
        (word) => vocabularyKey(word.term) === vocabularyKey(entry.term),
      );
      if (existing) {
        this.sourceMetadata = {
          ...(existing.sourceUrl ? { sourceUrl: existing.sourceUrl } : {}),
          ...(existing.translationSource ? { translationSource: existing.translationSource } : {}),
        };
        this.term = existing.term;
        this.meaning = existing.meaning;
        this.pronunciation = existing.pronunciation;
        this.example = existing.example;
      }
    } catch (error) {
      console.error('Unable to read favorite vocabulary', error);
      this.error.set('Không đọc được từ đã lưu. Hãy thử lại.');
    } finally {
      this.busy.set(false);
    }
  }

  protected restoreFocus(): void {
    this.previousFocus?.focus();
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.repository.save({
        ...this.sourceMetadata,
        term: this.term,
        meaning: this.meaning,
        pronunciation: this.pronunciation,
        example: this.example,
      });
      this.message.set(`Đã lưu “${this.term}” vào từ vựng yêu thích.`);
      this.dialog().nativeElement.close();
    } catch (error) {
      console.error('Unable to save favorite vocabulary', error);
      this.error.set(
        'Không lưu được. Điền đầy đủ các trường và kiểm tra quyền lưu trữ của trình duyệt.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
