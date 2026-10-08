import { TestBed } from '@angular/core/testing';
import { HackerGrammarExamples, parseHackerGrammarExamples } from './hacker-grammar-examples';
import { hackerGrammarFixture } from './hacker-grammar-examples.fixture';

describe('Hacker grammar examples', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requires five distinct examples for every rule and honest adaptation labels', () => {
    const pack = hackerGrammarFixture();
    expect(parseHackerGrammarExamples(pack)).toHaveLength(84);
    const incomplete = structuredClone(pack);
    incomplete.groups.pop();
    expect(() => parseHackerGrammarExamples(incomplete)).toThrow('every lesson rule');
    const short = structuredClone(pack);
    short.groups[0].examples.pop();
    expect(() => parseHackerGrammarExamples(short)).toThrow('five valid examples');
    const mislabeled = structuredClone(pack);
    mislabeled.groups[0].examples[4].kind = 'excerpt';
    expect(() => parseHackerGrammarExamples(mislabeled)).toThrow('five valid examples');
  });

  it('rejects invalid highlights, source IDs and duplicated sentences', () => {
    const pack = hackerGrammarFixture();
    pack.groups[0].examples[0].highlight = 'unrelated';
    expect(() => parseHackerGrammarExamples(pack)).toThrow();
    const badSource = hackerGrammarFixture();
    badSource.groups[0].examples[0].source.questionId = 'jimmy-test-01-q101';
    expect(() => parseHackerGrammarExamples(badSource)).toThrow();
    const duplicates = hackerGrammarFixture();
    duplicates.groups[0].examples[1] = { ...duplicates.groups[0].examples[0], id: 'different-id' };
    expect(() => parseHackerGrammarExamples(duplicates)).toThrow('Duplicate');
  });

  it('shows load failures, permits retry and reuses a successful collection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(hackerGrammarFixture())));
    const service = TestBed.inject(HackerGrammarExamples);
    await service.load();
    expect(service.error()).toContain('Chưa tải được');
    expect(service.groups()).toHaveLength(0);
    expect(service.loading()).toBe(false);
    await service.load();
    expect(service.error()).toBe('');
    expect(service.groups()).toHaveLength(84);
    await service.load();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
