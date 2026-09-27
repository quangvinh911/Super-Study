import { Injectable } from '@angular/core';
import {
  LoadedQuestionBank,
  QuestionBankManifest,
  QuestionEnvelope,
  SolutionEnvelope,
} from '../models';

export class QuestionBankLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'QuestionBankLoadError';
  }
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

async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await globalThis.fetch(url);
  } catch (error) {
    throw new QuestionBankLoadError(`Could not load question-bank file: ${url}`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new QuestionBankLoadError(`Question-bank request failed (${response.status}): ${url}`);
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

@Injectable({ providedIn: 'root' })
export class QuestionBankService {
  private readonly cache = new Map<string, Promise<LoadedQuestionBank>>();

  load(manifestUrl = '/data/manifest.json', certificateId = 'ctfl'): Promise<LoadedQuestionBank> {
    let pending = this.cache.get(manifestUrl);
    if (!pending) {
      pending = this.loadUncached(manifestUrl).catch((error: unknown) => {
        this.cache.delete(manifestUrl);
        throw error;
      });
      this.cache.set(manifestUrl, pending);
    }
    return pending.then((bank) => {
      if (
        (bank.manifest.certificateId ?? 'ctfl') !== certificateId ||
        bank.questions.some((question) => (question.certificateId ?? 'ctfl') !== certificateId)
      ) {
        throw new QuestionBankLoadError('Question bank belongs to a different certificate.');
      }
      return clone(bank);
    });
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async loadUncached(manifestUrl: string): Promise<LoadedQuestionBank> {
    const manifest = parseManifest(await fetchJson(manifestUrl));
    const [questionEnvelope, solutionEnvelope] = await Promise.all([
      fetchJson(resolveFileUrl(manifestUrl, manifest.files.questions)).then(parseQuestionEnvelope),
      fetchJson(resolveFileUrl(manifestUrl, manifest.files.solutions)).then(parseSolutionEnvelope),
    ]);

    if (
      questionEnvelope.bankVersion !== manifest.bankVersion ||
      solutionEnvelope.bankVersion !== manifest.bankVersion
    ) {
      throw new QuestionBankLoadError('Question-bank file versions do not match the manifest.');
    }
    if (
      questionEnvelope.questions.length !== manifest.questionCount ||
      solutionEnvelope.solutions.length !== manifest.solutionCount
    ) {
      throw new QuestionBankLoadError('Question-bank counts do not match the manifest.');
    }

    const ids = new Set(questionEnvelope.questions.map((question) => question.id));
    const solutionIds = new Set(solutionEnvelope.solutions.map((solution) => solution.questionId));
    if (
      ids.size !== questionEnvelope.questions.length ||
      solutionIds.size !== solutionEnvelope.solutions.length ||
      [...ids].some((id) => !solutionIds.has(id))
    ) {
      throw new QuestionBankLoadError(
        'Question-bank question and solution IDs are incomplete or duplicated.',
      );
    }

    return {
      manifest,
      questions: questionEnvelope.questions,
      solutions: solutionEnvelope.solutions,
    };
  }
}
