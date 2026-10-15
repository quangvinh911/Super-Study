import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AccountApiError } from '../../core/auth/auth.service';
import { NotesRepository } from '../../core/persistence/notes.repository';
import { documentFromText, parseNoteDocument, parseNoteDraft } from '../../core/domain/notes';
import { Note, NoteEditorDraft, NoteNode, NoteSource } from '../../core/models/notes.models';
import { CanDeactivateFn } from '@angular/router';

const contentKey = (title: string, document: NoteNode) => JSON.stringify({ title, document });
@Injectable({ providedIn: 'root' })
export class NotesDialogService {
  readonly repository = inject(NotesRepository);
  private readonly auth = inject(AuthService);
  readonly draft = signal<NoteEditorDraft | null>(null);
  readonly recovery = signal<NoteEditorDraft | null>(null);
  readonly storageWarning = signal('');
  readonly notice = signal('');
  readonly saving = signal(false);
  readonly dirty = computed(() => {
    const draft = this.draft();
    return !!draft && contentKey(draft.note.title, draft.note.document) !== draft.initialContent;
  });
  private pendingSave?: Promise<Note>;
  private previousFocus: HTMLElement | null = null;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  constructor() {
    const removeHook = this.auth.registerBeforeChange(async () => {
      if (this.pendingSave) {
        try {
          await this.pendingSave;
        } catch {
          /* The account-bound recovery draft remains available after a failed save. */
        }
      }
      this.persist();
      this.draft.set(null);
      this.recovery.set(null);
    });
    inject(DestroyRef).onDestroy(() => {
      removeHook();
      clearTimeout(this.noticeTimer);
    });
  }
  open(note?: Note, source?: NoteSource, selectedText: string | NoteNode = ''): void {
    if (this.draft()) return;
    if (this.recovery()) {
      if (!window.confirm('Bạn có bản nháp chưa khôi phục. Bỏ bản nháp đó và mở ghi chú này?'))
        return;
      this.discardRecovery();
    }
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const title = note?.title ?? '';
    let noteDocument: NoteNode;
    try {
      noteDocument = parseNoteDocument(
        note?.document ??
          (typeof selectedText === 'string' ? documentFromText(selectedText) : selectedText),
      );
    } catch {
      this.showNotice('Đoạn văn quá lớn hoặc có định dạng chưa hỗ trợ. Hãy chọn đoạn ngắn hơn.');
      return;
    }
    const noteSource = note?.source ?? source;
    this.draft.set({
      owner: this.repository.owner(),
      note: {
        id: note?.id ?? crypto.randomUUID(),
        title,
        document: noteDocument,
        ...(noteSource ? { source: noteSource } : {}),
      },
      expectedRevision: note?.revision ?? null,
      initialContent: contentKey(title, note ? noteDocument : documentFromText('')),
    });
    this.storageWarning.set('');
    this.persist();
  }
  update(title: string, value: unknown): void {
    const current = this.draft();
    if (!current || this.saving()) return;
    const document = parseNoteDocument(value);
    this.draft.set({ ...current, note: { ...current.note, title, document } });
    this.persist();
  }
  private storageKey(owner: string): string {
    return `certificate-notes-draft:${owner}`;
  }
  persist(): void {
    const draft = this.draft();
    if (!draft) return;
    try {
      if (this.dirty()) sessionStorage.setItem(this.storageKey(draft.owner), JSON.stringify(draft));
      else sessionStorage.removeItem(this.storageKey(draft.owner));
      this.storageWarning.set('');
    } catch {
      this.storageWarning.set(
        'Không thể bảo vệ bản nháp trong tab này. Hãy lưu hoặc copy nội dung trước khi tải lại.',
      );
    }
  }
  recover(): void {
    const owner = this.repository.owner();
    try {
      const stored = sessionStorage.getItem(this.storageKey(owner));
      if (!stored) return;
      const raw: unknown = JSON.parse(stored);
      if (
        !raw ||
        typeof raw !== 'object' ||
        !('owner' in raw) ||
        raw.owner !== owner ||
        !('note' in raw) ||
        !('expectedRevision' in raw) ||
        !('initialContent' in raw) ||
        typeof raw.initialContent !== 'string' ||
        raw.initialContent.length > 300 * 1024
      )
        throw new Error('invalid_draft');
      const expected = raw.expectedRevision;
      if (
        expected !== null &&
        (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 1)
      )
        throw new Error('invalid_draft');
      this.recovery.set({
        owner,
        note: parseNoteDraft(raw.note, true),
        expectedRevision: expected,
        initialContent: raw.initialContent,
      });
    } catch {
      this.storageWarning.set(
        'Không thể khôi phục bản nháp. Dữ liệu Notes đã lưu vẫn được giữ nguyên.',
      );
    }
  }
  restore(): void {
    const recovered = this.recovery();
    if (!recovered || recovered.owner !== this.repository.owner() || this.draft()) return;
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.draft.set(recovered);
    this.recovery.set(null);
  }
  discardRecovery(): void {
    const draft = this.recovery();
    if (draft) this.removeRecovery(draft.owner);
    this.recovery.set(null);
  }
  private removeRecovery(owner: string): void {
    try {
      sessionStorage.removeItem(this.storageKey(owner));
    } catch {
      this.storageWarning.set('Không thể xóa bản nháp tạm trong tab này.');
    }
  }
  close(): void {
    const draft = this.draft();
    if (draft) this.removeRecovery(draft.owner);
    this.draft.set(null);
    // Let Angular remove the modal before focusing a control in the page below it.
    requestAnimationFrame(() => this.restoreFocus());
  }
  restoreFocus(): void {
    const target =
      this.previousFocus?.isConnected && this.previousFocus !== document.body
        ? this.previousFocus
        : document.getElementById('main-content');
    target?.focus();
  }
  save(asNew = false): Promise<Note> {
    if (this.pendingSave) return this.pendingSave;
    let draft = this.draft();
    if (!draft || draft.owner !== this.repository.owner())
      return Promise.reject(new AccountApiError('account_changed', 409));
    if (asNew) {
      draft = {
        ...draft,
        note: { ...draft.note, id: crypto.randomUUID() },
        expectedRevision: null,
        initialContent: contentKey('', documentFromText('')),
      };
      this.draft.set(draft);
      this.persist();
    }
    this.saving.set(true);
    const owner = draft.owner;
    const request = this.repository.save(draft.note, draft.expectedRevision, owner);
    this.pendingSave = request;
    return request
      .then((note) => {
        if (this.draft()?.owner === owner) {
          this.close();
          this.showNotice('Đã lưu ghi chú');
        }
        return note;
      })
      .finally(() => {
        this.pendingSave = undefined;
        this.saving.set(false);
      });
  }
  async loadLatest(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    const note = await this.repository.get(draft.note.id);
    if (this.draft() !== draft || this.repository.owner() !== draft.owner)
      throw new AccountApiError('account_changed', 409);
    if (!note) throw new Error('note_deleted');
    this.draft.set({
      ...draft,
      note,
      expectedRevision: note.revision,
      initialContent: contentKey(note.title, note.document),
    });
    this.removeRecovery(draft.owner);
  }
  confirmLeave(): boolean {
    if (this.saving()) return false;
    if (this.dirty() && !window.confirm('Ghi chú có thay đổi chưa lưu. Bỏ thay đổi và rời trang?'))
      return false;
    if (this.draft()) this.close();
    return true;
  }
  showNotice(message: string): void {
    clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 4000);
  }
}
export const notesLeaveGuard: CanDeactivateFn<unknown> = () =>
  inject(NotesDialogService).confirmLeave();
