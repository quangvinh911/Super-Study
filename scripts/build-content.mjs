import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import { parse as parseYaml } from 'yaml';
import { validateCertificateBanks } from './validate-certificate-banks.mjs';
import { buildToeic } from './build-toeic.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');

export const OFFICIAL_EXAM_MATRIX = Object.freeze([
  { chapter: 1, kLevel: 'K1', count: 2 },
  { chapter: 1, kLevel: 'K2', count: 6 },
  { chapter: 1, kLevel: 'K3', count: 0 },
  { chapter: 2, kLevel: 'K1', count: 2 },
  { chapter: 2, kLevel: 'K2', count: 4 },
  { chapter: 2, kLevel: 'K3', count: 0 },
  { chapter: 3, kLevel: 'K1', count: 2 },
  { chapter: 3, kLevel: 'K2', count: 2 },
  { chapter: 3, kLevel: 'K3', count: 0 },
  { chapter: 4, kLevel: 'K1', count: 0 },
  { chapter: 4, kLevel: 'K2', count: 6 },
  { chapter: 4, kLevel: 'K3', count: 5 },
  { chapter: 5, kLevel: 'K1', count: 1 },
  { chapter: 5, kLevel: 'K2', count: 5 },
  { chapter: 5, kLevel: 'K3', count: 3 },
  { chapter: 6, kLevel: 'K1', count: 1 },
  { chapter: 6, kLevel: 'K2', count: 1 },
  { chapter: 6, kLevel: 'K3', count: 0 },
]);

