import { Node } from '@tiptap/core';
import { isNoteGrammarRole, noteGrammarRoles } from '../../core/domain/notes';

export const NotesGrammarToken = Node.create({
  name: 'grammarToken',
  group: 'inline',
  inline: true,
  content: 'text*',
  selectable: false,
  addAttributes() {
    return { role: { default: null, rendered: false } };
  },
  parseHTML() {
    return [
      {
        tag: '[data-note-grammar-role]',
        getAttrs: (element) => {
          const role = element.getAttribute('data-note-grammar-role');
          return isNoteGrammarRole(role) ? { role } : false;
        },
        contentElement: '[data-note-grammar-text]',
      },
    ];
  },
  renderHTML({ node }) {
    const role: unknown = node.attrs['role'];
    if (!isNoteGrammarRole(role)) throw new Error('invalid_note');
    const colors = noteGrammarRoles[role];
    return [
      'span',
      {
        'data-note-grammar-role': role,
        class: 'note-grammar-token',
        style: `--note-role-ink:${colors.ink};--note-role-wash:${colors.wash};--note-role-line:${colors.line}`,
      },
      [
        'span',
        { class: 'note-grammar-label', contenteditable: 'false', lang: 'vi' },
        `${role} · ${colors.label}`,
      ],
      ['span', { 'data-note-grammar-text': '', lang: 'en' }, 0],
    ];
  },
});
