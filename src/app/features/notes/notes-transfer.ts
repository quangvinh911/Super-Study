import { NoteDraft } from '../../core/models/notes.models';
import { noteHtml, noteMarkdown, notePlainText } from '../../core/domain/notes';

export async function copyNote(note: NoteDraft): Promise<'rich' | 'text'> {
  const plainText = `${note.title}\n\n${notePlainText(note.document)}`;
  if (!navigator.clipboard) throw new Error('clipboard_unavailable');
  if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard.write === 'function') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([noteHtml(note)], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
      return 'rich';
    } catch {
      /* Browsers may permit plain text while rejecting HTML clipboard writes. */
    }
  }
  await navigator.clipboard.writeText(plainText);
  return 'text';
}
export function exportNote(note: NoteDraft): void {
  const blob = new Blob([noteMarkdown(note)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${note.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 100) || 'note'}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
