import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { findCertificate } from '../src/app/certificates/registry';
import { generateExam } from '../src/app/core/domain/exam-generator';

const readJson = async (name) =>
  JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), 'utf8'));
let pack;
try {
  pack = await readJson('content/toeic-hacker2-generated.json');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

describe.skipIf(!pack)('private Hacker 2 import', () => {
  it('retains printed keys, stable source IDs and the actual per-test inventory', async () => {
    const [authored, keys, manifest, envelope] = await Promise.all([
      readJson('content/toeic-hacker2-items.json'),
      readJson('content/toeic-hacker2-answers.json'),
      readJson('public/data/toeic/hacker2-manifest.json'),
      readJson('public/data/toeic/hacker2-questions.json'),
    ]);
    expect(authored.issues).toEqual([]);
    expect(keys.issues).toEqual([]);
    expect(pack.questions).toHaveLength(1728);
    expect(pack.solutions).toHaveLength(1728);
    expect(envelope.questions).toEqual(pack.questions);
    expect(manifest.questionCount).toBe(1728);
    const solutions = new Map(pack.solutions.map((solution) => [solution.questionId, solution]));
    expect(solutions.size).toBe(1728);
    for (let test = 1; test <= 10; test += 1) {
      const form = pack.questions.filter(
        (question) => question.formId === `hacker-2-test-${String(test).padStart(2, '0')}`,
      );
      const listening = authored.listening[test - 1];
      const orders = [
        ...Object.keys(listening.items).map(Number),
        ...Array.from({ length: 100 }, (_, index) => index + 101),
      ].sort((a, b) => a - b);
      expect(form.map((question) => question.order)).toEqual(orders);
      for (const question of form) {
        const number = question.order;
        const answer = number <= 100 ? listening.answers[number] : keys.tests[test][number];
        expect(question.id).toBe(`${question.formId}-q${String(number).padStart(3, '0')}`);
        expect(question.shuffleOptions).toBe(false);
        expect(solutions.get(question.id).correctOptionIds).toEqual([answer]);
        expect(question.verification.answerStatus).toBe('sourcePrinted');
        expect(question.provenance.rightsStatus).toBe('privateUserProvided');
        if (number >= 101 && number <= 130) {
          expect(question.stem[0].text.match(/______/gu)).toHaveLength(1);
        }
      }
    }
  });

  it('only generates mocks for the seven complete 200-question forms', () => {
    const policy = findCertificate('toeic').exam;
    for (let test = 1; test <= 10; test += 1) {
      const formId = `hacker-2-test-${String(test).padStart(2, '0')}`;
      const questions = pack.questions.filter((question) => question.formId === formId);
      const ids = new Set(questions.map((question) => question.id));
      const solutions = pack.solutions.filter((solution) => ids.has(solution.questionId));
      const generate = () => generateExam(questions, solutions, policy, 'hacker2-audit');
      if ([3, 7, 8].includes(test)) {
        expect(generate).toThrow();
      } else {
        expect(generate().map((entry) => entry.question.order)).toEqual(
          Array.from({ length: 200 }, (_, index) => index + 1),
        );
      }
    }
  });

  it('keeps spoken choices and transcripts behind the solution boundary', () => {
    for (const question of pack.questions.filter((question) => question.order <= 31)) {
      const letters = question.order <= 6 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C'];
      expect(question.options.map((option) => option.content[0].text)).toEqual(letters);
      expect(question.stem.some((block) => block.kind === 'audio')).toBe(true);
      if (question.order <= 6) {
        expect(question.stem[0].alt).toMatch(/^Photograph for Hacker 2 Test \d+, question \d+$/u);
      }
    }
    const groups = new Map();
    for (const question of pack.questions) {
      if (!question.stimulus) continue;
      const key = `${question.formId}:${question.stimulus.id}`;
      if (groups.has(key)) expect(question.stimulus.content).toEqual(groups.get(key));
      groups.set(key, question.stimulus.content);
    }
  });
});
