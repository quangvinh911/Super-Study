import { describe, expect, it } from 'vitest';
import {
  documentFromText,
  isNoteMediaSize,
  isSafeNoteLink,
  noteHtml,
  noteAttachments,
  noteMarkdown,
  notePlainText,
  noteSchemaVersion,
  noteTableColumnWidths,
  parseNote,
  parseNoteDocument,
  parseNoteDraft,
  validateNoteAttachment,
} from './notes';
import { NoteDraft, NoteNode } from '../models/notes.models';

const draft = (): NoteDraft => ({
  id: '12345678-1234-1234-1234-123456789012',
  title: 'Ghi chú',
  document: documentFromText('Dòng một\nDòng hai'),
});
const attachmentId = 'a2345678-1234-1234-1234-123456789012';
const picture: NoteNode = {
  type: 'image',
  attrs: { attachmentId, fileName: 'mẫu <ảnh>.png', mimeType: 'image/png', alt: 'Mẫu' },
};
const cell = (
  type: 'tableHeader' | 'tableCell',
  value = '',
  attrs?: NoteNode['attrs'],
): NoteNode => ({
  type,
  content: documentFromText(value).content,
  attrs,
});
describe('Notes content boundaries and transfer', () => {
  it('preserves paragraph breaks and derives a title only on final save', () => {
    const input = { ...draft(), title: '' };
    expect(notePlainText(parseNoteDraft(input).document)).toBe('Dòng một\nDòng hai');
    expect(parseNoteDraft(input).title).toBe('Dòng một');
    expect(parseNoteDraft(input, true).title).toBe('');
    expect(() => parseNoteDraft({ ...input, document: documentFromText('') })).toThrow(
      'empty_note',
    );
  });
  it('roundtrips all supported formatting and strips editor-only link attributes', () => {
    const document: NoteNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'important',
              marks: [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'underline' },
                { type: 'highlight' },
                { type: 'link', attrs: { href: 'https://example.com', target: '_blank' } },
              ],
            },
            { type: 'hardBreak', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'next line' },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'step' }] }],
            },
          ],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
            },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }],
        },
      ],
    };
    const note = parseNote({
      ...draft(),
      document,
      schemaVersion: 1,
      revision: 1,
      createdAt: '2026-10-14T10:00:00.000Z',
      updatedAt: '2026-10-14T10:00:00.000Z',
    });
    expect(noteMarkdown(note)).toContain('## Heading');
    expect(noteMarkdown(note)).toContain('3. step');
    expect(noteMarkdown(note)).toContain('- [x] done');
    expect(noteMarkdown(note)).toContain('> quoted');
    expect(noteHtml(note)).toContain('<mark>');
    expect(noteHtml(note)).not.toContain('target=');
    expect(parseNote(note)).toEqual(note);
  });
  it('escapes pasted text in HTML and Markdown without treating it as markup', () => {
    const input = {
      ...draft(),
      title: '<script>',
      document: documentFromText('<img src=x onerror=alert(1)> **text**'),
    };
    expect(noteHtml(input)).toContain('&lt;img');
    expect(noteHtml(input)).not.toContain('<script>');
    expect(noteMarkdown(input)).toContain('\\*\\*text\\*\\*');
  });
  it('rejects unsupported nodes, attributes, unsafe URLs and invalid nesting', () => {
    const invalid = [
      { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.com' } }] },
      { type: 'doc', content: [{ type: 'text', text: 'unwrapped' }] },
      { type: 'doc', content: [{ type: 'heading', attrs: { level: 4 } }] },
      { type: 'doc', content: [{ type: 'paragraph', attrs: { onclick: 'alert(1)' } }] },
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      },
    ];
    for (const value of invalid) expect(() => parseNoteDocument(value)).toThrow();
    for (const url of [
      'javascript:alert(1)',
      '//example.com',
      'https://example.com\n',
      'data:text/html,hi',
    ])
      expect(isSafeNoteLink(url)).toBe(false);
    expect(isSafeNoteLink('mailto:hello@example.com')).toBe(true);
  });
  it('rejects oversized or incompatible saved documents without silently downgrading them', () => {
    expect(() => parseNoteDocument(documentFromText('x'.repeat(256 * 1024)))).toThrow(
      'note_too_large',
    );
    expect(() =>
      parseNote({
        ...draft(),
        schemaVersion: 2,
        revision: 1,
        createdAt: '2026-10-14',
        updatedAt: '2026-10-14',
      }),
    ).toThrow();
    expect(() => parseNoteDraft({ ...draft(), owner: 'another-user' })).toThrow();
    expect(() =>
      parseNoteDraft({ ...draft(), source: { path: '//evil.com', label: 'Source' } }),
    ).toThrow();
  });
  it('saves and searches notes containing only a table or attachment', () => {
    const input = parseNoteDraft({
      ...draft(),
      title: '',
      document: { type: 'doc', content: [picture] },
    });
    expect(input.title).toBe('mẫu <ảnh>.png');
    expect(notePlainText(input.document)).toBe(input.title);
    expect(noteAttachments(input.document)).toEqual([
      { attachmentId, fileName: input.title, mimeType: 'image/png' },
    ]);
    expect(noteSchemaVersion(input.document)).toBe(2);
    expect(noteHtml(input)).toContain('<p>Ảnh · mẫu &lt;ảnh&gt;.png</p>');
    expect(noteHtml(input)).not.toContain(attachmentId);
    expect(noteMarkdown(input)).toContain('Ảnh · mẫu \\<ảnh\\>.png');
    const emptyTable: NoteNode = {
      type: 'table',
      content: [{ type: 'tableRow', content: [cell('tableCell')] }],
    };
    expect(
      parseNoteDraft({ ...input, title: '', document: { type: 'doc', content: [emptyTable] } })
        .title,
    ).toBe('Bảng');
  });
  it('exports simple tables as GFM, including pipes and line breaks', () => {
    const document = parseNoteDocument({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [cell('tableHeader', 'Cột A'), cell('tableHeader', 'Cột B')],
            },
            {
              type: 'tableRow',
              content: [cell('tableCell', 'x | y'), cell('tableCell', 'một\nhai')],
            },
          ],
        },
      ],
    });
    expect(notePlainText(document)).toBe('Cột A\tCột B\nx | y\tmột\nhai');
    expect(noteMarkdown({ ...draft(), document })).toContain(
      '| Cột A | Cột B |\n| --- | --- |\n| x \\| y | một<br>hai |',
    );
  });
  it('roundtrips merged and resized tables and preserves their structure in HTML', () => {
    const table: NoteNode = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [cell('tableHeader', 'A', { colspan: 2, rowspan: 2, colwidth: [180, 230] })],
        },
        { type: 'tableRow' },
      ],
    };
    const note = parseNote({
      ...draft(),
      document: { type: 'doc', content: [table] },
      schemaVersion: 2,
      revision: 1,
      createdAt: '2026-10-14',
      updatedAt: '2026-10-14',
    });
    expect(parseNote(note)).toEqual(note);
    expect(noteTableColumnWidths(table)).toEqual([180, 230]);
    expect(noteHtml(note)).toContain(
      '<th colspan="2" rowspan="2" colwidth="180,230"><p>A</p></th>',
    );
    expect(noteMarkdown(note)).toContain(
      '<colgroup><col style="width:180px"><col style="width:230px"></colgroup>',
    );
    const invalidRow = { type: 'tableRow', content: [cell('tableCell', 'Overlaps')] };
    expect(() =>
      parseNoteDocument({
        type: 'doc',
        content: [{ ...table, content: [table.content?.[0], invalidRow] }],
      }),
    ).toThrow('invalid_note');
  });
  it('rejects invalid attachment metadata, nesting and table cell attributes', () => {
    const invalid: unknown[] = [
      { ...picture, attrs: { ...picture.attrs, mimeType: 'video/webm' } },
      { ...picture, attrs: { ...picture.attrs, fileName: 'a\nb' } },
      { ...picture, attrs: { ...picture.attrs, src: 'blob:attached' } },
      { type: 'blockquote', content: [picture] },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableCell', 'A', { colwidth: [200, 200] })] },
        ],
      },
    ];
    for (const node of invalid) {
      expect(() => parseNoteDocument({ type: 'doc', content: [node] })).toThrow('invalid_note');
    }
  });
  it('validates file signatures and the strict decimal size limit', async () => {
    expect(isNoteMediaSize(0)).toBe(false);
    expect(isNoteMediaSize(49_999_999)).toBe(true);
    expect(isNoteMediaSize(50_000_000)).toBe(false);
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: 'image/png',
    });
    const mp4 = new Blob([new Uint8Array([0, 0, 0, 16]), 'ftypisom', new Uint8Array(4)], {
      type: 'video/mp4',
    });
    await expect(validateNoteAttachment(png, 'image')).resolves.toBeUndefined();
    await expect(validateNoteAttachment(mp4, 'video')).resolves.toBeUndefined();
    await expect(validateNoteAttachment(png, 'video')).rejects.toThrow('invalid_note_media_type');
    await expect(
      validateNoteAttachment(new Blob(['<svg>'], { type: 'image/png' }), 'image'),
    ).rejects.toThrow('invalid_note_media_type');
    await expect(validateNoteAttachment(new Blob([]), 'image')).rejects.toThrow(
      'invalid_note_media_size',
    );
  });
});
