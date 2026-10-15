import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { NotesPage } from './notes-page';
import { NotesRepository } from '../../core/persistence/notes.repository';
import { NotesDialogService } from './notes-dialog.service';
import { AuthService } from '../../core/auth/auth.service';
import { documentFromText } from '../../core/domain/notes';

describe('Global Notes page', () => {
  it('shows notes from both certificates and supports accent-insensitive search', async () => {
    const list = vi.fn().mockResolvedValue([
      {
        id: crypto.randomUUID(),
        schemaVersion: 1,
        revision: 1,
        title: 'Ghi chú ngữ pháp',
        document: documentFromText('Các thì tiếng Anh'),
        source: { certificateId: 'toeic', path: '/certificates/toeic/grammar', label: 'TOEIC' },
        updatedAt: '2026-10-14T10:00:00Z',
        createdAt: '2026-10-14T10:00:00Z',
      },
      {
        id: crypto.randomUUID(),
        schemaVersion: 1,
        revision: 1,
        title: 'Các mức kiểm thử',
        document: documentFromText('CTFL'),
        source: { certificateId: 'ctfl', path: '/certificates/ctfl/practice', label: 'CTFL' },
        updatedAt: '2026-10-14T09:00:00Z',
        createdAt: '2026-10-14T09:00:00Z',
      },
    ]);
    TestBed.configureTestingModule({
      imports: [NotesPage],
      providers: [
        { provide: NotesRepository, useValue: { list, revision: signal(0) } },
        { provide: AuthService, useValue: { user: signal(null) } },
        { provide: NotesDialogService, useValue: { open: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(NotesPage);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.note-card')).toHaveLength(2);
    const search = root.querySelector<HTMLInputElement>('input[type=search]');
    if (!search) throw new Error('Missing search');
    search.value = 'ngu phap';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(root.querySelectorAll('.note-card')).toHaveLength(1);
    expect(root.textContent).toContain('Ghi chú ngữ pháp');
  });
});
