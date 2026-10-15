import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { NotesGrammarToken } from './notes-grammar-token';
import { notePlainText, parseNoteDocument } from '../../core/domain/notes';

describe('Editable grammar tokens', () => {
  it('pastes lesson chips, edits their text and reopens without duplicate labels', () => {
    const editor = new Editor({
      extensions: [StarterKit, NotesGrammarToken],
      content:
        '<p>Please <button data-note-grammar-role="V"><span>V · Động từ</span><span data-note-grammar-text>submit</span></button> the form.</p>',
    });
    try {
      expect(notePlainText(parseNoteDocument(editor.getJSON()))).toBe('Please submit the form.');
      editor.commands.insertContentAt(9, 're');
      const savedJson = editor.getJSON();
      const saved = parseNoteDocument(savedJson);
      expect(notePlainText(saved)).toBe('Please resubmit the form.');
      editor.commands.setContent(savedJson);
      const root = document.createElement('div');
      root.innerHTML = editor.getHTML();
      expect(root.querySelector('[data-note-grammar-text]')?.textContent).toBe('resubmit');
      expect(root.textContent?.match(/V · Động từ/g)).toHaveLength(1);
      editor.commands.setContent(editor.getHTML());
      expect(parseNoteDocument(editor.getJSON())).toEqual(saved);
      editor.commands.selectAll();
      editor.commands.toggleBold();
      expect(() => parseNoteDocument(editor.getJSON())).not.toThrow();
    } finally {
      editor.destroy();
    }
  });
});
