import { Injectable } from '@angular/core';
import {
  CertificateDefinition,
  LoadedQuestionBank,
  QuestionBankDefinition,
  QuestionBankManifest,
  QuestionEnvelope,
  SolutionEnvelope,
} from '../models';
import { canGenerateExam } from '../domain/exam-generator';

interface ActiveBank {
  readonly id: string;
  readonly bankVersion: string;
  readonly questionCount: number;
  readonly examReady: boolean;
}

export interface AvailableQuestionBank extends QuestionBankDefinition {
  readonly bankVersion: string;
  readonly questionCount: number;
  readonly examReady: boolean | undefined;
  readonly storage: 'd1' | 'json';
}

export class QuestionBankLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'QuestionBankLoadError';
  }
}

class QuestionBankFileUnavailableError extends QuestionBankLoadError {
  constructor(
    readonly url: string,
    options?: ErrorOptions,
  ) {
    super(`Question-bank file is unavailable: ${url}`, options);
  }
}

class QuestionBankRequestError extends QuestionBankLoadError {
  constructor(
    readonly url: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(`Question-bank request failed: ${url} (${status ?? 'network'})`, options);
  }
}

function canUseBackup(error: unknown): boolean {
  return (
    error instanceof QuestionBankFileUnavailableError ||
    (error instanceof QuestionBankRequestError &&
      (error.status === undefined || error.status >= 500))
  );
}

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveFileUrl(manifestUrl: string, fileUrl: string): string {
  if (/^(?:https?:)?\/\//u.test(fileUrl) || fileUrl.startsWith('/')) {
    return fileUrl;
  }
  const cleanManifest = manifestUrl.split(/[?#]/u, 1)[0] ?? manifestUrl;
  const slash = cleanManifest.lastIndexOf('/');
  return `${slash >= 0 ? cleanManifest.slice(0, slash + 1) : ''}${fileUrl}`;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await globalThis.fetch(url, { headers: { Accept: 'application/json' }, signal });
  } catch (error) {
    if (globalThis.navigator?.onLine === false) {
      throw new QuestionBankFileUnavailableError(url, { cause: error });
    }
    throw new QuestionBankRequestError(url, undefined, { cause: error });
  }
  // Static SPA hosts may return the HTML shell for an absent data file.
  if (
    response.status === 404 ||
    (response.status === 504 && globalThis.navigator?.onLine === false) ||
    (response.ok && response.headers.get('content-type')?.startsWith('text/html'))
  ) {
    throw new QuestionBankFileUnavailableError(url);
  }
  if (!response.ok) {
    throw new QuestionBankRequestError(url, response.status);
  }
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new QuestionBankLoadError(`Question-bank file is not valid JSON: ${url}`, {
      cause: error,
    });
  }
}

function parseManifest(value: unknown): QuestionBankManifest {
  if (!isRecord(value) || !isRecord(value['files'])) {
    throw new QuestionBankLoadError('Question-bank manifest is malformed.');
  }
  const files = value['files'];
  if (
    typeof value['schemaVersion'] !== 'string' ||
    typeof value['bankVersion'] !== 'string' ||
    typeof value['questionCount'] !== 'number' ||
    !Number.isSafeInteger(value['questionCount']) ||
    value['questionCount'] < 0 ||
    value['questionCount'] !== value['solutionCount'] ||
    typeof files['questions'] !== 'string' ||
    typeof files['solutions'] !== 'string'
  ) {
    throw new QuestionBankLoadError('Question-bank manifest is missing required fields.');
  }
  return clone(value) as unknown as QuestionBankManifest;
}

function parseQuestionEnvelope(value: unknown): QuestionEnvelope {
  if (
    !isRecord(value) ||
    typeof value['schemaVersion'] !== 'string' ||
    typeof value['bankVersion'] !== 'string' ||
    !Array.isArray(value['questions'])
  ) {
    throw new QuestionBankLoadError('questions.json has an invalid envelope.');
  }
  return clone(value) as unknown as QuestionEnvelope;
}

function parseSolutionEnvelope(value: unknown): SolutionEnvelope {
  if (
    !isRecord(value) ||
    typeof value['schemaVersion'] !== 'string' ||
    typeof value['bankVersion'] !== 'string' ||
    !Array.isArray(value['solutions'])
  ) {
    throw new QuestionBankLoadError('solutions.json has an invalid envelope.');
  }
  return clone(value) as unknown as SolutionEnvelope;
}

function isActiveBank(value: unknown): value is ActiveBank {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    /^[a-z][a-z0-9-]{0,63}$/.test(value['id']) &&
    typeof value['bankVersion'] === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value['bankVersion']) &&
    typeof value['questionCount'] === 'number' &&
    Number.isSafeInteger(value['questionCount']) &&
    value['questionCount'] >= 0 &&
    typeof value['examReady'] === 'boolean'
  );
}

function questionBankApi(certificateId: string): string {
  return `/api/question-banks/${encodeURIComponent(certificateId)}`;
}

function verifyBank(bank: LoadedQuestionBank, certificateId: string): LoadedQuestionBank {
  if (
    (bank.manifest.certificateId ?? 'ctfl') !== certificateId ||
    bank.questions.some((question) => (question.certificateId ?? 'ctfl') !== certificateId)
  ) {
    throw new QuestionBankLoadError('Question bank belongs to a different certificate.');
  }
  if (
    bank.questions.length !== bank.manifest.questionCount ||
    bank.solutions.length !== bank.manifest.solutionCount
  ) {
    throw new QuestionBankLoadError('Question-bank counts do not match the manifest.');
  }
  const ids = new Set(bank.questions.map((question) => question.id));
  const solutionIds = new Set(bank.solutions.map((solution) => solution.questionId));
  if (
    ids.size !== bank.questions.length ||
    solutionIds.size !== bank.solutions.length ||
    [...ids].some((id) => !solutionIds.has(id))
  ) {
    throw new QuestionBankLoadError(
      'Question-bank question and solution IDs are incomplete or duplicated.',
    );
  }
  return bank;
}

