import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [authored, answers, generated, envelope] = await Promise.all([
  readJson('../content/toeic-hacker-items.json'),
  readJson('../content/toeic-hacker-answers.json'),
  readJson('../content/toeic-hacker-generated.json'),
  readJson('../public/data/toeic/questions.json'),
]);

describe('Hacker 3 Reading import', () => {
  it('preserves ten complete ordered Reading tests and both TOEIC sources', () => {
    expect(authored.issues).toEqual([]);
    expect(generated.questions).toHaveLength(1000);
    expect(generated.solutions).toHaveLength(1000);
    expect(envelope.questions).toHaveLength(1977);
    for (let test = 1; test <= 10; test += 1) {
      const formId = `hacker-3-test-${String(test).padStart(2, '0')}`;
      const form = generated.questions.filter((question) => question.formId === formId);
      expect(form.map((question) => question.order)).toEqual(
        Array.from({ length: 100 }, (_, index) => index + 101),
      );
      expect(form.filter((question) => question.classification.section === 'part-5')).toHaveLength(
        30,
      );
      expect(form.filter((question) => question.classification.section === 'part-6')).toHaveLength(
        16,
      );
      expect(form.filter((question) => question.classification.section === 'part-7')).toHaveLength(
        54,
      );
    }
  });

  it('joins printed keys by Test and question number', () => {
    const solutions = new Map(
      generated.solutions.map((solution) => [solution.questionId, solution]),
    );
    for (const question of generated.questions) {
      const test = Number(question.formId.slice(-2));
      expect(solutions.get(question.id).correctOptionIds).toEqual([
        answers.tests[String(test)][String(question.order)],
      ]);
      expect(question.options.map((option) => option.id)).toEqual(['A', 'B', 'C', 'D']);
      expect(question.shuffleOptions).toBe(false);
    }
  });

  it('keeps source images available for missing PDF blanks and shared passages', async () => {
    const stimuli = new Map();
    for (const question of generated.questions) {
      const test = Number(question.formId.slice(-2));
      const item = authored.tests[test - 1].items[String(question.order)];
      expect(question.sourceQuestionImage.page).toBe(item.page);
      if (item.needsImage) {
        expect(question.stem.some((block) => block.kind === 'image')).toBe(true);
      }
      if (question.order >= 131) {
        expect(question.stimulus.content.some((block) => block.kind === 'image')).toBe(true);
        const key = `${question.formId}:${question.stimulus.id}`;
        const serialized = JSON.stringify(question.stimulus.content);
        expect(stimuli.get(key) ?? serialized).toBe(serialized);
        stimuli.set(key, serialized);
      }
      const imagePaths = [
        question.sourceQuestionImage.src,
        ...question.stem.filter((block) => block.kind === 'image').map((block) => block.src),
        ...(question.stimulus?.content ?? [])
          .filter((block) => block.kind === 'image')
          .map((block) => block.src),
      ];
      for (const src of imagePaths) {
        const asset = new URL(`../public${src}`, import.meta.url);
        expect((await stat(asset)).size).toBeGreaterThan(0);
      }
    }
  });
});