export class ContentValidationError extends Error {
  constructor(problems) {
    super(`Content validation failed:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'ContentValidationError';
    this.problems = problems;
  }
}

function canonical(value) {
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function validateBankMetadata(bank, problems) {
  if (!bank || typeof bank !== 'object') {
    problems.push('content/bank.yaml must contain an object');
    return;
  }
  for (const key of [
    'schemaVersion',
    'bankVersion',
    'publishedAt',
    'title',
    'language',
    'syllabus',
    'license',
    'expectedQuestionCount',
    'questionsPerExam',
    'passScore',
    'durationsMinutes',
    'blueprint',
  ]) {
    if (bank[key] === undefined || bank[key] === null || bank[key] === '') {
      problems.push(`bank metadata is missing ${key}`);
    }
  }
  if (bank?.language !== 'en') problems.push('bank language must be en');
  if (bank?.syllabus?.version !== '4.0.1') problems.push('syllabus version must be 4.0.1');
  if (bank?.questionsPerExam !== 40) problems.push('questionsPerExam must be 40');
  if (bank?.passScore !== 26) problems.push('passScore must be 26');
  if (bank?.expectedQuestionCount !== 80) problems.push('expectedQuestionCount must be 80');
  if (canonical(bank?.durationsMinutes) !== canonical([60, 75])) {
    problems.push('durationsMinutes must contain 60 and 75');
  }

  const blueprint = Array.isArray(bank?.blueprint) ? bank.blueprint : [];
  if (blueprint.length !== 40) problems.push(`blueprint must define 40 slots, found ${blueprint.length}`);
  const seen = new Set();
  for (const slot of blueprint) {
    if (!slot || typeof slot !== 'object') {
      problems.push('blueprint contains a non-object slot');
      continue;
    }
    if (seen.has(slot.bucket)) problems.push(`duplicate blueprint bucket ${slot.bucket}`);
    seen.add(slot.bucket);
    if (slot.variantsRequired !== 2) {
      problems.push(`blueprint bucket ${slot.bucket} must require exactly 2 variants`);
    }
    const expectedPrefix = `C${slot.chapter}-${slot.kLevel}-`;
    if (typeof slot.bucket !== 'string' || !slot.bucket.startsWith(expectedPrefix)) {
      problems.push(`blueprint bucket ${slot.bucket} does not match chapter/K-level`);
    }
  }

  for (const expected of OFFICIAL_EXAM_MATRIX) {
    const count = blueprint.filter(
      (slot) => slot.chapter === expected.chapter && slot.kLevel === expected.kLevel,
    ).length;
    if (count !== expected.count) {
      problems.push(
        `blueprint chapter ${expected.chapter} ${expected.kLevel} requires ${expected.count} slots, found ${count}`,
      );
    }
  }
}

function validateAudit(audit, problems) {
  if (!audit || typeof audit !== 'object') {
    problems.push('content/source-audit.json must contain metadata');
    return;
  }
  if (audit.containsExtractedText !== false) {
    problems.push('source audit must explicitly declare containsExtractedText=false');
  }
  if (audit.purpose !== 'research-only') problems.push('source audit purpose must be research-only');
  if (typeof audit.publicationPolicy !== 'string' || audit.publicationPolicy.length < 20) {
    problems.push('source audit requires a publication policy');
  }
}

function semanticValidation(bank, chapters, problems) {
  const questions = chapters.flatMap((chapter) => chapter.questions);
  const questionIds = new Set();
  const slots = new Map(bank.blueprint.map((slot) => [slot.bucket, slot]));
  const bucketQuestions = new Map(bank.blueprint.map((slot) => [slot.bucket, []]));
  const chapterNumbers = new Set();

  for (const chapterDocument of chapters) {
    if (chapterNumbers.has(chapterDocument.chapter)) {
      problems.push(`chapter ${chapterDocument.chapter} is defined more than once`);
    }
    chapterNumbers.add(chapterDocument.chapter);

    for (const question of chapterDocument.questions) {
      const label = question.id ?? '<missing-id>';
      if (questionIds.has(question.id)) problems.push(`duplicate question id ${label}`);
      questionIds.add(question.id);

      if (question.classification.chapter !== chapterDocument.chapter) {
        problems.push(`${label} chapter does not match its authoring file`);
      }

      const slot = slots.get(question.classification.blueprintBucket);
      if (!slot) {
        problems.push(`${label} uses unknown blueprint bucket ${question.classification.blueprintBucket}`);
      } else {
        bucketQuestions.get(slot.bucket).push(question);
        if (
          slot.chapter !== question.classification.chapter ||
          slot.kLevel !== question.classification.kLevel
        ) {
          problems.push(`${label} classification does not match blueprint bucket ${slot.bucket}`);
        }
      }

      const expectedId = `CTFL-${question.classification.blueprintBucket}-${question.variant}`;
      if (question.id !== expectedId) problems.push(`${label} must use stable id ${expectedId}`);

      const optionIds = new Set();
      const optionContents = new Set();
      for (const option of question.options) {
        if (optionIds.has(option.id)) problems.push(`${label} has duplicate option id ${option.id}`);
        optionIds.add(option.id);
        const contentKey = canonical(option.content);
        if (optionContents.has(contentKey)) problems.push(`${label} has duplicate option content`);
        optionContents.add(contentKey);
      }

      const answers = question.solution.correctOptionIds;
      if (answers.includes('U')) problems.push(`${label} contains invalid answer id U`);
      for (const answer of answers) {
        if (!optionIds.has(answer)) problems.push(`${label} answer ${answer} does not identify an option`);
      }
      if (answers.length !== question.interaction.requiredSelections) {
        problems.push(`${label} answer count does not equal requiredSelections`);
      }
      if (question.interaction.kind === 'singleChoice') {
        if (question.interaction.requiredSelections !== 1 || question.options.length !== 4) {
          problems.push(`${label} singleChoice requires one selection and four options`);
        }
      } else if (question.interaction.requiredSelections < 2 || question.options.length !== 5) {
        problems.push(`${label} multiSelect requires at least two selections and five options`);
      }

      if (
        !question.solution.references.some(
          (reference) => reference.locator === question.classification.learningObjective,
        )
      ) {
        problems.push(`${label} lacks evidence for ${question.classification.learningObjective}`);
      }
    }
  }

  for (let chapter = 1; chapter <= 6; chapter += 1) {
    if (!chapterNumbers.has(chapter)) problems.push(`chapter ${chapter} authoring file is missing`);
  }
  if (questions.length !== bank.expectedQuestionCount) {
    problems.push(`bank requires ${bank.expectedQuestionCount} questions, found ${questions.length}`);
  }
  for (const slot of bank.blueprint) {
    const candidates = bucketQuestions.get(slot.bucket) ?? [];
    if (candidates.length !== slot.variantsRequired) {
      problems.push(
        `blueprint bucket ${slot.bucket} requires ${slot.variantsRequired} candidates, found ${candidates.length}`,
      );
    }
    const variants = candidates.map((question) => question.variant).sort().join('');
    if (variants !== 'AB') problems.push(`blueprint bucket ${slot.bucket} must contain variants A and B`);
  }
}

export function compileFromDocuments({ bank, chapters, audit, validateChapter }) {
  const problems = [];
  validateBankMetadata(bank, problems);
  validateAudit(audit, problems);

  for (const chapter of chapters) {
    if (!validateChapter(chapter)) {
      for (const error of validateChapter.errors ?? []) {
        problems.push(
          `chapter ${chapter?.chapter ?? '?'}${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
        );
      }
    }
  }

  if (problems.length === 0) semanticValidation(bank, chapters, problems);
  if (problems.length > 0) throw new ContentValidationError(problems);

  const authored = chapters
    .flatMap((chapter) => chapter.questions)
    .sort((left, right) => left.id.localeCompare(right.id));
  const questions = authored.map(({ solution: _solution, ...question }) => question);
  const solutions = authored.map((question) => ({
    questionId: question.id,
    ...question.solution,
  }));

  const questionEnvelope = {
    schemaVersion: bank.schemaVersion,
    bankVersion: bank.bankVersion,
    questions,
  };
  const solutionEnvelope = {
    schemaVersion: bank.schemaVersion,
    bankVersion: bank.bankVersion,
    solutions,
  };
  const questionJson = `${JSON.stringify(questionEnvelope, null, 2)}\n`;
  const solutionJson = `${JSON.stringify(solutionEnvelope, null, 2)}\n`;

  const byChapter = {};
  const byKLevel = {};
  const byInteraction = {};
  for (const question of questions) {
    increment(byChapter, String(question.classification.chapter));
    increment(byKLevel, question.classification.kLevel);
    increment(byInteraction, question.interaction.kind);
  }

  const manifest = {
    schemaVersion: bank.schemaVersion,
    bankVersion: bank.bankVersion,
    publishedAt: bank.publishedAt,
    title: bank.title,
    language: bank.language,
    syllabusVersion: bank.syllabus.version,
    questionCount: questions.length,
    solutionCount: solutions.length,
    blueprint: OFFICIAL_EXAM_MATRIX,
    syllabus: bank.syllabus,
    license: bank.license,
    exam: {
      questionCount: bank.questionsPerExam,
      passScore: bank.passScore,
      durationsMinutes: bank.durationsMinutes,
      blueprint: OFFICIAL_EXAM_MATRIX,
    },
    inventory: {
      totalQuestions: questions.length,
      totalBlueprintBuckets: bank.blueprint.length,
      variantsPerBucket: 2,
      byChapter,
      byKLevel,
      byInteraction,
      buckets: bank.blueprint.map((slot) => ({
        ...slot,
        questionIds: questions
          .filter((question) => question.classification.blueprintBucket === slot.bucket)
          .map((question) => question.id),
      })),
    },
    files: {
      questions: 'questions.json',
      solutions: 'solutions.json',
    },
    integrity: {
      questionsSha256: sha256(questionJson),
      solutionsSha256: sha256(solutionJson),
    },
    sourceAudit: audit,
  };

  return {
    manifest,
    questionEnvelope,
    solutionEnvelope,
    serialized: {
      manifest: `${JSON.stringify(manifest, null, 2)}\n`,
      questions: questionJson,
      solutions: solutionJson,
    },
  };
}

