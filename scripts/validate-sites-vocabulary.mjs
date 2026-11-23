import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function validateSitesVocabulary(clientDirectory) {
  const asset = 'data/toeic/vocabulary/hacker-3.json';
  let collection;
  try {
    collection = JSON.parse(await readFile(join(clientDirectory, asset), 'utf8'));
  } catch (error) {
    throw new Error(
      `Sites vocabulary asset is missing or invalid: ${asset}. Build from the checkout containing the private vocabulary inputs; run content:build before packaging.`,
      { cause: error },
    );
  }
  // Private vocabulary is intentionally absent from Git, but its published route needs this asset.
  if (
    collection?.id !== 'hacker-3' ||
    !Array.isArray(collection.entries) ||
    collection.entries.length !== 300
  ) {
    throw new Error(`Sites vocabulary asset must contain the 300 Hacker 3 entries: ${asset}.`);
  }
}
