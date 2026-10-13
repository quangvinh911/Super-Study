import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FavoriteVocabularyRepository } from '../../core/persistence/favorite-vocabulary.repository';
import { FavoriteVocabularyService, parseVocabularyDetails } from './favorite-vocabulary.service';

const details = {
  meaning: 'lô hàng',
  englishMeaning: 'A load of goods being transported.',
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
  it('previews dictionary details without writing favorites or showing a saved notice', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(details));
    vi.stubGlobal('fetch', fetch);
    const { repository, service } = setup();
    const signal = new AbortController().signal;
    const word = await service.lookup(
      { term: 'keep in mind', example: 'Please keep in mind the deadline.' },
      signal,
    );
    expect(word).toEqual(
      expect.objectContaining({ ...details, term: 'keep in mind', source: 'dictionary' }),
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/vocabulary/enrich',
      expect.objectContaining({
        signal,
        body: JSON.stringify({
          term: 'keep in mind',
          meaning: '',
          context: 'Please keep in mind the deadline.',
        }),
      }),
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.updateEnrichment).not.toHaveBeenCalled();
    expect(service.notice()).toBeNull();
  });
  it('validates optional English definitions and accepts older API responses', () => {
    expect(parseVocabularyDetails(details).englishMeaning).toBe(details.englishMeaning);
    expect(
      parseVocabularyDetails({ ...details, englishMeaning: undefined }).englishMeaning,
    ).toBeUndefined();
    expect(() => parseVocabularyDetails({ ...details, englishMeaning: 123 })).toThrow();
    expect(() =>
      parseVocabularyDetails({ ...details, englishMeaning: 'x'.repeat(2001) }),
    ).toThrow();
  });
  it('recovers Vietnamese meaning in the browser when hosted translation fails and caches it', async () => {
    const fallback = {
      ...details,
      meaning: 'plural of fee',
      englishMeaning: 'plural of fee',
      meaningLanguage: 'en',
    };
    const fetch = vi
      .fn()
      .mockImplementation(async (url) =>
        String(url).startsWith('/api/')
          ? Response.json(fallback)
          : Response.json({
              responseStatus: 200,
              quotaFinished: false,
              responseData: { translatedText: 'phí' },
            }),
      );
    vi.stubGlobal('fetch', fetch);
    const { service, repository } = setup();
    for (let index = 0; index < 2; index++) {
      expect(
        await service.lookup(
          { term: 'fees', example: 'Private study context.' },
          new AbortController().signal,
        ),
      ).toEqual(
        expect.objectContaining({
          term: 'fees',
          meaning: 'phí',
          englishMeaning: 'plural of fee',
          meaningLanguage: 'vi',
          translationSource: 'MyMemory',
        }),
      );
    }
    const providerCalls = fetch.mock.calls.filter(([url]) => !String(url).startsWith('/api/'));
    expect(providerCalls).toHaveLength(1);
    const url = new URL(providerCalls[0][0]);
    expect(url.searchParams.get('q')).toBe('fees');
    expect(url.searchParams.get('langpair')).toBe('en|vi');
    expect([...url.searchParams.keys()]).toEqual(['q', 'langpair']);
    expect(providerCalls[0][1]).toEqual(
      expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }),
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
  it.each([
    {
      responseStatus: 403,
      quotaFinished: true,
      responseData: { translatedText: 'DAILY LIMIT EXCEEDED' },
    },
    { responseStatus: 200, quotaFinished: false, responseData: { translatedText: 'fees' } },
    { responseStatus: 200, quotaFinished: false, responseData: { translatedText: 123 } },
  ])('preserves English fallback when browser translation is invalid: %j', async (translation) => {
    const fallback = {
      ...details,
      meaning: 'plural of fee',
      englishMeaning: 'plural of fee',
      meaningLanguage: 'en',
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(fallback))
        .mockResolvedValueOnce(Response.json(translation)),
    );
    const { service, repository } = setup();
    const word = await service.lookup({ term: 'fees' }, new AbortController().signal);
    expect(word).toEqual(
      expect.objectContaining({
        meaning: fallback.meaning,
        meaningLanguage: 'en',
        enrichment: 'partial',
      }),
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('aborts browser translation when its dictionary popup is closed', async () => {
    const fallback = { ...details, meaning: 'plural of fee', meaningLanguage: 'en' };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(fallback))
      .mockImplementationOnce(
        (_url, options: RequestInit) =>
          new Promise<never>((_resolve, reject) => {
            if (!options.signal) throw new Error('Missing cancellation signal');
            options.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Closed', 'AbortError')),
              { once: true },
            );
          }),
      );
    vi.stubGlobal('fetch', fetch);
    const { service } = setup();
    const controller = new AbortController();
    const pending = service.lookup({ term: 'fees' }, controller.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    controller.abort();
    await expect(pending).rejects.toThrow('Closed');
  });
  it('saves previewed data without another dictionary request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { repository, service } = setup();
    const word = {
      term: 'shipment',
      ...details,
      source: 'dictionary' as const,
      enrichment: 'complete' as const,
    };
    expect(await service.savePreview(word)).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(word);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves a manually edited favorite when saving a preview of the same term', async () => {
    const { repository, service } = setup([
      { term: 'Shipment', ...details, meaning: 'hàng gửi', source: 'manual' },
    ]);
    expect(await service.savePreview({ term: 'shipment', ...details })).toBe(true);
    expect(repository.save).not.toHaveBeenCalled();
    expect(service.notice()?.text).toContain('đã có');
  });
  it('reports failed preview persistence without claiming a saved result', async () => {
    const { repository, service } = setup();
    repository.save.mockRejectedValue(new Error('Storage full'));
    expect(await service.savePreview({ term: 'shipment', ...details })).toBe(false);
    expect(service.notice()?.error).toBe(true);
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
  it('automatically saves the fetched example and its source for a manually added term', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ...details, exampleSource: 'Free Dictionary API' }));
    vi.stubGlobal('fetch', fetch);
    const { repository, service } = setup();
    await service.save({ term: 'shipment' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/vocabulary/enrich',
      expect.objectContaining({
        body: JSON.stringify({ term: 'shipment', meaning: '', context: '' }),
      }),
    );
    expect(repository.updateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({
        ...details,
        exampleSource: 'Free Dictionary API',
        enrichment: 'complete',
      }),
      expect.objectContaining({ example: '', enrichment: 'pending' }),
    );
  });
  it('persists corpus examples with their source and author', async () => {
    const corpus = {
      ...details,
      exampleSource: 'Tatoeba',
      exampleSourceUrl: 'https://tatoeba.org/en/sentences/show/3657396',
      exampleAuthor: 'kerbear407',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(corpus)));
    const { repository, service } = setup();
    await service.save({ term: 'daisy' });
    expect(repository.updateEnrichment).toHaveBeenCalledWith(
      expect.objectContaining(corpus),
      expect.anything(),
    );
    expect(() =>
      parseVocabularyDetails({ ...corpus, exampleSourceUrl: 'https://evil.example' }),
    ).toThrow();
    expect(() => parseVocabularyDetails({ ...corpus, exampleAuthor: undefined })).toThrow();
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
