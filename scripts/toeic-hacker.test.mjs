import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [authored, answers, generated, listeningSource, listening, manifest, envelope] =
  await Promise.all([
    readJson('../content/toeic-hacker-items.json'),
    readJson('../content/toeic-hacker-answers.json'),
    readJson('../content/toeic-hacker-generated.json'),
    readJson('../content/toeic-hacker-lc-source.json'),
    readJson('../content/toeic-hacker-lc-generated.json'),
    readJson('../public/data/toeic/hacker-manifest.json'),
    readJson('../public/data/toeic/hacker-questions.json'),
  ]);

describe('Hacker 3 Reading import', () => {
  it('preserves ten complete ordered Reading tests in its own selectable bank', () => {
    expect(authored.issues).toEqual([]);
    expect(generated.questions).toHaveLength(1000);
    expect(generated.solutions).toHaveLength(1000);
    expect(manifest).toMatchObject({
      certificateId: 'toeic',
      questionCount: 1980,
      solutionCount: 1980,
      files: {
        questions: 'hacker-questions.json',
        solutions: 'hacker-solutions.json',
      },
    });
    expect(envelope.questions).toHaveLength(1980);
    expect(envelope.questions.every((question) => question.id.startsWith('hacker-3-test-'))).toBe(
      true,
    );
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
      const part5 = form.filter((question) => question.classification.section === 'part-5');
      expect(part5.every((question) => question.revision === 2)).toBe(true);
      expect(
        part5.every(
          (question) =>
            question.stem.length === 1 &&
            question.stem[0].kind === 'paragraph' &&
            question.stem[0].text.match(/______/gu)?.length === 1,
        ),
      ).toBe(true);
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

  it('keeps recovered Part 5 blanks in the searchable question text', () => {
    const question = generated.questions.find((item) => item.id === 'hacker-3-test-07-q122');
    expect(question?.stem).toEqual([
      {
        kind: 'paragraph',
        text: 'Once the vendor ______ his payment, Smith & Cooper Wholesalers will ship his order out.',
      },
    ]);
  });

  it('keeps source images available for review and shared passages', async () => {
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

describe('Hacker 3 Listening import', () => {
  it('combines 980 Listening questions with unchanged Reading forms', () => {
    expect(listening.questions).toHaveLength(980);
    expect(listening.solutions).toHaveLength(980);
    const originalReading = new Map(generated.questions.map((question) => [question.id, question]));
    for (const question of envelope.questions.filter((item) => item.order >= 101)) {
      expect(question).toEqual(originalReading.get(question.id));
    }
    for (let test = 1; test <= 10; test += 1) {
      const formId = `hacker-3-test-${String(test).padStart(2, '0')}`;
      const form = envelope.questions.filter((question) => question.formId === formId);
      const missing =
        test === 4 ? new Set([1, 2, ...Array.from({ length: 18 }, (_, i) => i + 65)]) : new Set();
      expect(form.map((question) => question.order)).toEqual(
        Array.from({ length: 200 }, (_, i) => i + 1).filter((number) => !missing.has(number)),
      );
      expect(form).toHaveLength(test === 4 ? 180 : 200);
      expect(
        [1, 2, 3, 4, 5, 6, 7].map(
          (part) =>
            form.filter((question) => question.classification.section === `part-${part}`).length,
        ),
      ).toEqual(test === 4 ? [4, 25, 33, 18, 30, 16, 54] : [6, 25, 39, 30, 30, 16, 54]);
    }
  });

  it('joins printed Listening keys and keeps transcript out of question blocks', () => {
    const solutions = new Map(
      listening.solutions.map((solution) => [solution.questionId, solution]),
    );
    for (const question of listening.questions) {
      const test = Number(question.formId.slice(-2));
      const number = question.order;
      const answer = listeningSource.tests[test - 1].answers[String(number)];
      expect(solutions.get(question.id).correctOptionIds).toEqual([answer]);
      expect(question.options.map((option) => option.id)).toEqual(
        number >= 7 && number <= 31 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'],
      );
      expect(question.verification.answerStatus).toBe('sourcePrinted');
      expect(question.provenance.rightsStatus).toBe('privateUserProvided');
      const explanation = solutions.get(question.id).explanation;
      expect(explanation[0]).toEqual({ kind: 'heading', level: 4, text: 'Transcript' });
      expect(explanation.at(-1).text).toContain(`marks ${answer}`);
      const transcriptLines = explanation.slice(1, -1).map((block) => block.text);
      expect(JSON.stringify(question)).not.toContain(transcriptLines[0].slice(0, 30));
      if (number <= 31) {
        const choices = transcriptLines.slice(number <= 6 ? 0 : 1);
        expect(choices.map((line) => line.slice(0, 3))).toEqual(
          number <= 6 ? ['(A)', '(B)', '(C)', '(D)'] : ['(A)', '(B)', '(C)'],
        );
      }
      expect(question.stem.some((block) => block.kind === 'image')).toBe(number <= 6);
      if (number <= 6) {
        expect(question.stem.find((block) => block.kind === 'image').alt.length).toBeGreaterThan(
          18,
        );
      }
      if (number >= 32) {
        expect(question.stimulus.content[0].kind).toBe('audio');
        const first =
          number <= 70
            ? 32 + 3 * Math.floor((number - 32) / 3)
            : 71 + 3 * Math.floor((number - 71) / 3);
        expect(question.stimulus.id).toBe(
          `${question.formId}-${String(first).padStart(3, '0')}-${String(first + 2).padStart(3, '0')}`,
        );
        for (const block of question.stimulus.content.filter(
          (content) => content.kind === 'image',
        )) {
          expect(block.alt.length).toBeGreaterThan(35);
        }
      }
    }
    expect(
      listening.questions.filter((question) =>
        question.stimulus?.content.some((block) => block.kind === 'image'),
      ),
    ).toHaveLength(144);
  });
});
