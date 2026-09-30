import { readFile, readdir, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import Ajv from 'ajv';

/** CTFL keeps its existing YAML compiler; additional banks share this contract. */
export async function validateCertificateBanks(rootDir) {
  const publicRoot = resolve(rootDir, 'public');
  const dataRoot = join(publicRoot, 'data');
  const schema = JSON.parse(
    await readFile(join(rootDir, 'content/schema/certificate-bank.schema.json'), 'utf8'),
  );
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
  const folders = (await readdir(dataRoot, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory(),
  );
  for (const folder of folders) {
    const directory = join(dataRoot, folder.name);
    const manifestFiles = (await readdir(directory))
      .filter((name) => name === 'manifest.json' || name.endsWith('-manifest.json'))
      .sort();
    for (const manifestFile of manifestFiles) {
      const bankLabel = `${folder.name}/${manifestFile}`;
      const manifest = JSON.parse(await readFile(join(directory, manifestFile), 'utf8'));
      if (manifest.certificateId !== folder.name)
        throw new Error(`${bankLabel}: certificateId must match the bank directory`);
      const readEnvelope = async (name) => {
        if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+\.json$/.test(name))
          throw new Error(`${bankLabel}: bank files must be local JSON filenames`);
        return JSON.parse(await readFile(join(directory, name), 'utf8'));
      };
      const [questions, solutions] = await Promise.all([
        readEnvelope(manifest.files?.questions),
        readEnvelope(manifest.files?.solutions),
      ]);
      if (
        typeof manifest.bankVersion !== 'string' ||
        [questions, solutions].some(
          (envelope) =>
            envelope.bankVersion !== manifest.bankVersion ||
            envelope.schemaVersion !== manifest.schemaVersion,
        )
      )
        throw new Error(`${bankLabel}: mismatched bank versions`);
      if (!validate({ questions: questions.questions, solutions: solutions.solutions }))
        throw new Error(`${bankLabel}: ${JSON.stringify(validate.errors)}`);
      if (
        manifest.questionCount !== questions.questions.length ||
        manifest.solutionCount !== solutions.solutions.length
      )
        throw new Error(`${bankLabel}: incorrect manifest counts`);
      const ids = new Set(questions.questions.map((question) => question.id));
      const answers = new Map(
        solutions.solutions.map((solution) => [solution.questionId, solution]),
      );
      if (
        ids.size !== questions.questions.length ||
        answers.size !== solutions.solutions.length ||
        ids.size !== answers.size ||
        [...answers.keys()].some((id) => !ids.has(id))
      )
        throw new Error(`${bankLabel}: duplicate or unmatched question/solution IDs`);
      const stimuli = new Map();
      const formOrders = new Set();
      for (const question of questions.questions) {
        if (question.certificateId !== manifest.certificateId)
          throw new Error(`${question.id}: wrong certificate`);
        const solution = answers.get(question.id);
        const options = new Set(question.options.map((option) => option.id));
        const required = question.interaction.requiredSelections;
        if (
          !solution ||
          options.size !== question.options.length ||
          solution.correctOptionIds.length !== required ||
          solution.correctOptionIds.some((id) => !options.has(id)) ||
          (question.interaction.kind === 'singleChoice' && required !== 1) ||
          (question.interaction.kind === 'multiSelect' && required < 2)
        )
          throw new Error(`${question.id}: invalid answer key or selection count`);
        if (
          question.provenance.rightsStatus === 'cleared' &&
          question.verification.answerStatus !== 'verified'
        )
          throw new Error(`${question.id}: public answers must be verified`);
        if (Boolean(question.formId) !== Boolean(question.order))
          throw new Error(`${question.id}: formId and order must be supplied together`);
        if (question.formId) {
          const key = `${question.formId}:${question.order}`;
          if (formOrders.has(key))
            throw new Error(`${question.id}: duplicate position within a form`);
          formOrders.add(key);
        }
        if (
          manifest.certificateId === 'toeic' &&
          (!/^part-[1-7]$/.test(question.classification.section) || question.shuffleOptions)
        )
          throw new Error(`${question.id}: TOEIC requires Part 1–7 and original option order`);
        if (question.stimulus) {
          const key = `${question.formId ?? 'practice'}:${question.stimulus.id}`;
          const value = JSON.stringify(question.stimulus.content);
          if (stimuli.has(key) && stimuli.get(key) !== value)
            throw new Error(`${question.id}: inconsistent shared stimulus`);
          stimuli.set(key, value);
        }
        const blocks = [
          ...question.stem,
          ...question.options.flatMap((option) => option.content),
          ...(question.stimulus?.content ?? []),
          ...solution.explanation,
          ...Object.values(solution.optionRationales ?? {}).flat(),
        ];
        if (question.sourceQuestionImage) {
          blocks.push({ kind: 'image', src: question.sourceQuestionImage.src });
        }
        for (const block of blocks) {
          if (block.kind !== 'audio' && block.kind !== 'image') continue;
          if (!block.src.startsWith('/') || block.src.startsWith('//'))
            throw new Error(`${question.id}: media must be a local public asset`);
          const asset = resolve(publicRoot, `.${block.src}`);
          if (!asset.startsWith(`${publicRoot}${sep}`))
            throw new Error(`${question.id}: invalid media path`);
          await access(asset).catch(() => {
            throw new Error(`${question.id}: missing media ${block.src}`);
          });
        }
      }
    }
  }
}
