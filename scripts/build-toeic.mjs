import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BANK_VERSION = 'toeic-sources-1.0.0';
const SCHEMA_VERSION = '1.0.0';
const PUBLISHED_AT = '2026-09-29';

function createBankArtifacts({ bankVersion, filePrefix, questions, solutions }) {
  const fileName = (name) => (filePrefix ? `${filePrefix}-${name}.json` : `${name}.json`);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    bankVersion,
    certificateId: 'toeic',
    publishedAt: PUBLISHED_AT,
    syllabusVersion: 'TOEIC Listening & Reading',
    language: 'en',
    questionCount: questions.length,
    solutionCount: solutions.length,
    blueprint: [],
    files: { questions: fileName('questions'), solutions: fileName('solutions') },
  };
  return {
    manifest,
    files: {
      [fileName('manifest')]: manifest,
      [fileName('questions')]: {
        schemaVersion: SCHEMA_VERSION,
        bankVersion,
        questions,
      },
      [fileName('solutions')]: {
        schemaVersion: SCHEMA_VERSION,
        bankVersion,
        solutions,
      },
    },
  };
}

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
  const combinedBank = createBankArtifacts({
    bankVersion: BANK_VERSION,
    filePrefix: '',
    questions,
    solutions,
  });
  const jimmyBank = createBankArtifacts({
    bankVersion: 'toeic-jimmy-reading-1.0.0',
    filePrefix: 'jimmy',
    questions: jimmy.questions,
    solutions: jimmy.solutions,
  });
  const hackerBank = createBankArtifacts({
    bankVersion: 'toeic-hacker-reading-1.0.0',
    filePrefix: 'hacker',
    questions: hacker.questions,
    solutions: hacker.solutions,
  });
  const artifacts = {
    ...combinedBank.files,
    ...jimmyBank.files,
    ...hackerBank.files,
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
  return combinedBank.manifest;
}
