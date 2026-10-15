import { describe, expect, it } from 'vitest';
import {
  documentFromText,
  isSafeNoteLink,
  noteHtml,
  noteMarkdown,
  notePlainText,
  parseNote,
  parseNoteDocument,
  parseNoteDraft,
} from './notes';
import { NoteDraft, NoteNode } from '../models/notes.models';

const draft = (): NoteDraft => ({
  id: '12345678-1234-1234-1234-123456789012',
  title: 'Ghi chú',
  document: documentFromText('Dòng một\nDòng hai'),
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
});
