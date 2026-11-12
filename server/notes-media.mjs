import {
  NOTE_MEDIA_SIGNATURE_BYTES,
  isNoteMediaSize,
  isNoteMediaType,
  matchesNoteMediaSignature,
  noteAttachments,
  parseNote,
} from '../src/app/core/domain/notes.ts';
import { ApiError, record, requireCondition } from './errors.mjs';
import { NOTES_SCOPE } from './notes.mjs';

export const noteMediaObjectPrefix = 'account-note-media/';
const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const mediaKeyPattern = new RegExp(`^${noteMediaObjectPrefix}(${uuid})/(${uuid})$`);
export const noteMediaPath = new RegExp(`^/api/notes/media/(${uuid})$`);
const minimumOrphanAgeMs = 24 * 60 * 60 * 1000;
const garbagePageSize = 20;
const cacheControl = 'private, no-store';

export class NoteMediaMissingError extends ApiError {
  constructor(attachmentId) {
    super(400, 'note_media_not_found');
    this.attachmentId = attachmentId;
  }
}

function mediaKey(userId, attachmentId) {
  return `${noteMediaObjectPrefix}${userId}/${attachmentId}`;
}

function isStoredMedia(object) {
  return (
    object &&
    isNoteMediaSize(object.size) &&
    isNoteMediaType(object.httpMetadata?.contentType) &&
    /^[a-f0-9]{64}$/.test(object.customMetadata?.sha256 ?? '')
  );
}

function requireStoredMedia(object, attachment) {
  if (!isStoredMedia(object) || object.httpMetadata.contentType !== attachment.mimeType)
    throw new NoteMediaMissingError(attachment.attachmentId);
}

async function readSignature(request) {
  const reader = request.clone().body.getReader();
  const signature = new Uint8Array(NOTE_MEDIA_SIGNATURE_BYTES);
  let size = 0;
  try {
    while (size < signature.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.subarray(0, signature.length - size);
      signature.set(part, size);
      size += part.length;
    }
    return signature.subarray(0, size);
  } finally {
    // A cloned body's cancellation can wait for the original stream to finish.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createNoteMediaStorage(bucket) {
  return {
    async put(userId, attachmentId, request) {
      const size = Number(request.headers.get('Content-Length'));
      const mimeType = request.headers.get('Content-Type');
      const sha256 = request.headers.get('X-Note-Media-Sha256');
      requireCondition(isNoteMediaSize(size), 'invalid_note_media_size', 413);
      requireCondition(isNoteMediaType(mimeType), 'invalid_note_media_type', 415);
      requireCondition(/^[a-f0-9]{64}$/.test(sha256 ?? ''), 'invalid_note_media_checksum');
      requireCondition(request.body, 'invalid_note_media');
      const signature = await readSignature(request);
      requireCondition(matchesNoteMediaSignature(mimeType, signature), 'invalid_note_media');

      const key = mediaKey(userId, attachmentId);
      let object;
      try {
        object = await bucket.put(key, request.body, {
          onlyIf: { etagDoesNotMatch: '*' },
          sha256: Uint8Array.from(Buffer.from(sha256, 'hex')).buffer,
          httpMetadata: { contentType: mimeType, cacheControl },
          customMetadata: { sha256 },
        });
      } catch (error) {
        if (error instanceof Error && /checksum.*(?:mismatch|did not match)/i.test(error.message))
          throw new ApiError(400, 'invalid_note_media_checksum');
        throw error;
      }
      // A repeated PUT may reuse the original object, but cannot overwrite it.
      const stored = object ?? (await bucket.head(key));
      requireCondition(
        stored?.size === size &&
          stored.httpMetadata?.contentType === mimeType &&
          stored.customMetadata?.sha256 === sha256,
        'note_media_conflict',
        409,
      );
      return { attachmentId, mimeType, size };
    },
    async get(userId, attachmentId) {
      const object = await bucket.get(mediaKey(userId, attachmentId));
      requireCondition(isStoredMedia(object), 'note_media_not_found', 404);
      return new Response(object.body, {
        headers: {
          'Cache-Control': cacheControl,
          'Content-Length': String(object.size),
          'Content-Type': object.httpMetadata.contentType,
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
    async requireAttachments(userId, attachments) {
      if (attachments.length > 20) {
        // Bound R2 subrequests for a document with many attachments.
        const pending = new Map(
          attachments.map((attachment) => [mediaKey(userId, attachment.attachmentId), attachment]),
        );
        let cursor;
        do {
          const page = await bucket.list({
            prefix: `${noteMediaObjectPrefix}${userId}/`,
            include: ['httpMetadata', 'customMetadata'],
            cursor,
          });
          for (const object of page.objects) {
            const attachment = pending.get(object.key);
            if (!attachment) continue;
            requireStoredMedia(object, attachment);
            pending.delete(object.key);
          }
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor && pending.size);
        const missing = pending.values().next().value;
        if (missing) throw new NoteMediaMissingError(missing.attachmentId);
        return;
      }
      await Promise.all(
        attachments.map(async (attachment) => {
          const object = await bucket.head(mediaKey(userId, attachment.attachmentId));
          requireStoredMedia(object, attachment);
        }),
      );
    },
    collectGarbage(repository, input) {
      return collectNoteMediaGarbage(bucket, repository, input);
    },
  };
}

export async function collectNoteMediaGarbage(bucket, repository, input, now = Date.now()) {
  requireCondition(record(input));
  requireCondition(Object.keys(input).every((key) => key === 'cursor' || key === 'apply'));
  const { apply = false, cursor } = input;
  requireCondition(typeof apply === 'boolean');
  requireCondition(
    cursor === undefined ||
      (typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 4096),
  );
  const page = await bucket.list({ prefix: noteMediaObjectPrefix, limit: garbagePageSize, cursor });
  const referencesByOwner = new Map();
  const orphaned = [];
  for (const object of page.objects) {
    const key = mediaKeyPattern.exec(object.key);
    if (!key || object.uploaded.getTime() > now - minimumOrphanAgeMs) continue;
    const [, userId, attachmentId] = key;
    let references = referencesByOwner.get(userId);
    if (!references) {
      const { records } = await repository.load(userId, NOTES_SCOPE);
      references = new Set();
      for (const entry of records) {
        if (entry.kind !== 'notes') continue;
        for (const attachment of noteAttachments(parseNote(entry.value).document))
          references.add(attachment.attachmentId);
      }
      referencesByOwner.set(userId, references);
    }
    if (!references.has(attachmentId)) orphaned.push(object.key);
  }
  if (apply && orphaned.length) await bucket.delete(orphaned);
  return {
    scanned: page.objects.length,
    orphaned: orphaned.length,
    deleted: apply ? orphaned.length : 0,
    cursor: page.truncated ? page.cursor : null,
  };
}
