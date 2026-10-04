import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FavoriteVocabularyRepository } from '../../core/persistence/favorite-vocabulary.repository';
import { FavoriteVocabularyService } from './favorite-vocabulary.service';

const details = {
  meaning: 'lô hàng',
  pronunciation: '/ˈʃɪpmənt/',
  example: 'The shipment arrived.',
};
function setup(existing: unknown[] = []) {
  const repository = {
    list: vi.fn().mockResolvedValue(existing),
    save: vi.fn().mockResolvedValue(undefined),
    updateEnrichment: vi.fn().mockResolvedValue(true),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: FavoriteVocabularyRepository, useValue: repository }],
  });
  return { repository, service: TestBed.inject(FavoriteVocabularyService) };
}

describe('Saving vocabulary without a dialog', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  it('persists immediately and enriches once despite rapid clicks', async () => {
    let resolveResponse: (response: Response) => void = () => {
      throw new Error('Fetch not started');
    };
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetch = vi.fn().mockReturnValue(response);
    vi.stubGlobal('fetch', fetch);
    const { repository, service } = setup();
    const first = service.save({ term: 'shipment', meaning: details.meaning });
    const second = service.save({ term: 'SHIPMENT' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ term: 'shipment', enrichment: 'pending' }),
    );
    expect(service.notice()?.text).toContain('Đã lưu');
    resolveResponse(Response.json(details));
    await Promise.all([first, second]);
    expect(repository.updateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({ ...details, enrichment: 'complete', source: 'dictionary' }),
      expect.objectContaining({ enrichment: 'pending' }),
    );
  });
  it('retains a saved word for retry if dictionary fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const { repository, service } = setup();
    await service.save({ term: 'shipment' });
    expect(repository.save).toHaveBeenCalled();
    expect(repository.updateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({ enrichment: 'failed' }),
      expect.anything(),
    );
    expect(service.notice()?.error).toBe(true);
  });
  it.each([
    [404, { error: 'word_not_found' }, 'chính tả'],
    [404, { error: 'not_found' }, 'máy chủ API'],
    [429, { error: 'rate_limited' }, 'một phút'],
  ])('records a useful reason for HTTP %s failures', async (status, body, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(body, { status: Number(status) })),
    );
    const { repository, service } = setup();
    await service.save({ term: 'shipment' });
    expect(repository.updateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({
        enrichment: 'failed',
        enrichmentError: expect.stringContaining(String(expected)),
      }),
      expect.anything(),
    );
  });
  it('preserves existing IPA and examples when retry returns missing fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...details, pronunciation: '', example: '' })),
    );
    const { repository, service } = setup([
      { term: 'shipment', ...details, enrichment: 'partial' },
    ]);
    await service.save({ term: 'shipment' });
    expect(repository.updateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({
        pronunciation: details.pronunciation,
        example: details.example,
        enrichment: 'complete',
      }),
      expect.anything(),
    );
  });
  it('reuses complete saved definitions without calling dictionary', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { repository, service } = setup([{ term: 'shipment', ...details }]);
    await service.save({ term: 'Shipment' });
    expect(fetch).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('retries legacy records marked complete when IPA is still missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(details)));
    const { repository, service } = setup([
      { term: 'shipment', ...details, pronunciation: '', enrichment: 'complete' },
    ]);
    await service.save({ term: 'shipment' });
    expect(repository.updateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({ pronunciation: details.pronunciation, enrichment: 'complete' }),
      expect.anything(),
    );
  });
  it('does not claim success or call dictionary if persistence fails', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { repository, service } = setup();
    repository.save.mockRejectedValue(new Error('Quota exceeded'));
    await service.save({ term: 'shipment' });
    expect(service.notice()?.text).toContain('Không lưu được');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed results and suppresses completion for deleted or edited words', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...details, pronunciation: 123 }))
        .mockResolvedValueOnce(Response.json(details)),
    );
    const { repository, service } = setup();
    await service.save({ term: 'shipment' });
    expect(repository.updateEnrichment).toHaveBeenLastCalledWith(
      expect.objectContaining({ enrichment: 'failed' }),
      expect.anything(),
    );
    repository.updateEnrichment.mockResolvedValue(false);
    await service.save({ term: 'shipment' });
    expect(service.notice()?.text).not.toContain('với nghĩa');
  });
  it('keeps partial dictionary data and its attribution without claiming full enrichment', async () => {
    const partial = {
      ...details,
      pronunciation: '',
      sourceUrl: 'https://en.wiktionary.org/wiki/shipment',
      meaningLanguage: 'en',
      pronunciationKind: 'entry',
      translationSource: '',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(partial)));
    const { repository, service } = setup();
    await service.save({ term: 'shipment' });
    expect(repository.updateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: partial.sourceUrl,
        pronunciation: '',
        meaningLanguage: 'en',
        enrichment: 'partial',
        source: 'dictionary',
      }),
      expect.anything(),
    );
    expect(service.notice()?.text).toContain('chưa có đủ thông tin');
  });
  it('rejects source links outside the dictionary host', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ...details, sourceUrl: 'https://other.example/shipment' }),
        ),
    );
    const { repository, service } = setup();
    await service.save({ term: 'shipment' });
    expect(repository.updateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({ enrichment: 'failed' }),
      expect.anything(),
    );
  });
});
