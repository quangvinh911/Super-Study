import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BANK_VERSION = 'toeic-sources-1.0.0';
const SCHEMA_VERSION = '1.0.0';

export async function buildToeic(rootDir, { write = true } = {}) {
  const content = join(rootDir, 'content');
  const output = join(rootDir, 'public', 'data', 'toeic');
  const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
  const [jimmy, hacker] = await Promise.all([
    readJson(join(content, 'toeic-jimmy-generated.json')),
    readJson(join(content, 'toeic-hacker-generated.json')),
  ]);
  const questions = [...jimmy.questions, ...hacker.questions];
  const solutions = [...jimmy.solutions, ...hacker.solutions];
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    bankVersion: BANK_VERSION,
    certificateId: 'toeic',
    publishedAt: '2026-09-29',
    syllabusVersion: 'TOEIC Listening & Reading',
    language: 'en',
    questionCount: questions.length,
    solutionCount: solutions.length,
    blueprint: [],
    files: { questions: 'questions.json', solutions: 'solutions.json' },
  };
  const artifacts = {
    'manifest.json': manifest,
    'questions.json': { schemaVersion: SCHEMA_VERSION, bankVersion: BANK_VERSION, questions },
    'solutions.json': { schemaVersion: SCHEMA_VERSION, bankVersion: BANK_VERSION, solutions },
  };
  for (const [name, value] of Object.entries(artifacts)) {
    const path = join(output, name);
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    if (write) {
      await writeFile(path, serialized, 'utf8');
    } else if ((await readFile(path, 'utf8')) !== serialized) {
      throw new Error(`${name} is stale; run pnpm run content:build`);
    }
  }
  return manifest;
}
