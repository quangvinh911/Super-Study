import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const angularOutput = resolve(root, 'dist/cloudflare/browser');
const clientOutput = resolve(root, 'dist/client');
const serverOutput = resolve(root, 'dist/server');

await rm(clientOutput, { recursive: true, force: true });
await rm(serverOutput, { recursive: true, force: true });
await mkdir(clientOutput, { recursive: true });
await mkdir(serverOutput, { recursive: true });
await cp(angularOutput, clientOutput, { recursive: true });

const worker = `const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== 'GET') {
      return withSecurityHeaders(response);
    }

    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    if (!acceptsHtml) return withSecurityHeaders(response);

    const indexUrl = new URL('/index.html', request.url);
    return withSecurityHeaders(await env.ASSETS.fetch(new Request(indexUrl, request)));
  },
};
`;

await writeFile(resolve(serverOutput, 'index.js'), worker, 'utf8');
