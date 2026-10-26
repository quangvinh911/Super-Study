import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NotePreview } from './note-preview';
import { NoteNode } from '../../core/models/notes.models';

describe('Note rich preview', () => {
  it('preserves formatted text, lists, checklists, quotations and grammar roles', async () => {
    const document: NoteNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Cấu trúc câu' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Ghi nhớ',
              marks: [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'underline' },
                { type: 'highlight' },
                { type: 'link', attrs: { href: 'https://example.com/lesson' } },
              ],
            },
            { type: 'hardBreak' },
            {
              type: 'grammarToken',
              attrs: { role: 'S' },
              content: [{ type: 'text', text: 'The manager' }],
            },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bước ba' }] }],
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Một điểm cần nhớ' }] },
              ],
            },
          ],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Đã ôn' }] }],
            },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ví dụ từ bài học' }] }],
        },
      ],
    };
    TestBed.configureTestingModule({ imports: [NotePreview] });
    const fixture = TestBed.createComponent(NotePreview);
    fixture.componentRef.setInput('document', document);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('h2')?.textContent).toContain('Cấu trúc câu');
    expect(root.querySelector('strong em u mark a')?.textContent).toBe('Ghi nhớ');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com/lesson');
    expect(root.querySelector('br')).not.toBeNull();
    expect(root.querySelector('[data-note-grammar-role="S"]')?.textContent).toContain('Chủ ngữ');
    expect(root.querySelector('[data-note-grammar-role="S"]')?.textContent).toContain(
      'The manager',
    );
    expect(root.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(root.querySelector('ul:not(.task-list) li')?.textContent).toContain('Một điểm cần nhớ');
    const checkbox = root.querySelector<HTMLInputElement>('.task-item input');
    expect(checkbox?.checked).toBe(true);
    expect(checkbox?.disabled).toBe(true);
    expect(root.querySelector('blockquote')?.textContent).toContain('Ví dụ từ bài học');
  });

  it('renders markup as text and refuses unsafe link protocols', async () => {
    TestBed.configureTestingModule({ imports: [NotePreview] });
    const fixture = TestBed.createComponent(NotePreview);
    fixture.componentRef.setInput('document', {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '<img src=x onerror=alert(1)>',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    } satisfies NoteNode);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('p')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('a')).toBeNull();
  });
});
