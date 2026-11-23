import { afterEach, describe, expect, it, vi } from 'vitest';
import { PracticeExplanationService } from './practice-explanation.service';
import { toeicFixture } from '../../core/testing/toeic-fixture';
import { SessionResponse } from '../../core/models';

const bank = toeicFixture();
const item = { question: bank.questions[100], solution: bank.solutions[100] };
const answer: SessionResponse = {
  questionId: item.question.id,
  selectedOptionIds: ['B'],
  checked: true,
  flagged: false,
};
describe('Practice explanation service', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends displayed option labels, snapshot answer and the cancellation signal to the same-origin API', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ explanation: 'Chi tiết lời giải.' }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    expect(await new PracticeExplanationService().explain('toeic', item, answer, signal)).toBe(
      'Chi tiết lời giải.',
    );
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/practice/explanation');
    expect(options.signal).toBe(signal);
    expect(JSON.parse(options.body)).toMatchObject({
      correctOptionIds: ['A'],
      selectedOptionIds: ['B'],
      options: [
        { id: 'A', label: 'A', text: 'Option A' },
        { id: 'B', label: 'B', text: 'Option B' },
        { id: 'C', label: 'C', text: 'Option C' },
        { id: 'D', label: 'D', text: 'Option D' },
      ],
    });
    expect(options.headers).not.toHaveProperty('Authorization');
  });
  it('never requests an explanation before grading', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      new PracticeExplanationService().explain(
        'toeic',
        item,
        { ...answer, checked: false },
        new AbortController().signal,
      ),
    ).rejects.toThrow('kiểm tra');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects empty, malformed and HTML responses', async () => {
    for (const response of [
      Response.json({ explanation: '' }),
      Response.json({ explanation: 12 }),
      new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } }),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(
        new PracticeExplanationService().explain(
          'toeic',
          item,
          answer,
          new AbortController().signal,
        ),
      ).rejects.toThrow('chưa trả về');
    }
  });
  it('explains missing server configuration and rate limits', async () => {
    for (const [status, error, message] of [
      [503, 'ai_not_configured', 'chưa cấu hình'],
      [429, 'rate_limited', 'giới hạn'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error }, { status })));
      await expect(
        new PracticeExplanationService().explain(
          'toeic',
          item,
          answer,
          new AbortController().signal,
        ),
      ).rejects.toThrow(message);
    }
  });
});
