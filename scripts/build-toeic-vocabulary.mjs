import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function textFromBlocks(blocks = []) {
  return blocks
    .flatMap((block) => {
      if (typeof block.text === 'string') return [block.text];
      if (Array.isArray(block.items)) return block.items.filter((item) => typeof item === 'string');
      if (Array.isArray(block.rows))
        return block.rows.flat().filter((cell) => typeof cell === 'string');
      return [];
    })
    .join(' ');
}

export function compileVocabulary(source, pack) {
  if (
    source.id !== 'hacker-3' ||
    source.rightsStatus !== 'privateUserProvided' ||
    !Array.isArray(source.entries)
  ) {
    throw new Error('Invalid Hacker 3 vocabulary source.');
  }
  const ids = new Set();
  const solutions = new Map(pack.solutions.map((solution) => [solution.questionId, solution]));
  const questions = pack.questions.map((question) => ({
    question,
    // Match learner text and transcripts, never provenance, labels or image descriptions.
    text: [
      textFromBlocks(question.stem),
      ...question.options.map((option) => textFromBlocks(option.content)),
      textFromBlocks(question.stimulus?.content),
      textFromBlocks(solutions.get(question.id)?.explanation),
    ]
      .join(' ')
      .normalize('NFKC')
      .toLowerCase(),
  }));
  const entries = source.entries.map((entry) => {
    if (ids.has(entry.id) || !/^hacker-3-/.test(entry.id))
      throw new Error(`Duplicate or invalid vocabulary ID: ${entry.id}`);
    ids.add(entry.id);
    for (const field of ['term', 'meaning', 'topic', 'usage']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim())
        throw new Error(`${entry.id}: missing ${field}`);
    }
    if (!['word', 'phrase', 'idiom'].includes(entry.kind) || !entry.sources?.length)
      throw new Error(`${entry.id}: invalid category or source`);
    for (const reference of entry.sources) {
      if (
        !source.sources.some((file) => file.file === reference.file) ||
        !reference.pdfPages?.length ||
        reference.pdfPages.some((page) => !Number.isInteger(page) || page < 1)
      )
        throw new Error(`${entry.id}: invalid PDF reference`);
    }
    const escapedTerm = entry.term
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![a-z])${escapedTerm}(?![a-z])`, 'u');
    const matches = questions
      .filter(({ text }) => pattern.test(text))
      .map(({ question }) => ({
        questionId: question.id,
        test: Number(question.formId.slice(-2)),
        order: question.order,
        part: question.classification.section,
      }));
    return { ...entry, occurrences: matches };
  });
  return { ...source, entries };
}

export async function buildToeicVocabulary(rootDir, { write = true } = {}) {
  const sourcePath = join(rootDir, 'content/toeic-hacker-vocabulary-reviewed.json');
  let source;
  try {
    source = JSON.parse(await readFile(sourcePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const file of source.sources) {
    const bytes = await readFile(join(rootDir, 'resources/toeic/hacker3/notes', file.file));
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256)
      throw new Error(`Vocabulary source changed: ${file.file}`);
  }
  const [questions, solutions] = await Promise.all(
    ['hacker-questions.json', 'hacker-solutions.json'].map(async (name) =>
      JSON.parse(await readFile(join(rootDir, 'public/data/toeic', name), 'utf8')),
    ),
  );
  const data = compileVocabulary(source, {
    questions: questions.questions,
    solutions: solutions.solutions,
  });
  if (
    data.entries.length !== 300 ||
    data.entries.filter((entry) => entry.kind !== 'word').length !== 120
  ) {
    throw new Error('Expected 180 selected words and 120 expressions.');
  }
  const outputDir = join(rootDir, 'public/data/toeic/vocabulary');
  const outputPath = join(outputDir, 'hacker-3.json');
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  if (write) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, serialized, 'utf8');
  } else if ((await readFile(outputPath, 'utf8')) !== serialized)
    throw new Error('Vocabulary output is stale; run content:build.');
}
