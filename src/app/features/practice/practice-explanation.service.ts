import { Injectable } from '@angular/core';
import { ContentBlock, SessionQuestionSnapshot, SessionResponse } from '../../core/models';

function blockText(blocks: readonly ContentBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case 'list':
          return block.items.join('\n');
        case 'table':
          return [
            block.caption,
            block.headers.join(' | '),
            ...block.rows.map((row) => row.join(' | ')),
          ].join('\n');
        case 'image':
          return '[Ảnh: nội dung ảnh chưa được gửi cho AI]';
        case 'audio':
          return '[Audio: chỉ dùng transcript nếu có trong lời giải gốc]';
        default:
          return block.text;
      }
    })
    .join('\n');
}

@Injectable({ providedIn: 'root' })
export class PracticeExplanationService {
  async explain(
    certificateId: string,
    item: SessionQuestionSnapshot,
    answer: SessionResponse,
    signal: AbortSignal,
  ): Promise<string> {
    if (!answer.checked) throw new Error('Hãy kiểm tra đáp án trước khi xem giải thích AI.');
    const response = await fetch('/api/practice/explanation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        certificateId,
        questionId: item.question.id,
        stem: blockText(item.question.stem),
        passage: blockText(item.question.stimulus?.content ?? []),
        options: item.question.options.map((option, index) => ({
          id: option.id,
          label: 'ABCDE'[index],
          text: blockText(option.content),
        })),
        correctOptionIds: item.solution.correctOptionIds,
        selectedOptionIds: answer.selectedOptionIds,
        explanation: blockText(item.solution.explanation),
        answerStatus: item.question.verification.answerStatus,
      }),
      signal,
    }).catch(() => {
      throw new Error('Chưa kết nối được dịch vụ AI. Kiểm tra kết nối và thử lại.');
    });
    const data: unknown = response.headers.get('Content-Type')?.includes('application/json')
      ? await response.json()
      : null;
    const valid = typeof data === 'object' && data !== null;
    if (!response.ok) {
      if (response.status === 503 && valid && 'error' in data && data.error === 'ai_not_configured')
        throw new Error('Máy chủ chưa cấu hình dịch vụ giải thích AI.');
      if (response.status === 429)
        throw new Error('Đã đạt giới hạn lượt giải thích. Hãy thử lại sau một phút.');
      throw new Error('Chưa tải được giải thích AI. Kiểm tra kết nối và thử lại.');
    }
    if (
      !valid ||
      !('explanation' in data) ||
      typeof data.explanation !== 'string' ||
      !data.explanation.trim() ||
      data.explanation.length > 20000
    )
      throw new Error('Dịch vụ AI chưa trả về lời giải hoàn chỉnh. Hãy thử lại.');
    return data.explanation;
  }
}
