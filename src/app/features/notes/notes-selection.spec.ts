import { describe, expect, it } from 'vitest';
import { noteDocumentFromSelection } from './notes-selection';
import { noteHtml, noteMarkdown, notePlainText, parseNoteDocument } from '../../core/domain/notes';

const sentence = `<div class="syntax-line">Please <button data-note-grammar-role="V"><span class="syntax-token__role">V · Động từ</span><span data-note-grammar-text>submit</span></button> <button data-note-grammar-role="O"><span class="syntax-token__role">O · Tân ngữ</span><span data-note-grammar-text>the form</span></button> <button data-note-grammar-role="M"><span class="syntax-token__role">M · Thành phần bổ nghĩa</span><span data-note-grammar-text>by Thursday</span></button>.</div><p>Vui lòng nộp biểu mẫu chậm nhất thứ Năm.</p>`;
function fragment(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  const range = document.createRange();
  range.selectNodeContents(root);
  return { root, range };
}
describe('Notes selection formatting', () => {
  it('keeps grammar chips inline and the translation on its own line through save/export', () => {
    const { range } = fragment(sentence);
    const document = noteDocumentFromSelection(range);
    expect(document.content).toHaveLength(2);
    expect(
      document.content?.[0].content
        ?.filter((node) => node.type === 'grammarToken')
        .map((node) => node.attrs?.['role']),
    ).toEqual(['V', 'O', 'M']);
    expect(notePlainText(document)).toBe(
      'Please submit the form by Thursday.\nVui lòng nộp biểu mẫu chậm nhất thứ Năm.',
    );
    expect(parseNoteDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
    const draft = { id: '12345678-1234-1234-1234-123456789012', title: 'Example', document };
    expect(noteHtml(draft)).toContain('V · Động từ');
    expect(noteHtml(draft)).toContain('background:#f0fdf4');
    expect(noteMarkdown(draft)).toContain('Please **submit** **the form** **by Thursday**.');
    expect(noteMarkdown(draft)).not.toContain('Động từsubmit');
  });
  it('captures only the selected part of a chip while preserving its role', () => {
    const { root, range } = fragment(sentence);
    const text = root.querySelector('[data-note-grammar-text]')?.firstChild;
    if (!text) throw new Error('Missing token');
    range.setStart(text, 1);
    range.setEnd(text, 4);
    const document = noteDocumentFromSelection(range);
    expect(notePlainText(document)).toBe('ubm');
    expect(document.content?.[0].content?.[0]).toEqual({
      type: 'grammarToken',
      attrs: { role: 'V' },
      content: [{ type: 'text', text: 'ubm' }],
    });
  });
  it('retains emphasis and lists and discards unsafe or hidden source markup', () => {
    const { range } = fragment(
      '<p><strong>Keep</strong> <em>this</em><script>alert(1)</script><span hidden>secret</span><button>control</button><a href="javascript:alert(1)">text</a></p><ul><li>one</li><li>two</li></ul>',
    );
    const document = noteDocumentFromSelection(range);
    expect(document.content?.[0].content?.[0].marks).toEqual([{ type: 'bold' }]);
    expect(document.content?.[1].type).toBe('bulletList');
    expect(notePlainText(document)).toBe('Keep thistext\none\ntwo');
  });
  it('rejects unknown roles and nested block content inside grammar chips', () => {
    for (const token of [
      { type: 'grammarToken', attrs: { role: 'unknown' } },
      { type: 'grammarToken', attrs: { role: 'V', style: 'color:red' } },
      { type: 'grammarToken', attrs: { role: 'V' }, content: [{ type: 'paragraph' }] },
    ])
      expect(() =>
        parseNoteDocument({ type: 'doc', content: [{ type: 'paragraph', content: [token] }] }),
      ).toThrow();
  });
});
