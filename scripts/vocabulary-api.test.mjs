import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVocabularyApi } from './vocabulary-api.mjs';

const input = { term: 'shipment', meaning: 'lô hàng', context: 'track a shipment' };
function request(body = input, origin = 'https://study.example') {
  return new Request('https://study.example/api/vocabulary/enrich', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function entry(
  term = 'shipment',
  { ipa = '/ˈʃɪpmənt/', examples = ['The shipment arrived today.'], translations = [] } = {},
) {
  return {
    word: term,
    entries: [
      {
        language: { code: 'en' },
        pronunciations: ipa ? [{ type: 'ipa', text: ipa, tags: ['US'] }] : [],
        senses: [
          {
            definition: 'A load of goods being transported.',
            examples,
            translations,
            tags: [],
            subsenses: [],
          },
        ],
      },
    ],
  };
}
describe('Internet vocabulary lookup without credentials', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('uses dictionary definitions, IPA and examples while preserving local Vietnamese meanings', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(entry()));
    vi.stubGlobal('fetch', fetch);
    const response = await createVocabularyApi()(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      meaning: 'lô hàng',
      pronunciation: '/ˈʃɪpmənt/',
      example: 'The shipment arrived today.',
      sourceUrl: 'https://en.wiktionary.org/wiki/shipment',
    });
    expect(fetch.mock.calls[0][0]).toContain('freedictionaryapi.com');
    expect(fetch.mock.calls[0][1].headers).toBeUndefined();
  });
  it('prefers dictionary Vietnamese translations and avoids translation requests', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          entry('shipment', { translations: [{ language: { code: 'vi' }, word: 'hàng gửi' }] }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const response = await createVocabularyApi()(request({ ...input, meaning: '' }));
    expect((await response.json()).meaning).toBe('hàng gửi');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('looks up a Vietnamese translation when the dictionary lacks one', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(entry()))
      .mockResolvedValueOnce(
        Response.json({
          responseStatus: 200,
          quotaFinished: false,
          responseData: { translatedText: 'lô hàng' },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    expect(
      await (await createVocabularyApi()(request({ ...input, meaning: '' }))).json(),
    ).toMatchObject({ meaning: 'lô hàng', meaningLanguage: 'vi', translationSource: 'MyMemory' });
    expect(String(fetch.mock.calls[1][0])).toContain('langpair=en%7Cvi');
  });
  it('labels an English fallback and leaves missing fields empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(entry('shipment', { ipa: '', examples: [] })))
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(Response.json({ responseStatus: 403, quotaFinished: true })),
    );
    expect(
      await (await createVocabularyApi()(request({ ...input, meaning: '' }))).json(),
    ).toMatchObject({
      meaning: 'A load of goods being transported.',
      meaningLanguage: 'en',
      pronunciation: '',
      example: '',
    });
  });
  it('composes phrase IPA from component entries with an explicit word-by-word label', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url) => {
        const term = decodeURIComponent(String(url).split('/').at(-1).split('?')[0]);
        return Response.json(
          term === 'take place'
            ? entry(term, { ipa: '', examples: ['The wedding will take place tomorrow.'] })
            : entry(term, { ipa: term === 'take' ? '/teɪk/' : '/pleɪs/' }),
        );
      }),
    );
    expect(
      await (
        await createVocabularyApi()(
          request({ term: 'take place', meaning: 'diễn ra', context: '' }),
        )
      ).json(),
    ).toMatchObject({
      pronunciation: '/teɪk/ /pleɪs/',
      pronunciationKind: 'word-by-word',
      example: 'The wedding will take place tomorrow.',
    });
  });
  it('retrieves missing IPA from the secondary dictionary', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(entry('shipment', { ipa: '' })))
        .mockResolvedValueOnce(Response.json([{ phonetics: [{ text: '/ˈʃɪpmənt/' }] }])),
    );
    expect(await (await createVocabularyApi()(request())).json()).toMatchObject({
      pronunciation: '/ˈʃɪpmənt/',
      pronunciationSource: 'Free Dictionary API',
    });
  });
  it('returns not found or a provider failure without creating fake data', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(Response.json({ entries: 'invalid' }))
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    const api = createVocabularyApi();
    expect((await api(request())).status).toBe(404);
    expect((await api(request())).status).toBe(502);
  });
  it('rejects foreign origins and oversized/invalid requests before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const api = createVocabularyApi();
    expect((await api(request(input, 'https://other.example'))).status).toBe(403);
    expect((await api(request({ ...input, term: '' }))).status).toBe(400);
    expect((await api(request({ ...input, context: 'a'.repeat(9000) }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([404, 503])('uses secondary meanings and IPA when primary returns %s', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(
          Response.json([
            {
              phonetic: '/ˈʃɪpmənt/',
              meanings: [
                {
                  definitions: [
                    { definition: 'Goods sent together.', example: 'The shipment arrived today.' },
                  ],
                },
              ],
            },
          ]),
        )
        .mockResolvedValueOnce(
          Response.json({ responseStatus: 200, responseData: { translatedText: 'lô hàng' } }),
        ),
    );
    expect(
      await (await createVocabularyApi()(request({ ...input, meaning: '' }))).json(),
    ).toMatchObject({
      meaning: 'lô hàng',
      pronunciation: '/ˈʃɪpmənt/',
      example: 'The shipment arrived today.',
      sourceUrl: 'https://dictionaryapi.dev/',
    });
  });
  it('caches dictionary requests and limits bursts', async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json(entry()));
    vi.stubGlobal('fetch', fetch);
    const api = createVocabularyApi();
    for (let index = 0; index < 10; index++) expect((await api(request())).status).toBe(200);
    expect((await api(request())).status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
