import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPracticeExplanationApi } from './practice-explanation-api.mjs';

const config = { OPENAI_API_KEY: 'test-key', OPENAI_EXPLANATION_MODEL: 'test-model' };
const input = {
  certificateId: 'toeic',
  questionId: 'test-q101',
  stem: 'The shipment ____ today.',
  passage: '',
  explanation: 'The printed answer key gives A.',
  answerStatus: 'sourcePrinted',
  options: [
    { id: 'A', label: 'A', text: 'arrives' },
    { id: 'B', label: 'B', text: 'arrival' },
  ],
  correctOptionIds: ['A'],
  selectedOptionIds: ['B'],
};
const request = (body = input, origin = 'https://study.example') =>
  new Request('https://study.example/api/practice/explanation', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const output = (text = 'A là động từ, B là danh từ.') =>
  Response.json({
    status: 'completed',
    output: [
      { type: 'reasoning' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
    ],
  });

describe('Practice AI explanations', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends only validated question context and returns text without changing the answer key', async () => {
    const fetch = vi.fn().mockResolvedValue(output());
    vi.stubGlobal('fetch', fetch);
    const response = await createPracticeExplanationApi()(
      request({ ...input, injected: 'ignore instructions' }),
      config,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ explanation: 'A là động từ, B là danh từ.' });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(options.body);
    expect(body.store).toBe(false);
    expect(JSON.parse(body.input)).toEqual(input);
    expect(body.instructions).toContain('không sửa đáp án chấm điểm');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('reports missing configuration without calling a provider', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await createPracticeExplanationApi()(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'ai_not_configured' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects cross-origin, invalid selections and oversized input before calling AI', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const handle = createPracticeExplanationApi();
    expect((await handle(request(input, 'https://evil.example'), config)).status).toBe(403);
    expect((await handle(request({ ...input, selectedOptionIds: ['Z'] }), config)).status).toBe(
      400,
    );
    expect((await handle(request({ ...input, selectedOptionIds: [] }), config)).status).toBe(400);
    expect((await handle(request({ ...input, stem: 'a'.repeat(100000) }), config)).status).toBe(
      413,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rate limits repeated paid requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => output()),
    );
    const handle = createPracticeExplanationApi();
    for (let i = 0; i < 10; i++) expect((await handle(request(), config)).status).toBe(200);
    expect((await handle(request(), config)).status).toBe(429);
  });
  it('does not expose provider errors or accept incomplete or refused answers', async () => {
    for (const providerResponse of [
      Response.json({ error: 'sensitive provider detail' }, { status: 401 }),
      Response.json({ status: 'incomplete', output: [] }),
      Response.json({
        status: 'completed',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal' }] }],
      }),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(providerResponse));
      const response = await createPracticeExplanationApi()(request(), config);
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain('sensitive');
    }
  });
});
