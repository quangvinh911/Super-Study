import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FavoriteVocabulary } from '../../core/persistence/favorite-vocabulary.repository';
import { FavoriteVocabularyService, VocabularyLookupError } from './favorite-vocabulary.service';

@Component({
  selector: 'app-vocabulary-lookup-popup',
  templateUrl: './vocabulary-lookup-popup.html',
  styleUrl: './vocabulary-lookup-popup.scss',
})
export class VocabularyLookupPopup {
  readonly word = input.required<{ term: string; example: string }>();
  readonly closed = output<void>();
  private readonly favorites = inject(FavoriteVocabularyService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private controller: AbortController | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private utterance: SpeechSynthesisUtterance | undefined;
  protected readonly details = signal<FavoriteVocabulary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal('');
  protected readonly speechError = signal('');

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
    effect(() => {
      const word = this.word();
      this.saved.set(false);
      this.saveError.set('');
      void this.lookup(word);
    });
    inject(DestroyRef).onDestroy(() => {
      this.controller?.abort();
      this.controller = undefined;
      clearTimeout(this.timeout);
      this.stopSpeech();
    });
  }

  protected speak(): void {
    this.speechError.set('');
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      this.speechError.set(
        'Trình duyệt này chưa hỗ trợ phát âm. Hãy thử trình duyệt có giọng đọc tiếng Anh.',
      );
      return;
    }
    this.stopSpeech();
    const utterance = new SpeechSynthesisUtterance(this.word().term);
    utterance.lang = 'en-US';
    this.utterance = utterance;
    utterance.onend = () => {
      if (this.utterance === utterance) this.utterance = undefined;
    };
    utterance.onerror = (event) => {
      if (this.utterance !== utterance) return;
      this.utterance = undefined;
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        this.speechError.set(
          'Không phát được âm thanh. Kiểm tra giọng đọc tiếng Anh trên thiết bị rồi thử lại.',
        );
      }
    };
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Unable to pronounce vocabulary', error);
      this.utterance = undefined;
      this.speechError.set(
        'Không phát được âm thanh. Kiểm tra giọng đọc tiếng Anh trên thiết bị rồi thử lại.',
      );
    }
  }

  private stopSpeech(): void {
    if (!this.utterance) return;
    this.utterance.onend = null;
    this.utterance.onerror = null;
    this.utterance = undefined;
    window.speechSynthesis.cancel();
  }

  protected retry(): void {
    void this.lookup(this.word());
  }

  private async lookup(word: { term: string; example: string }): Promise<void> {
    this.controller?.abort();
    clearTimeout(this.timeout);
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 35000);
    this.timeout = timeout;
    this.loading.set(true);
    this.error.set('');
    this.details.set(null);
    try {
      const details = await this.favorites.lookup(word, controller.signal);
      if (this.controller === controller && !controller.signal.aborted) this.details.set(details);
    } catch (error) {
      if (this.controller !== controller) return;
      console.error('Unable to preview vocabulary', error);
      this.error.set(
        error instanceof VocabularyLookupError
          ? error.message
          : 'Không tra được từ. Kiểm tra kết nối mạng rồi thử lại.',
      );
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.loading() || this.saving() || this.saved()) return;
    this.saving.set(true);
    this.saveError.set('');
    const entry =
      this.details() ??
      ({
        term: this.word().term,
        meaning: '',
        pronunciation: '',
        example: '',
        enrichment: 'failed',
        enrichmentError: this.error(),
      } satisfies FavoriteVocabulary);
    try {
      const saved = await this.favorites.savePreview(entry);
      this.saved.set(saved);
      if (!saved) this.saveError.set('Không lưu được từ vựng. Hãy thử lại.');
    } finally {
      this.saving.set(false);
    }
  }
}
