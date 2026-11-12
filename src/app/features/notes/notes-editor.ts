import {
  AfterViewInit,
  ApplicationRef,
  Component,
  ElementRef,
  EnvironmentInjector,
  OnDestroy,
  computed,
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
import { createTable } from '@tiptap/extension-table';
import { NodeSelection } from '@tiptap/pm/state';
import { isInTable, selectedRect } from '@tiptap/pm/tables';
import { NoteConflictError, NoteMediaKind, NoteNode } from '../../core/models/notes.models';
import {
  isSafeNoteLink,
  MAX_NOTE_COLUMN_WIDTH,
  MAX_NOTE_TABLE_CELLS,
  parseNoteDraft,
} from '../../core/domain/notes';
import { NotesDialogService } from './notes-dialog.service';
import { copyNote, exportNote } from './notes-transfer';
import { NotesGrammarToken } from './notes-grammar-token';
import { AuthService, AccountApiError } from '../../core/auth/auth.service';
import { LoginDialogService } from '../../core/auth/login-dialog.service';
import { NoteAttachmentUnavailableError } from '../../core/persistence/notes.repository';
import {
  fitsTableGrowth,
  insertNoteBlock,
  NOTE_COLUMN_MIN_WIDTH,
  NotesDocument,
  notesMediaExtensions,
  NotesTableExtensions,
  notesTableValidation,
  setNoteColumnWidth,
} from './notes-editor-extensions';

const tableActions = [
  { name: 'addRowBefore', label: 'Thêm hàng phía trên' },
  { name: 'addRowAfter', label: 'Thêm hàng phía dưới' },
  { name: 'addColumnBefore', label: 'Thêm cột bên trái' },
  { name: 'addColumnAfter', label: 'Thêm cột bên phải' },
  { name: 'deleteRow', label: 'Xóa hàng' },
  { name: 'deleteColumn', label: 'Xóa cột' },
  { name: 'toggleHeaderRow', label: 'Bật/tắt hàng tiêu đề' },
  { name: 'deleteTable', label: 'Xóa bảng' },
] as const;

type TableAction = (typeof tableActions)[number]['name'] | 'mergeCells' | 'splitCell';

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
  private readonly application = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly discardDialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('discardDialog');
  private readonly editorElement = viewChild.required<ElementRef<HTMLElement>>('editor');
  protected readonly error = signal('');
  protected readonly conflict = signal(false);
  protected readonly sessionExpired = signal(false);
  protected readonly linkOpen = signal(false);
  protected readonly tableOpen = signal(false);
  protected readonly attachmentKind = signal<NoteMediaKind | null>(null);
  protected readonly busy = computed(() => this.notes.saving() || this.notes.stagingAttachment());
  protected readonly tableActions = tableActions;
  protected readonly minColumnWidth = NOTE_COLUMN_MIN_WIDTH;
  protected readonly maxColumnWidth = MAX_NOTE_COLUMN_WIDTH;
  protected readonly maxTableCells = MAX_NOTE_TABLE_CELLS;
  protected linkUrl = '';
  protected imageAlt = '';
  protected readonly version = signal(0);
  protected title = '';
  private editor?: Editor;
  private readonly available = signal(false);
  constructor() {
    effect(() => {
      const busy = this.busy();
      this.available();
      // setEditable must not emit a content update or make the draft an effect dependency.
      untracked(() => this.editor?.setEditable(!busy, false));
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
          document: false,
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
        NotesDocument,
        ...NotesTableExtensions,
        notesTableValidation(() =>
          this.error.set('Bảng vượt giới hạn hoặc có định dạng chưa hỗ trợ.'),
        ),
        ...notesMediaExtensions(this.application, this.environmentInjector, draft.draftId),
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
    if (!this.editor || this.busy()) return;
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
    if (this.busy()) return;
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
    if (this.busy()) return;
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
  protected openAttachment(kind: NoteMediaKind): void {
    if (this.busy()) return;
    this.linkOpen.set(false);
    this.tableOpen.set(false);
    this.attachmentKind.set(this.attachmentKind() === kind ? null : kind);
    this.imageAlt = '';
  }
  protected async insertAttachment(input: HTMLInputElement, kind: NoteMediaKind): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    const editor = this.editor;
    const draft = this.notes.draft();
    if (!file || !editor || !draft || this.busy()) return;
    this.error.set('');
    try {
      const attachment = await this.notes.stageAttachment(file, kind);
      if (editor.isDestroyed || this.notes.draft()?.draftId !== draft.draftId) return;
      const alt = kind === 'image' ? this.imageAlt.trim() : '';
      const node = editor.schema.nodes[kind].create({ ...attachment, ...(alt ? { alt } : {}) });
      editor.chain().focus().command(insertNoteBlock(node)).run();
      this.attachmentKind.set(null);
      this.imageAlt = '';
    } catch (error) {
      if (editor.isDestroyed || this.notes.draft()?.draftId !== draft.draftId) return;
      const code = error instanceof Error ? error.message : '';
      this.error.set(
        code === 'invalid_note_media_size'
          ? 'Mỗi tệp phải có dữ liệu và nhỏ hơn 50 MB.'
          : code === 'invalid_note_media_type'
            ? 'Chọn ảnh JPEG, PNG, WebP, GIF hoặc video MP4, WebM.'
            : 'Không thể thêm tệp. Hãy kiểm tra dung lượng lưu trữ và thử lại.',
      );
    }
  }
  protected mediaSelected(): boolean {
    this.version();
    const selection = this.editor?.state.selection;
    return (
      selection instanceof NodeSelection && ['image', 'video'].includes(selection.node.type.name)
    );
  }
  protected removeMedia(): void {
    if (!this.busy() && this.mediaSelected()) this.editor?.chain().focus().deleteSelection().run();
  }
  protected toggleTableForm(): void {
    if (this.busy()) return;
    this.linkOpen.set(false);
    this.attachmentKind.set(null);
    this.tableOpen.set(!this.tableOpen());
  }
  protected insertTable(rows: number, columns: number, withHeaderRow: boolean): void {
    const editor = this.editor;
    if (!editor || this.busy()) return;
    if (
      !Number.isSafeInteger(rows) ||
      !Number.isSafeInteger(columns) ||
      rows < 1 ||
      columns < 1 ||
      rows * columns > this.maxTableCells
    ) {
      this.error.set('Nhập số hàng và số cột hợp lệ để tạo bảng.');
      return;
    }
    const previousDocument = editor.state.doc;
    const table = createTable(editor.schema, rows, columns, withHeaderRow);
    editor.chain().focus().command(insertNoteBlock(table)).run();
    if (editor.state.doc !== previousDocument) this.tableOpen.set(false);
  }
  protected inTable(): boolean {
    this.version();
    return !!this.editor && isInTable(this.editor.state);
  }
  protected canChangeTable(action: TableAction): boolean {
    const editor = this.editor;
    if (!editor || !this.inTable() || this.busy()) return false;
    if (
      (action === 'addRowBefore' || action === 'addRowAfter') &&
      !fitsTableGrowth(editor.state, 'row')
    )
      return false;
    if (
      (action === 'addColumnBefore' || action === 'addColumnAfter') &&
      !fitsTableGrowth(editor.state, 'column')
    )
      return false;
    return editor.can()[action]();
  }
  protected changeTable(action: TableAction): void {
    if (this.canChangeTable(action)) this.editor?.chain().focus()[action]().run();
  }
  protected applyTableAction(select: HTMLSelectElement): void {
    const action = this.tableActions.find(({ name }) => name === select.value);
    select.value = '';
    if (action) this.changeTable(action.name);
  }
  protected selectedColumnWidth(): number | '' {
    if (!this.editor || !this.inTable()) return '';
    const { left, map, table } = selectedRect(this.editor.state);
    const offset = map.map[left];
    const widths: unknown = table.nodeAt(offset)?.attrs['colwidth'];
    const width: unknown = Array.isArray(widths) ? widths[left - map.colCount(offset)] : null;
    return typeof width === 'number' && width > 0 ? width : '';
  }
  protected applyColumnWidth(value: string): void {
    if (!this.editor || !this.inTable() || this.busy()) return;
    const width = value ? Number(value) : 0;
    if (
      value &&
      (!Number.isSafeInteger(width) || width < this.minColumnWidth || width > this.maxColumnWidth)
    ) {
      this.error.set(
        `Nhập độ rộng từ ${this.minColumnWidth} đến ${this.maxColumnWidth} px hoặc để trống.`,
      );
      return;
    }
    this.editor.chain().focus().command(setNoteColumnWidth(width)).run();
  }
  protected close(event?: Event): void {
    event?.preventDefault();
    if (this.busy()) return;
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
    if (!this.editor || this.busy()) return;
    try {
      this.notes.update(this.title, this.editor.getJSON());
      parseNoteDraft(this.notes.draft()?.note);
      this.error.set('');
      this.sessionExpired.set(false);
      await this.notes.save(asNew);
    } catch (error) {
      this.conflict.set(error instanceof NoteConflictError);
      this.sessionExpired.set(error instanceof AccountApiError && error.status === 401);
      if (error instanceof NoteConflictError) {
        this.error.set('Ghi chú đã được sửa hoặc xóa ở nơi khác. Bản nháp của bạn vẫn được giữ.');
      } else if (error instanceof NoteAttachmentUnavailableError) {
        this.error.set(`Không thể tìm thấy tệp “${error.fileName}”. Hãy chèn lại tệp và thử lưu.`);
      } else if (error instanceof Error && error.message === 'empty_note') {
        this.error.set('Hãy thêm nội dung trước khi lưu.');
      } else {
        this.error.set(
          'Không thể lưu ghi chú. Nội dung vẫn được giữ. Hãy thử lại hoặc sao chép ra ngoài.',
        );
      }
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
