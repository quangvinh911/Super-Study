import { Injectable, signal } from '@angular/core';
import { GRAMMAR_LESSONS } from './grammar-lessons';

export interface HackerGrammarExample {
  readonly id: string;
  readonly kind: 'excerpt' | 'adapted';
  readonly english: string;
  readonly highlight: string;
  readonly explanation: string;
  readonly quiz: {
    readonly instruction: string;
    readonly prompt: string;
    readonly options: readonly { readonly id: string; readonly text: string }[];
    readonly correctOptionId: string;
  };
  readonly source: {
    readonly questionId: string;
    readonly quote: string;
    readonly test: number;
    readonly order: number;
    readonly part: string;
    readonly location: 'stem' | 'stimulus' | 'transcript';
    readonly completedFromAnswerKey: boolean;
    readonly answerStatus: string;
  };
}

export interface HackerGrammarRuleExamples {
  readonly slug: string;
  readonly ruleLabel: string;
  readonly examples: readonly HackerGrammarExample[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isExample(value: unknown): value is HackerGrammarExample {
  if (!isRecord(value) || !isRecord(value['source'])) return false;
  const source = value['source'];
  return (
    ['id', 'english', 'highlight', 'explanation'].every((field) => hasText(value[field])) &&
    (value['kind'] === 'excerpt' || value['kind'] === 'adapted') &&
    typeof value['english'] === 'string' &&
    typeof value['highlight'] === 'string' &&
    value['english'].includes(value['highlight']) &&
    isQuiz(value['quiz'], value['english'], value['highlight']) &&
    hasText(source['quote']) &&
    hasText(source['answerStatus']) &&
    typeof source['test'] === 'number' &&
    Number.isInteger(source['test']) &&
    source['test'] >= 1 &&
    source['test'] <= 10 &&
    typeof source['order'] === 'number' &&
    Number.isInteger(source['order']) &&
    source['order'] >= 1 &&
    source['order'] <= 200 &&
    source['questionId'] ===
      `hacker-3-test-${String(source['test']).padStart(2, '0')}-q${String(source['order']).padStart(3, '0')}` &&
    typeof source['part'] === 'string' &&
    /^part-[1-7]$/u.test(source['part']) &&
    ['stem', 'stimulus', 'transcript'].includes(String(source['location'])) &&
    typeof source['completedFromAnswerKey'] === 'boolean' &&
    (value['kind'] === 'excerpt'
      ? value['english'] === source['quote']
      : value['english'] !== source['quote'])
  );
}

function isQuiz(value: unknown, english: string, highlight: string): boolean {
  if (
    !isRecord(value) ||
    !hasText(value['instruction']) ||
    !hasText(value['prompt']) ||
    value['prompt'].split('_____').length !== 2 ||
    !Array.isArray(value['options']) ||
    value['options'].length !== 4 ||
    !value['options'].every(
      (option: unknown, index: number): option is { id: string; text: string } =>
        isRecord(option) && option['id'] === 'ABCD'[index] && hasText(option['text']),
    )
  )
    return false;
  const options = value['options'];
  const correct = options.find((option) => option.id === value['correctOptionId']);
  const blankStart = value['prompt'].indexOf('_____');
  const highlightStart = english.indexOf(highlight);
  return (
    !!correct &&
    new Set(options.map((option) => option.text.trim().replace(/\s+/gu, ' ').toLowerCase()))
      .size === 4 &&
    blankStart >= highlightStart &&
    blankStart + correct.text.length <= highlightStart + highlight.length &&
    value['prompt'].replace('_____', correct.text) === english
  );
}

export function parseHackerGrammarExamples(value: unknown): readonly HackerGrammarRuleExamples[] {
  if (
    !isRecord(value) ||
    value['schemaVersion'] !== 2 ||
    value['rightsStatus'] !== 'privateUserProvided' ||
    !Array.isArray(value['groups'])
  ) {
    throw new Error('Invalid Hacker grammar collection.');
  }
  const expectedRules = new Set(
    GRAMMAR_LESSONS.flatMap((lesson) => lesson.rules.map((rule) => `${lesson.slug}/${rule.label}`)),
  );
  const seenRules = new Set<string>();
  const seenExamples = new Set<string>();
  const groups: HackerGrammarRuleExamples[] = [];
  for (const group of value['groups']) {
    if (
      !isRecord(group) ||
      !hasText(group['slug']) ||
      !hasText(group['ruleLabel']) ||
      !Array.isArray(group['examples']) ||
      group['examples'].length !== 5 ||
      !group['examples'].every(isExample)
    ) {
      throw new Error('Each Hacker grammar rule must have five valid examples.');
    }
    const key = `${group['slug']}/${group['ruleLabel']}`;
    if (!expectedRules.has(key) || seenRules.has(key)) {
      throw new Error(`Unknown or duplicate Hacker grammar rule: ${key}`);
    }
    seenRules.add(key);
    const sentences = new Set<string>();
    for (const example of group['examples']) {
      const sentence = example.english.trim().toLowerCase();
      if (seenExamples.has(example.id) || sentences.has(sentence)) {
        throw new Error(`Duplicate Hacker grammar example: ${example.id}`);
      }
      seenExamples.add(example.id);
      sentences.add(sentence);
    }
    groups.push({
      slug: group['slug'],
      ruleLabel: group['ruleLabel'],
      examples: group['examples'],
    });
  }
  if (seenRules.size !== expectedRules.size) {
    throw new Error('Hacker grammar examples do not cover every lesson rule.');
  }
  return groups;
}

@Injectable({ providedIn: 'root' })
export class HackerGrammarExamples {
  readonly groups = signal<readonly HackerGrammarRuleExamples[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  async load(): Promise<void> {
    if (this.loading() || this.groups().length) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await fetch('/data/toeic/grammar/hacker-3.json');
      if (!response.ok) throw new Error(`Hacker grammar request failed: ${response.status}`);
      this.groups.set(parseHackerGrammarExamples(await response.json()));
    } catch (error) {
      console.error('Unable to load Hacker grammar examples', error);
      this.error.set('Chưa tải được ví dụ Hacker. Hãy thử lại khi bộ tài liệu có sẵn.');
    } finally {
      this.loading.set(false);
    }
  }
}
