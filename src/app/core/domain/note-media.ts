import type {
  NoteAttachment,
  NoteMediaKind,
  NoteMediaType,
  NoteNode,
} from '../models/notes.models';

export const MAX_NOTE_MEDIA_BYTES = 50_000_000;
export const NOTE_MEDIA_SIGNATURE_BYTES = 64;
const mediaTypes: readonly NoteMediaType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
];

export function isNoteMediaType(value: unknown): value is NoteMediaType {
  return mediaTypes.some((mimeType) => value === mimeType);
}

export function noteMediaKind(mimeType: NoteMediaType): NoteMediaKind {
  return mimeType.startsWith('image/') ? 'image' : 'video';
}

export function isNoteMediaSize(size: number): boolean {
  return Number.isSafeInteger(size) && size > 0 && size < MAX_NOTE_MEDIA_BYTES;
}

export function isNoteAttachmentId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
}

export function noteAttachmentFileName(name: string): string {
  return (
    name
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .slice(0, 255)
      .trim() || 'Tệp đính kèm'
  );
}

export function noteAttachment(node: NoteNode): NoteAttachment | null {
  if (node.type !== 'image' && node.type !== 'video') return null;
  const attachmentId = node.attrs?.['attachmentId'];
  const fileName = node.attrs?.['fileName'];
  const mimeType = node.attrs?.['mimeType'];
  if (
    !isNoteAttachmentId(attachmentId) ||
    typeof fileName !== 'string' ||
    noteAttachmentFileName(fileName) !== fileName ||
    !isNoteMediaType(mimeType) ||
    noteMediaKind(mimeType) !== node.type
  )
    return null;
  return { attachmentId, fileName, mimeType };
}

export function noteAttachments(document: NoteNode): NoteAttachment[] {
  const attachments = new Map<string, NoteAttachment>();
  for (const child of document.content ?? []) {
    const attachment = noteAttachment(child);
    if (!attachment) continue;
    const previous = attachments.get(attachment.attachmentId);
    if (previous && previous.mimeType !== attachment.mimeType) throw new Error('invalid_note');
    attachments.set(attachment.attachmentId, attachment);
  }
  return [...attachments.values()];
}

function hasBytes(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function matchesNoteMediaSignature(mimeType: NoteMediaType, bytes: Uint8Array): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return hasBytes(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6));
    case 'video/mp4':
      return (
        bytes.length >= 16 &&
        ascii(bytes, 4, 4) === 'ftyp' &&
        /^(iso[m2-9]|mp4[12]|avc1|dash|M4V |MSNV)$/.test(ascii(bytes, 8, 4))
      );
    case 'video/webm':
      if (!hasBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return false;
      for (let offset = 5; offset <= bytes.length - 7; offset++) {
        if (hasBytes(bytes, [0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d], offset)) return true;
      }
      return false;
  }
}

export async function validateNoteAttachment(file: Blob, kind: NoteMediaKind): Promise<void> {
  if (!isNoteMediaSize(file.size)) throw new Error('invalid_note_media_size');
  if (!isNoteMediaType(file.type) || noteMediaKind(file.type) !== kind)
    throw new Error('invalid_note_media_type');
  const signature = new Uint8Array(await file.slice(0, NOTE_MEDIA_SIGNATURE_BYTES).arrayBuffer());
  if (!matchesNoteMediaSignature(file.type, signature)) throw new Error('invalid_note_media_type');
}
