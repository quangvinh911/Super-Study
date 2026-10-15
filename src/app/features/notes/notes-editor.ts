import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Editor, JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { NoteConflictError, NoteNode } from '../../core/models/notes.models';
import { isSafeNoteLink, parseNoteDraft } from '../../core/domain/notes';
import { NotesDialogService } from './notes-dialog.service';
import { copyNote, exportNote } from './notes-transfer';
import { NotesGrammarToken } from './notes-grammar-token';
import { AuthService, AccountApiError } from '../../core/auth/auth.service';
import { LoginDialogService } from '../../core/auth/login-dialog.service';

function editorDocument(node: NoteNode): JSONContent {
  return {
    type: node.type,
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.content ? { content: node.content.map(editorDocument) } : {}),
    ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
    ...(node.marks
      ? {
          marks: node.marks.map((mark) => ({
            type: mark.type,
            ...(mark.attrs ? { attrs: { ...mark.attrs } } : {}),
          })),
        }
      : {}),
  };
}
@Component({
  selector: 'app-notes-editor',
  imports: [FormsModule],
  templateUrl: './notes-editor.html',
  styleUrl: './notes-editor.scss',
})
export class NotesEditor implements AfterViewInit, OnDestroy {
  protected readonly notes = inject(NotesDialogService);
  protected readonly auth = inject(AuthService);
  private readonly login = inject(LoginDialogService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly discardDialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('discardDialog');
  private readonly editorElement = viewChild.required<ElementRef<HTMLElement>>('editor');
  protected readonly error = signal('');
  protected readonly conflict = signal(false);
  protected readonly sessionExpired = signal(false);
  protected readonly linkOpen = signal(false);
  protected linkUrl = '';
  protected readonly version = signal(0);
  protected title = '';
  private editor?: Editor;
  private readonly available = signal(false);
  constructor() {
    effect(() => {
      const saving = this.notes.saving();
      this.available();
      // setEditable must not emit a content update or make the draft an effect dependency.
      untracked(() => this.editor?.setEditable(!saving, false));
    });
  }
  ngAfterViewInit(): void {
    const draft = this.notes.draft();
    if (!draft) return;
    this.title = draft.note.title;
    this.editor = new Editor({
      element: this.editorElement().nativeElement,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          code: false,
          codeBlock: false,
          strike: false,
          horizontalRule: false,
          link: { openOnClick: false, isAllowedUri: (url) => isSafeNoteLink(url) },
        }),
        Highlight,
        NotesGrammarToken,
        TaskList,
        TaskItem.configure({ nested: true }),
      ],
      content: editorDocument(draft.note.document),
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-label': 'Nội dung ghi chú',
          'aria-multiline': 'true',
          spellcheck: 'true',
        },
      },
      onUpdate: () => this.changed(),
      onSelectionUpdate: () => this.version.update((value) => value + 1),
    });
    this.available.set(true);
    this.dialog().nativeElement.showModal();
  }
  ngOnDestroy(): void {
    this.editor?.destroy();
    this.discardDialog().nativeElement.close();
    this.dialog().nativeElement.close();
    this.notes.restoreFocus();
  }
  protected changed(): void {
    if (!this.editor) return;
    try {
      this.notes.update(this.title, this.editor.getJSON());
      this.error.set('');
    } catch {
      this.error.set('Nội dung vượt giới hạn hoặc có định dạng chưa hỗ trợ. Hãy rút gọn để lưu.');
    }
    this.version.update((value) => value + 1);
  }
  protected isActive(name: string): boolean {
    this.version();
    return this.editor?.isActive(name) ?? false;
  }
  protected characters(): number {
    this.version();
    return this.editor?.getText().length ?? 0;
  }
  protected format(command: string): void {
    if (!this.editor || this.notes.saving()) return;
    const chain = this.editor.chain().focus();
    switch (command) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'highlight':
        chain.toggleHighlight().run();
        break;
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      case 'taskList':
        chain.toggleTaskList().run();
        break;
      case 'blockquote':
        chain.toggleBlockquote().run();
        break;
      case 'undo':
        chain.undo().run();
        break;
      case 'redo':
        chain.redo().run();
        break;
    }
    this.version.update((value) => value + 1);
  }
  protected block(value: string): void {
    if (value === 'paragraph') this.editor?.chain().focus().setParagraph().run();
    if (value === '1' || value === '2' || value === '3')
      this.editor
        ?.chain()
        .focus()
        .toggleHeading({ level: value === '1' ? 1 : value === '2' ? 2 : 3 })
        .run();
  }
  protected blockType(): string {
    this.version();
    for (const level of [1, 2, 3])
      if (this.editor?.isActive('heading', { level })) return String(level);
    return 'paragraph';
  }
  protected applyLink(): void {
    const url = this.linkUrl.trim();
    if (!url) this.editor?.chain().focus().unsetLink().run();
    else if (isSafeNoteLink(url))
      this.editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    else {
      this.error.set('Liên kết cần bắt đầu bằng https://, http:// hoặc mailto:.');
      return;
    }
    this.linkOpen.set(false);
    this.linkUrl = '';
    this.error.set('');
  }
  protected close(event?: Event): void {
    event?.preventDefault();
    if (this.notes.saving()) return;
    if (this.notes.dirty()) this.discardDialog().nativeElement.showModal();
    else this.notes.close();
  }
  protected continueEditing(event?: Event): void {
    event?.preventDefault();
    this.discardDialog().nativeElement.close();
  }
  protected discardChanges(): void {
    this.discardDialog().nativeElement.close();
    this.notes.close();
  }
  protected keyboard(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.save();
    }
  }
  protected async save(asNew = false): Promise<void> {
    if (!this.editor || this.notes.saving()) return;
    try {
      this.notes.update(this.title, this.editor.getJSON());
      parseNoteDraft(this.notes.draft()?.note);
      this.error.set('');
      this.sessionExpired.set(false);
      await this.notes.save(asNew);
    } catch (error) {
      this.conflict.set(error instanceof NoteConflictError);
      this.sessionExpired.set(error instanceof AccountApiError && error.status === 401);
      this.error.set(
        error instanceof NoteConflictError
          ? 'Ghi chú đã được sửa hoặc xóa ở nơi khác. Bản nháp của bạn vẫn được giữ.'
          : error instanceof Error && error.message === 'empty_note'
            ? 'Hãy thêm nội dung trước khi lưu.'
            : 'Không thể lưu ghi chú. Nội dung vẫn được giữ; hãy thử lại hoặc copy ra ngoài.',
      );
    }
  }
  protected async latest(): Promise<void> {
    if (!window.confirm('Tải bản mới sẽ thay thế nội dung bạn đang sửa. Tiếp tục?')) return;
    try {
      await this.notes.loadLatest();
      const draft = this.notes.draft();
      if (!draft) return;
      this.title = draft.note.title;
      this.editor?.commands.setContent(editorDocument(draft.note.document));
      this.error.set('');
      this.conflict.set(false);
    } catch {
      this.error.set('Không thể tải bản mới. Bạn có thể lưu bản nháp thành ghi chú mới.');
    }
  }
  protected reauthenticate(): void {
    this.notes.persist();
    this.login.open();
  }
  private transferDraft() {
    if (!this.editor) throw new Error('editor_unavailable');
    return parseNoteDraft({
      ...this.notes.draft()?.note,
      title: this.title,
      document: this.editor.getJSON(),
    });
  }
  protected async copy(): Promise<void> {
    try {
      const result = await copyNote(this.transferDraft());
      this.notes.showNotice(
        result === 'rich' ? 'Đã copy nội dung có định dạng' : 'Đã copy dạng văn bản',
      );
    } catch {
      this.error.set('Không thể copy tự động. Hãy chọn nội dung và dùng Ctrl/Cmd+C.');
    }
  }
  protected export(): void {
    try {
      exportNote(this.transferDraft());
    } catch {
      this.error.set('Hãy thêm nội dung hợp lệ trước khi xuất Markdown.');
    }
  }
}
