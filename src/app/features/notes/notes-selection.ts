import { isNoteGrammarRole, isSafeNoteLink, parseNoteDocument } from '../../core/domain/notes';
import { NoteMark, NoteNode } from '../../core/models/notes.models';

const blockTags = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote';
const inlineTypes = new Set(['text', 'hardBreak', 'grammarToken']);
const markTags: Readonly<Record<string, NoteMark['type']>> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  u: 'underline',
  mark: 'highlight',
};

// Read only the selected fragment. Reattach its enclosing markup so selecting part
// of a token or bold phrase retains that formatting without capturing extra text.
export function noteDocumentFromSelection(range: Range): NoteNode {
  let fragment: Node = range.cloneContents();
  let ancestor =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  while (ancestor) {
    const wrapper = ancestor.cloneNode(false);
    wrapper.appendChild(fragment);
    fragment = wrapper;
    if (ancestor.matches(blockTags)) break;
    ancestor = ancestor.parentElement;
  }
  const content = blocks(convert(fragment));
  return parseNoteDocument({
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  });
}

function blocks(nodes: readonly NoteNode[]): NoteNode[] {
  const result: NoteNode[] = [];
  let inline: NoteNode[] = [];
  const flush = () => {
    if (inline.some((node) => node.type !== 'text' || node.text?.trim()))
      result.push({ type: 'paragraph', content: inline });
    inline = [];
  };
  for (const node of nodes) {
    if (inlineTypes.has(node.type)) inline.push(node);
    else {
      flush();
      result.push(node);
    }
  }
  flush();
  return result;
}

function convert(node: Node, marks: readonly NoteMark[] = []): NoteNode[] {
  if (node.nodeType === Node.TEXT_NODE)
    return node.textContent
      ? [{ type: 'text', text: node.textContent, ...(marks.length ? { marks } : {}) }]
      : [];
  if (!(node instanceof Element))
    return Array.from(node.childNodes).flatMap((child) => convert(child, marks));
  if (
    node.matches(
      'script,style,iframe,object,svg,img,input,textarea,select,audio,video,[hidden],.syntax-token__role,.syntax-group__label',
    )
  )
    return [];
  const role = node.getAttribute('data-note-grammar-role');
  if (isNoteGrammarRole(role)) {
    const body = node.querySelector('[data-note-grammar-text]');
    if (!body?.textContent) return [];
    const content = convert(body, marks).filter((item) => item.type === 'text');
    return [{ type: 'grammarToken', attrs: { role }, ...(content.length ? { content } : {}) }];
  }
  if (node.matches('button')) return [];
  if (node.matches('br')) return [{ type: 'hardBreak' }];
  const markType = markTags[node.localName];
  let nextMarks = marks;
  if (markType && !marks.some((mark) => mark.type === markType))
    nextMarks = [...marks, { type: markType }];
  const href = node.getAttribute('href');
  if (node.matches('a') && href && isSafeNoteLink(href))
    nextMarks = [
      ...marks.filter((mark) => mark.type !== 'link'),
      { type: 'link', attrs: { href } },
    ];
  const children = Array.from(node.childNodes).flatMap((child) => convert(child, nextMarks));
  if (node.matches('ul,ol')) {
    const content = children.filter((child) => child.type === 'listItem');
    return content.length
      ? [{ type: node.matches('ol') ? 'orderedList' : 'bulletList', content }]
      : [];
  }
  if (node.matches('li,blockquote')) {
    const content = blocks(children);
    return content.length
      ? [{ type: node.matches('li') ? 'listItem' : 'blockquote', content }]
      : [];
  }
  if (node.matches('h1,h2,h3'))
    return [
      {
        type: 'heading',
        attrs: { level: Number(node.localName.slice(1)) },
        content: children.filter((child) => inlineTypes.has(child.type)),
      },
    ];
  if (node.matches('p,div,h4,h5,h6,section,article')) return blocks(children);
  return children;
}
