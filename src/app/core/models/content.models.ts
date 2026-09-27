export interface ParagraphBlock {
  readonly kind: 'paragraph';
  readonly text: string;
}

export interface HeadingBlock {
  readonly kind: 'heading';
  readonly text: string;
  readonly level?: 3 | 4;
}

export interface ListBlock {
  readonly kind: 'list';
  readonly items: readonly string[];
  readonly ordered?: boolean;
}

export interface TableBlock {
  readonly kind: 'table';
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface CodeBlock {
  readonly kind: 'code';
  readonly language: string;
  readonly text: string;
}

export interface FormulaBlock {
  readonly kind: 'formula';
  readonly text: string;
  readonly accessibleText?: string;
}

export interface ImageBlock {
  readonly kind: 'image';
  readonly src: string;
  readonly alt: string;
  readonly caption?: string;
}

export interface AudioBlock {
  readonly kind: 'audio';
  readonly src: string;
  readonly label: string;
}

/**
 * Deliberately excludes arbitrary HTML. Every bank entry can be rendered using
 * trusted Angular templates without bypassing sanitization.
 */
export type ContentBlock =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | TableBlock
  | CodeBlock
  | FormulaBlock
  | ImageBlock
  | AudioBlock;
