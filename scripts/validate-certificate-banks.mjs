import { readFile, readdir, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import Ajv from 'ajv';
import { validateBankContent, validateBankManifest } from '../server/question-bank-validation.mjs';

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
      validateBankManifest(manifest, folder.name);
      const readEnvelope = async (name) =>
        JSON.parse(await readFile(join(directory, name), 'utf8'));
      const [questions, solutions] = await Promise.all([
        readEnvelope(manifest.files?.questions),
        readEnvelope(manifest.files?.solutions),
      ]);
      if (
        [questions, solutions].some(
          (envelope) =>
            envelope.bankVersion !== manifest.bankVersion ||
            envelope.schemaVersion !== manifest.schemaVersion,
        )
      )
        throw new Error(`${bankLabel}: mismatched bank versions`);
      const media = validateBankContent(
        { manifest, questions: questions.questions, solutions: solutions.solutions },
        folder.name,
        validate,
      );
      for (const path of media) {
        const asset = resolve(publicRoot, `.${path}`);
        if (!asset.startsWith(`${publicRoot}${sep}`))
          throw new Error(`${bankLabel}: invalid media path`);
        await access(asset).catch(() => {
          throw new Error(`${bankLabel}: missing media ${path}`);
        });
      }
    }
  }
}
