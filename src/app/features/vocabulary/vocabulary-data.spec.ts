import { describe, expect, it } from 'vitest';
import { parseVocabulary, searchVocabulary } from './vocabulary-data';

const entry = {
  id: 'hacker-3-word-1',
  term: 'shipment',
  meaning: 'lô hàng',
  kind: 'word',
  topic: 'Vận chuyển',
  day: 16,
  usage: 'track a shipment',
  sources: [{ file: 'words.pdf', pdfPages: [42] }],
  occurrences: [{ questionId: 'hacker-3-test-01-q101', test: 1, order: 101, part: 'part-5' }],
};
const collection = {
  id: 'hacker-3',
  title: 'Hacker 3',
  reviewNote: 'Selected vocabulary',
  entries: [entry],
};
describe('TOEIC vocabulary data', () => {
  it('loads valid source evidence and exact question references', () => {
    expect(parseVocabulary(collection, 'hacker-3').entries[0].occurrences[0].order).toBe(101);
  });
  it('rejects another collection, duplicates and malformed source evidence', () => {
    expect(() => parseVocabulary(collection, 'another')).toThrow();
    expect(() => parseVocabulary({ ...collection, entries: [entry, entry] }, 'hacker-3')).toThrow();
    expect(() =>
      parseVocabulary(
        { ...collection, entries: [{ ...entry, sources: [{ file: 'words.pdf', pdfPages: [0] }] }] },
        'hacker-3',
      ),
    ).toThrow();
    expect(() =>
      parseVocabulary(
        { ...collection, entries: [{ ...entry, occurrences: [{ part: 'part-8' }] }] },
        'hacker-3',
      ),
    ).toThrow();
  });
  it('finds English combinations and Vietnamese meanings without accents', () => {
    const parsed = parseVocabulary(collection, 'hacker-3').entries[0];
    expect(searchVocabulary(parsed, 'LO HANG')).toBe(true);
    expect(searchVocabulary(parsed, 'track a shipment')).toBe(true);
    expect(searchVocabulary(parsed, 'unknown')).toBe(false);
  });
});
