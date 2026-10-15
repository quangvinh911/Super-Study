export interface NoteMark {
  readonly type: 'bold' | 'italic' | 'underline' | 'highlight' | 'link';
  readonly attrs?: Readonly<Record<string, string | number | boolean>>;
}

export interface NoteNode {
  readonly type:
    | 'doc'
    | 'paragraph'
    | 'heading'
    | 'text'
    | 'hardBreak'
    | 'grammarToken'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
    | 'taskList'
    | 'taskItem'
    | 'blockquote';
  readonly content?: readonly NoteNode[];
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean>>;
  readonly marks?: readonly NoteMark[];
}

export interface NoteSource {
  readonly certificateId?: string;
  readonly path: string;
  readonly label: string;
}

export interface NoteDraft {
  readonly id: string;
  readonly title: string;
  readonly document: NoteNode;
  readonly source?: NoteSource;
}

export interface Note extends NoteDraft {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NoteEditorDraft {
  readonly owner: string;
  readonly note: NoteDraft;
  readonly expectedRevision: number | null;
  readonly initialContent: string;
}

export class NoteConflictError extends Error {
  constructor() {
    super('note_conflict');
  }
}
