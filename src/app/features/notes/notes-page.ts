import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotesRepository } from '../../core/persistence/notes.repository';
import { NotesDialogService } from './notes-dialog.service';
import { Note } from '../../core/models/notes.models';
import { notePlainText } from '../../core/domain/notes';
import { AuthService } from '../../core/auth/auth.service';
import { CERTIFICATES } from '../../certificates/registry';
import { copyNote, exportNote } from './notes-transfer';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
@Component({
  selector: 'app-notes-page',
  imports: [FormsModule, DatePipe],
  templateUrl: './notes-page.html',
  styleUrl: './notes-page.scss',
})
export class NotesPage {
  protected readonly dialogs = inject(NotesDialogService);
  protected readonly auth = inject(AuthService);
  private readonly repository = inject(NotesRepository);
  protected readonly notes = signal<Note[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly actionError = signal('');
  protected readonly query = signal('');
  protected readonly certificateId = signal('');
  protected readonly certificates = CERTIFICATES;
  protected readonly pendingDelete = signal<Note | null>(null);
  protected readonly removing = signal(false);
  private requestId = 0;
  private deleteOwner = '';
  protected readonly visible = computed(() => {
    const query = normalize(this.query());
    const certificate = this.certificateId();
    return this.notes().filter(
      (note) =>
        (!certificate || note.source?.certificateId === certificate) &&
        normalize(note.title + ' ' + notePlainText(note.document)).includes(query),
    );
  });
  constructor() {
    effect(() => {
      this.repository.revision();
      this.auth.user();
      void this.load();
    });
  }
  protected async load(): Promise<void> {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set('');
    this.notes.set([]);
    this.pendingDelete.set(null);
    try {
      const notes = await this.repository.list();
      if (id === this.requestId) this.notes.set(notes);
    } catch {
      if (id === this.requestId)
        this.error.set('Không thể tải Notes. Hãy kiểm tra kết nối và thử lại.');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }
  protected preview(note: Note): string {
    return notePlainText(note.document).slice(0, 260);
  }
  protected certificateName(note: Note): string {
    return CERTIFICATES.find((c) => c.id === note.source?.certificateId)?.name ?? 'Ghi chú riêng';
  }
  protected async copy(note: Note): Promise<void> {
    try {
      const format = await copyNote(note);
      this.dialogs.showNotice(
        format === 'rich' ? 'Đã copy nội dung có định dạng' : 'Đã copy dạng văn bản',
      );
    } catch {
      this.actionError.set('Trình duyệt không cho phép copy. Mở ghi chú để chọn và copy nội dung.');
    }
  }
  protected export(note: Note): void {
    try {
      exportNote(note);
    } catch {
      this.actionError.set('Không thể xuất Markdown. Hãy thử lại trong trình duyệt.');
    }
  }
  protected requestRemove(note: Note): void {
    this.deleteOwner = this.repository.owner();
    this.pendingDelete.set(note);
    this.actionError.set('');
  }
  protected async remove(): Promise<void> {
    const note = this.pendingDelete();
    if (!note || this.removing()) return;
    this.removing.set(true);
    try {
      await this.repository.remove(note.id, note.revision, this.deleteOwner);
      this.pendingDelete.set(null);
      this.dialogs.showNotice('Đã xóa ghi chú');
    } catch {
      this.actionError.set('Không thể xóa. Ghi chú có thể vừa được sửa; hãy tải lại và thử lại.');
    } finally {
      this.removing.set(false);
    }
  }
}
