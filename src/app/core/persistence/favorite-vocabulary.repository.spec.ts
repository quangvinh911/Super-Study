import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CERTIFICATE, CertificateContext } from '../../certificates/certificate-context';
import { CERTIFICATES, CTFL } from '../../certificates/registry';
import { FavoriteVocabularyRepository } from './favorite-vocabulary.repository';
import { wordAtOffset } from '../../certificates/certificate-shell';

function repository(certificate: typeof CTFL): FavoriteVocabularyRepository {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: CERTIFICATE, useValue: certificate },
      CertificateContext,
      FavoriteVocabularyRepository,
    ],
  });
  return TestBed.inject(FavoriteVocabularyRepository);
}

describe('Favorite vocabulary', () => {
  it('persists edits without duplicates and isolates certificates', async () => {
    const ctfl = repository(CTFL);
    const entry = {
      term: ' Shipment ',
      meaning: 'lô hàng',
      pronunciation: '/ˈʃɪpmənt/',
      example: 'The shipment arrived today.',
    };
    await ctfl.save(entry);
    await ctfl.save({ ...entry, term: 'shipment', meaning: 'hàng gửi' });
    expect(await repository(CTFL).list()).toEqual([
      { ...entry, term: 'shipment', meaning: 'hàng gửi' },
    ]);
    const toeicDefinition = CERTIFICATES.find((certificate) => certificate.id === 'toeic');
    if (!toeicDefinition) throw new Error('Missing TOEIC definition');
    const toeic = repository(toeicDefinition);
    expect(await toeic.list()).toEqual([]);
    await toeic.save(entry);
    await ctfl.remove('SHIPMENT');
    expect(await ctfl.list()).toEqual([]);
    expect(await toeic.list()).toHaveLength(1);
    await toeic.remove('shipment');
  });

  it('rejects incomplete definitions without saving them', async () => {
    const repo = repository(CTFL);
    await expect(
      repo.save({ term: 'test', meaning: '', pronunciation: '/test/', example: 'A test.' }),
    ).rejects.toThrow();
    expect(await repo.list()).toEqual([]);
  });

  it('finds whole words including apostrophes and avoids punctuation', () => {
    expect(wordAtOffset("The shipment isn't late.", 6)).toBe('shipment');
    expect(wordAtOffset("The shipment isn't late.", 16)).toBe("isn't");
    expect(wordAtOffset('shipment.', 8)).toBeUndefined();
    expect(wordAtOffset('nghĩa', 2)).toBe('nghĩa');
  });
  it('persists dictionary attribution and partial field metadata across reload', async () => {
    const repo = repository(CTFL);
    const entry = {
      term: 'shipment',
      meaning: 'A load of goods.',
      pronunciation: '/ˈʃɪpmənt/',
      example: '',
      enrichment: 'partial' as const,
      source: 'dictionary' as const,
      sourceUrl: 'https://en.wiktionary.org/wiki/shipment',
      meaningLanguage: 'en' as const,
      pronunciationKind: 'entry' as const,
    };
    await repo.save(entry);
    expect(await repository(CTFL).list()).toEqual([entry]);
    await repo.remove(entry.term);
  });

  it('preserves deletions and manual edits while background enrichment finishes', async () => {
    const repo = repository(CTFL);
    const pending = {
      term: 'shipment',
      meaning: '',
      pronunciation: '',
      example: '',
      enrichment: 'pending' as const,
    };
    const complete = {
      term: 'shipment',
      meaning: 'lô hàng',
      pronunciation: '/ˈʃɪpmənt/',
      example: 'The shipment arrived.',
      enrichment: 'complete' as const,
    };
    await repo.save(pending);
    await repo.remove(pending.term);
    expect(await repo.updateEnrichment(complete, pending)).toBe(false);
    expect(await repo.list()).toEqual([]);
    await repo.save(pending);
    await repo.save({ ...complete, meaning: 'nghĩa đã chỉnh sửa' });
    expect(await repo.updateEnrichment(complete, pending)).toBe(false);
    expect((await repo.list())[0].meaning).toBe('nghĩa đã chỉnh sửa');
    await repo.remove(pending.term);
    await repo.save(pending);
    expect(await repo.updateEnrichment(complete, pending)).toBe(true);
    expect((await repo.list())[0].enrichment).toBe('complete');
    await repo.remove(pending.term);
  });
});
