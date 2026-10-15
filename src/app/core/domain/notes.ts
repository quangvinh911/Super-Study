import type { Note, NoteDraft, NoteMark, NoteNode, NoteSource } from '../models/notes.models';

export const MAX_NOTE_BYTES = 256 * 1024;
const blocks = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote'];
const inline = ['text', 'hardBreak', 'grammarToken'];
export const noteGrammarRoles = {
  S: { label: 'Chủ ngữ', ink: '#1d4ed8', wash: '#eff6ff', line: '#bfdbfe' },
  V: { label: 'Động từ', ink: '#166534', wash: '#f0fdf4', line: '#bbf7d0' },
  O: { label: 'Tân ngữ', ink: '#92400e', wash: '#fffbeb', line: '#fde68a' },
  C: { label: 'Bổ ngữ', ink: '#0e7490', wash: '#ecfeff', line: '#a5f3fc' },
  M: { label: 'Thành phần bổ nghĩa', ink: '#6b21a8', wash: '#faf5ff', line: '#e9d5ff' },
} as const;
export function isNoteGrammarRole(value: unknown): value is keyof typeof noteGrammarRoles {
  return typeof value === 'string' && Object.hasOwn(noteGrammarRoles, value);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_note');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('invalid_note');
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error('invalid_note');
  return value;
}
export function isSafeNoteLink(value: string): boolean {
  if (value.length > 2048 || /[\u0000-\u0020]/.test(value)) return false;
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
function parseMark(value: unknown): NoteMark {
  const mark = record(value);
  keys(mark, ['type', 'attrs']);
  const type = mark['type'];
  if (type === 'link') {
    const attrs = record(mark['attrs']);
    keys(attrs, ['href', 'target', 'rel', 'class']);
    const href = text(attrs['href'], 2048);
    if (!isSafeNoteLink(href)) throw new Error('invalid_note_link');
    return { type, attrs: { href } };
  }
  if (type !== 'bold' && type !== 'italic' && type !== 'underline' && type !== 'highlight')
    throw new Error('invalid_note');
  if (mark['attrs'] !== undefined && Object.keys(record(mark['attrs'])).length)
    throw new Error('invalid_note');
  return { type };
}
export function parseNoteDocument(value: unknown): NoteNode {
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_NOTE_BYTES)
    throw new Error('note_too_large');
  let count = 0;
  function node(input: unknown, depth: number): NoteNode {
    if (++count > 5000 || depth > 32) throw new Error('note_too_large');
    const item = record(input);
    keys(item, ['type', 'content', 'text', 'attrs', 'marks']);
    const type = item['type'];
    if (type === 'text') {
      keys(item, ['type', 'text', 'marks']);
      const value = text(item['text'], MAX_NOTE_BYTES);
      if (!value) throw new Error('invalid_note');
      if (item['marks'] !== undefined && !Array.isArray(item['marks']))
        throw new Error('invalid_note');
      const marks = Array.isArray(item['marks'])
        ? item['marks'].map((m: unknown) => parseMark(m))
        : [];
      if (new Set(marks.map((mark) => mark.type)).size !== marks.length)
        throw new Error('invalid_note');
      return { type, text: value, ...(marks.length ? { marks } : {}) };
    }
    if (type === 'hardBreak') {
      keys(item, ['type', 'marks']);
      if (item['marks'] !== undefined && !Array.isArray(item['marks']))
        throw new Error('invalid_note');
      const marks = Array.isArray(item['marks'])
        ? item['marks'].map((m: unknown) => parseMark(m))
        : [];
      return { type, ...(marks.length ? { marks } : {}) };
    }
    if (
      type !== 'doc' &&
      type !== 'paragraph' &&
      type !== 'heading' &&
      type !== 'grammarToken' &&
      type !== 'bulletList' &&
      type !== 'orderedList' &&
      type !== 'listItem' &&
      type !== 'taskList' &&
      type !== 'taskItem' &&
      type !== 'blockquote'
    )
      throw new Error('invalid_note');
    if (item['text'] !== undefined || item['marks'] !== undefined) throw new Error('invalid_note');
    if (item['content'] !== undefined && !Array.isArray(item['content']))
      throw new Error('invalid_note');
    const content = Array.isArray(item['content'])
      ? item['content'].map((child: unknown) => node(child, depth + 1))
      : [];
    let allowed = blocks;
    if (type === 'paragraph' || type === 'heading') allowed = inline;
    if (type === 'grammarToken') allowed = ['text'];
    if (type === 'bulletList' || type === 'orderedList') allowed = ['listItem'];
    if (type === 'taskList') allowed = ['taskItem'];
    if (content.some((child) => !allowed.includes(child.type))) throw new Error('invalid_note');
    if (type !== 'paragraph' && type !== 'heading' && type !== 'grammarToken' && !content.length)
      throw new Error('invalid_note');
    if ((type === 'listItem' || type === 'taskItem') && content[0]?.type !== 'paragraph')
      throw new Error('invalid_note');
    let attrs: NoteNode['attrs'];
    if (type === 'grammarToken') {
      const raw = record(item['attrs']);
      keys(raw, ['role']);
      if (!isNoteGrammarRole(raw['role'])) throw new Error('invalid_note');
      attrs = { role: raw['role'] };
    } else if (type === 'heading') {
      const raw = record(item['attrs']);
      keys(raw, ['level']);
      if (raw['level'] !== 1 && raw['level'] !== 2 && raw['level'] !== 3)
        throw new Error('invalid_note');
      attrs = { level: raw['level'] };
    } else if (type === 'orderedList') {
      const raw = item['attrs'] === undefined ? {} : record(item['attrs']);
      keys(raw, ['start', 'type']);
      const start = raw['start'] ?? 1;
      if (
        typeof start !== 'number' ||
        !Number.isSafeInteger(start) ||
        start < 1 ||
        start > 1000000 ||
        (raw['type'] !== undefined && raw['type'] !== null)
      )
        throw new Error('invalid_note');
      attrs = { start };
    } else if (type === 'taskItem') {
      const raw = record(item['attrs']);
      keys(raw, ['checked']);
      if (typeof raw['checked'] !== 'boolean') throw new Error('invalid_note');
      attrs = { checked: raw['checked'] };
    } else if (item['attrs'] !== undefined && Object.keys(record(item['attrs'])).length)
      throw new Error('invalid_note');
    return { type, ...(content.length ? { content } : {}), ...(attrs ? { attrs } : {}) };
  }
  const document = node(value, 0);
  if (document.type !== 'doc') throw new Error('invalid_note');
  return document;
}
function parseSource(value: unknown): NoteSource {
  const source = record(value);
  keys(source, ['certificateId', 'path', 'label']);
  const path = text(source['path'], 2048);
  const label = text(source['label'], 200);
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\\u0000-\u0020]/.test(path) ||
    !label.trim()
  )
    throw new Error('invalid_note');
  const certificateId = source['certificateId'];
  if (
    certificateId !== undefined &&
    (typeof certificateId !== 'string' || !/^[a-z][a-z0-9-]{0,59}$/.test(certificateId))
  )
    throw new Error('invalid_note');
  return { path, label, ...(typeof certificateId === 'string' ? { certificateId } : {}) };
}
export function parseNoteDraft(value: unknown, allowEmpty = false): NoteDraft {
  const draft = record(value);
  keys(draft, ['id', 'title', 'document', 'source']);
  const id = text(draft['id'], 36);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new Error('invalid_note');
  const document = parseNoteDocument(draft['document']);
  const plain = notePlainText(document).trim();
  if (!plain && !allowEmpty) throw new Error('empty_note');
  const title =
    text(draft['title'], 200).trim() || (allowEmpty ? '' : plain.split('\n')[0].slice(0, 80));
  return {
    id,
    title,
    document,
    ...(draft['source'] !== undefined ? { source: parseSource(draft['source']) } : {}),
  };
}
export function parseNote(value: unknown): Note {
  const note = record(value);
  keys(note, [
    'id',
    'title',
    'document',
    'source',
    'schemaVersion',
    'revision',
    'createdAt',
    'updatedAt',
  ]);
  const draft = parseNoteDraft({
    id: note['id'],
    title: note['title'],
    document: note['document'],
    ...(note['source'] !== undefined ? { source: note['source'] } : {}),
  });
  const revision = note['revision'];
  const createdAt = text(note['createdAt'], 40),
    updatedAt = text(note['updatedAt'], 40);
  if (
    note['schemaVersion'] !== 1 ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !Number.isFinite(Date.parse(createdAt)) ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    createdAt > updatedAt
  )
    throw new Error('invalid_note');
  return { ...draft, schemaVersion: 1, revision, createdAt, updatedAt };
}
export function notePlainText(node: NoteNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const separator = ['paragraph', 'heading', 'grammarToken'].includes(node.type) ? '' : '\n';
  return (node.content ?? []).map(notePlainText).join(separator);
}
export function documentFromText(value: string): NoteNode {
  return {
    type: 'doc',
    content: value.split(/\r?\n/).map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
const escapeMarkdown = (value: string) => value.replace(/[\\`*_[\]<>#]/g, '\\$&');
export function noteHtml(draft: NoteDraft): string {
  function html(node: NoteNode): string {
    if (node.type === 'text') {
      let value = escapeHtml(node.text ?? '');
      for (const mark of node.marks ?? []) {
        const tag = { bold: 'strong', italic: 'em', underline: 'u', highlight: 'mark', link: 'a' }[
          mark.type
        ];
        const attrs =
          mark.type === 'link'
            ? ` href="${escapeHtml(String(mark.attrs?.['href'] ?? ''))}" rel="noopener noreferrer"`
            : '';
        value = `<${tag}${attrs}>${value}</${tag}>`;
      }
      return value;
    }
    if (node.type === 'hardBreak') return '<br>';
    const inner = (node.content ?? []).map(html).join('');
    if (node.type === 'doc') return inner;
    if (node.type === 'grammarToken') {
      const role = node.attrs?.['role'];
      if (!isNoteGrammarRole(role)) throw new Error('invalid_note');
      const colors = noteGrammarRoles[role];
      return `<span data-note-grammar-role="${role}" style="display:inline-flex;flex-direction:column;vertical-align:middle;gap:3px;margin:3px 1px;padding:7px 11px;border:1px solid ${colors.line};border-radius:10px;color:${colors.ink};background:${colors.wash}"><span contenteditable="false" style="font-size:12px;font-weight:750">${role} · ${colors.label}</span><span data-note-grammar-text style="font-size:16px;font-weight:650">${inner}</span></span>`;
    }
    const tag = {
      paragraph: 'p',
      heading: `h${node.attrs?.['level'] ?? 1}`,
      bulletList: 'ul',
      orderedList: 'ol',
      listItem: 'li',
      taskList: 'ul',
      taskItem: 'li',
      blockquote: 'blockquote',
    }[node.type];
    const attrs = node.type === 'orderedList' ? ` start="${node.attrs?.['start'] ?? 1}"` : '';
    return `<${tag}${attrs}>${node.type === 'taskItem' ? (node.attrs?.['checked'] ? '☑ ' : '☐ ') : ''}${inner}</${tag}>`;
  }
  return `<h1>${escapeHtml(draft.title)}</h1>${html(draft.document)}`;
}
export function noteMarkdown(draft: NoteDraft): string {
  function markdown(node: NoteNode): string {
    if (node.type === 'text') {
      let value = escapeMarkdown(node.text ?? '');
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') value = `**${value}**`;
        if (mark.type === 'italic') value = `*${value}*`;
        if (mark.type === 'link')
          value = `[${value}](${String(mark.attrs?.['href'] ?? '').replace(/[()]/g, (char) => encodeURIComponent(char))})`;
      }
      return value;
    }
    if (node.type === 'hardBreak') return '  \n';
    const inner = (node.content ?? []).map(markdown).join('');
    if (node.type === 'grammarToken') return `**${inner}**`;
    if (node.type === 'doc') return inner;
    if (node.type === 'heading')
      return `${'#'.repeat(Number(node.attrs?.['level'] ?? 1))} ${inner}\n\n`;
    if (node.type === 'paragraph') return `${inner}\n\n`;
    if (node.type === 'blockquote')
      return `${inner
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')}\n\n`;
    if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
      return (
        (node.content ?? [])
          .map((item, index) => {
            const prefix =
              node.type === 'orderedList'
                ? `${Number(node.attrs?.['start'] ?? 1) + index}. `
                : node.type === 'taskList'
                  ? `- [${item.attrs?.['checked'] ? 'x' : ' '}] `
                  : '- ';
            const lines = markdown(item).trim().split('\n');
            return prefix + lines.join('\n' + ' '.repeat(prefix.length)) + '\n';
          })
          .join('') + '\n'
      );
    }
    return inner;
  }
  return `# ${escapeMarkdown(draft.title)}\n\n${markdown(draft.document).trim()}\n`;
}
