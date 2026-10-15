import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { AccountApiError, AccountUser, AuthService } from '../auth/auth.service';
import { NotesRepository } from './notes.repository';
import { documentFromText } from '../domain/notes';
import { Note, NoteConflictError } from '../models/notes.models';

function setup() {
  const user = signal<AccountUser | null>(null);
  const hooks: (() => Promise<void>)[] = [];
  const request = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          user,
          request,
          registerBeforeChange: (hook: () => Promise<void>) => {
            hooks.push(hook);
            return () => {};
          },
        },
      },
    ],
  });
  return { repository: TestBed.inject(NotesRepository), user, request, hooks };
}
const account: AccountUser = {
  id: 'learner-a',
  username: 'A',
  email: null,
  role: 'user',
  deletedAt: null,
  createdAt: '2026-10-14',
  updatedAt: '2026-10-14',
};
const input = () => ({
  id: crypto.randomUUID(),
  title: 'Ghi chú',
  document: documentFromText('Nội dung'),
  source: { certificateId: 'ctfl', path: '/certificates/ctfl/practice', label: 'CTFL' },
});
afterEach(async () => {
  TestBed.resetTestingModule();
  await deleteDB('certificate-notes');
});
describe('Global Notes repository', () => {
  it('keeps guest CRUD after reload and detects stale updates/deletions', async () => {
    const { repository } = setup();
    const saved = await repository.save(input(), null);
    expect(await repository.get(saved.id)).toEqual(saved);
    const next = await repository.save(
      { ...input(), id: saved.id, title: 'Updated' },
      saved.revision,
    );
    await expect(
      repository.save({ ...input(), id: saved.id }, saved.revision),
    ).rejects.toBeInstanceOf(NoteConflictError);
    await expect(repository.remove(saved.id, saved.revision)).rejects.toBeInstanceOf(
      NoteConflictError,
    );
    TestBed.resetTestingModule();
    const reloaded = setup().repository;
    expect(await reloaded.list()).toEqual([next]);
    await reloaded.remove(next.id, next.revision);
    expect(await reloaded.list()).toEqual([]);
  });
  it('uses the global account endpoint and never falls back to guest on failure', async () => {
    const { repository, user, request } = setup();
    const guest = await repository.save(input(), null);
    user.set(account);
    request.mockRejectedValue(new AccountApiError('invalid_session', 401));
    await expect(repository.save(input(), null)).rejects.toThrow();
    expect(request).toHaveBeenCalledWith('/api/notes', expect.objectContaining({ method: 'POST' }));
    request.mockResolvedValue([]);
    expect(await repository.list()).toEqual([]);
    user.set(null);
    expect(await repository.list()).toEqual([guest]);
  });
  it('rejects delayed account responses and writes bound to a different owner', async () => {
    const { repository, user, request, hooks } = setup();
    user.set(account);
    let resolve: ((value: unknown) => void) | undefined;
    request.mockReturnValue(
      new Promise<unknown>((done) => {
        resolve = done;
      }),
    );
    const pending = repository.list();
    const result = expect(pending).rejects.toThrow('account_changed');
    await hooks[0]();
    user.set({ ...account, id: 'learner-b' });
    resolve?.([]);
    await result;
    await expect(repository.save(input(), null, 'user:learner-a')).rejects.toThrow(
      'account_changed',
    );
  });
  it('validates account data and reports edit conflicts', async () => {
    const { repository, user, request } = setup();
    user.set(account);
    request.mockResolvedValue([{ invalid: true }]);
    await expect(repository.list()).rejects.toThrow('invalid_note');
    request.mockRejectedValue(new AccountApiError('note_conflict', 409));
    await expect(repository.save(input(), null)).rejects.toBeInstanceOf(NoteConflictError);
  });
});
