import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { validateProgressExport } from '../domain/progress-validation';
import { Attempt, Bookmark, QuestionStat, SessionSnapshot } from '../models';
import { FavoriteVocabulary } from '../persistence/favorite-vocabulary.repository';

@Injectable({ providedIn: 'root' })
export class AccountLearningClient {
  private readonly auth = inject(AuthService);
  async call(
    certificateId: string,
    action: string,
    args: readonly unknown[] = [],
  ): Promise<unknown> {
    return this.auth.request(`/api/learning/${certificateId}`, {
      method: 'POST',
      body: JSON.stringify({ action, args }),
    });
  }
  parseProgressField<K extends 'activeSessions' | 'attempts' | 'questionStats' | 'bookmarks'>(
    certificateId: string,
    field: K,
    value: unknown,
  ): {
    activeSessions: SessionSnapshot[];
    attempts: Attempt[];
    questionStats: QuestionStat[];
    bookmarks: Bookmark[];
  }[K] {
    const progress = validateProgressExport(
      {
        format: 'certificate-practice-progress',
        schemaVersion: 3,
        certificateId,
        exportedAt: new Date().toISOString(),
        activeSessions: [],
        attempts: [],
        questionStats: [],
        bookmarks: [],
        settings: {},
        [field]: value,
      },
      certificateId,
    );
    // The validator checks the complete field before it enters application state.
    return [...progress[field]] as {
      activeSessions: SessionSnapshot[];
      attempts: Attempt[];
      questionStats: QuestionStat[];
      bookmarks: Bookmark[];
    }[K];
  }
  parseWords(value: unknown): FavoriteVocabulary[] {
    if (!Array.isArray(value)) throw new Error('Invalid vocabulary response');
    return value.map((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null)
        throw new Error('Invalid vocabulary response');
      const word = entry as Record<string, unknown>;
      if (
        typeof word['term'] !== 'string' ||
        word['term'].length > 120 ||
        !word['term'].trim() ||
        typeof word['meaning'] !== 'string' ||
        word['meaning'].length > 2000 ||
        (word['englishMeaning'] !== undefined &&
          (typeof word['englishMeaning'] !== 'string' || word['englishMeaning'].length > 2000)) ||
        typeof word['pronunciation'] !== 'string' ||
        word['pronunciation'].length > 200 ||
        typeof word['example'] !== 'string' ||
        word['example'].length > 4000
      )
        throw new Error('Invalid vocabulary response');
      const enrichment = word['enrichment'];
      if (
        enrichment !== undefined &&
        !['pending', 'failed', 'partial', 'complete'].includes(String(enrichment))
      )
        throw new Error('Invalid vocabulary response');
      const source = word['source'];
      if (source !== undefined && !['dictionary', 'manual', 'ai'].includes(String(source)))
        throw new Error('Invalid vocabulary response');
      const result: FavoriteVocabulary = {
        term: word['term'],
        meaning: word['meaning'],
        ...(typeof word['englishMeaning'] === 'string'
          ? { englishMeaning: word['englishMeaning'] }
          : {}),
        pronunciation: word['pronunciation'],
        example: word['example'],
        ...(enrichment === 'pending' ||
        enrichment === 'failed' ||
        enrichment === 'partial' ||
        enrichment === 'complete'
          ? { enrichment }
          : {}),
        ...(source === 'dictionary' || source === 'manual' || source === 'ai' ? { source } : {}),
      };
      for (const key of [
        'sourceUrl',
        'enrichmentError',
        'pronunciationSource',
        'exampleSource',
        'exampleSourceUrl',
        'exampleAuthor',
        'translationSource',
      ] as const) {
        const item = word[key];
        if (item !== undefined && typeof item !== 'string')
          throw new Error('Invalid vocabulary metadata');
      }
      if (
        word['exampleSource'] !== undefined &&
        word['exampleSource'] !== 'Free Dictionary API' &&
        word['exampleSource'] !== 'Tatoeba'
      )
        throw new Error('Invalid vocabulary metadata');
      if (
        word['exampleSourceUrl'] !== undefined &&
        !/^https:\/\/tatoeba\.org\/en\/sentences\/show\/[1-9]\d*$/.test(
          String(word['exampleSourceUrl']),
        )
      )
        throw new Error('Invalid example source');
      if (
        word['exampleAuthor'] !== undefined &&
        (!String(word['exampleAuthor']).trim() || String(word['exampleAuthor']).length > 100)
      )
        throw new Error('Invalid example author');
      if (
        word['exampleSource'] === 'Tatoeba' &&
        (!word['exampleSourceUrl'] || !word['exampleAuthor'])
      )
        throw new Error('Incomplete example attribution');
      if (
        word['meaningLanguage'] !== undefined &&
        !['vi', 'en'].includes(String(word['meaningLanguage']))
      )
        throw new Error('Invalid vocabulary metadata');
      if (
        word['pronunciationKind'] !== undefined &&
        !['entry', 'word-by-word'].includes(String(word['pronunciationKind']))
      )
        throw new Error('Invalid vocabulary metadata');
      return {
        ...result,
        ...(typeof word['sourceUrl'] === 'string' ? { sourceUrl: word['sourceUrl'] } : {}),
        ...(typeof word['enrichmentError'] === 'string'
          ? { enrichmentError: word['enrichmentError'] }
          : {}),
        ...(typeof word['pronunciationSource'] === 'string'
          ? { pronunciationSource: word['pronunciationSource'] }
          : {}),
        ...(word['exampleSource'] === 'Free Dictionary API' || word['exampleSource'] === 'Tatoeba'
          ? { exampleSource: word['exampleSource'] }
          : {}),
        ...(typeof word['exampleSourceUrl'] === 'string'
          ? { exampleSourceUrl: word['exampleSourceUrl'] }
          : {}),
        ...(typeof word['exampleAuthor'] === 'string'
          ? { exampleAuthor: word['exampleAuthor'] }
          : {}),
        ...(typeof word['translationSource'] === 'string'
          ? { translationSource: word['translationSource'] }
          : {}),
        ...(word['meaningLanguage'] === 'vi' || word['meaningLanguage'] === 'en'
          ? { meaningLanguage: word['meaningLanguage'] }
          : {}),
        ...(word['pronunciationKind'] === 'entry' || word['pronunciationKind'] === 'word-by-word'
          ? { pronunciationKind: word['pronunciationKind'] }
          : {}),
      };
    });
  }
}
