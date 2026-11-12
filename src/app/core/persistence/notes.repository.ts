import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { DBSchema, IDBPTransaction, openDB } from 'idb';
import { AuthService, AccountApiError } from '../auth/auth.service';
import {
  isNoteAttachmentId,
  isNoteMediaSize,
  isNoteMediaType,
  noteAttachmentFileName,
  noteAttachments,
  validateNoteAttachment,
} from '../domain/note-media';
import { noteSchemaVersion, parseNote, parseNoteDraft } from '../domain/notes';
import {
  Note,
  NoteAttachment,
  NoteConflictError,
  NoteDraft,
  NoteMediaKind,
} from '../models/notes.models';

interface SavedAttachment {
  attachmentId: string;
  file: Blob;
}
interface DraftAttachment extends SavedAttachment {
  owner: string;
  draftId: string;
  stagedAt: number;
}

interface NotesDatabase extends DBSchema {
  notes: { key: string; value: Note };
  attachments: { key: string; value: SavedAttachment };
  draftAttachments: {
    key: [string, string, string];
    value: DraftAttachment;
    indexes: { byDraft: [string, string]; byOwnerAndAge: [string, number] };
  };
}
const guestStores = ['notes', 'attachments', 'draftAttachments'] as const;
const mediaRequestTimeoutMs = 5 * 60_000;
// Private media bypasses Angular's worker, which cannot forward the staged upload body reliably.
const bypassServiceWorker = { 'ngsw-bypass': 'true' };
const staleDraftAttachmentAgeMs = 7 * 24 * 60 * 60_000;
const draftCleanupBatchSize = 100;
type GuestNoteTransaction = IDBPTransaction<NotesDatabase, typeof guestStores, 'readwrite'>;

export class NoteAttachmentUnavailableError extends Error {
  constructor(readonly fileName: string) {
    super('note_media_unavailable');
  }
}

function checkAttachmentFile(file: Blob | undefined, attachment: NoteAttachment): Blob {
  if (!file || file.type !== attachment.mimeType || !isNoteMediaSize(file.size))
    throw new NoteAttachmentUnavailableError(attachment.fileName);
  return file;
}

async function unusedAttachments(
  tx: GuestNoteTransaction,
  current: Note | undefined,
  retained: readonly NoteAttachment[],
): Promise<string[]> {
  if (!current) return [];
  const kept = new Set(retained.map(({ attachmentId }) => attachmentId));
  const removed = noteAttachments(current.document).filter(
    ({ attachmentId }) => !kept.has(attachmentId),
  );
  if (!removed.length) return [];
  // Save-as-new can share the same immutable file with the original note.
  for (const note of await tx.objectStore('notes').getAll()) {
    if (note.id === current.id) continue;
    for (const { attachmentId } of noteAttachments(note.document)) kept.add(attachmentId);
  }
  return removed
    .filter(({ attachmentId }) => !kept.has(attachmentId))
    .map(({ attachmentId }) => attachmentId);
}

