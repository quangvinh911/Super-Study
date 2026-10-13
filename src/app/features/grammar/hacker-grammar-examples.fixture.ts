import { GRAMMAR_LESSONS } from './grammar-lessons';

/** Synthetic examples for tests; production content is loaded from the private Hacker pack. */
export function hackerGrammarFixture() {
  return {
    schemaVersion: 2,
    rightsStatus: 'privateUserProvided',
    groups: GRAMMAR_LESSONS.flatMap((lesson) =>
      lesson.rules.map((rule, ruleIndex) => ({
        slug: lesson.slug,
        ruleLabel: rule.label,
        examples: Array.from({ length: 5 }, (_, index) => ({
          id: `${lesson.slug}-${ruleIndex}-${index}`,
          kind: index === 4 ? 'adapted' : 'excerpt',
          english: `The team reviews report ${index + 1}.`,
          highlight: 'reviews',
          explanation: 'Động từ theo sau chủ ngữ.',
          quiz: {
            instruction: 'Chọn động từ chia theo chủ ngữ.',
            prompt: `The team _____ report ${index + 1}.`,
            options: [
              { id: 'A', text: 'review' },
              { id: 'B', text: 'reviews' },
              { id: 'C', text: 'reviewing' },
              { id: 'D', text: 'to reviews' },
            ],
            correctOptionId: 'B',
          },
          source: {
            questionId: `hacker-3-test-01-q${101 + index}`,
            quote:
              index === 4
                ? 'The team reviewed the report.'
                : `The team reviews report ${index + 1}.`,
            test: 1,
            order: 101 + index,
            part: 'part-5',
            location: 'stem',
            completedFromAnswerKey: true,
            answerStatus: 'sourcePrinted',
          },
        })),
      })),
    ),
  };
}
