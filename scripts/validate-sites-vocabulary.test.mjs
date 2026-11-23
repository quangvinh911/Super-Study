import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateSitesVocabulary } from './validate-sites-vocabulary.mjs';

describe('Sites vocabulary packaging', () => {
  let directory;
  let assetPath;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sites-vocabulary-'));
    const assetDirectory = join(directory, 'data/toeic/vocabulary');
    await mkdir(assetDirectory, { recursive: true });
    assetPath = join(assetDirectory, 'hacker-3.json');
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('blocks a build without the ignored vocabulary asset and explains recovery', async () => {
    await expect(validateSitesVocabulary(directory)).rejects.toThrow(/private vocabulary inputs/);
  });

  it('rejects HTML fallback, a wrong collection and incomplete data', async () => {
    for (const contents of [
      '<html>app</html>',
      JSON.stringify({ id: 'another', entries: Array(300).fill({}) }),
      JSON.stringify({ id: 'hacker-3', entries: [] }),
    ]) {
      await writeFile(assetPath, contents);
      await expect(validateSitesVocabulary(directory)).rejects.toThrow(/Sites vocabulary asset/);
    }
  });

  it('accepts a packaged collection with the expected inventory', async () => {
    await writeFile(assetPath, JSON.stringify({ id: 'hacker-3', entries: Array(300).fill({}) }));
    await expect(validateSitesVocabulary(directory)).resolves.toBeUndefined();
  });
});
