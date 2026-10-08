import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileGrammarExamples } from './build-toeic-grammar.mjs';
import { GRAMMAR_LESSONS } from '../src/app/features/grammar/grammar-lessons.ts';

function fixture() {
  const questions = Array.from({ length: 5 }, (_, index) => ({
    id: `hacker-3-test-01-q${101 + index}`,
    certificateId: 'toeic',
    formId: 'hacker-3-test-01',
    order: 101 + index,
    stem: [{ kind: 'paragraph', text: `The team _____ report ${index + 1}.` }],
    options: [{ id: 'B', content: [{ kind: 'paragraph', text: 'reviews' }] }],
    classification: { section: 'part-5' },
    provenance: { rightsStatus: 'privateUserProvided' },
    verification: { answerStatus: 'sourcePrinted' },
  }));
  const solutions = questions.map((question) => ({
    questionId: question.id,
    correctOptionIds: ['B'],
  }));
  const examples = questions.map((question, index) => ({
    id: `example-${index}`,
    kind: 'excerpt',
    english: `The team reviews report ${index + 1}.`,
    highlight: 'reviews',
    explanation: 'Động từ chia theo chủ ngữ.',
    source: {
      questionId: question.id,
      location: 'stem',
      quote: `The team reviews report ${index + 1}.`,
    },
  }));
  return {
    bank: { questions, solutions },
    source: {
      schemaVersion: 1,
      rightsStatus: 'privateUserProvided',
      reviewNote: 'Synthetic test fixture.',
      groups: [{ slug: 'cau-va-tu-loai', ruleLabel: 'Khung câu', examples }],
    },
  };
}

describe('Hacker grammar compiler', () => {
  it('completes Part 5 from the printed key and preserves verification and rights', () => {
    const { source, bank } = fixture();
    const compiled = compileGrammarExamples(source, bank);
    expect(compiled.groups[0].examples[0].source).toMatchObject({
      test: 1,
      order: 101,
      part: 'part-5',
      completedFromAnswerKey: true,
      answerStatus: 'sourcePrinted',
    });
    expect(compiled.rightsStatus).toBe('privateUserProvided');
    expect(bank.questions[0].stem[0].text).toContain('_____');
  });

  it('rejects an invalid key, missing question and quote not present in the source', () => {
    const invalidKey = fixture();
    invalidKey.bank.solutions[0].correctOptionIds = ['X'];
    expect(() => compileGrammarExamples(invalidKey.source, invalidKey.bank)).toThrow(
      'answer option',
    );
    const missing = fixture();
    missing.bank.questions.pop();
    expect(() => compileGrammarExamples(missing.source, missing.bank)).toThrow('missing Hacker');
    const incorrectQuote = fixture();
    incorrectQuote.source.groups[0].examples[0].source.quote = 'A different source sentence.';
    expect(() => compileGrammarExamples(incorrectQuote.source, incorrectQuote.bank)).toThrow(
      'quote does not match',
    );
  });

  it('requires distinct examples and distinguishes adaptations from source excerpts', () => {
    const { source, bank } = fixture();
    source.groups[0].examples[0].english = 'The team quickly reviews report 1.';
    expect(() => compileGrammarExamples(source, bank)).toThrow('quote does not match');
    source.groups[0].examples[0].kind = 'adapted';
    expect(compileGrammarExamples(source, bank).groups[0].examples[0].source.quote).toBe(
      'The team reviews report 1.',
    );
    source.groups[0].examples.pop();
    expect(() => compileGrammarExamples(source, bank)).toThrow('five examples');
  });

  it.runIf(existsSync('content/toeic-hacker-grammar-reviewed.json'))(
    'validates all private Hacker quotations and five examples for every authored rule',
    () => {
      const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
      const source = read('content/toeic-hacker-grammar-reviewed.json');
      const bank = {
        questions: read('public/data/toeic/hacker-questions.json').questions,
        solutions: read('public/data/toeic/hacker-solutions.json').solutions,
      };
      const compiled = compileGrammarExamples(source, bank);
      const expected = GRAMMAR_LESSONS.flatMap((lesson) =>
        lesson.rules.map((rule) => `${lesson.slug}/${rule.label}`),
      );
      expect(compiled.groups.map((group) => `${group.slug}/${group.ruleLabel}`)).toEqual(expected);
      expect(compiled.groups.flatMap((group) => group.examples)).toHaveLength(expected.length * 5);
    },
  );
});
