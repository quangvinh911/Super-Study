import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NoteMark, NoteNode } from '../../core/models/notes.models';
import {
  isNoteGrammarRole,
  isSafeNoteLink,
  noteAttachment,
  noteGrammarRoles,
  noteTableColumnWidths,
} from '../../core/domain/notes';
import { NoteMedia } from './note-media';

@Component({
  selector: 'app-note-preview',
  imports: [NgTemplateOutlet, NoteMedia],
  templateUrl: './note-preview.html',
  styleUrl: './note-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotePreview {
  readonly document = input.required<NoteNode>();
  readonly noteId = input<string>();
  protected readonly attachment = noteAttachment;
  protected readonly tables = computed(
    () =>
      new Map(
        (this.document().content ?? [])
          .filter((node) => node.type === 'table')
          .map((table) => [table, noteTableColumnWidths(table)]),
      ),
  );

  protected altText(node: NoteNode): string | undefined {
    const alt = node.attrs?.['alt'];
    return typeof alt === 'string' ? alt : undefined;
  }

  protected tableWidth(columns: readonly number[]): number | null {
    return columns.every((width) => width > 0)
      ? columns.reduce((total, width) => total + width, 0)
      : null;
  }

  protected tableMinWidth(columns: readonly number[]): number {
    return columns.reduce((total, width) => total + (width || 48), 0);
  }

  protected grammarRole(node: NoteNode) {
    const role = node.attrs?.['role'];
    return isNoteGrammarRole(role) ? { role, ...noteGrammarRoles[role] } : null;
  }

  protected safeLink(mark: NoteMark): string | null {
    const href = mark.attrs?.['href'];
    return typeof href === 'string' && isSafeNoteLink(href) ? href : null;
  }
}
