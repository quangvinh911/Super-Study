import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NoteMark, NoteNode } from '../../core/models/notes.models';
import { isNoteGrammarRole, isSafeNoteLink, noteGrammarRoles } from '../../core/domain/notes';

@Component({
  selector: 'app-note-preview',
  imports: [NgTemplateOutlet],
  templateUrl: './note-preview.html',
  styleUrl: './note-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotePreview {
  readonly document = input.required<NoteNode>();

  protected grammarRole(node: NoteNode) {
    const role = node.attrs?.['role'];
    return isNoteGrammarRole(role) ? { role, ...noteGrammarRoles[role] } : null;
  }

  protected safeLink(mark: NoteMark): string | null {
    const href = mark.attrs?.['href'];
    return typeof href === 'string' && isSafeNoteLink(href) ? href : null;
  }
}
