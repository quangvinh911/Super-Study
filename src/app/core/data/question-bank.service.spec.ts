import { afterEach, describe, expect, it, vi } from 'vitest';
import { findCertificate } from '../../certificates/registry';
import { toeicFixture } from '../testing/toeic-fixture';
import { QuestionBankLoadError, QuestionBankService } from './question-bank.service';

const toeic = findCertificate('toeic');
if (!toeic) throw new Error('The TOEIC certificate is required for these tests.');

const hacker2Manifest = '/data/toeic/hacker2-manifest.json';
const catalog = '/api/question-banks/toeic';

function serveBanks(overrides = new Map<string, Response | Error>()) {
  const responses = new Map<string, Response>([[catalog, Response.json({ banks: [] })]]);
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
  const fetch = vi.fn(async (url: string) => {
    const response = overrides.get(url) ?? responses.get(url);
    if (!response) throw new Error(`Unexpected request for ${url}`);
    if (response instanceof Error) throw response;
    return response.clone();
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('loading the TOEIC banks', () => {
  it('includes Hacker 2 when the complete pack is served', async () => {
    serveBanks();

    const service = new QuestionBankService();
    const banks = await service.listBanks(toeic);

    expect(banks.map((bank) => bank.id)).toEqual(['hacker', 'hacker2', 'jimmy']);
    expect((await service.loadBank(banks[1]!, 'toeic')).questions).toHaveLength(200);
  });

  it.each([
    ['network rejection', new TypeError('Failed to fetch')],
    ['service worker timeout', new Response(null, { status: 504 })],
  ])('keeps cached required banks usable offline after a %s', async (_, response) => {
    vi.stubGlobal('navigator', { onLine: false });
    serveBanks(new Map([[hacker2Manifest, response]]));

    const banks = await new QuestionBankService().listBanks(toeic);

    expect(banks.map((bank) => bank.id)).toEqual(['hacker', 'jimmy']);
  });

  it.each([
    ['404', new Response(null, { status: 404 })],
    ['SPA fallback', new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })],
  ])(
    'keeps Hacker 3 and Jimmy available when the optional manifest returns %s',
    async (_, response) => {
      serveBanks(new Map([[hacker2Manifest, response]]));

      const banks = await new QuestionBankService().listBanks(toeic);

      expect(banks.map((bank) => bank.id)).toEqual(['hacker', 'jimmy']);
      expect(banks.map((bank) => bank.questionCount)).toEqual([200, 200]);
    },
  );

  it.each([
    ['/data/toeic/hacker-manifest.json', 404],
    [hacker2Manifest, 503],
    [hacker2Manifest, 504],
  ])('reports an error when %s returns %s', async (url, status) => {
    const response = new Response('<!doctype html>', {
      status,
      headers: { 'Content-Type': 'text/html' },
    });
    serveBanks(new Map([[url, response]]));

    await expect(new QuestionBankService().listBanks(toeic)).rejects.toBeInstanceOf(
      QuestionBankLoadError,
    );
  });

  it('reports a malformed Hacker 2 manifest instead of omitting the bank', async () => {
    serveBanks(new Map([[hacker2Manifest, Response.json({ files: {} })]]));

    await expect(new QuestionBankService().listBanks(toeic)).rejects.toBeInstanceOf(
      QuestionBankLoadError,
    );
  });

  it('reports missing solutions when a learner selects an available bank', async () => {
    serveBanks(
      new Map([['/data/toeic/hacker2-solutions.json', new Response(null, { status: 404 })]]),
    );
    const service = new QuestionBankService();
    const banks = await service.listBanks(toeic);
    await expect(service.loadBank(banks[1]!, 'toeic')).rejects.toBeInstanceOf(
      QuestionBankLoadError,
    );
  });
});

describe('loading published D1 versions', () => {
  const bank = toeicFixture('hacker');
  const manifest = { ...bank.manifest, bankVersion: 'database-v1' };
  const versionPath = `${catalog}/hacker/${manifest.bankVersion}`;
  const active = Response.json({
    banks: [
      { id: 'hacker', bankVersion: manifest.bankVersion, questionCount: 200, examReady: true },
    ],
  });

  it('uses the catalog for availability and downloads only the selected version', async () => {
    const fetch = serveBanks(
      new Map([
        [catalog, active],
        [versionPath, Response.json({ ...bank, manifest })],
      ]),
    );
    const service = new QuestionBankService();
    const sources = await service.listBanks(toeic);
    expect(sources[0]).toMatchObject({
      id: 'hacker',
      storage: 'd1',
      bankVersion: manifest.bankVersion,
    });
    await expect(service.examAvailable(toeic, sources)).resolves.toBe(true);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      catalog,
      hacker2Manifest,
      '/data/toeic/jimmy-manifest.json',
    ]);
    await expect(service.loadBank(sources[0]!, 'toeic')).resolves.toMatchObject({ manifest });
    expect(fetch.mock.calls.at(-1)?.[0]).toBe(versionPath);
  });

  it('loads static JSON when the active version is temporarily unavailable', async () => {
    const fetch = serveBanks(
      new Map([
        [catalog, active],
        [versionPath, new Response(null, { status: 503 })],
      ]),
    );
    const service = new QuestionBankService();
    const [source] = await service.listBanks(toeic);
    const result = await service.loadBank(source!, 'toeic');
    expect(result.manifest.bankVersion).toBe(bank.manifest.bankVersion);
    expect(fetch.mock.calls.map(([url]) => url)).toContain('/data/toeic/hacker-questions.json');
    expect(fetch.mock.calls.map(([url]) => url)).not.toContain('/data/toeic/jimmy-questions.json');
  });

  it('reports inconsistent D1 content instead of silently loading an older version', async () => {
    serveBanks(
      new Map([
        [catalog, active],
        [versionPath, Response.json(bank)],
      ]),
    );
    const service = new QuestionBankService();
    const [source] = await service.listBanks(toeic);
    await expect(service.loadBank(source!, 'toeic')).rejects.toBeInstanceOf(QuestionBankLoadError);
  });
});
