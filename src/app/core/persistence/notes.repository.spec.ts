import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB, openDB } from 'idb';
import { AccountApiError, AccountUser, AuthService } from '../auth/auth.service';
import { NoteAttachmentUnavailableError, NotesRepository } from './notes.repository';
import { documentFromText } from '../domain/notes';
import { Note, NoteAttachment, NoteConflictError, NoteDraft } from '../models/notes.models';

function setup() {
  const user = signal<AccountUser | null>(null);
  const hooks: (() => Promise<void>)[] = [];
  const request = vi.fn();
  const requestBlob = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          user,
          request,
          requestBlob,
          registerBeforeChange: (hook: () => Promise<void>) => {
            hooks.push(hook);
            return () => {};
          },
        },
      },
    ],
  });
  return { repository: TestBed.inject(NotesRepository), user, request, requestBlob, hooks };
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
const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngFile(): File {
  return new File([pngSignature], 'Ảnh.png', { type: 'image/png' });
}
function mediaDraft(...attachments: NoteAttachment[]): NoteDraft {
  return {
    ...input(),
    document: {
      type: 'doc',
      content: attachments.map((attachment) => ({ type: 'image', attrs: { ...attachment } })),
    },
  };
}
const nativeClone = globalThis.structuredClone;
beforeEach(() => {
  // jsdom Blob instances do not survive the host clone used by fake-indexeddb.
  vi.stubGlobal('structuredClone', <T>(value: T): T => {
    if (value && typeof value === 'object' && 'file' in value && value.file instanceof Blob) {
      const { file, ...metadata } = value;
      return { ...nativeClone(metadata), file: file.slice(0, file.size, file.type) } as T;
    }
    return nativeClone(value);
  });
});
afterEach(async () => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  it('keeps version 1 notes when upgrading guest storage for attachments', async () => {
    const legacy: Note = {
      ...input(),
      schemaVersion: 1,
      revision: 4,
      createdAt: '2026-10-04',
      updatedAt: '2026-10-14',
    };
    const oldDb = await openDB('certificate-notes', 1, {
      upgrade: (db) => db.createObjectStore('notes', { keyPath: 'id' }),
    });
    await oldDb.put('notes', legacy);
    oldDb.close();
    expect(await setup().repository.get(legacy.id)).toEqual(legacy);
  });
  it('persists a guest attachment with its note and retains it until the last reference is removed', async () => {
    const { repository } = setup();
    const draftId = crypto.randomUUID();
    const attachment = await repository.stageAttachment(pngFile(), 'image', 'guest', draftId);
    expect(await repository.readAttachment(attachment, { draftId })).toMatchObject({
      type: 'image/png',
    });
    await expect(
      repository.readAttachment(attachment, { draftId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(NoteAttachmentUnavailableError);
    const saved = await repository.save(mediaDraft(attachment), null, 'guest', draftId);
    expect(saved.schemaVersion).toBe(2);
    await repository.discardDraftAttachments('guest', draftId);
    TestBed.resetTestingModule();
    const reloaded = setup().repository;
    expect(await reloaded.get(saved.id)).toEqual(saved);
    expect(new Uint8Array(await (await reloaded.readAttachment(attachment)).arrayBuffer())).toEqual(
      pngSignature,
    );
    const copy = await reloaded.save(mediaDraft(attachment), null);
    await reloaded.remove(saved.id, saved.revision);
    expect(await reloaded.readAttachment(attachment)).toMatchObject({ type: 'image/png' });
    await reloaded.save({ ...input(), id: copy.id }, copy.revision);
    await expect(reloaded.readAttachment(attachment)).rejects.toMatchObject({
      fileName: attachment.fileName,
    });
  });
  it('fails atomically when a guest attachment is missing and identifies the missing file', async () => {
    const { repository } = setup();
    const draftId = crypto.randomUUID();
    const attachment = await repository.stageAttachment(pngFile(), 'image', 'guest', draftId);
    const missing = { ...attachment, attachmentId: crypto.randomUUID(), fileName: 'missing.png' };
    const draft = mediaDraft(attachment, missing);
    await expect(repository.save(draft, null, 'guest', draftId)).rejects.toMatchObject({
      fileName: 'missing.png',
    });
    expect(await repository.get(draft.id)).toBeNull();
    await expect(repository.readAttachment(attachment)).rejects.toBeInstanceOf(
      NoteAttachmentUnavailableError,
    );
    expect(await repository.readAttachment(attachment, { draftId })).toMatchObject({
      type: 'image/png',
    });
  });
  it('keeps account attachments in their owner and draft across a failed save and retry', async () => {
    const { repository, user, request, requestBlob } = setup();
    const digest = vi.fn(async () => new ArrayBuffer(32));
    vi.stubGlobal('crypto', { randomUUID: crypto.randomUUID.bind(crypto), subtle: { digest } });
    user.set(account);
    const owner = repository.owner();
    const draftId = crypto.randomUUID();
    const attachment = await repository.stageAttachment(pngFile(), 'image', owner, draftId);
    const draft = mediaDraft(attachment);
    const saved: Note = {
      ...draft,
      schemaVersion: 2,
      revision: 1,
      createdAt: '2026-10-04',
      updatedAt: '2026-10-04',
    };
    const uploaded = {
      attachmentId: attachment.attachmentId,
      mimeType: attachment.mimeType,
      size: pngSignature.length,
    };
    request.mockResolvedValueOnce(uploaded).mockRejectedValueOnce(new Error('offline'));
    await expect(repository.save(draft, null, owner, draftId)).rejects.toThrow('offline');
    expect(await repository.readAttachment(attachment, { draftId })).toMatchObject({
      type: 'image/png',
    });
    request.mockResolvedValueOnce(uploaded).mockResolvedValueOnce(saved);
    await expect(repository.save(draft, null, owner, draftId)).resolves.toEqual(saved);
    const uploads = request.mock.calls.filter(([, init]) => init.method === 'PUT');
    expect(uploads).toHaveLength(2);
    expect(uploads[0][0]).toBe(`/api/notes/media/${attachment.attachmentId}`);
    expect(uploads[1][0]).toBe(uploads[0][0]);
    expect(uploads[1][1].headers).toEqual(uploads[0][1].headers);
    expect(uploads[1][1].headers).toMatchObject({
      'ngsw-bypass': 'true',
      'Content-Type': 'image/png',
      'X-Note-Media-Sha256': '0'.repeat(64),
    });
    user.set({ ...account, id: 'learner-b' });
    requestBlob.mockRejectedValue(new AccountApiError('note_media_not_found', 404));
    await expect(repository.readAttachment(attachment, { draftId })).rejects.toThrow(
      'note_media_not_found',
    );
    expect(requestBlob).toHaveBeenCalledExactlyOnceWith(
      `/api/notes/media/${attachment.attachmentId}`,
      expect.objectContaining({ headers: { 'ngsw-bypass': 'true' } }),
      expect.any(Number),
    );
  });
  it('names the missing account attachment using the attachment ID reported by the API', async () => {
    const { repository, user, request } = setup();
    user.set(account);
    const first = {
      attachmentId: crypto.randomUUID(),
      fileName: 'available.png',
      mimeType: 'image/png',
    } as const;
    const second = { ...first, attachmentId: crypto.randomUUID(), fileName: 'missing.png' };
    request.mockRejectedValue(
      new AccountApiError('note_media_not_found', 400, second.attachmentId),
    );
    await expect(repository.save(mediaDraft(first, second), null)).rejects.toMatchObject({
      fileName: 'missing.png',
    });
  });
  it('cancels an in-flight upload before changing accounts and retains the owner’s draft', async () => {
    const { repository, user, request, hooks } = setup();
    vi.stubGlobal('crypto', {
      randomUUID: crypto.randomUUID.bind(crypto),
      subtle: { digest: async () => new ArrayBuffer(32) },
    });
    user.set(account);
    const owner = repository.owner();
    const draftId = crypto.randomUUID();
    const attachment = await repository.stageAttachment(pngFile(), 'image', owner, draftId);
    let signalUploadStarted: (() => void) | undefined;
    const uploadStarted = new Promise<void>((resolve) => {
      signalUploadStarted = resolve;
    });
    request.mockImplementation((_path: string, init: RequestInit) => {
      const signal = init.signal;
      if (!signal) throw new Error('Missing upload signal');
      signalUploadStarted?.();
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const pending = repository.save(mediaDraft(attachment), null, owner, draftId);
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await uploadStarted;
    await hooks[0]();
    await cancelled;
    expect(request).toHaveBeenCalledOnce();
    expect(await repository.readAttachment(attachment, { draftId })).toMatchObject({
      type: 'image/png',
    });
  });
  it('cleans abandoned staging for this owner without deleting files from the current draft', async () => {
    const { repository, user } = setup();
    const now = Date.now();
    const time = vi.spyOn(Date, 'now').mockReturnValue(now - 8 * 24 * 60 * 60_000);
    const draftId = crypto.randomUUID();
    const abandonedId = crypto.randomUUID();
    const active = await repository.stageAttachment(pngFile(), 'image', 'guest', draftId);
    const abandoned = await repository.stageAttachment(pngFile(), 'image', 'guest', abandonedId);
    user.set(account);
    const otherOwner = repository.owner();
    const other = await repository.stageAttachment(pngFile(), 'image', otherOwner, abandonedId);
    time.mockReturnValue(now);
    user.set(null);
    await repository.stageAttachment(pngFile(), 'image', 'guest', draftId);
    expect(await repository.readAttachment(active, { draftId })).toMatchObject({
      type: 'image/png',
    });
    await expect(
      repository.readAttachment(abandoned, { draftId: abandonedId }),
    ).rejects.toBeInstanceOf(NoteAttachmentUnavailableError);
    user.set(account);
    expect(await repository.readAttachment(other, { draftId: abandonedId })).toMatchObject({
      type: 'image/png',
    });
  });
});
