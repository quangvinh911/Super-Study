import { parseNote, parseNoteDraft } from '../src/app/core/domain/notes.ts';
import { ApiError, record, requireCondition } from './errors.mjs';

// This reserved account scope is never exposed through certificate learning actions.
const NOTES_SCOPE = 'global-notes';
const sameDraft = (note, draft) =>
  JSON.stringify({
    id: note.id,
    title: note.title,
    document: note.document,
    ...(note.source ? { source: note.source } : {}),
  }) === JSON.stringify(draft);
export function createNotesService(repository) {
  return async (userId, input) => {
    requireCondition(
      record(input) && typeof input.action === 'string' && Array.isArray(input.args),
    );
    requireCondition(Object.keys(input).every((key) => ['action', 'args'].includes(key)));
    const { action, args } = input;
    requireCondition(
      ['listNotes', 'getNote', 'saveNote', 'removeNote'].includes(action),
      'unknown_action',
    );
    let draft;
    if (action === 'saveNote') {
      requireCondition(args.length === 2);
      try {
        draft = parseNoteDraft(args[0]);
      } catch (error) {
        throw new ApiError(400, error.message);
      }
    }
    const id = draft?.id ?? args[0];
    if (action === 'getNote' || action === 'removeNote')
      requireCondition(
        typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
      );
    if (action === 'listNotes') requireCondition(args.length === 0);
    if (action === 'getNote') requireCondition(args.length === 1);
    if (action === 'saveNote' || action === 'removeNote')
      requireCondition(
        args.length === 2 &&
          ((action === 'saveNote' && args[1] === null) ||
            (Number.isSafeInteger(args[1]) && args[1] > 0)),
      );
    for (let retry = 0; retry < 5; retry++) {
      const state = await repository.load(userId, NOTES_SCOPE);
      const entries = state.records
        .filter((entry) => entry.kind === 'notes')
        .map((entry) => parseNote(entry.value));
      if (action === 'listNotes')
        return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const existing = entries.find((note) => note.id === id);
      if (action === 'getNote') return existing ?? null;
      if (action === 'removeNote' && !existing) return null;
      // A lost response can be retried without duplicating the note or its revision.
      if (
        action === 'saveNote' &&
        existing &&
        sameDraft(existing, draft) &&
        ((args[1] === null && existing.revision === 1) || existing.revision === args[1] + 1)
      )
        return existing;
      requireCondition((existing?.revision ?? null) === args[1], 'note_conflict', 409);
      const now = new Date().toISOString();
      const saved =
        action === 'saveNote'
          ? {
              ...draft,
              schemaVersion: 1,
              revision: (existing?.revision ?? 0) + 1,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
            }
          : null;
      const records = state.records.filter(
        (entry) => !(entry.kind === 'notes' && entry.key === id),
      );
      if (saved) records.push({ kind: 'notes', key: saved.id, value: saved });
      if (await repository.commit(userId, NOTES_SCOPE, state.version, records)) return saved;
    }
    throw new ApiError(409, 'concurrent_notes_change');
  };
}
