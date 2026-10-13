import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  FavoriteVocabulary,
  FavoriteVocabularyRepository,
  vocabularyKey,
} from '../../core/persistence/favorite-vocabulary.repository';

export function parseVocabularyDetails(
  value: unknown,
): Pick<
  FavoriteVocabulary,
  | 'meaning'
  | 'englishMeaning'
  | 'pronunciation'
  | 'example'
  | 'sourceUrl'
  | 'meaningLanguage'
  | 'pronunciationKind'
  | 'pronunciationSource'
  | 'exampleSource'
  | 'exampleSourceUrl'
  | 'exampleAuthor'
  | 'translationSource'
> {
  if (!isRecord(value)) throw new Error('Invalid vocabulary response');
  const meaning = value['meaning'];
  const englishMeaning = value['englishMeaning'];
  const pronunciation = value['pronunciation'];
  const example = value['example'];
  if (
    typeof meaning !== 'string' ||
    meaning.length > 2000 ||
    (englishMeaning !== undefined &&
      (typeof englishMeaning !== 'string' || englishMeaning.length > 2000)) ||
    typeof pronunciation !== 'string' ||
    pronunciation.length > 200 ||
    typeof example !== 'string' ||
    example.length > 4000
  ) {
    throw new Error('Incomplete vocabulary response');
  }
  if (![meaning, pronunciation, example].some((field) => field.trim()))
    throw new Error('Empty dictionary response');
  const sourceUrl = value['sourceUrl'];
  if (
    sourceUrl !== undefined &&
    (typeof sourceUrl !== 'string' ||
      (!sourceUrl.startsWith('https://en.wiktionary.org/wiki/') &&
        sourceUrl !== 'https://dictionaryapi.dev/'))
  )
    throw new Error('Invalid dictionary source');
  const meaningLanguage = value['meaningLanguage'] ?? 'vi';
  const pronunciationKind = value['pronunciationKind'] ?? 'entry';
  const translationSource = value['translationSource'] ?? '';
  const pronunciationSource = value['pronunciationSource'] ?? '';
  const exampleSource = value['exampleSource'] ?? '';
  const exampleSourceUrl = value['exampleSourceUrl'];
  const exampleAuthor = value['exampleAuthor'];
  if (
    (meaningLanguage !== 'vi' && meaningLanguage !== 'en') ||
    (pronunciationKind !== 'entry' && pronunciationKind !== 'word-by-word') ||
    typeof translationSource !== 'string' ||
    translationSource.length > 100 ||
    (pronunciationSource !== '' && pronunciationSource !== 'Free Dictionary API') ||
    typeof exampleSource !== 'string' ||
    !['', 'Free Dictionary API', 'Tatoeba'].includes(exampleSource) ||
    (exampleSourceUrl !== undefined &&
      (typeof exampleSourceUrl !== 'string' ||
        !/^https:\/\/tatoeba\.org\/en\/sentences\/show\/[1-9]\d*$/.test(exampleSourceUrl))) ||
    (exampleAuthor !== undefined &&
      (typeof exampleAuthor !== 'string' || !exampleAuthor.trim() || exampleAuthor.length > 100)) ||
    (exampleSource === 'Tatoeba' && (!exampleSourceUrl || !exampleAuthor))
  )
    throw new Error('Invalid dictionary metadata');
  return {
    meaning: meaning.trim(),
    ...(typeof englishMeaning === 'string' && englishMeaning.trim()
      ? { englishMeaning: englishMeaning.trim() }
      : {}),
    pronunciation: pronunciation.trim(),
    example: example.trim(),
    ...(typeof sourceUrl === 'string' ? { sourceUrl } : {}),
    meaningLanguage: meaningLanguage === 'en' ? 'en' : 'vi',
    pronunciationKind: pronunciationKind === 'word-by-word' ? 'word-by-word' : 'entry',
    translationSource,
    pronunciationSource,
    ...(exampleSource ? { exampleSource } : {}),
    ...(typeof exampleSourceUrl === 'string' ? { exampleSourceUrl } : {}),
    ...(typeof exampleAuthor === 'string' ? { exampleAuthor } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable({ providedIn: 'root' })
export class FavoriteVocabularyService {
  private readonly repository = inject(FavoriteVocabularyRepository);
  private readonly requests = new Map<string, Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private readonly translations = new Map<string, { meaning: string; at: number }>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly notice = signal<{ text: string; error: boolean } | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      for (const controller of this.controllers) controller.abort();
    });
  }

  save(entry: Partial<FavoriteVocabulary> & { term: string }): Promise<void> {
    const key = vocabularyKey(entry.term);
    const running = this.requests.get(key);
    if (running) return running;
    const operation = this.saveAndEnrich(entry).finally(() => this.requests.delete(key));
    this.requests.set(key, operation);
    return operation;
  }

  // Previewing dictionary information must never create or change a favorite.
  async lookup(
    entry: { term: string; meaning?: string; example?: string; meaningLanguage?: 'vi' | 'en' },
    signal: AbortSignal,
  ): Promise<FavoriteVocabulary> {
    const response = await fetch('/api/vocabulary/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: entry.term,
        meaning: entry.meaningLanguage === 'en' ? '' : (entry.meaning ?? ''),
        context: (entry.example ?? '').slice(0, 4000),
      }),
      signal,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      let message =
        'Không kết nối được dịch vụ tra từ. Kiểm tra kết nối hoặc máy chủ API rồi thử lại.';
      if (response.status === 404 && isRecord(body) && body['error'] === 'word_not_found')
        message = 'Các từ điển chưa tìm thấy từ này. Kiểm tra chính tả hoặc bổ sung thủ công.';
      else if (response.status === 429)
        message = 'Dịch vụ tra từ đang giới hạn lượt truy cập. Đợi một phút rồi thử lại.';
      else if (
        response.status === 502 &&
        isRecord(body) &&
        body['error'] === 'dictionary_unavailable'
      )
        message = 'Nguồn từ điển đang không khả dụng. Hãy thử tra lại sau.';
      throw new VocabularyLookupError(message);
    }
    if (!response.headers.get('Content-Type')?.includes('application/json'))
      throw new Error('Vocabulary API did not return JSON');
    const data: unknown = await response.json();
    let details = parseVocabularyDetails(data);
    if (details.meaningLanguage === 'en') {
      try {
        const meaning = await this.translateInBrowser(entry.term, signal);
        details = {
          ...details,
          englishMeaning: details.englishMeaning || details.meaning,
          meaning,
          meaningLanguage: 'vi',
          translationSource: 'MyMemory',
        };
      } catch (error) {
        if (signal.aborted) throw error;
        console.warn('Browser translation unavailable', error);
      }
    }
    const complete =
      !!details.meaning &&
      !!details.pronunciation &&
      !!details.example &&
      details.meaningLanguage !== 'en';
    return {
      term: entry.term,
      ...details,
      source: 'dictionary',
      enrichment: complete ? 'complete' : 'partial',
    };
  }

  async savePreview(entry: FavoriteVocabulary): Promise<boolean> {
    try {
      const existing = (await this.repository.list()).find(
        (word) => vocabularyKey(word.term) === vocabularyKey(entry.term),
      );
      if (!existing) await this.repository.save(entry);
      this.notify(
        existing
          ? `“${existing.term}” đã có trong từ vựng đã lưu.`
          : `Đã lưu “${entry.term}” vào từ vựng yêu thích.`,
      );
      return true;
    } catch (error) {
      console.error('Unable to save vocabulary preview', error);
      this.notify('Không lưu được từ vựng. Hãy thử lại.', true);
      return false;
    }
  }

  private async translateInBrowser(term: string, signal: AbortSignal): Promise<string> {
    const key = vocabularyKey(term);
    const cached = this.translations.get(key);
    if (cached && Date.now() - cached.at < 3600000) return cached.meaning;
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', term);
    url.searchParams.set('langpair', 'en|vi');
    // Browser requests avoid a shared hosting IP's quota; send only the selected term.
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (
      !isRecord(value) ||
      (value['responseStatus'] !== 200 && value['responseStatus'] !== '200') ||
      (value['quotaFinished'] !== undefined && value['quotaFinished'] !== false) ||
      !isRecord(value['responseData'])
    )
      throw new Error('Translation unavailable');
    const meaning = value['responseData']['translatedText'];
    if (
      typeof meaning !== 'string' ||
      !meaning.trim() ||
      meaning.length > 2000 ||
      vocabularyKey(meaning) === key
    )
      throw new Error('Translation not found');
    if (this.translations.size >= 200) {
      const oldestKey = this.translations.keys().next().value;
      if (oldestKey !== undefined) this.translations.delete(oldestKey);
    }
    this.translations.set(key, { meaning: meaning.trim(), at: Date.now() });
    return meaning.trim();
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.notice.set(null);
  }

  private notify(text: string, error = false): void {
    clearTimeout(this.timer);
    this.notice.set({ text, error });
    this.timer = setTimeout(() => this.notice.set(null), error ? 9000 : 5000);
  }

  private async saveAndEnrich(
    entry: Partial<FavoriteVocabulary> & { term: string },
  ): Promise<void> {
    let pending: FavoriteVocabulary;
    try {
      const existing = (await this.repository.list()).find(
        (word) => vocabularyKey(word.term) === vocabularyKey(entry.term),
      );
      if (
        existing &&
        existing.meaning.trim() &&
        existing.pronunciation.trim() &&
        existing.example.trim() &&
        existing.enrichment !== 'failed' &&
        existing.enrichment !== 'pending' &&
        existing.enrichment !== 'partial'
      ) {
        this.notify(`“${existing.term}” đã có trong từ vựng đã lưu.`);
        return;
      }
      pending = {
        ...(existing ?? entry),
        term: entry.term.trim(),
        meaning: existing?.meaning ?? entry.meaning ?? '',
        pronunciation: existing?.pronunciation ?? entry.pronunciation ?? '',
        example: existing?.example ?? entry.example ?? '',
        enrichment: 'pending',
      };
      await this.repository.save(pending);
      this.notify(`Đã lưu “${pending.term}”. Đang bổ sung thông tin…`);
    } catch (error) {
      console.error('Unable to save favorite vocabulary', error);
      this.notify('Không lưu được từ vựng. Hãy thử lại.', true);
      return;
    }

    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 35000);
    let failureMessage =
      'Không kết nối được dịch vụ tra từ. Kiểm tra kết nối hoặc máy chủ API rồi thử lại.';
    try {
      const fetchedDetails = await this.lookup(pending, controller.signal);
      const details = {
        ...fetchedDetails,
        pronunciation: fetchedDetails.pronunciation || pending.pronunciation,
        example: fetchedDetails.example || pending.example,
        exampleSource: fetchedDetails.example
          ? fetchedDetails.exampleSource
          : pending.exampleSource,
        exampleSourceUrl: fetchedDetails.example
          ? fetchedDetails.exampleSourceUrl
          : pending.exampleSourceUrl,
        exampleAuthor: fetchedDetails.example
          ? fetchedDetails.exampleAuthor
          : pending.exampleAuthor,
        ...(!fetchedDetails.pronunciation && pending.pronunciation
          ? {
              pronunciationKind: pending.pronunciationKind,
              pronunciationSource: pending.pronunciationSource,
            }
          : {}),
      };
      const complete =
        !!details.meaning &&
        !!details.pronunciation &&
        !!details.example &&
        details.meaningLanguage !== 'en';
      const updated = await this.repository.updateEnrichment(
        {
          ...pending,
          ...details,
          enrichment: complete ? 'complete' : 'partial',
          source: 'dictionary',
          enrichmentError: undefined,
        },
        pending,
      );
      if (updated)
        this.notify(
          complete
            ? `Đã lưu “${pending.term}” với nghĩa, phiên âm và câu ví dụ.`
            : `Đã lưu “${pending.term}”. Từ điển chưa có đủ thông tin; bạn có thể tra lại hoặc bổ sung sau.`,
        );
    } catch (error) {
      console.error('Unable to enrich favorite vocabulary', error);
      if (error instanceof VocabularyLookupError) failureMessage = error.message;
      try {
        const updated = await this.repository.updateEnrichment(
          { ...pending, enrichment: 'failed', enrichmentError: failureMessage },
          pending,
        );
        if (updated) this.notify(`Đã lưu “${pending.term}”. ${failureMessage}`, true);
      } catch (storageError) {
        console.error('Unable to update vocabulary status', storageError);
        this.notify(
          'Từ đã được lưu, nhưng không cập nhật được thông tin. Hãy tải lại và thử lại.',
          true,
        );
      }
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
}

export class VocabularyLookupError extends Error {}
