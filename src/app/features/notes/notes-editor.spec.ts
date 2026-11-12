import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TiptapEditorHTMLElement } from '@tiptap/core';
import { TableMap } from '@tiptap/pm/tables';
import { NotesEditor } from './notes-editor';
import { NotesDialogService } from './notes-dialog.service';
import { NotesRepository } from '../../core/persistence/notes.repository';
import { AuthService } from '../../core/auth/auth.service';
import { NoteAttachment } from '../../core/models/notes.models';

const image: NoteAttachment = {
  attachmentId: 'b6e5e6fb-ad6f-4460-8440-c6a4e0410a9c',
  fileName: 'ghi-chu.png',
  mimeType: 'image/png',
};

async function setup() {
  // jsdom has no native dialog top layer.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  const save = vi.fn().mockRejectedValue(new Error('offline'));
  const stageAttachment = vi.fn().mockResolvedValue(image);
  const readAttachment = vi.fn().mockResolvedValue(new Blob([], { type: image.mimeType }));
  TestBed.configureTestingModule({
    imports: [NotesEditor],
    providers: [
      {
        provide: NotesRepository,
        useValue: {
          owner: () => 'guest',
          save,
          stageAttachment,
          readAttachment,
          discardDraftAttachments: vi.fn().mockResolvedValue(undefined),
          revision: signal(0),
        },
      },
      {
        provide: AuthService,
        useValue: { user: signal(null), registerBeforeChange: () => () => {} },
      },
    ],
  });
  const notes = TestBed.inject(NotesDialogService);
  notes.open(undefined, undefined, 'Nội dung cần giữ lại.');
  const fixture = TestBed.createComponent(NotesEditor);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element, notes, save, stageAttachment };
}

function editorButton(element: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(element.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Missing button ${label}`);
  return button;
}

afterEach(() => {
  TestBed.resetTestingModule();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
describe('Notes editor public behavior', () => {
  it('loads the selected text and keeps the editor open on failed save', async () => {
    const { fixture, element, notes, save } = await setup();
    expect(element.querySelector('[role=textbox]')?.textContent).toContain('Nội dung cần giữ lại.');
    const button = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Lưu ghi chú',
    );
    button?.click();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledOnce();
    expect(notes.draft()).not.toBeNull();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('Không thể lưu');
  });
  it('routes Ctrl+S through the save action and confirms Escape before discarding changes', async () => {
    const { fixture, element, notes, save } = await setup();
    element
      .querySelector('dialog')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    await fixture.whenStable();
    expect(save).toHaveBeenCalledOnce();
    element.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
    await fixture.whenStable();
    expect(notes.draft()).not.toBeNull();
    expect(element.querySelector<HTMLDialogElement>('.discard-confirm')?.open).toBe(true);
    expect(element.querySelector<HTMLDialogElement>('dialog')?.open).toBe(true);
    expect(element.querySelector('.discard-confirm')?.textContent).toContain('Bỏ thay đổi');
  });
  it('keeps edits when continuing or pressing Escape in the confirmation, and discards only on request', async () => {
    const { fixture, element, notes, save } = await setup();
    const draft = notes.draft();
    const editorDialog = element.querySelector('dialog');
    const confirmation = element.querySelector<HTMLDialogElement>('.discard-confirm');
    const continueButton = confirmation?.querySelector<HTMLButtonElement>('button');
    const discardButton = confirmation?.querySelector<HTMLButtonElement>('.button--danger');
    if (!editorDialog || !confirmation || !continueButton || !discardButton)
      throw new Error('Missing Notes dialogs');
    editorDialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(confirmation.open).toBe(true);
    continueButton.click();
    expect(confirmation.open).toBe(false);
    expect(notes.draft()).toBe(draft);
    editorDialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    const escape = new Event('cancel', { cancelable: true });
    confirmation.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(confirmation.open).toBe(false);
    expect(notes.draft()).toBe(draft);
    editorDialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    discardButton.click();
    await fixture.whenStable();
    expect(confirmation.open).toBe(false);
    expect(notes.draft()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('certificate-notes-draft:guest')).toBeNull();
  });
  it('inserts a table, stores keyboard column widths, and merges and splits cells', async () => {
    const { fixture, element, notes } = await setup();
    editorButton(element, 'Chèn bảng').click();
    await fixture.whenStable();
    const columns = element.querySelector<HTMLInputElement>('#note-table-columns');
    if (!columns) throw new Error('Missing table dimensions');
    columns.value = '2';
    editorButton(element, 'Tạo bảng').click();
    await fixture.whenStable();
    const table = element.querySelector('table');
    if (!table) throw new Error('Missing inserted table');
    expect(table.rows.length).toBe(3);
    expect(table.rows[0].cells.length).toBe(2);
    expect(table.rows[0].cells[0].tagName).toBe('TH');
    const width = element.querySelector<HTMLInputElement>('#note-column-width');
    if (!width) throw new Error('Missing table column width');
    width.value = '180';
    width.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    const document = notes.draft()?.note.document;
    const rows = document?.content?.find((node) => node.type === 'table')?.content;
    expect(rows?.map((row) => row.content?.[0].attrs?.['colwidth'])).toEqual([[180], [180], [180]]);

    const editor = element.querySelector<TiptapEditorHTMLElement>('.tiptap')?.editor;
    if (!editor) throw new Error('Missing table editor');
    const tablePosition = editor.state.doc.child(0).nodeSize;
    const tableNode = editor.state.doc.nodeAt(tablePosition);
    if (!tableNode) throw new Error('Missing document table');
    const { map } = TableMap.get(tableNode);
    const tableStart = tablePosition + 1;
    editor.commands.setCellSelection({
      anchorCell: tableStart + map[0],
      headCell: tableStart + map[3],
    });
    await fixture.whenStable();
    editorButton(element, 'Gộp ô').click();
    await fixture.whenStable();
    expect(table.rows[0].cells[0].colSpan).toBe(2);
    expect(table.rows[0].cells[0].rowSpan).toBe(2);
    expect(
      notes.draft()?.note.document.content?.find((node) => node.type === 'table')?.content?.[0]
        .content?.[0].attrs,
    ).toMatchObject({
      colspan: 2,
      rowspan: 2,
      colwidth: [180, 0],
    });
    editorButton(element, 'Tách ô').click();
    await fixture.whenStable();
    expect(table.rows[0].cells[0].colSpan).toBe(1);
    expect(table.rows[0].cells[0].rowSpan).toBe(1);
  });
  it('stages an image with its description and removes the selected file', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:note-image');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
    const { fixture, element, notes, stageAttachment } = await setup();
    editorButton(element, 'Chèn ảnh').click();
    await fixture.whenStable();
    const alt = element.querySelector<HTMLInputElement>('#note-image-alt');
    const input = element.querySelector<HTMLInputElement>('#note-attachment-file');
    if (!alt || !input) throw new Error('Missing attachment inputs');
    alt.value = 'Sơ đồ bài học';
    alt.dispatchEvent(new Event('input', { bubbles: true }));
    const file = new File(['test'], image.fileName, { type: image.mimeType });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(stageAttachment).toHaveBeenCalledWith(file, 'image', 'guest', notes.draft()?.draftId);
    expect(notes.draft()?.note.document.content).toContainEqual({
      type: 'image',
      attrs: { ...image, alt: 'Sơ đồ bài học' },
    });
    expect(element.querySelector('img')?.alt).toBe('Sơ đồ bài học');
    editorButton(element, 'Xóa tệp').click();
    await fixture.whenStable();
    expect(notes.draft()?.note.document.content?.some((node) => node.type === 'image')).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:note-image');
  });
});
