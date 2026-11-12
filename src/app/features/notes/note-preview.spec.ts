import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { NotePreview } from './note-preview';
import { NoteNode } from '../../core/models/notes.models';
import { NotesRepository } from '../../core/persistence/notes.repository';

afterEach(() => vi.unstubAllGlobals());

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

  it('renders table headers, merged cells and saved column widths', async () => {
    TestBed.configureTestingModule({ imports: [NotePreview] });
    const fixture = TestBed.createComponent(NotePreview);
    fixture.componentRef.setInput('document', {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colspan: 2, rowspan: 1, colwidth: [140, 100] },
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Tiêu đề chung' }] },
                  ],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    } satisfies NoteNode);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('th')?.colSpan).toBe(2);
    expect(root.querySelector('th')?.textContent).toBe('Tiêu đề chung');
    expect(root.querySelector('tbody')?.rows.length).toBe(2);
    expect(Array.from(root.querySelectorAll('col')).map((col) => col.style.width)).toEqual([
      '140px',
      '100px',
    ]);
  });

  it('downloads video on request and releases its URL on note change', async () => {
    const readAttachment = vi.fn().mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }));
    const createObjectURL = vi.fn().mockReturnValue('blob:video-preview');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
    TestBed.configureTestingModule({
      imports: [NotePreview],
      providers: [
        { provide: AuthService, useValue: { user: signal(null) } },
        { provide: NotesRepository, useValue: { owner: () => 'guest', readAttachment } },
      ],
    });
    const fixture = TestBed.createComponent(NotePreview);
    fixture.componentRef.setInput('noteId', 'first-note');
    fixture.componentRef.setInput('document', {
      type: 'doc',
      content: [
        {
          type: 'video',
          attrs: {
            attachmentId: 'b6e5e6fb-ad6f-4460-8440-c6a4e0410a9c',
            fileName: 'bai-hoc.mp4',
            mimeType: 'video/mp4',
          },
        },
      ],
    } satisfies NoteNode);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(readAttachment).not.toHaveBeenCalled();
    expect(root.querySelector('button')?.textContent?.trim()).toBe('Xem video');
    root.querySelector('button')?.click();
    await fixture.whenStable();
    expect(readAttachment).toHaveBeenCalledOnce();
    expect(root.querySelector('video')?.src).toBe('blob:video-preview');
    expect(root.querySelector('video')?.controls).toBe(true);
    fixture.componentRef.setInput('noteId', 'second-note');
    await fixture.whenStable();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:video-preview');
    expect(root.querySelector('video')).toBeNull();
    expect(readAttachment).toHaveBeenCalledOnce();
  });
});
