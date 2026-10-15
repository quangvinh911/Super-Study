import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { DBSchema, openDB } from 'idb';
import { AuthService, AccountApiError } from '../auth/auth.service';
import { parseNote, parseNoteDraft } from '../domain/notes';
import { Note, NoteDraft, NoteConflictError } from '../models/notes.models';

interface NotesDatabase extends DBSchema {
  notes: { key: string; value: Note };
}
@Injectable({ providedIn: 'root' })
export class NotesRepository {
  private readonly auth = inject(AuthService);
  readonly revision = signal(0);
  private epoch = 0;
  constructor() {
    const detach = this.auth.registerBeforeChange(async () => {
      this.epoch++;
      this.revision.update((value) => value + 1);
    });
    inject(DestroyRef).onDestroy(detach);
  }
  owner(): string {
    return this.auth.user() ? `user:${this.auth.user()?.id}` : 'guest';
  }
  private assertOwner(owner: string, epoch: number): void {
    if (this.owner() !== owner || this.epoch !== epoch)
      throw new AccountApiError('account_changed', 409);
  }
  private open() {
    return openDB<NotesDatabase>('certificate-notes', 1, {
      upgrade: (db) => db.createObjectStore('notes', { keyPath: 'id' }),
    });
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
  ): Promise<Note> {
    const epoch = this.epoch;
    this.assertOwner(owner, epoch);
    const draft = parseNoteDraft(input);
    if (owner !== 'guest') {
      const saved = parseNote(await this.call('saveNote', [draft, expectedRevision]));
      this.assertOwner(owner, epoch);
      this.revision.update((value) => value + 1);
      return saved;
    }
    const db = await this.open();
    try {
      this.assertOwner(owner, epoch);
      const tx = db.transaction('notes', 'readwrite');
      const current = await tx.store.get(draft.id);
      if (this.owner() !== owner || this.epoch !== epoch) {
        tx.abort();
        // Abort rejects tx.done; the actionable error is the ownership change below.
        await tx.done.catch(() => undefined);
        this.assertOwner(owner, epoch);
      }
      if ((current?.revision ?? null) !== expectedRevision) {
        await tx.done;
        throw new NoteConflictError();
      }
      const now = new Date().toISOString();
      const saved: Note = {
        ...draft,
        schemaVersion: 1,
        revision: (current?.revision ?? 0) + 1,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      await tx.store.put(saved);
      await tx.done;
      this.assertOwner(owner, epoch);
      this.revision.update((value) => value + 1);
      return saved;
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
        const tx = db.transaction('notes', 'readwrite');
        const current = await tx.store.get(id);
        if (this.owner() !== owner || this.epoch !== epoch) {
          tx.abort();
          // Abort rejects tx.done; the actionable error is the ownership change below.
          await tx.done.catch(() => undefined);
          this.assertOwner(owner, epoch);
        }
        if (current && current.revision !== expectedRevision) {
          await tx.done;
          throw new NoteConflictError();
        }
        await tx.store.delete(id);
        await tx.done;
      } finally {
        db.close();
      }
    }
    this.assertOwner(owner, epoch);
    this.revision.update((value) => value + 1);
  }
}
