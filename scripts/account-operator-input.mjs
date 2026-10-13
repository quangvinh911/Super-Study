import { createInterface } from 'node:readline';
export async function operatorInput() {
  // Pipe JSON through stdin; credentials never appear in command arguments or logs.
  console.error('Provide one JSON object on stdin. Keep secrets out of shell history.');
  const reader = createInterface({ input: process.stdin, terminal: false });
  let line;
  for await (const input of reader) {
    line = input;
    break;
  }
  reader.close();
  const value = JSON.parse(line || '{}');
  if (!value || typeof value !== 'object' || typeof value.siteUrl !== 'string')
    throw new Error('Missing siteUrl.');
  const url = new URL(value.siteUrl);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new Error('Use HTTPS outside local development.');
  return { ...value, siteUrl: url.origin };
}
