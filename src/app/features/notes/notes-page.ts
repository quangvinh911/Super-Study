import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotesRepository } from '../../core/persistence/notes.repository';
import { NotesDialogService } from './notes-dialog.service';
import { Note } from '../../core/models/notes.models';
import { notePlainText } from '../../core/domain/notes';
import { AuthService } from '../../core/auth/auth.service';
import { CERTIFICATES } from '../../certificates/registry';
import { copyNote, exportNote } from './notes-transfer';
import { NotePreview } from './note-preview';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
@Component({
  selector: 'app-notes-page',
  imports: [FormsModule, DatePipe, NotePreview],
  templateUrl: './notes-page.html',
  styleUrl: './notes-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesPage {
  protected readonly dialogs = inject(NotesDialogService);
  protected readonly auth = inject(AuthService);
  private readonly repository = inject(NotesRepository);
  private readonly injector = inject(Injector);
  private readonly selectedHeading = viewChild<ElementRef<HTMLHeadingElement>>('selectedHeading');
  private readonly listHeading = viewChild<ElementRef<HTMLHeadingElement>>('listHeading');
  protected readonly notes = signal<Note[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly actionError = signal('');
  protected readonly query = signal('');
  protected readonly certificateId = signal('');
  private readonly selectedId = signal<string | null>(null);
  private readonly openedDetailId = signal<string | null>(null);
  protected readonly certificates = CERTIFICATES;
  protected readonly pendingDelete = signal<Note | null>(null);
  protected readonly removing = signal(false);
  private requestId = 0;
  private deleteOwner = '';
  private loadedOwner = '';
  protected readonly visible = computed(() => {
    const query = normalize(this.query().trim());
    const certificate = this.certificateId();
    return this.notes().filter(
      (note) =>
        (!certificate || note.source?.certificateId === certificate) &&
        normalize(note.title + ' ' + notePlainText(note.document)).includes(query),
    );
  });
  protected readonly selected = computed(
    () => this.visible().find((note) => note.id === this.selectedId()) ?? this.visible()[0] ?? null,
  );
  protected readonly detailOpen = computed(
    () => this.selected() !== null && this.selected()?.id === this.openedDetailId(),
  );
  constructor() {
    effect(() => {
      this.repository.revision();
      this.auth.user();
      void this.load();
    });
  }
  protected async load(): Promise<void> {
    const id = ++this.requestId;
    const owner = this.repository.owner();
    if (this.loadedOwner !== owner) {
      this.loadedOwner = owner;
      this.selectedId.set(null);
      this.openedDetailId.set(null);
      this.query.set('');
      this.certificateId.set('');
      this.actionError.set('');
    }
    this.loading.set(true);
    this.error.set('');
    this.notes.set([]);
    this.pendingDelete.set(null);
    try {
      const notes = await this.repository.list();
      if (id === this.requestId && owner === this.repository.owner()) this.notes.set(notes);
    } catch {
      if (id === this.requestId)
        this.error.set('Không thể tải ghi chú. Hãy kiểm tra kết nối và thử lại.');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }
  protected select(note: Note): void {
    this.selectedId.set(note.id);
    this.openedDetailId.set(note.id);
    this.pendingDelete.set(null);
    this.actionError.set('');
    afterNextRender(() => this.selectedHeading()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }
  protected backToList(): void {
    this.openedDetailId.set(null);
    afterNextRender(() => this.listHeading()?.nativeElement.focus(), { injector: this.injector });
  }
  protected changeQuery(value: string): void {
    this.query.set(value);
    this.openedDetailId.set(null);
    this.pendingDelete.set(null);
  }
  protected changeCertificate(value: string): void {
    this.certificateId.set(value);
    this.openedDetailId.set(null);
    this.pendingDelete.set(null);
  }
  protected preview(note: Note): string {
    return notePlainText(note.document).replace(/\s+/g, ' ').slice(0, 140);
  }
  protected certificateName(note: Note): string {
    return CERTIFICATES.find((c) => c.id === note.source?.certificateId)?.name ?? 'Ghi chú riêng';
  }
  protected async copy(note: Note): Promise<void> {
    const owner = this.repository.owner();
    this.actionError.set('');
    try {
      const format = await copyNote(note);
      if (owner !== this.repository.owner()) return;
      this.dialogs.showNotice(
        format === 'rich' ? 'Đã sao chép nội dung có định dạng' : 'Đã sao chép dạng văn bản',
      );
    } catch {
      if (owner === this.repository.owner())
        this.actionError.set('Trình duyệt không cho phép sao chép. Hãy chọn và sao chép nội dung.');
    }
  }
  protected export(note: Note): void {
    this.actionError.set('');
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
    const owner = this.deleteOwner;
    this.removing.set(true);
    try {
      await this.repository.remove(note.id, note.revision, owner);
      if (owner !== this.repository.owner()) return;
      this.notes.update((notes) => notes.filter((item) => item.id !== note.id));
      if (this.selectedId() === note.id) this.selectedId.set(null);
      this.backToList();
      this.pendingDelete.set(null);
      this.dialogs.showNotice('Đã xóa ghi chú');
    } catch {
      if (owner === this.repository.owner())
        this.actionError.set('Không thể xóa. Ghi chú có thể vừa được sửa; hãy tải lại và thử lại.');
    } finally {
      this.removing.set(false);
    }
  }
}
