import { ApplicationRef, EnvironmentInjector, createComponent } from '@angular/core';
import { Command, Extension, Node } from '@tiptap/core';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state';
import { isInTable, selectedRect } from '@tiptap/pm/tables';
import { MAX_NOTE_TABLE_CELLS, noteAttachment, parseNoteDocument } from '../../core/domain/notes';
import { NoteMedia } from './note-media';

export const NOTE_COLUMN_MIN_WIDTH = 48;

export const NotesDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | noteTable | noteAttachment)+',
});

export const NotesTableExtensions = [
  Table.extend({ group: 'noteTable' }).configure({
    resizable: true,
    cellMinWidth: NOTE_COLUMN_MIN_WIDTH,
  }),
  TableRow,
  TableHeader.extend({ content: 'paragraph+' }),
  TableCell.extend({ content: 'paragraph+' }),
];

// Pasted or resized tables must fit the same limits as saved documents. Check only
// tables changed by the transaction so editing text elsewhere stays inexpensive.
export function notesTableValidation(onInvalid: () => void): Extension {
  return Extension.create({
    name: 'notesTableValidation',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          filterTransaction: (transaction, state) => {
            if (!transaction.docChanged) return true;
            const existingTables = new Set<ProseMirrorNode>();
            state.doc.forEach((node) => {
              if (node.type.name === 'table') existingTables.add(node);
            });
            try {
              transaction.doc.forEach((node) => {
                if (node.type.name === 'table' && !existingTables.has(node)) {
                  parseNoteDocument({ type: 'doc', content: [node.toJSON()] });
                }
              });
              return true;
            } catch {
              onInvalid();
              return false;
            }
          },
        }),
      ];
    },
  });
}

export function insertNoteBlock(node: ProseMirrorNode): Command {
  return ({ tr, dispatch }) => {
    if (!dispatch) return true;
    const { selection } = tr;
    const { $from } = selection;
    const currentBlock = $from.depth > 0 ? $from.node(1) : null;
    const replaceEmptyParagraph =
      currentBlock?.type.name === 'paragraph' && !currentBlock.content.size;
    let position = selection.to;
    if (replaceEmptyParagraph) position = $from.before(1);
    else if (currentBlock) position = $from.after(1);
    if (replaceEmptyParagraph) tr.replaceWith(position, $from.after(1), node);
    else tr.insert(position, node);
    const after = position + node.nodeSize;
    if (after === tr.doc.content.size) {
      tr.insert(after, tr.doc.type.schema.nodes['paragraph'].create());
    }
    const insertedSelection =
      node.type.name === 'table'
        ? TextSelection.near(tr.doc.resolve(position + 1))
        : NodeSelection.create(tr.doc, position);
    tr.setSelection(insertedSelection).scrollIntoView();
    return true;
  };
}

export function fitsTableGrowth(state: Parameters<Command>[0]['state'], axis: 'row' | 'column') {
  if (!isInTable(state)) return false;
  const { map } = selectedRect(state);
  const addedCells = axis === 'row' ? map.width : map.height;
  return map.width * map.height + addedCells <= MAX_NOTE_TABLE_CELLS;
}

export function setNoteColumnWidth(width: number): Command {
  return ({ tr, state, dispatch }) => {
    if (!isInTable(state)) return false;
    if (!dispatch) return true;
    const { map, table, tableStart, left } = selectedRect(state);
    const updatedCells = new Set<number>();
    for (let row = 0; row < map.height; row++) {
      const offset = map.map[row * map.width + left];
      if (updatedCells.has(offset)) continue;
      updatedCells.add(offset);
      const cell = table.nodeAt(offset);
      if (!cell) return false;
      const colspan = Number(cell.attrs['colspan']);
      const existing: unknown = cell.attrs['colwidth'];
      const widths: number[] = Array.isArray(existing) ? [...existing] : Array(colspan).fill(0);
      widths[left - map.colCount(offset)] = width;
      tr.setNodeMarkup(tableStart + offset, undefined, {
        ...cell.attrs,
        colwidth: widths.some((value) => value > 0) ? widths : null,
      });
    }
    return true;
  };
}

export function notesMediaExtensions(
  application: ApplicationRef,
  injector: EnvironmentInjector,
  draftId: string,
) {
  return (['image', 'video'] as const).map((kind) =>
    Node.create({
      name: kind,
      group: 'noteAttachment',
      atom: true,
      selectable: true,
      addAttributes() {
        return {
          attachmentId: { default: null, rendered: false },
          fileName: { default: null, rendered: false },
          mimeType: { default: null, rendered: false },
          ...(kind === 'image' ? { alt: { default: null, rendered: false } } : {}),
        };
      },
      renderHTML({ node }) {
        return ['p', `[${kind === 'image' ? 'Ảnh' : 'Video'}: ${String(node.attrs['fileName'])}]`];
      },
      addNodeView() {
        return ({ node }) => {
          const dom = document.createElement('app-note-media');
          dom.contentEditable = 'false';
          const attachment = noteAttachment({ type: kind, attrs: node.attrs });
          if (!attachment) return { dom };
          const component = createComponent(NoteMedia, {
            hostElement: dom,
            environmentInjector: injector,
          });
          component.setInput('attachmentId', attachment.attachmentId);
          component.setInput('fileName', attachment.fileName);
          component.setInput('mimeType', attachment.mimeType);
          component.setInput('draftId', draftId);
          const alt: unknown = node.attrs['alt'];
          if (typeof alt === 'string') component.setInput('alt', alt);
          application.attachView(component.hostView);
          return {
            dom,
            ignoreMutation: () => true,
            stopEvent: (event) =>
              event.target instanceof Element && !!event.target.closest('button, video'),
            destroy: () => {
              application.detachView(component.hostView);
              component.destroy();
            },
          };
        };
      },
    }),
  );
}