@Injectable({ providedIn: 'root' })
export class QuestionBankService {
  private readonly loadingBanks = new Map<string, Promise<LoadedQuestionBank>>();

  async listBanks(certificate: CertificateDefinition): Promise<AvailableQuestionBank[]> {
    let active: ActiveBank[] = [];
    try {
      const result = await fetchJson(questionBankApi(certificate.id), AbortSignal.timeout(2500));
      if (
        !isRecord(result) ||
        !Array.isArray(result['banks']) ||
        !result['banks'].every(isActiveBank)
      ) {
        throw new QuestionBankLoadError('The active question-bank list is malformed.');
      }
      active = result['banks'];
    } catch (error) {
      if (!canUseBackup(error)) throw error;
    }
    const byId = new Map(active.map((bank) => [bank.id, bank]));
    if (byId.size !== active.length) {
      throw new QuestionBankLoadError('The active question-bank list contains duplicate IDs.');
    }
    const entries = await Promise.all(
      certificate.banks.map(async (source): Promise<AvailableQuestionBank | null> => {
        const bank = byId.get(source.id);
        if (bank) return { ...source, ...bank, storage: 'd1' };
        try {
          const { bankVersion, questionCount } = await this.readManifest(
            source.manifestUrl,
            certificate.id,
          );
          return { ...source, bankVersion, questionCount, examReady: undefined, storage: 'json' };
        } catch (error) {
          if (
            source.optional &&
            error instanceof QuestionBankFileUnavailableError &&
            error.url === source.manifestUrl
          ) {
            return null;
          }
          throw error;
        }
      }),
    );
    return entries.filter((entry) => entry !== null);
  }

  async loadBank(
    source: AvailableQuestionBank,
    certificateId: string,
  ): Promise<LoadedQuestionBank> {
    if (source.storage === 'json') {
      return this.loadOnce(source.manifestUrl, certificateId, () =>
        this.loadStatic(source.manifestUrl, certificateId),
      );
    }
    const url = `${questionBankApi(certificateId)}/${encodeURIComponent(source.id)}/${encodeURIComponent(source.bankVersion)}`;
    try {
      return await this.loadOnce(url, certificateId, async () => {
        const value = await fetchJson(url, AbortSignal.timeout(12_000));
        if (
          !isRecord(value) ||
          !Array.isArray(value['questions']) ||
          !Array.isArray(value['solutions'])
        ) {
          throw new QuestionBankLoadError('The question-bank response is malformed.');
        }
        const manifest = parseManifest(value['manifest']);
        if (
          manifest.bankVersion !== source.bankVersion ||
          manifest.questionCount !== source.questionCount
        ) {
          throw new QuestionBankLoadError('The question bank does not match the active version.');
        }
        return { manifest, questions: value['questions'], solutions: value['solutions'] };
      });
    } catch (error) {
      if (!canUseBackup(error)) throw error;
      return this.loadOnce(source.manifestUrl, certificateId, () =>
        this.loadStatic(source.manifestUrl, certificateId),
      );
    }
  }

  async examAvailable(
    certificate: CertificateDefinition,
    banks: readonly AvailableQuestionBank[],
  ): Promise<boolean> {
    if (banks.some((bank) => bank.examReady)) return true;
    for (const bank of banks) {
      if (bank.examReady !== undefined || bank.questionCount < certificate.exam.questionCount)
        continue;
      if (canGenerateExam(await this.loadBank(bank, certificate.id), certificate.exam)) return true;
    }
    return false;
  }

  private async loadOnce(
    url: string,
    certificateId: string,
    load: () => Promise<LoadedQuestionBank>,
  ): Promise<LoadedQuestionBank> {
    const key = `${certificateId}:${url}`;
    let pending = this.loadingBanks.get(key);
    if (!pending) {
      pending = load()
        .then((bank) => verifyBank(bank, certificateId))
        .finally(() => this.loadingBanks.delete(key));
      this.loadingBanks.set(key, pending);
    }
    return clone(await pending);
  }

  private async readManifest(
    manifestUrl: string,
    certificateId: string,
  ): Promise<QuestionBankManifest> {
    const manifest = parseManifest(await fetchJson(manifestUrl));
    if ((manifest.certificateId ?? 'ctfl') !== certificateId) {
      throw new QuestionBankLoadError('Question bank belongs to a different certificate.');
    }
    return manifest;
  }

  private async loadStatic(
    manifestUrl: string,
    certificateId: string,
  ): Promise<LoadedQuestionBank> {
    const manifest = await this.readManifest(manifestUrl, certificateId);
    const [questionEnvelope, solutionEnvelope] = await Promise.all([
      fetchJson(resolveFileUrl(manifestUrl, manifest.files.questions)).then(parseQuestionEnvelope),
      fetchJson(resolveFileUrl(manifestUrl, manifest.files.solutions)).then(parseSolutionEnvelope),
    ]);

    if (
      questionEnvelope.bankVersion !== manifest.bankVersion ||
      solutionEnvelope.bankVersion !== manifest.bankVersion ||
      questionEnvelope.schemaVersion !== manifest.schemaVersion ||
      solutionEnvelope.schemaVersion !== manifest.schemaVersion
    ) {
      throw new QuestionBankLoadError('Question-bank file versions do not match the manifest.');
    }
    return {
      manifest,
      questions: questionEnvelope.questions,
      solutions: solutionEnvelope.solutions,
    };
  }
}
