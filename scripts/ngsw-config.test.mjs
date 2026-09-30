import { readFile } from 'node:fs/promises';
import { Generator } from '@angular/service-worker/config';
import { expect, it } from 'vitest';

it('caches PDF question images lazily while prefetching bank data and ordinary images', async () => {
  const config = JSON.parse(
    await readFile(new URL('../ngsw-config.json', import.meta.url), 'utf8'),
  );
  const evidence = [
    '/pdf-evidence/q-001.webp',
    '/pdf-evidence/jimmy-reading-01-q109.webp',
    '/pdf-evidence/toeic-jimmy-reading-01-153-155-passage-1.webp',
  ];
  const ordinaryAssets = ['/data/toeic/questions.json', '/icons/icon-192.png'];
  const files = [...evidence, ...ordinaryAssets];
  const filesystem = {
    list: async () => files,
    hash: async (file) => `hash:${file}`,
    read: async () => {
      throw new Error('The config generator should only need the asset inventory and hashes');
    },
    write: async () => {
      throw new Error('Generating a manifest must not mutate the asset inventory');
    },
  };

  const manifest = await new Generator(filesystem, '/').process(config);
  const lazyGroup = manifest.assetGroups.find((group) => group.name === 'pdf-evidence');
  expect(lazyGroup.installMode).toBe('lazy');
  expect(lazyGroup.urls).toEqual(evidence.sort());
  const prefetched = manifest.assetGroups
    .filter((group) => group.installMode === 'prefetch')
    .flatMap((group) => group.urls);
  expect(prefetched).toEqual(expect.arrayContaining(ordinaryAssets));
  expect(prefetched.some((url) => evidence.includes(url))).toBe(false);
});
