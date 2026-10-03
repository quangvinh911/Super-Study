import { describe, expect, it } from 'vitest';
import { compileVocabulary } from './build-toeic-vocabulary.mjs';

const source = {
  id: 'hacker-3',
  rightsStatus: 'privateUserProvided',
  sources: [{ file: 'words.pdf' }],
  entries: [
    {
      id: 'hacker-3-word-1',
      term: 'shipment',
      meaning: 'lô hàng',
      topic: 'Vận chuyển',
      kind: 'word',
      usage: 'track a shipment',
      sources: [{ file: 'words.pdf', pdfPages: [5] }],
    },
  ],
};
function question(order, text) {
  return {
    id: `hacker-3-test-01-q${order}`,
    formId: 'hacker-3-test-01',
    order,
    classification: { section: 'part-5' },
    stem: [{ text }],
    options: [],
  };
}
describe('Vocabulary source review and Hacker matching', () => {
  it('matches exact words in content and transcripts, excluding longer words and metadata', () => {
    const pack = {
      questions: [
        question(101, 'The shipment arrived.'),
        question(102, 'shipments'),
        question(103, 'Call us.'),
        { ...question(104, 'Look.'), stem: [{ kind: 'image', alt: 'shipment' }] },
      ],
      solutions: [
        { questionId: 'hacker-3-test-01-q103', explanation: [{ text: 'Track the shipment.' }] },
      ],
    };
    expect(
      compileVocabulary(source, pack).entries[0].occurrences.map((item) => item.order),
    ).toEqual([101, 103]);
  });
  it('rejects duplicate entries and broken page/source references', () => {
    const pack = { questions: [], solutions: [] };
    expect(() =>
      compileVocabulary({ ...source, entries: [...source.entries, ...source.entries] }, pack),
    ).toThrow(/Duplicate/);
    expect(() =>
      compileVocabulary(
        {
          ...source,
          entries: [{ ...source.entries[0], sources: [{ file: 'wrong.pdf', pdfPages: [1] }] }],
        },
        pack,
      ),
    ).toThrow(/reference/);
  });
});
