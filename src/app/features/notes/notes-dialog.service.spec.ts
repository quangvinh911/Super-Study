import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotesDialogService } from './notes-dialog.service';
import { NotesRepository } from '../../core/persistence/notes.repository';
import { AuthService } from '../../core/auth/auth.service';
import { Note, NoteConflictError } from '../../core/models/notes.models';
import { documentFromText } from '../../core/domain/notes';

function setup(owner = 'guest') {
  const save = vi.fn();
  const hook = vi.fn();
  const repository = { owner: () => owner, save, get: vi.fn(), revision: signal(0) };
  TestBed.configureTestingModule({
    providers: [
      { provide: NotesRepository, useValue: repository },
      {
        provide: AuthService,
        useValue: {
          registerBeforeChange: (callback: () => Promise<void>) => {
            hook.mockImplementation(callback);
            return () => {};
          },
        },
      },
    ],
  });
  return { service: TestBed.inject(NotesDialogService), repository, save, hook };
}
afterEach(() => {
  TestBed.resetTestingModule();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
describe('Notes draft lifecycle', () => {
  it('retains the new note ID when retrying a failed save-as-new', async () => {
    const { service, save } = setup();
    service.open();
    service.update('New copy', documentFromText('Keep this copy'));
    save.mockRejectedValue(new Error('offline'));
    await expect(service.save(true)).rejects.toThrow('offline');
    const firstId = save.mock.calls[0][0].id;
    await expect(service.save()).rejects.toThrow('offline');
    expect(save.mock.calls[1][0].id).toBe(firstId);
    expect(save.mock.calls[1][1]).toBeNull();
    expect(service.dirty()).toBe(true);
  });
  it('restores a dirty draft only for its original owner after reload', () => {
    const { service } = setup('user:a');
    service.open();
    service.update('Nháp', documentFromText('Giữ lại'));
    TestBed.resetTestingModule();
    const other = setup('user:b').service;
    other.recover();
    expect(other.recovery()).toBeNull();
    TestBed.resetTestingModule();
    const original = setup('user:a').service;
    original.recover();
    original.restore();
    expect(original.draft()?.note.title).toBe('Nháp');
    expect(original.dirty()).toBe(true);
    original.close();
    expect(sessionStorage.getItem('certificate-notes-draft:user:a')).toBeNull();
  });
  it('keeps the draft after save conflict and discards it only after successful save', async () => {
    const { service, save } = setup();
    service.open();
    service.update('Nháp', documentFromText('Nội dung'));
    save.mockRejectedValue(new NoteConflictError());
    await expect(service.save()).rejects.toBeInstanceOf(NoteConflictError);
    expect(service.dirty()).toBe(true);
    expect(service.draft()).not.toBeNull();
    const draft = service.draft();
    if (!draft) throw new Error('Missing draft');
    save.mockResolvedValue({
      ...draft.note,
      schemaVersion: 1,
      revision: 1,
      createdAt: '2026-10-14',
      updatedAt: '2026-10-14',
    } satisfies Note);
    await service.save();
    expect(service.draft()).toBeNull();
    expect(sessionStorage.getItem('certificate-notes-draft:guest')).toBeNull();
  });
  it('guards navigation and snapshots selected text before it can disappear', () => {
    const { service } = setup();
    service.open(undefined, undefined, 'Đoạn gốc\nDòng tiếp');
    expect(service.dirty()).toBe(true);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(service.confirmLeave()).toBe(false);
    expect(service.draft()).not.toBeNull();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(service.confirmLeave()).toBe(true);
    expect(service.draft()).toBeNull();
  });
  it('preserves recovery data before account reload and clears visible editor state', async () => {
    const { service, hook } = setup('user:a');
    service.open();
    service.update('Nháp', documentFromText('Nội dung'));
    await hook();
    expect(service.draft()).toBeNull();
    expect(sessionStorage.getItem('certificate-notes-draft:user:a')).not.toBeNull();
  });
});
