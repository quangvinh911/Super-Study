export const VOCABULARY_COLLECTIONS = [
  {
    id: 'hacker-3',
    title: 'Hacker 3',
    description:
      '180 mục từ theo 30 chủ đề và 120 thành ngữ, cụm từ giao tiếp. Đối chiếu với đề Listening và Reading Hacker 3.',
    url: '/data/toeic/vocabulary/hacker-3.json',
  },
] as const;

export type VocabularyKind = 'word' | 'phrase' | 'idiom';
export interface VocabularyEntry {
  readonly id: string;
  readonly term: string;
  readonly meaning: string;
  readonly kind: VocabularyKind;
  readonly topic: string;
  readonly day: number | null;
  readonly usage: string;
  readonly sources: readonly { file: string; pdfPages: readonly number[]; item?: number }[];
  readonly occurrences: readonly {
    questionId: string;
    test: number;
    order: number;
    part: string;
  }[];
}
export interface VocabularyCollection {
  readonly id: string;
  readonly title: string;
  readonly reviewNote: string;
  readonly entries: readonly VocabularyEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['file'] === 'string' &&
    Array.isArray(value['pdfPages']) &&
    value['pdfPages'].length > 0 &&
    value['pdfPages'].every((page: unknown) => Number.isInteger(page) && Number(page) > 0)
  );
}
function isOccurrence(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['questionId'] === 'string' &&
    Number.isInteger(value['test']) &&
    Number.isInteger(value['order']) &&
    typeof value['part'] === 'string' &&
    /^part-[1-7]$/.test(value['part'])
  );
}
function isEntry(value: unknown): value is VocabularyEntry {
  if (!isRecord(value)) return false;
  return (
    ['id', 'term', 'meaning', 'topic', 'usage'].every(
      (field) => typeof value[field] === 'string' && value[field].trim().length > 0,
    ) &&
    ['word', 'phrase', 'idiom'].includes(String(value['kind'])) &&
    (value['day'] === null ||
      (Number.isInteger(value['day']) &&
        Number(value['day']) >= 1 &&
        Number(value['day']) <= 30)) &&
    Array.isArray(value['sources']) &&
    value['sources'].length > 0 &&
    value['sources'].every(isSource) &&
    Array.isArray(value['occurrences']) &&
    value['occurrences'].every(isOccurrence)
  );
}
export function parseVocabulary(value: unknown, expectedId: string): VocabularyCollection {
  if (
    !isRecord(value) ||
    value['id'] !== expectedId ||
    typeof value['title'] !== 'string' ||
    typeof value['reviewNote'] !== 'string' ||
    !Array.isArray(value['entries']) ||
    !value['entries'].every(isEntry)
  ) {
    throw new Error('Invalid vocabulary collection.');
  }
  const entries = value['entries'];
  if (!entries.length || new Set(entries.map((entry) => entry.id)).size !== entries.length)
    throw new Error('Empty or duplicate vocabulary entries.');
  return { id: expectedId, title: value['title'], reviewNote: value['reviewNote'], entries };
}
export function searchVocabulary(entry: VocabularyEntry, query: string): boolean {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  return normalize(`${entry.term} ${entry.meaning} ${entry.topic} ${entry.usage}`).includes(
    normalize(query.trim()),
  );
}
