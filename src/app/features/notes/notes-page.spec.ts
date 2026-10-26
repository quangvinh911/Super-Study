import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { NotesPage } from './notes-page';
import { NotesRepository } from '../../core/persistence/notes.repository';
import { NotesDialogService } from './notes-dialog.service';
import { AccountUser, AuthService } from '../../core/auth/auth.service';
import { documentFromText } from '../../core/domain/notes';
import { Note } from '../../core/models/notes.models';

const makeNote = (title: string, certificateId: string, body = title): Note => ({
  id: crypto.randomUUID(),
  schemaVersion: 1,
  revision: 1,
  title,
  document: documentFromText(body),
  source: {
    certificateId,
    path: '/certificates/' + certificateId + '/practice',
    label: certificateId.toUpperCase(),
  },
  updatedAt: '2026-10-14T10:00:00Z',
  createdAt: '2026-10-14T10:00:00Z',
});

function element<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const result = root.querySelector<T>(selector);
  if (!result) throw new Error('Missing element: ' + selector);
  return result;
}

function setup(notes: Note[]) {
  const user = signal<AccountUser | null>(null);
  const revision = signal(0);
  const list = vi.fn<() => Promise<Note[]>>().mockResolvedValue(notes);
  const remove = vi.fn<() => Promise<void>>().mockResolvedValue();
  const open = vi.fn();
  const showNotice = vi.fn();
  const owner = () => (user() ? 'user:' + user()?.id : 'guest');
  TestBed.configureTestingModule({
    imports: [NotesPage],
    providers: [
      { provide: NotesRepository, useValue: { list, remove, revision, owner } },
      { provide: AuthService, useValue: { user } },
      { provide: NotesDialogService, useValue: { open, showNotice } },
    ],
  });
  const fixture = TestBed.createComponent(NotesPage);
  const root: HTMLElement = fixture.nativeElement;
  return { fixture, root, list, remove, open, showNotice, user, revision };
}

async function search(fixture: ComponentFixture<NotesPage>, query: string) {
  const control = element<HTMLInputElement>(fixture.nativeElement, 'input[type=search]');
  control.value = query;
  control.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}