export async function loadAuthoringDocuments(rootDir = DEFAULT_ROOT) {
  const contentDir = join(rootDir, 'content');
  const [bankText, auditText, schemaText, entries] = await Promise.all([
    readFile(join(contentDir, 'bank.yaml'), 'utf8'),
    readFile(join(contentDir, 'source-audit.json'), 'utf8'),
    readFile(join(contentDir, 'schema', 'question-bank.schema.json'), 'utf8'),
    readdir(contentDir),
  ]);
  const chapterFiles = entries
    .filter((entry) => /^chapter-[1-6]\.yaml$/.test(entry))
    .sort((left, right) => left.localeCompare(right));
  const chapterTexts = await Promise.all(
    chapterFiles.map((entry) => readFile(join(contentDir, entry), 'utf8')),
  );
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validateChapter = ajv.compile(JSON.parse(schemaText));
  return {
    bank: parseYaml(bankText),
    audit: JSON.parse(auditText),
    chapters: chapterTexts.map((text) => parseYaml(text)),
    validateChapter,
  };
}

async function atomicWrite(path, contents) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, path);
}

export async function buildContent({ rootDir = DEFAULT_ROOT, write = true } = {}) {
  await buildToeic(rootDir, { write });
  await validateCertificateBanks(rootDir);
  const documents = await loadAuthoringDocuments(rootDir);
  const artifacts = compileFromDocuments(documents);
  if (write) {
    const outputDir = join(rootDir, 'public', 'data');
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      atomicWrite(join(outputDir, 'manifest.json'), artifacts.serialized.manifest),
      atomicWrite(join(outputDir, 'questions.json'), artifacts.serialized.questions),
      atomicWrite(join(outputDir, 'solutions.json'), artifacts.serialized.solutions),
    ]);
  }
  return artifacts;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const checkOnly = process.argv.includes('--check');
  try {
    const artifacts = await buildContent({ write: !checkOnly });
    const action = checkOnly ? 'Validated' : 'Built';
    process.stdout.write(
      `${action} ${artifacts.manifest.inventory.totalQuestions} questions across ` +
        `${artifacts.manifest.inventory.totalBlueprintBuckets} blueprint buckets ` +
        `(bank ${artifacts.manifest.bankVersion}).\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
