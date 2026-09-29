import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCertificateBanks } from './validate-certificate-banks.mjs';

const temporaryRoots = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'certificate-bank-test-'));
  temporaryRoots.push(root);
  const directory = join(root, 'public/data/toeic');
  await mkdir(directory, { recursive: true });
  await mkdir(join(root, 'content/schema'), { recursive: true });
  await writeFile(
    join(root, 'content/schema/certificate-bank.schema.json'),
    await readFile(new URL('../content/schema/certificate-bank.schema.json', import.meta.url)),
  );
  const question = JSON.parse(
    await readFile(new URL('../public/data/questions.json', import.meta.url), 'utf8'),
  ).questions[0];
  const solution = JSON.parse(
    await readFile(new URL('../public/data/solutions.json', import.meta.url), 'utf8'),
  ).solutions.find((item) => item.questionId === question.id);
  question.certificateId = 'toeic';
  question.shuffleOptions = false;
  question.classification = { section: 'part-5', styleTags: [] };
  const manifest = {
    certificateId: 'toeic',
    schemaVersion: '1.0',
    bankVersion: 'test',
    questionCount: 1,
    solutionCount: 1,
    files: { questions: 'questions.json', solutions: 'solutions.json' },
  };
  const write = async () =>
    Promise.all([
      writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)),
      writeFile(
        join(directory, 'questions.json'),
        JSON.stringify({ schemaVersion: '1.0', bankVersion: 'test', questions: [question] }),
      ),
      writeFile(
        join(directory, 'solutions.json'),
        JSON.stringify({ schemaVersion: '1.0', bankVersion: 'test', solutions: [solution] }),
      ),
    ]);
  await write();
  return { root, question, solution, manifest, write };
}

describe('additional certificate bank validation', () => {
  it('accepts a practice-only TOEIC question without CTFL classification', async () => {
    const bank = await fixture();
    await expect(validateCertificateBanks(bank.root)).resolves.toBeUndefined();
  });
  it('rejects invalid answer keys and missing audio before publication', async () => {
    const bank = await fixture();
    const answers = bank.solution.correctOptionIds;
    bank.solution.correctOptionIds = ['U'];
    await bank.write();
    await expect(validateCertificateBanks(bank.root)).rejects.toThrow();
    bank.solution.correctOptionIds = answers;
    bank.question.stimulus = {
      id: 'audio-1',
      content: [{ kind: 'audio', src: '/audio/toeic/missing.mp3', label: 'Conversation' }],
    };
    await bank.write();
    await expect(validateCertificateBanks(bank.root)).rejects.toThrow(/missing media/);
  });
  it('requires a local question evidence image', async () => {
    const bank = await fixture();
    bank.question.sourceQuestionImage = { src: '/pdf-evidence/missing.webp', page: 4 };
    await bank.write();
    await expect(validateCertificateBanks(bank.root)).rejects.toThrow(/missing media/);
  });
});