describe('Global Notes page', () => {
  it('browses notes from both certificates and combines source and accent-insensitive filters', async () => {
    const toeic = makeNote('Ghi chú ngữ pháp', 'toeic', 'Các thì tiếng Anh');
    const ctfl = makeNote('Các mức kiểm thử', 'ctfl');
    const { fixture, root } = setup([toeic, ctfl]);
    await fixture.whenStable();
    expect(root.querySelectorAll('.note-row')).toHaveLength(2);
    expect(root.textContent).toContain('Dùng chung mọi chứng chỉ');

    await search(fixture, 'ngu phap');
    expect(root.querySelectorAll('.note-row')).toHaveLength(1);
    expect(element(root, '.note-reading__heading h2').textContent).toContain(toeic.title);

    await search(fixture, '');
    const source = element<HTMLSelectElement>(root, '.certificate-filter select');
    source.value = 'ctfl';
    source.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(root.querySelectorAll('.note-row')).toHaveLength(1);
    expect(element(root, '.note-reading__heading h2').textContent).toContain(ctfl.title);
    expect(root.querySelector('app-note-preview')?.textContent).not.toContain('Các thì tiếng Anh');
  });

  it('opens a read-only detail and returns to the list without opening the editor', async () => {
    const notes = [makeNote('Bài một', 'toeic'), makeNote('Bài hai', 'ctfl')];
    const { fixture, root, open } = setup(notes);
    await fixture.whenStable();

    root.querySelectorAll<HTMLButtonElement>('.note-row')[1].click();
    await fixture.whenStable();
    expect(element(root, '.notes-workspace').classList).toContain('notes-workspace--detail');
    expect(element(root, '.note-reading__heading h2').textContent).toContain('Bài hai');
    expect(open).not.toHaveBeenCalled();

    element<HTMLButtonElement>(root, '.note-actions > button').click();
    expect(open).toHaveBeenCalledExactlyOnceWith(notes[1]);
    element<HTMLButtonElement>(root, '.detail-back').click();
    await fixture.whenStable();
    expect(element(root, '.notes-workspace').classList).not.toContain('notes-workspace--detail');
  });

  it('clears the selected detail when a filter excludes all notes', async () => {
    const { fixture, root } = setup([makeNote('Ngữ pháp', 'toeic')]);
    await fixture.whenStable();
    element<HTMLButtonElement>(root, '.note-row').click();
    await fixture.whenStable();

    await search(fixture, 'khong ton tai');
    expect(root.querySelector('.note-reading')).toBeNull();
    expect(root.querySelector('app-note-preview')).toBeNull();
    expect(element(root, '.notes-workspace').classList).not.toContain('notes-workspace--detail');
    expect(root.textContent).toContain('Không tìm thấy ghi chú phù hợp.');
  });

  it('refreshes the selected note after a save and removes its preview while reloading', async () => {
    const note = makeNote('Cấu trúc câu', 'toeic', 'Nội dung cũ');
    const { fixture, root, revision, list } = setup([note]);
    await fixture.whenStable();
    element<HTMLButtonElement>(root, '.note-row').click();
    await fixture.whenStable();

    let finishLoad: ((notes: Note[]) => void) | undefined;
    list.mockImplementationOnce(
      () =>
        new Promise<Note[]>((resolve) => {
          finishLoad = resolve;
        }),
    );
    revision.update((value) => value + 1);
    fixture.detectChanges();
    expect(root.querySelector('app-note-preview')).toBeNull();

    if (!finishLoad) throw new Error('Expected a pending refresh');
    finishLoad([{ ...note, revision: 2, document: documentFromText('Nội dung mới') }]);
    await Promise.resolve();
    await fixture.whenStable();
    expect(root.querySelector('app-note-preview')?.textContent).toContain('Nội dung mới');
    expect(root.querySelector('app-note-preview')?.textContent).not.toContain('Nội dung cũ');
    expect(element(root, '.notes-workspace').classList).toContain('notes-workspace--detail');
  });

  it('deletes only the confirmed note revision and returns to the remaining notes', async () => {
    const notes = [makeNote('Xóa ghi chú này', 'toeic'), makeNote('Giữ ghi chú này', 'ctfl')];
    const { fixture, root, remove } = setup(notes);
    await fixture.whenStable();
    element<HTMLButtonElement>(root, '.note-row').click();
    await fixture.whenStable();
    element<HTMLButtonElement>(root, '.delete-action').click();
    await fixture.whenStable();
    expect(remove).not.toHaveBeenCalled();
    element<HTMLButtonElement>(root, '.delete-confirm .delete-button').click();
    await fixture.whenStable();

    expect(remove).toHaveBeenCalledExactlyOnceWith(notes[0].id, notes[0].revision, 'guest');
    expect(root.querySelectorAll('.note-row')).toHaveLength(1);
    expect(element(root, '.note-reading__heading h2').textContent).toContain(notes[1].title);
    expect(root.querySelector('app-note-preview')?.textContent).not.toContain(notes[0].title);
    expect(element(root, '.notes-workspace').classList).not.toContain('notes-workspace--detail');
  });

  it('does not reveal the previous owner’s pending load after switching account', async () => {
    const guest = makeNote('Ghi chú của khách', 'toeic');
    const account = makeNote('Ghi chú tài khoản', 'ctfl');
    const { fixture, root, user, list } = setup([guest]);
    let finishGuestLoad: ((notes: Note[]) => void) | undefined;
    list.mockImplementationOnce(
      () =>
        new Promise<Note[]>((resolve) => {
          finishGuestLoad = resolve;
        }),
    );
    fixture.detectChanges();

    list.mockResolvedValue([account]);
    user.set({
      id: 'new-owner',
      username: 'learner',
      email: null,
      role: 'user',
      deletedAt: null,
      createdAt: '2026-10-14T10:00:00Z',
      updatedAt: '2026-10-14T10:00:00Z',
    });
    await fixture.whenStable();
    expect(element(root, '.note-reading__heading h2').textContent).toContain(account.title);
    if (!finishGuestLoad) throw new Error('Expected a pending guest load');
    finishGuestLoad([guest]);
    await Promise.resolve();
    await fixture.whenStable();

    expect(root.textContent).not.toContain(guest.title);
    expect(root.querySelector('app-note-preview')?.textContent).toContain(account.title);
    expect(element(root, '.notes-workspace').classList).not.toContain('notes-workspace--detail');
  });
});
