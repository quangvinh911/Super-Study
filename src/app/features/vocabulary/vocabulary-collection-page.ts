import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FavoriteVocabularyService } from './favorite-vocabulary.service';
import {
  VOCABULARY_COLLECTIONS,
  VocabularyCollection,
  parseVocabulary,
  searchVocabulary,
} from './vocabulary-data';

@Component({
  selector: 'app-vocabulary-collection-page',
  imports: [RouterLink, FormsModule],
  templateUrl: './vocabulary-collection-page.html',
  styleUrl: './vocabulary-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VocabularyCollectionPage {
  protected readonly favorites = inject(FavoriteVocabularyService);
  protected readonly collection = signal<VocabularyCollection | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly kind = signal('all');
  protected readonly topic = signal('all');
  protected readonly onlyInTests = signal(false);
  protected readonly selfCheck = signal(false);
  protected readonly revealed = signal<ReadonlySet<string>>(new Set());
  protected readonly topics = computed(() => [
    ...new Set(this.collection()?.entries.map((entry) => entry.topic) ?? []),
  ]);
  protected readonly filtered = computed(() =>
    (this.collection()?.entries ?? []).filter(
      (entry) =>
        (this.kind() === 'all' || entry.kind === this.kind()) &&
        (this.topic() === 'all' || entry.topic === this.topic()) &&
        (!this.onlyInTests() || entry.occurrences.length > 0) &&
        searchVocabulary(entry, this.query()),
    ),
  );

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('collectionId');
    const metadata = VOCABULARY_COLLECTIONS.find((collection) => collection.id === id);
    if (!metadata) {
      this.error.set('Không tìm thấy bộ tài liệu này.');
      this.loading.set(false);
      return;
    }
    void this.load(metadata.id, metadata.url);
  }
  protected toggleMeaning(id: string): void {
    const revealed = new Set(this.revealed());
    if (revealed.has(id)) revealed.delete(id);
    else revealed.add(id);
    this.revealed.set(revealed);
  }
  protected changeSelfCheck(enabled: boolean): void {
    this.selfCheck.set(enabled);
    this.revealed.set(new Set());
  }
  protected resetFilters(): void {
    this.query.set('');
    this.kind.set('all');
    this.topic.set('all');
    this.onlyInTests.set(false);
  }
  protected speak(term: string): void {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(term);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }
  private async load(id: string, url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Vocabulary HTTP ${response.status}`);
      const data: unknown = await response.json();
      this.collection.set(parseVocabulary(data, id));
    } catch (error) {
      console.error('Unable to load vocabulary', error);
      this.error.set(
        'Chưa tải được bộ từ vựng. Kiểm tra kết nối hoặc dữ liệu cục bộ rồi tải lại trang.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
