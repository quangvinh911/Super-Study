import { inject, Injectable, signal } from '@angular/core';
import { DBSchema, openDB } from 'idb';
import { CertificateContext } from '../../certificates/certificate-context';

export interface FavoriteVocabulary {
  readonly term: string;
  readonly meaning: string;
  readonly pronunciation: string;
  readonly example: string;
  readonly enrichment?: 'pending' | 'failed' | 'partial' | 'complete';
  readonly enrichmentError?: string;
  readonly source?: 'dictionary' | 'manual' | 'ai'; // 'ai' is retained for existing saved records only.
  readonly sourceUrl?: string;
  readonly meaningLanguage?: 'vi' | 'en';
  readonly pronunciationKind?: 'entry' | 'word-by-word';
  readonly pronunciationSource?: string;
  readonly translationSource?: string;
}

interface VocabularyDatabase extends DBSchema {
  words: { key: string; value: FavoriteVocabulary };
}

export function vocabularyKey(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, ' ');
}

@Injectable({ providedIn: 'root' })
export class FavoriteVocabularyRepository {
  readonly revision = signal(0);
  private readonly certificate = inject(CertificateContext);

  private open() {
    return openDB<VocabularyDatabase>(`certificate-vocabulary:${this.certificate.id}`, 1, {
      upgrade(database) {
        database.createObjectStore('words');
      },
    });
  }

  async list(): Promise<FavoriteVocabulary[]> {
    const database = await this.open();
    try {
      return await database.getAll('words');
    } finally {
      database.close();
    }
  }

  async save(entry: FavoriteVocabulary): Promise<void> {
    if (
      !entry.term.trim() ||
      entry.term.length > 120 ||
      (!(
        entry.enrichment === 'pending' ||
        entry.enrichment === 'failed' ||
        entry.enrichment === 'partial'
      ) &&
        ![entry.meaning, entry.pronunciation, entry.example].every((value) => value.trim()))
    ) {
      throw new Error('Vocabulary fields must not be empty.');
    }
    const database = await this.open();
    try {
      await database.put(
        'words',
        {
          term: entry.term.trim(),
          meaning: entry.meaning.trim(),
          pronunciation: entry.pronunciation.trim(),
          example: entry.example.trim(),
          ...(entry.enrichment ? { enrichment: entry.enrichment } : {}),
          ...(entry.enrichmentError ? { enrichmentError: entry.enrichmentError } : {}),
          ...(entry.source ? { source: entry.source } : {}),
          ...(entry.sourceUrl ? { sourceUrl: entry.sourceUrl } : {}),
          ...(entry.meaningLanguage ? { meaningLanguage: entry.meaningLanguage } : {}),
          ...(entry.pronunciationKind ? { pronunciationKind: entry.pronunciationKind } : {}),
          ...(entry.pronunciationSource ? { pronunciationSource: entry.pronunciationSource } : {}),
          ...(entry.translationSource ? { translationSource: entry.translationSource } : {}),
        },
        vocabularyKey(entry.term),
      );
      this.revision.update((value) => value + 1);
    } finally {
      database.close();
    }
  }

  async remove(term: string): Promise<void> {
    const database = await this.open();
    try {
      await database.delete('words', vocabularyKey(term));
      this.revision.update((value) => value + 1);
    } finally {
      database.close();
    }
  }

  async updateEnrichment(
    entry: FavoriteVocabulary,
    expected: FavoriteVocabulary,
  ): Promise<boolean> {
    const database = await this.open();
    try {
      const transaction = database.transaction('words', 'readwrite');
      const key = vocabularyKey(entry.term);
      const current = await transaction.store.get(key);
      // A background response must not resurrect a deleted word or overwrite a manual edit.
      const unchanged =
        current?.enrichment === 'pending' &&
        current.meaning === expected.meaning &&
        current.pronunciation === expected.pronunciation &&
        current.example === expected.example;
      if (unchanged) await transaction.store.put(entry, key);
      await transaction.done;
      if (unchanged) this.revision.update((value) => value + 1);
      return unchanged;
    } finally {
      database.close();
    }
  }
}
