import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function textFromBlocks(blocks = []) {
  return blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => block.text)
    .join(' ');
}

function normalize(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

function compilePractice(example) {
  const practice = example.practice;
  if (
    !practice ||
    typeof practice.instruction !== 'string' ||
    !practice.instruction.trim() ||
    typeof practice.blank !== 'string' ||
    !practice.blank.trim() ||
    !Array.isArray(practice.options) ||
    practice.options.length !== 4 ||
    practice.options.some(
      (option, index) =>
        !option ||
        option.id !== 'ABCD'[index] ||
        typeof option.text !== 'string' ||
        !option.text.trim(),
    ) ||
    new Set(practice.options.map((option) => normalize(option.text).toLowerCase())).size !== 4 ||
    practice.options.find((option) => option.id === practice.correctOptionId)?.text !==
      practice.blank
  ) {
    throw new Error(`${example.id}: invalid grammar practice options or answer.`);
  }
  const escaped = practice.blank.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [
    ...example.highlight.matchAll(new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z])`, 'g')),
  ];
  if (matches.length !== 1 || example.english.includes('_____')) {
    throw new Error(`${example.id}: grammar practice blank must target one highlighted phrase.`);
  }
  const start = example.english.indexOf(example.highlight) + matches[0].index;
  const prompt = `${example.english.slice(0, start)}_____${example.english.slice(start + practice.blank.length)}`;
  return {
    instruction: practice.instruction,
    prompt,
    options: practice.options,
    correctOptionId: practice.correctOptionId,
  };
}

export function compileGrammarExamples(source, bank) {
  if (
    source.schemaVersion !== 1 ||
    source.rightsStatus !== 'privateUserProvided' ||
    !Array.isArray(source.groups) ||
    !source.groups.length ||
    typeof source.reviewNote !== 'string'
  ) {
    throw new Error('Invalid Hacker grammar source.');
  }
  const questions = new Map(bank.questions.map((question) => [question.id, question]));
  const solutions = new Map(bank.solutions.map((solution) => [solution.questionId, solution]));
  const groupIds = new Set();
  const exampleIds = new Set();
  const groups = source.groups.map((group) => {
    const groupId = `${group.slug}/${group.ruleLabel}`;
    if (
      typeof group.slug !== 'string' ||
      !group.slug.trim() ||
      typeof group.ruleLabel !== 'string' ||
      !group.ruleLabel.trim() ||
      groupIds.has(groupId) ||
      !Array.isArray(group.examples) ||
      group.examples.length !== 5
    ) {
      throw new Error(`${groupId}: expected a unique rule with five examples.`);
    }
    groupIds.add(groupId);
    const sentences = new Set();
    const examples = group.examples.map((example) => {
      for (const field of ['id', 'english', 'highlight', 'explanation']) {
        if (typeof example[field] !== 'string' || !example[field].trim()) {
          throw new Error(`${groupId}: missing ${field}.`);
        }
      }
      if (
        exampleIds.has(example.id) ||
        sentences.has(normalize(example.english).toLowerCase()) ||
        !example.english.includes(example.highlight) ||
        !['excerpt', 'adapted'].includes(example.kind) ||
        typeof example.source?.quote !== 'string' ||
        !example.source.quote.trim()
      ) {
        throw new Error(`${example.id}: invalid or duplicate grammar example.`);
      }
      exampleIds.add(example.id);
      sentences.add(normalize(example.english).toLowerCase());
      const question = questions.get(example.source.questionId);
      const solution = solutions.get(example.source.questionId);
      if (
        !question ||
        question.certificateId !== 'toeic' ||
        !/^hacker-3-test-\d{2}-q\d{3}$/u.test(question.id) ||
        question.provenance.rightsStatus !== 'privateUserProvided' ||
        !solution
      ) {
        throw new Error(`${example.id}: missing Hacker source question or solution.`);
      }
      let sourceText;
      let completedFromAnswerKey = false;
      switch (example.source.location) {
        case 'stem': {
          sourceText = textFromBlocks(question.stem);
          if (question.classification.section === 'part-5') {
            if (solution.correctOptionIds.length !== 1 || !/_{2,}/u.test(sourceText)) {
              throw new Error(`${example.id}: invalid Part 5 blank or answer key.`);
            }
            const option = question.options.find(
              (option) => option.id === solution.correctOptionIds[0],
            );
            const answer = option && textFromBlocks(option.content);
            if (!answer) throw new Error(`${example.id}: answer option is missing.`);
            sourceText = sourceText.replace(/_{2,}/u, answer);
            completedFromAnswerKey = true;
          }
          break;
        }
        case 'stimulus':
          sourceText = textFromBlocks(question.stimulus?.content);
          break;
        case 'transcript':
          // Listening transcripts are solution-only content in the existing bank.
          if (!/^part-[1-4]$/u.test(question.classification.section)) {
            throw new Error(`${example.id}: transcript reference is not Listening.`);
          }
          sourceText = textFromBlocks(solution.explanation);
          break;
        default:
          throw new Error(`${example.id}: invalid source location.`);
      }
      if (
        !normalize(sourceText).includes(normalize(example.source.quote)) ||
        (example.kind === 'excerpt' && example.english !== example.source.quote) ||
        (example.kind === 'adapted' && example.english === example.source.quote)
      ) {
        throw new Error(`${example.id}: quote does not match the Hacker source.`);
      }
      return {
        id: example.id,
        kind: example.kind,
        english: example.english,
        highlight: example.highlight,
        explanation: example.explanation,
        quiz: compilePractice(example),
        source: {
          ...example.source,
          test: Number(question.formId.slice(-2)),
          order: question.order,
          part: question.classification.section,
          completedFromAnswerKey,
          answerStatus: question.verification.answerStatus,
        },
      };
    });
    return { slug: group.slug, ruleLabel: group.ruleLabel, examples };
  });
  // The exercises are authored from reviewed sentences; they do not change the bank's printed keys.
  return { ...source, schemaVersion: 2, groups };
}

export async function buildToeicGrammar(rootDir, { write = true } = {}) {
  let source;
  try {
    source = JSON.parse(
      await readFile(join(rootDir, 'content/toeic-hacker-grammar-reviewed.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const [questions, solutions] = await Promise.all(
    ['hacker-questions.json', 'hacker-solutions.json'].map(async (file) =>
      JSON.parse(await readFile(join(rootDir, 'public/data/toeic', file), 'utf8')),
    ),
  );
  const data = compileGrammarExamples(source, {
    questions: questions.questions,
    solutions: solutions.solutions,
  });
  const outputDir = join(rootDir, 'public/data/toeic/grammar');
  const outputPath = join(outputDir, 'hacker-3.json');
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  if (write) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, serialized, 'utf8');
  } else if ((await readFile(outputPath, 'utf8')) !== serialized) {
    throw new Error('Hacker grammar output is stale; run content:build.');
  }
}
