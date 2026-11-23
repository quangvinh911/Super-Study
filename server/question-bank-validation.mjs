import { createHash } from 'node:crypto';
import { record } from './errors.mjs';

export const BANK_ID = /^[a-z][a-z0-9-]{0,63}$/;
export const BANK_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
export const BANK_CHECKSUM = /^[a-f0-9]{64}$/;
export const BANK_UPLOAD_BYTES = 512 * 1024;
export const BANK_UPLOAD_ROWS = 100;
export const BANK_MEDIA_BATCH = 32;

export class QuestionBankValidationError extends Error {}

function check(condition, message) {
  if (!condition) throw new QuestionBankValidationError(message);
}

export function validateBankManifest(manifest, certificateId) {
  check(
    record(manifest) &&
      (manifest.certificateId === undefined ? 'ctfl' : manifest.certificateId) === certificateId &&
      typeof manifest.schemaVersion === 'string' &&
      /^1\.\d+(?:\.\d+)?$/.test(manifest.schemaVersion) &&
      typeof manifest.bankVersion === 'string' &&
      BANK_VERSION.test(manifest.bankVersion) &&
      Number.isSafeInteger(manifest.questionCount) &&
      manifest.questionCount >= 0 &&
      manifest.solutionCount === manifest.questionCount &&
      record(manifest.files) &&
      [manifest.files.questions, manifest.files.solutions].every(
        (name) => typeof name === 'string' && /^[a-zA-Z0-9_-]+\.json$/.test(name),
      ) &&
      manifest.files.questions !== manifest.files.solutions,
    'Invalid manifest, certificate, schema version, filenames, or counts.',
  );
}

export function isBankMediaPath(path) {
  return (
    typeof path === 'string' &&
    path.length <= 1024 &&
    /^\/(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.(?:webp|png|jpe?g|avif|gif|svg|mp3|wav|m4a|ogg)$/i.test(
      path,
    ) &&
    !path.split('/').some((segment) => segment === '.' || segment === '..')
  );
}

export function questionMediaPaths(question, solution) {
  const blocks = [
    ...question.stem,
    ...question.options.flatMap((option) => option.content),
    ...(question.stimulus?.content ?? []),
    ...solution.explanation,
    ...Object.values(solution.optionRationales ?? {}).flat(),
  ];
  const paths = blocks
    .filter((block) => block.kind === 'audio' || block.kind === 'image')
    .map((block) => block.src);
  if (question.sourceQuestionImage) paths.push(question.sourceQuestionImage.src);
  if (question.sourceEvidence) {
    paths.push(question.sourceEvidence.questionImage, question.sourceEvidence.answerImage);
  }
  return paths;
}

export function validateBankContent({ manifest, questions, solutions }, certificateId, validate) {
  validateBankManifest(manifest, certificateId);
  check(
    Array.isArray(questions) &&
      Array.isArray(solutions) &&
      questions.length === manifest.questionCount &&
      solutions.length === manifest.solutionCount,
    'Question and solution counts must match the manifest.',
  );
  // The two legacy CTFL envelopes omit certificateId. Validate that shape without
  // adding fields to the original question records stored in D1.
  const schemaQuestions =
    certificateId === 'ctfl'
      ? questions.map((question) =>
          record(question) && question.certificateId === undefined
            ? { ...question, certificateId }
            : question,
        )
      : questions;
  check(
    validate({ questions: schemaQuestions, solutions }),
    `Invalid question or solution schema: ${JSON.stringify(validate.errors?.slice(0, 4))}`,
  );

  const ids = new Set(questions.map((question) => question.id));
  const answers = new Map(solutions.map((solution) => [solution.questionId, solution]));
  check(
    ids.size === questions.length &&
      answers.size === solutions.length &&
      [...answers.keys()].every((id) => ids.has(id)),
    'Duplicate or unmatched question and solution IDs.',
  );
  const stimuli = new Map();
  const formOrders = new Set();
  const media = new Set();
  for (const question of questions) {
    check(
      (question.certificateId ?? 'ctfl') === certificateId,
      `${question.id}: wrong certificate`,
    );
    const solution = answers.get(question.id);
    const options = new Set(question.options.map((option) => option.id));
    const required = question.interaction.requiredSelections;
    check(
      solution &&
        options.size === question.options.length &&
        solution.correctOptionIds.length === required &&
        solution.correctOptionIds.every((id) => options.has(id)) &&
        Object.keys(solution.optionRationales ?? {}).every((id) => options.has(id)) &&
        (question.interaction.kind === 'singleChoice' ? required === 1 : required >= 2),
      `${question.id}: invalid answer key or selection count`,
    );
    check(
      question.provenance.rightsStatus !== 'cleared' ||
        question.verification.answerStatus === 'verified',
      `${question.id}: public answers must be verified`,
    );
    check(
      Boolean(question.formId) === Boolean(question.order),
      `${question.id}: formId and order must be supplied together`,
    );
    if (question.formId) {
      const key = JSON.stringify([question.formId, question.order]);
      check(!formOrders.has(key), `${question.id}: duplicate position within a form`);
      formOrders.add(key);
    }
    if (certificateId === 'toeic') {
      check(
        /^part-[1-7]$/.test(question.classification.section) && !question.shuffleOptions,
        `${question.id}: TOEIC requires Part 1–7 and original option order`,
      );
    }
    if (question.stimulus) {
      const key = JSON.stringify([question.formId, question.stimulus.id]);
      const content = JSON.stringify(question.stimulus.content);
      check(
        !stimuli.has(key) || stimuli.get(key) === content,
        `${question.id}: inconsistent shared stimulus`,
      );
      stimuli.set(key, content);
    }
    for (const path of questionMediaPaths(question, solution)) {
      check(isBankMediaPath(path), `${question.id}: invalid media path`);
      media.add(path);
    }
  }
  return media;
}

export function bankChecksum({ manifest, questions, solutions }) {
  return createHash('sha256')
    .update(JSON.stringify({ manifest, questions, solutions }))
    .digest('hex');
}
