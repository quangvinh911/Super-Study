import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { operatorInput } from './account-operator-input.mjs';
import validateSchema from './question-bank-schema.mjs';
import {
  BANK_ID,
  BANK_MEDIA_BATCH,
  BANK_UPLOAD_BYTES,
  BANK_UPLOAD_ROWS,
  BANK_VERSION,
  bankChecksum,
  questionMediaPaths,
  validateBankContent,
  validateBankManifest,
} from '../server/question-bank-validation.mjs';

const defaultBanks = [
  ['ctfl', 'original', 'public/data/manifest.json'],
  ['ctfl', 'pdf', 'public/data/pdf-manifest.json'],
  ['toeic', 'jimmy', 'public/data/toeic/jimmy-manifest.json'],
  ['toeic', 'hacker', 'public/data/toeic/hacker-manifest.json'],
  ['toeic', 'hacker2', 'public/data/toeic/hacker2-manifest.json'],
];

async function runBatches(batches, operation) {
  for (let start = 0; start < batches.length; start += 4) {
    const results = await Promise.allSettled(batches.slice(start, start + 4).map(operation));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
}

async function readBank(certificateId, bankId, manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateBankManifest(manifest, certificateId);
  const [questionFile, solutionFile] = await Promise.all(
    [manifest.files.questions, manifest.files.solutions].map((name) =>
      readFile(resolve(dirname(manifestPath), name), 'utf8'),
    ),
  );
  const [questionEnvelope, solutionEnvelope] = [questionFile, solutionFile].map(JSON.parse);
  if (
    [questionEnvelope, solutionEnvelope].some(
      (file) =>
        file?.bankVersion !== manifest.bankVersion || file.schemaVersion !== manifest.schemaVersion,
    )
  ) {
    throw new Error('Manifest, question and solution versions must match.');
  }
  for (const [source, checksum] of [
    [questionFile, manifest.integrity?.questionsSha256],
    [solutionFile, manifest.integrity?.solutionsSha256],
  ]) {
    if (checksum !== undefined && createHash('sha256').update(source).digest('hex') !== checksum) {
      throw new Error(
        'The original question or solution file does not match the manifest checksum.',
      );
    }
  }
  const bank = {
    manifest,
    questions: questionEnvelope.questions,
    solutions: solutionEnvelope.solutions,
  };
  const media = validateBankContent(bank, certificateId, validateSchema);
  return { ...bank, certificateId, bankId, media, checksum: bankChecksum(bank) };
}

function batches(bank) {
  const solutions = new Map(
    bank.solutions.map((solution, position) => [
      solution.questionId,
      { solution, solutionPosition: position },
    ]),
  );
  const uploads = [];
  let entries = [];
  let media = new Set();
  let bytes = Buffer.byteLength(JSON.stringify({ checksum: bank.checksum, entries: [] }));
  const baseBytes = bytes;
  for (const [position, question] of bank.questions.entries()) {
    const entry = { question, position, ...solutions.get(question.id) };
    const entryBytes = Buffer.byteLength(JSON.stringify(entry)) + 1;
    const paths = new Set(questionMediaPaths(question, entry.solution));
    if (entryBytes + baseBytes > BANK_UPLOAD_BYTES || paths.size > BANK_MEDIA_BATCH) {
      throw new Error(`${question.id} exceeds the import request limits.`);
    }
    if (
      entries.length === BANK_UPLOAD_ROWS ||
      bytes + entryBytes > BANK_UPLOAD_BYTES ||
      new Set([...media, ...paths]).size > BANK_MEDIA_BATCH
    ) {
      uploads.push(entries);
      entries = [];
      media = new Set();
      bytes = baseBytes;
    }
    entries.push(entry);
    bytes += entryBytes;
    for (const path of paths) media.add(path);
  }
  if (entries.length) uploads.push(entries);
  return uploads;
}

async function fetchBankApi(input, path, { method = 'GET', body } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(`${input.siteUrl}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: 'application/json',
          Origin: input.siteUrl,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
          ...(input.bypassToken
            ? { 'OAI-Sites-Authorization': `Bearer ${input.bypassToken}` }
            : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (attempt === 2)
        throw new Error(`Request failed for ${path}. Retry to resume.`, { cause: error });
    }
    if (!response || ([429, 502, 503, 504].includes(response.status) && attempt < 2)) {
      await response?.body?.cancel();
      await delay(500 * (attempt + 1));
      continue;
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      const details = result?.detail ?? result?.missing?.slice(0, 3).join(', ');
      const summary = `${path} returned ${response.status} ${result?.error ?? 'unexpected_response'}`;
      throw new Error(details ? `${summary}. ${details}` : summary);
    }
    return result;
  }
}

async function checkMedia(paths, input) {
  const missing = [];
  for (let start = 0; start < paths.length; start += BANK_MEDIA_BATCH) {
    const batch = paths.slice(start, start + BANK_MEDIA_BATCH);
    if (input) {
      const result = await fetchBankApi(input, '/api/admin/question-banks/media', {
        method: 'POST',
        body: batch,
      });
      if (!Array.isArray(result.missing)) throw new Error('Invalid media check response.');
      missing.push(...result.missing);
    } else {
      const results = await Promise.all(
        batch.map(async (path) => {
          try {
            const file = await stat(resolve('public', `.${path}`));
            return file.isFile() && file.size > 0 ? null : path;
          } catch (error) {
            if (error.code === 'ENOENT') return path;
            throw error;
          }
        }),
      );
      missing.push(...results.filter(Boolean));
    }
  }
  return missing;
}

function adminPath(certificateId, bankId) {
  return `/api/admin/question-banks/${certificateId}/${bankId}`;
}

async function activate(input, path, bankVersion, previousVersion) {
  await fetchBankApi(input, `${path}/active`, {
    method: 'PUT',
    body: { bankVersion, previousVersion },
  });
}

async function importBank(input, bank, uploads, stageOnly) {
  const { certificateId, bankId, manifest, checksum } = bank;
  const path = adminPath(certificateId, bankId);
  const { bankVersion } = manifest;
  const versionPath = `${path}/versions/${bankVersion}`;
  const previousVersion = (await fetchBankApi(input, `${path}/active`)).bankVersion;
  let version = await fetchBankApi(input, versionPath, {
    method: 'PUT',
    body: { manifest, checksum },
  });
  if (!version.verified) {
    let completed = 0;
    await runBatches(uploads, async (entries) => {
      await fetchBankApi(input, `${versionPath}/entries`, {
        method: 'PUT',
        body: { checksum, entries },
      });
      completed += 1;
      if (completed % 10 === 0 || completed === uploads.length) {
        console.log(`${certificateId}/${bankId}: uploaded ${completed}/${uploads.length} batches.`);
      }
    });
    version = await fetchBankApi(input, `${versionPath}/verify`, {
      method: 'POST',
      body: { checksum },
    });
  }
  if (
    !version.verified ||
    version.checksum !== checksum ||
    version.questionCount !== bank.questions.length
  ) {
    throw new Error('The database did not verify the imported version.');
  }
  // Re-running an old import must not replace a newer active version.
  if (!stageOnly && previousVersion === null) await activate(input, path, bankVersion, null);
  const activeVersion = (await fetchBankApi(input, `${path}/active`)).bankVersion;
  console.log(
    `${certificateId}/${bankId} ${bankVersion} ${activeVersion === bankVersion ? 'active' : 'verified'} in D1.`,
  );
  if (activeVersion !== bankVersion) {
    console.log(`Use --activate ${bankVersion} to select this verified version.`);
  }
}

async function run() {
  const { values: args } = parseArgs({
    options: {
      'dry-run': { type: 'boolean' },
      remote: { type: 'boolean' },
      'stage-only': { type: 'boolean' },
      certificate: { type: 'string' },
      bank: { type: 'string' },
      manifest: { type: 'string' },
      activate: { type: 'string' },
    },
  });
  const specific = [args.certificate, args.bank, args.manifest].some(
    (value) => value !== undefined,
  );
  if (specific && (!BANK_ID.test(args.certificate ?? '') || !BANK_ID.test(args.bank ?? ''))) {
    throw new Error('Provide valid --certificate and --bank IDs together.');
  }
  if (args.activate !== undefined) {
    if (!specific || args.manifest || args['dry-run'] || args['stage-only'] || !args.remote) {
      throw new Error('Use --remote --certificate ID --bank ID --activate VERSION (or json).');
    }
    if (!BANK_VERSION.test(args.activate)) throw new Error('Invalid bank version.');
  }
  if (args['stage-only'] && (!args.remote || args['dry-run'])) {
    throw new Error('--stage-only requires a remote import.');
  }
  const input = args.remote ? await operatorInput() : null;
  if (input && (typeof input.accessToken !== 'string' || !input.accessToken)) {
    throw new Error('Provide the target Site URL and an Admin accessToken.');
  }
  if (args.activate !== undefined) {
    const path = adminPath(args.certificate, args.bank);
    const { bankVersion } = await fetchBankApi(input, `${path}/active`);
    const target = args.activate === 'json' ? null : args.activate;
    await activate(input, path, target, bankVersion);
    console.log(`${args.certificate}/${args.bank} now uses ${target ?? 'static JSON'}.`);
    return;
  }
  if (!input && !args['dry-run'])
    throw new Error('Use --dry-run or --remote to select the import mode.');

  const targets = args.manifest
    ? [[args.certificate, args.bank, args.manifest]]
    : defaultBanks.filter(
        ([certificateId, bankId]) =>
          !specific || (certificateId === args.certificate && bankId === args.bank),
      );
  if (!targets.length) throw new Error('Provide --manifest for this bank.');
  for (const [certificateId, bankId, manifestPath] of targets) {
    try {
      if (!specific && bankId === 'hacker2') {
        try {
          await access(manifestPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          console.log('toeic/hacker2 skipped because its optional manifest is absent.');
          continue;
        }
      }
      const bank = await readBank(certificateId, bankId, manifestPath);
      const uploads = batches(bank);
      console.log(
        `${certificateId}/${bankId} ${bank.manifest.bankVersion}: ${bank.questions.length} questions, ${uploads.length} batches, SHA-256 ${bank.checksum}.`,
      );
      if (args['dry-run']) {
        const missing = await checkMedia([...bank.media], input);
        if (missing.length) {
          throw new Error(
            `${missing.length} missing media files (first 3: ${missing.slice(0, 3).join(', ')}).`,
          );
        }
      } else {
        await importBank(input, bank, uploads, args['stage-only']);
      }
    } catch (error) {
      console.error(`${certificateId}/${bankId}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
