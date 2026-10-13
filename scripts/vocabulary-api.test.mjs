import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
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
  {
    ipa = '/ˈʃɪpmənt/',
    examples = ['The shipment arrived today.'],
    quotes = [],
    translations = [],
  } = {},
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
            quotes,
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
  it('allows browser translation fallback in the production connection policy', async () => {
    const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
    const policy = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1];
    expect(policy).toBeDefined();
    const connectSources = policy
      ?.split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .find(([name]) => name === 'connect-src')
      ?.slice(1);
    expect(connectSources).toEqual(["'self'", 'https://api.mymemory.translated.net']);
  });
  it('finds a real daisy sentence when both dictionaries lack examples', async () => {
    const primary = entry('daisy', { examples: [] });
    primary.entries[0].senses.push({
      definition: 'Something splendid.',
      examples: ['That car is a daisy.'],
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(primary))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: 1,
              text: 'Does Tom like daisies?',
              lang: 'eng',
              owner: 'CK',
              license: 'CC BY 2.0 FR',
              is_unapproved: false,
            },
            {
              id: 3657396,
              text: 'The daisy is white.',
              lang: 'eng',
              owner: 'kerbear407',
              license: 'CC BY 2.0 FR',
              is_unapproved: false,
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const response = await createVocabularyApi()(
      request({ term: 'daisy', meaning: 'hoa cúc', context: '' }),
    );
    expect(await response.json()).toMatchObject({
      meaning: 'hoa cúc',
      example: 'The daisy is white.',
      exampleSource: 'Tatoeba',
      exampleSourceUrl: 'https://tatoeba.org/en/sentences/show/3657396',
      exampleAuthor: 'kerbear407',
    });
    const url = new URL(fetch.mock.calls[2][0]);
    expect(url.origin).toBe('https://api.tatoeba.org');
    expect(url.searchParams.get('q')).toBe('"daisy"');
    expect(url.searchParams.get('is_unapproved')).toBe('no');
    expect(url.searchParams.get('license')).toBe('CC BY 2.0 FR');
  });
  it('keeps the whole phrase together when choosing a corpus example and caches the result', async () => {
    const fetch = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('freedictionaryapi.com'))
        return Response.json(entry('keep in mind', { examples: [] }));
      if (String(url).includes('dictionaryapi.dev')) return Response.json([]);
      return Response.json({
        data: [
          {
            id: 1,
            text: 'Keep your plans in mind.',
            lang: 'eng',
            owner: 'CK',
            license: 'CC BY 2.0 FR',
            is_unapproved: false,
          },
          {
            id: 2,
            text: 'Please keep in mind the deadline.',
            lang: 'eng',
            owner: 'CK',
            license: 'CC BY 2.0 FR',
            is_unapproved: false,
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetch);
    const api = createVocabularyApi();
    for (let index = 0; index < 2; index++) {
      expect(
        await (
          await api(request({ term: 'keep in mind', meaning: 'ghi nhớ', context: '' }))
        ).json(),
      ).toMatchObject({ example: 'Please keep in mind the deadline.', exampleSource: 'Tatoeba' });
    }
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('tatoeba.org'))).toHaveLength(1);
  });
  it('rejects unapproved, unlicensed or unattributed sentences', async () => {
    const sentence = {
      id: 1,
      text: 'The daisy is white.',
      lang: 'eng',
      owner: 'CK',
      license: 'CC BY 2.0 FR',
      is_unapproved: false,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(entry('daisy', { examples: [] })))
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(
          Response.json({
            data: [
              { ...sentence, is_unapproved: true },
              { ...sentence, license: 'PROBLEM' },
              { ...sentence, owner: null },
              { ...sentence, lang: 'deu' },
              { ...sentence, id: '1' },
            ],
          }),
        ),
    );
    expect(
      await (
        await createVocabularyApi()(request({ term: 'daisy', meaning: 'hoa cúc', context: '' }))
      ).json(),
    ).toMatchObject({ meaning: 'hoa cúc', example: '' });
  });
  it('preserves dictionary details when the corpus is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(entry('daisy', { examples: [] })))
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(new Response(null, { status: 503 })),
    );
    expect(
      await (
        await createVocabularyApi()(request({ term: 'daisy', meaning: 'hoa cúc', context: '' }))
      ).json(),
    ).toMatchObject({ meaning: 'hoa cúc', pronunciation: '/ˈʃɪpmənt/', example: '' });
  });
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
      englishMeaning: 'A load of goods being transported.',
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
  it('uses a dictionary quotation when no example is listed', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        entry('keep in mind', {
          examples: [],
          quotes: [
            { text: 'Please keep in mind the deadline.', reference: 'Dictionary quotation' },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const response = await createVocabularyApi()(
      request({ term: 'keep in mind', meaning: 'ghi nhớ', context: '' }),
    );
    expect(await response.json()).toMatchObject({ example: 'Please keep in mind the deadline.' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['shipment', 'take place'])(
    'automatically retrieves a missing example for the manually entered term %s',
    async (term) => {
      const sentence =
        term === 'shipment'
          ? 'The shipment arrived today.'
          : 'The meeting will take place tomorrow.';
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json(entry(term, { examples: [] })))
        .mockResolvedValueOnce(
          Response.json([
            {
              meanings: [
                { definitions: [{ definition: 'Secondary definition.', example: sentence }] },
              ],
            },
          ]),
        );
      vi.stubGlobal('fetch', fetch);
      const response = await createVocabularyApi()(
        request({ term, meaning: 'nghĩa đã lưu', context: '' }),
      );
      expect(await response.json()).toMatchObject({
        meaning: 'nghĩa đã lưu',
        pronunciation: '/ˈʃɪpmənt/',
        example: sentence,
        exampleSource: 'Free Dictionary API',
        sourceUrl: `https://en.wiktionary.org/wiki/${term.replace(/ /g, '_')}`,
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[1][0]).toBe(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
      );
    },
  );
  it('reuses the secondary response for missing IPA and example', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(entry('shipment', { ipa: '', examples: [] })))
      .mockResolvedValueOnce(
        Response.json([
          {
            phonetic: '/ˈʃɪpmənt/',
            meanings: [
              { definitions: [{ definition: 'Goods.', example: 'The shipment arrived.' }] },
            ],
          },
        ]),
      );
    vi.stubGlobal('fetch', fetch);
    expect(await (await createVocabularyApi()(request())).json()).toMatchObject({
      pronunciation: '/ˈʃɪpmənt/',
      pronunciationSource: 'Free Dictionary API',
      example: 'The shipment arrived.',
      exampleSource: 'Free Dictionary API',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([404, 503])(
    'preserves primary details when example fallback returns %s',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(Response.json(entry('shipment', { examples: [] })))
          .mockResolvedValueOnce(new Response(null, { status })),
      );
      const response = await createVocabularyApi()(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        meaning: 'lô hàng',
        pronunciation: '/ˈʃɪpmənt/',
        example: '',
      });
    },
  );
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
      englishMeaning: 'A load of goods being transported.',
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
      englishMeaning: 'Goods sent together.',
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
