import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [source, authored, questionCrops, questionEnvelope, solutionEnvelope] = await Promise.all([
  readJson('../content/toeic-jimmy-source.json'),
  readJson('../content/toeic-jimmy-items.json'),
  readJson('../content/toeic-jimmy-question-crops.json'),
  readJson('../public/data/toeic/questions.json'),
  readJson('../public/data/toeic/solutions.json'),
]);
const questions = questionEnvelope.questions.filter((question) =>
  question.id.startsWith('jimmy-reading-'),
);
const solutions = new Map(
  solutionEnvelope.solutions
    .filter((solution) => solution.questionId.startsWith('jimmy-reading-'))
    .map((solution) => [solution.questionId, solution]),
);

describe('Jimmy Reading import', () => {
  it('contains only the 977 questions present in the supplied Reading PDF', () => {
    expect(questions).toHaveLength(977);
    expect(solutions.size).toBe(977);
    for (const test of source.tests) {
      const formId = `jimmy-reading-${String(test.test).padStart(2, '0')}`;
      const form = questions.filter((question) => question.formId === formId);
      const count = test.test === 10 ? 77 : 100;
      expect(form.map((question) => question.order)).toEqual(
        Array.from({ length: count }, (_, index) => index + 101),
      );
    }
  });

  it('maps each correct option to the printed Test/question answer row', () => {
    for (const question of questions) {
      const test = source.tests.find(
        (test) => question.formId === `jimmy-reading-${String(test.test).padStart(2, '0')}`,
      );
      const index = question.order - 101;
      const printedAnswer = test.answerRows[Math.floor(index / 10)][index % 10];
      expect(solutions.get(question.id).correctOptionIds).toEqual([printedAnswer]);
      expect(question.shuffleOptions).toBe(false);
    }
  });

  it('renders independent question/choice text instead of full question-page images', () => {
    for (const question of questions) {
      expect(question.stem).toEqual([
        { kind: 'paragraph', text: authored.items[question.id].stem },
      ]);
      expect(question.stem[0].text).not.toMatch(/Read question .*source image/);
      expect(question.options.map((option) => option.id)).toEqual(['A', 'B', 'C', 'D']);
      for (const option of question.options) {
        expect(option.content).toEqual([
          { kind: 'paragraph', text: authored.items[question.id].options[option.id] },
        ]);
        expect(option.content[0].text).not.toMatch(/printed choice|NEXT\s*PAGE|TopSage/iu);
        expect(option.content[0].text).not.toMatch(/^\./u);
      }
      expect(JSON.stringify(question)).not.toContain('toeic-jimmy-rc-');
      const crop = questionCrops[question.id];
      expect(question.sourceQuestionImage).toEqual({
        src: `/pdf-evidence/${question.id}.webp`,
        page: crop[0],
      });
      expect(crop[3] - crop[1]).toBeLessThan(1150);
      expect(crop[4] - crop[2]).toBeLessThan(600);
    }
  });

  it('preserves blanks and shared passages without attaching passages to Part 5', () => {
    for (const question of questions) {
      if (question.classification.section === 'part-5') {
        expect(question.stem[0].text.match(/_{4,}/g)).toHaveLength(1);
        expect(question.stem[0].text).not.toMatch(/-\s*_{4,}|_{4,}\s*-/u);
        expect(question.stimulus).toBeUndefined();
      } else {
        expect(question.stimulus.content).toEqual(authored.stimuli[question.stimulus.id]);
        if (question.classification.section === 'part-6') {
          const passage = question.stimulus.content.map((block) => block.text).join(' ');
          expect(passage).toContain(`____ (${question.order})`);
        }
      }
    }
  });

  it('preserves source wording at previously damaged OCR boundaries', () => {
    const item = (test, number) => authored.items[`jimmy-reading-${test}-q${number}`];
    expect(item('01', 101).options.A).toBe('If');
    expect(item('01', 109).stem).toBe(
      'Please accept our ________ apology for the inconvenience this delay is causing all the passengers here at Pearson International Airport.',
    );
    expect(item('01', 105).stem).toContain('strict ____ set');
    expect(item('02', 104).options.D).toBe('correctly');
    expect(item('05', 145).options.B).toBe('lift');
    expect(item('09', 170).options.D).toBe('agitated');
    expect(item('10', 177).options.D).toBe('The cost of insurance');
    expect(item('10', 112).options.D).toBe('Earlier');
    expect(item('10', 121).options.C).toBe('reflect');
    expect(item('10', 128).stem).toContain('my deputy ____ in my position');
  });
});