@Injectable({ providedIn: 'root' })
export class NotesRepository {
  private readonly auth = inject(AuthService);
  readonly revision = signal(0);
  private epoch = 0;
  private transfers = new AbortController();
  constructor() {
    const detach = this.auth.registerBeforeChange(async () => {
      this.epoch++;
      this.transfers.abort();
      this.transfers = new AbortController();
      this.revision.update((value) => value + 1);
    });
    inject(DestroyRef).onDestroy(() => {
      detach();
      this.transfers.abort();
    });
  }
  owner(): string {
    return this.auth.user() ? `user:${this.auth.user()?.id}` : 'guest';
  }
  private assertOwner(owner: string, epoch: number): void {
    if (this.owner() !== owner || this.epoch !== epoch)
      throw new AccountApiError('account_changed', 409);
  }
  private open() {
    return openDB<NotesDatabase>('certificate-notes', 2, {
      upgrade: (db, oldVersion) => {
        if (oldVersion === 0) db.createObjectStore('notes', { keyPath: 'id' });
        db.createObjectStore('attachments', { keyPath: 'attachmentId' });
        const drafts = db.createObjectStore('draftAttachments', {
          keyPath: ['owner', 'draftId', 'attachmentId'],
        });
        drafts.createIndex('byDraft', ['owner', 'draftId']);
        drafts.createIndex('byOwnerAndAge', ['owner', 'stagedAt']);
      },
    });
  }
  async stageAttachment(
    file: File,
    kind: NoteMediaKind,
    owner: string,
    draftId: string,
  ): Promise<NoteAttachment> {
    const epoch = this.epoch;
    this.assertOwner(owner, epoch);
    await validateNoteAttachment(file, kind);
    const mimeType = file.type;
    if (!isNoteMediaType(mimeType)) throw new Error('invalid_note_media_type');
    const attachmentId = crypto.randomUUID();
    const db = await this.open();
    try {
      this.assertOwner(owner, epoch);
      const tx = db.transaction('draftAttachments', 'readwrite');
      try {
        const stagedAt = Date.now();
        const cutoff = stagedAt - staleDraftAttachmentAgeMs;
        // Closed tabs cannot release their draft files. Sweep a bounded batch without reading blobs.
        const expired = await tx.store
          .index('byOwnerAndAge')
          .getAllKeys(
            IDBKeyRange.bound([owner, 0], [owner, cutoff], false, true),
            draftCleanupBatchSize,
          );
        this.assertOwner(owner, epoch);
        await Promise.all([
          ...expired
            .filter(([, expiredDraftId]) => expiredDraftId !== draftId)
            .map((key) => tx.store.delete(key)),
          tx.store.add({
            owner,
            draftId,
            attachmentId,
            stagedAt,
            file: file.slice(0, file.size, mimeType),
          }),
          tx.done,
        ]);
      } catch (error) {
        await tx.done.catch(() => undefined);
        throw error;
      }
      if (this.owner() !== owner || this.epoch !== epoch) {
        await db.delete('draftAttachments', [owner, draftId, attachmentId]);
        this.assertOwner(owner, epoch);
      }
      return { attachmentId, fileName: noteAttachmentFileName(file.name), mimeType };
    } finally {
      db.close();
    }
  }
  async discardStagedAttachment(
    owner: string,
    draftId: string,
    attachmentId: string,
  ): Promise<void> {
    const db = await this.open();
    try {
      await db.delete('draftAttachments', [owner, draftId, attachmentId]);
    } finally {
      db.close();
    }
  }
  async discardDraftAttachments(owner: string, draftId: string): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction('draftAttachments', 'readwrite');
      try {
        const keys = await tx.store.index('byDraft').getAllKeys([owner, draftId]);
        await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done]);
      } catch (error) {
        await tx.done.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }
  private async readDraftAttachment(owner: string, draftId: string, attachmentId: string) {
    const db = await this.open();
    try {
      return (await db.get('draftAttachments', [owner, draftId, attachmentId]))?.file;
    } finally {
      db.close();
    }
  }
  async readAttachment(
    attachment: NoteAttachment,
    options: { draftId?: string; signal?: AbortSignal } = {},
  ): Promise<Blob> {
    const owner = this.owner(),
      epoch = this.epoch;
    const { attachmentId } = attachment;
    if (!isNoteAttachmentId(attachmentId)) throw new Error('note_media_unavailable');
    const signal = options.signal
      ? AbortSignal.any([options.signal, this.transfers.signal])
      : this.transfers.signal;
    signal.throwIfAborted();
    let file = options.draftId
      ? await this.readDraftAttachment(owner, options.draftId, attachmentId)
      : undefined;
    this.assertOwner(owner, epoch);
    signal.throwIfAborted();
    if (!file && owner === 'guest') {
      const db = await this.open();
      try {
        file = (await db.get('attachments', attachmentId))?.file;
      } finally {
        db.close();
      }
    } else if (!file) {
      file = await this.auth.requestBlob(
        `/api/notes/media/${attachmentId}`,
        { headers: bypassServiceWorker, signal },
        mediaRequestTimeoutMs,
      );
    }
    this.assertOwner(owner, epoch);
    signal.throwIfAborted();
    return checkAttachmentFile(file, attachment);
  }
  private async uploadDraftAttachments(
    attachments: readonly NoteAttachment[],
    owner: string,
    draftId: string,
    epoch: number,
  ): Promise<void> {
    const signal = this.transfers.signal;
    for (const attachment of attachments) {
      const { attachmentId, mimeType } = attachment;
      const staged = await this.readDraftAttachment(owner, draftId, attachmentId);
      this.assertOwner(owner, epoch);
      if (!staged) continue; // The server checks whether the existing account file can be reused.
      const file = checkAttachmentFile(staged, attachment);
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      this.assertOwner(owner, epoch);
      const uploaded = await this.auth.request(
        `/api/notes/media/${attachmentId}`,
        {
          method: 'PUT',
          body: file,
          headers: {
            ...bypassServiceWorker,
            'Content-Type': mimeType,
            'X-Note-Media-Sha256': checksum,
          },
          signal,
        },
        mediaRequestTimeoutMs,
      );
      if (
        !uploaded ||
        typeof uploaded !== 'object' ||
        !('attachmentId' in uploaded) ||
        uploaded.attachmentId !== attachmentId ||
        !('mimeType' in uploaded) ||
        uploaded.mimeType !== mimeType ||
        !('size' in uploaded) ||
        uploaded.size !== file.size
      )
        throw new Error('note_media_unavailable');
    }
  }
  private async call(action: string, args: readonly unknown[]): Promise<unknown> {
    try {
      return await this.auth.request('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ action, args }),
      });
    } catch (error) {
      if (
        error instanceof AccountApiError &&
        ['note_conflict', 'concurrent_notes_change'].includes(error.code)
      )
        throw new NoteConflictError();
      throw error;
    }
  }
  async list(): Promise<Note[]> {
    const owner = this.owner(),
      epoch = this.epoch;
    let values: unknown;
    if (owner !== 'guest') values = await this.call('listNotes', []);
    else {
      const db = await this.open();
      try {
        values = await db.getAll('notes');
      } finally {
        db.close();
      }
    }
    this.assertOwner(owner, epoch);
    if (!Array.isArray(values)) throw new Error('invalid_note');
    return values
      .map((value: unknown) => parseNote(value))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string): Promise<Note | null> {
    const owner = this.owner(),
      epoch = this.epoch;
    let value: unknown;
    if (owner !== 'guest') value = await this.call('getNote', [id]);
    else {
      const db = await this.open();
      try {
        value = await db.get('notes', id);
      } finally {
        db.close();
      }
    }
    this.assertOwner(owner, epoch);
    return value == null ? null : parseNote(value);
  }
  async save(
    input: NoteDraft,
    expectedRevision: number | null,
    owner = this.owner(),
    draftId?: string,
  ): Promise<Note> {
    const epoch = this.epoch;
    this.assertOwner(owner, epoch);
    const draft = parseNoteDraft(input);
    const attachments = noteAttachments(draft.document);
    if (owner !== 'guest') {
      if (draftId && attachments.length)
        await this.uploadDraftAttachments(attachments, owner, draftId, epoch);
      this.assertOwner(owner, epoch);
      let saved: Note;
      try {
        saved = parseNote(await this.call('saveNote', [draft, expectedRevision]));
      } catch (error) {
        if (error instanceof AccountApiError && error.code === 'note_media_not_found') {
          const missing = attachments.find(
            ({ attachmentId }) => attachmentId === error.attachmentId,
          );
          if (missing) throw new NoteAttachmentUnavailableError(missing.fileName);
        }
        throw error;
      }
      this.assertOwner(owner, epoch);
      this.revision.update((value) => value + 1);
      return saved;
    }
    const db = await this.open();
    try {
      this.assertOwner(owner, epoch);
      const tx = db.transaction(guestStores, 'readwrite');
      const notes = tx.objectStore('notes');
      const files = tx.objectStore('attachments');
      const draftFiles = tx.objectStore('draftAttachments');
      try {
        const current = await notes.get(draft.id);
        if ((current?.revision ?? null) !== expectedRevision) throw new NoteConflictError();
        const added: SavedAttachment[] = [];
        for (const attachment of attachments) {
          const { attachmentId } = attachment;
          const existing = await files.get(attachmentId);
          if (existing) checkAttachmentFile(existing.file, attachment);
          else {
            const staged = draftId
              ? await draftFiles.get([owner, draftId, attachmentId])
              : undefined;
            added.push({ attachmentId, file: checkAttachmentFile(staged?.file, attachment) });
          }
        }
        const removed = await unusedAttachments(tx, current, attachments);
        this.assertOwner(owner, epoch);
        const now = new Date().toISOString();
        const saved: Note = {
          ...draft,
          schemaVersion: noteSchemaVersion(draft.document),
          revision: (current?.revision ?? 0) + 1,
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        };
        await Promise.all([
          ...(draftId
            ? added.map(({ attachmentId }) => draftFiles.delete([owner, draftId, attachmentId]))
            : []),
          notes.put(saved),
          ...added.map((attachment) => files.add(attachment)),
          ...removed.map((id) => files.delete(id)),
          tx.done,
        ]);
        this.assertOwner(owner, epoch);
        this.revision.update((value) => value + 1);
        return saved;
      } catch (error) {
        // Validation fails before any writes. Failed IndexedDB requests abort their transaction.
        await tx.done.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }
  async remove(id: string, expectedRevision: number, owner = this.owner()): Promise<void> {
    const epoch = this.epoch;
    this.assertOwner(owner, epoch);
    if (owner !== 'guest') await this.call('removeNote', [id, expectedRevision]);
    else {
      const db = await this.open();
      try {
        this.assertOwner(owner, epoch);
        const tx = db.transaction(guestStores, 'readwrite');
        const notes = tx.objectStore('notes');
        const files = tx.objectStore('attachments');
        try {
          const current = await notes.get(id);
          if (current && current.revision !== expectedRevision) throw new NoteConflictError();
          const removed = await unusedAttachments(tx, current, []);
          this.assertOwner(owner, epoch);
          await Promise.all([
            notes.delete(id),
            ...removed.map((key) => files.delete(key)),
            tx.done,
          ]);
        } catch (error) {
          await tx.done.catch(() => undefined);
          throw error;
        }
      } finally {
        db.close();
      }
    }
    this.assertOwner(owner, epoch);
    this.revision.update((value) => value + 1);
  }
}
