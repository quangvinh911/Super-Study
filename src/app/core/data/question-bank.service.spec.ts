import { afterEach, describe, expect, it, vi } from 'vitest';
import { findCertificate } from '../../certificates/registry';
import { toeicFixture } from '../testing/toeic-fixture';
import { QuestionBankLoadError, QuestionBankService } from './question-bank.service';

const toeic = findCertificate('toeic');
if (!toeic) throw new Error('The TOEIC certificate is required for these tests.');

const hacker2Manifest = '/data/toeic/hacker2-manifest.json';

function serveBanks(overrides = new Map<string, Response | Error>()): void {
  const responses = new Map<string, Response>();
  for (const id of ['hacker', 'hacker2', 'jimmy']) {
    const { manifest, questions, solutions } = toeicFixture(id);
    const prefix = `/data/toeic/${id}-`;
    const questionFile = `${id}-questions.json`;
    const solutionFile = `${id}-solutions.json`;
    const { bankVersion, schemaVersion } = manifest;
    responses.set(
      `${prefix}manifest.json`,
      Response.json({ ...manifest, files: { questions: questionFile, solutions: solutionFile } }),
    );
    responses.set(
      `${prefix}questions.json`,
      Response.json({ bankVersion, schemaVersion, questions }),
    );
    responses.set(
      `${prefix}solutions.json`,
      Response.json({ bankVersion, schemaVersion, solutions }),
    );
  }
  vi.stubGlobal('fetch', async (url: string) => {
    const response = overrides.get(url) ?? responses.get(url);
    if (!response) throw new Error(`Unexpected request for ${url}`);
    if (response instanceof Error) throw response;
    return response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('loading the TOEIC banks', () => {
  it('includes Hacker 2 when the complete pack is served', async () => {
    serveBanks();

    const banks = await new QuestionBankService().loadCertificateBanks(toeic);

    expect(Object.keys(banks)).toEqual(['hacker', 'hacker2', 'jimmy']);
    expect(banks['hacker2']?.questions).toHaveLength(200);
  });

  it.each([
    ['network rejection', new TypeError('Failed to fetch')],
    ['service worker timeout', new Response(null, { status: 504 })],
  ])('keeps cached required banks usable offline after a %s', async (_, response) => {
    vi.stubGlobal('navigator', { onLine: false });
    serveBanks(new Map([[hacker2Manifest, response]]));

    const banks = await new QuestionBankService().loadCertificateBanks(toeic);

    expect(Object.keys(banks)).toEqual(['hacker', 'jimmy']);
  });

  it.each([
    ['404', new Response(null, { status: 404 })],
    ['SPA fallback', new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })],
  ])(
    'keeps Hacker 3 and Jimmy available when the optional manifest returns %s',
    async (_, response) => {
      serveBanks(new Map([[hacker2Manifest, response]]));

      const banks = await new QuestionBankService().loadCertificateBanks(toeic);

      expect(Object.keys(banks)).toEqual(['hacker', 'jimmy']);
      expect(banks['hacker']?.questions).toHaveLength(200);
      expect(banks['jimmy']?.questions).toHaveLength(200);
    },
  );

  it.each([
    ['/data/toeic/hacker-manifest.json', 404],
    ['/data/toeic/hacker2-solutions.json', 404],
    [hacker2Manifest, 503],
    [hacker2Manifest, 504],
  ])('reports an error when %s returns %s', async (url, status) => {
    const response = new Response('<!doctype html>', {
      status,
      headers: { 'Content-Type': 'text/html' },
    });
    serveBanks(new Map([[url, response]]));

    await expect(new QuestionBankService().loadCertificateBanks(toeic)).rejects.toBeInstanceOf(
      QuestionBankLoadError,
    );
  });

  it('reports a malformed Hacker 2 manifest instead of omitting the bank', async () => {
    serveBanks(new Map([[hacker2Manifest, Response.json({ files: {} })]]));

    await expect(new QuestionBankService().loadCertificateBanks(toeic)).rejects.toBeInstanceOf(
      QuestionBankLoadError,
    );
  });
});
