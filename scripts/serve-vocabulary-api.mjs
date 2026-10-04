import { createServer } from 'node:http';
import { createVocabularyApi } from './vocabulary-api.mjs';

const handle = createVocabularyApi();
const port = 8788;
createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url !== '/api/vocabulary/enrich') {
      outgoing.writeHead(404).end();
      return;
    }
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      ...(incoming.method === 'POST' ? { body: incoming, duplex: 'half' } : {}),
    });
    const response = await handle(request, {
      VOCABULARY_ALLOWED_ORIGIN: 'http://localhost:4200',
    });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing
      .writeHead(500, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'server_error' }));
  }
}).listen(port, '127.0.0.1', () => console.log(`Vocabulary API listening on 127.0.0.1:${port}`));
