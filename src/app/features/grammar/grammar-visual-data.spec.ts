import { describe, expect, it } from 'vitest';
import { GRAMMAR_LEARNING_ORDER, GRAMMAR_LESSONS } from './grammar-lessons';
import { PASSIVE_DEMO, REDUCTION_DEMOS, TENSE_EXAMPLES } from './grammar-visual-data';
import type { GrammarSentence, SyntaxNode } from './grammar-visual.models';

function allNodes(nodes: readonly SyntaxNode[]): readonly SyntaxNode[] {
  return nodes.flatMap((node) =>
    node.kind === 'group' ? [node, ...allNodes(node.children)] : [node],
  );
}

function reconstruct(nodes: readonly SyntaxNode[]): string {
  return nodes
    .map((node) => (node.kind === 'group' ? reconstruct(node.children) : node.text))
    .join('');
}

function tokenById(sentence: GrammarSentence, id: string) {
  const node = allNodes(sentence.syntax).find((entry) => entry.id === id);
  if (node?.kind !== 'token') throw new Error(`Missing authored token ${id}`);
  return node;
}

function verifySentence(sentence: GrammarSentence): void {
  const nodes = allNodes(sentence.syntax);
  expect(reconstruct(sentence.syntax), sentence.id).toBe(sentence.english);
  expect(sentence.vietnamese.trim(), sentence.id).not.toBe('');
  expect(sentence.clue.trim(), sentence.id).not.toBe('');
  expect(new Set(nodes.map((node) => node.id)).size, sentence.id).toBe(nodes.length);
  expect(
    nodes.some((node) => node.kind === 'token'),
    sentence.id,
  ).toBe(true);
  for (const node of nodes) {
    expect(node.id.trim(), sentence.id).not.toBe('');
    if (node.kind === 'token') {
      expect(['S', 'V', 'O', 'C', 'M']).toContain(node.role);
      expect(node.text.trim(), node.id).not.toBe('');
      expect(node.pos.trim(), node.id).not.toBe('');
      expect(node.explanation.trim(), node.id).not.toBe('');
    }
    if (node.kind === 'group') {
      expect(node.label.trim(), node.id).not.toBe('');
      expect(node.children.length, node.id).toBeGreaterThan(0);
    }
  }
}

describe('authored grammar analyses', () => {
  const examples = GRAMMAR_LESSONS.flatMap((lesson) => lesson.examples);

  it('retains all 19 stable lesson slugs and 38 examples and self-checks', () => {
    expect(GRAMMAR_LESSONS.map((lesson) => lesson.slug)).toEqual([
      'cau-va-tu-loai',
      'danh-tu-va-tu-han-dinh',
      'cac-thi',
      'hoa-hop-chu-vi',
      'cau-bi-dong',
      'dong-tu-khuyet-thieu',
      'to-v-va-v-ing',
      'phan-tu-va-rut-gon',
      'gioi-tu',
      'lien-tu-va-tu-noi',
      'menh-de',
      'so-sanh',
      'cau-dieu-kien',
      'cau-gia-dinh',
      'cau-hoi-va-gian-tiep',
      'cau-truc-cong-viec',
      'other-another-va-dai-tu-bat-dinh',
      'trang-tu-va-tu-nhan-manh',
      'lien-tu-cap-va-cau-truc-song-song',
    ]);
    expect(examples).toHaveLength(38);
    expect(GRAMMAR_LESSONS.flatMap((lesson) => lesson.checks)).toHaveLength(38);
    expect(new Set(examples.map((sentence) => sentence.id)).size).toBe(38);
    const nodeIds = examples.flatMap((sentence) =>
      allNodes(sentence.syntax).map((node) => node.id),
    );
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
  });

  it('reconstructs every original example exactly, including whitespace and punctuation', () => {
    for (const sentence of examples) verifySentence(sentence);
  });

  it('uses the same stage order while retaining relative order within each stage', () => {
    expect(GRAMMAR_LEARNING_ORDER).toHaveLength(19);
    expect(new Set(GRAMMAR_LEARNING_ORDER).size).toBe(19);
    expect(GRAMMAR_LEARNING_ORDER.map((lesson) => lesson.slug)).toEqual([
      'cau-va-tu-loai',
      'danh-tu-va-tu-han-dinh',
      'cac-thi',
      'hoa-hop-chu-vi',
      'other-another-va-dai-tu-bat-dinh',
      'cau-bi-dong',
      'dong-tu-khuyet-thieu',
      'to-v-va-v-ing',
      'phan-tu-va-rut-gon',
      'gioi-tu',
      'lien-tu-va-tu-noi',
      'menh-de',
      'so-sanh',
      'cau-dieu-kien',
      'lien-tu-cap-va-cau-truc-song-song',
      'cau-gia-dinh',
      'cau-hoi-va-gian-tiep',
      'cau-truc-cong-viec',
      'trang-tu-va-tu-nhan-manh',
    ]);
  });

  it('keeps clause context, sentence function and neutral conjunctions distinct', () => {
    const relative = examples.find(
      (sentence) => sentence.english === 'The engineer who inspected the site sent a report.',
    );
    if (!relative) throw new Error('Missing relative-clause example');
    const relativeNodes = allNodes(relative.syntax);
    const who = relativeNodes.find((node) => node.kind === 'token' && node.text === 'who');
    expect(who).toMatchObject({ kind: 'token', role: 'S', pos: 'Đại từ quan hệ' });
    expect(relativeNodes.filter((node) => node.kind === 'group')).toHaveLength(2);

    const parallel = examples.find(
      (sentence) => sentence.english === 'The supervisor will review and approve the request.',
    );
    if (!parallel) throw new Error('Missing parallel-verb example');
    expect(
      allNodes(parallel.syntax).find((node) => node.kind === 'text' && node.text === ' and '),
    ).toBeDefined();
    expect(
      allNodes(parallel.syntax).filter((node) => node.kind === 'token' && node.role === 'V'),
    ).toHaveLength(2);
  });
});

describe('authored twelve-tense timeline', () => {
  it('contains each period and aspect exactly once with valid timeline coordinates', () => {
    expect(TENSE_EXAMPLES).toHaveLength(12);
    expect(new Set(TENSE_EXAMPLES.map((example) => example.id)).size).toBe(12);
    const combinations = TENSE_EXAMPLES.map((example) => `${example.period}:${example.aspect}`);
    for (const period of ['past', 'present', 'future']) {
      for (const aspect of ['simple', 'continuous', 'perfect', 'perfect-continuous']) {
        expect(
          combinations.filter((combination) => combination === `${period}:${aspect}`),
        ).toHaveLength(1);
      }
    }
    for (const example of TENSE_EXAMPLES) {
      verifySentence(example.sentence);
      expect(example.formula.trim()).not.toBe('');
      expect(example.description.trim()).not.toBe('');
      for (const coordinate of [
        example.diagram.start,
        example.diagram.end,
        example.diagram.reference,
      ]) {
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThanOrEqual(100);
      }
      expect(example.diagram.start).toBeLessThanOrEqual(example.diagram.end);
      if (example.period === 'past') expect(example.diagram.reference).toBeLessThan(50);
      if (example.period === 'present') expect(example.diagram.reference).toBe(50);
      if (example.period === 'future') expect(example.diagram.reference).toBeGreaterThan(50);
    }
  });

  it('distinguishes routine, ongoing duration, completion and accumulated duration', () => {
    const shapes = new Set(TENSE_EXAMPLES.map((example) => example.diagram.shape));
    expect(shapes).toEqual(
      new Set(['routine', 'point', 'duration', 'perfect', 'perfect-duration']),
    );
    expect(
      TENSE_EXAMPLES.find((example) => example.period === 'present' && example.aspect === 'simple'),
    ).toMatchObject({
      label: 'Hiện tại đơn',
      diagram: { shape: 'routine', reference: 50 },
    });
  });
});

describe('authored sentence transformations', () => {
  it('keeps each step a complete reconstructable sentence with unique local IDs', () => {
    expect(PASSIVE_DEMO.steps).toHaveLength(3);
    expect(REDUCTION_DEMOS).toHaveLength(2);
    for (const demo of [PASSIVE_DEMO, ...REDUCTION_DEMOS]) {
      expect(demo.steps.length).toBeGreaterThanOrEqual(2);
      expect(new Set(demo.steps.map((step) => step.id)).size).toBe(demo.steps.length);
      for (const step of demo.steps) {
        verifySentence(step.sentence);
        expect(step.explanation.trim()).not.toBe('');
        expect(step.sentence.english.endsWith('.')).toBe(true);
      }
    }
  });

  it('preserves past tense, plurality, agent and time while moving stable passive tokens', () => {
    expect(PASSIVE_DEMO.steps.map((step) => step.sentence.english)).toEqual([
      'The accounting team sent the invoices yesterday.',
      'The invoices were sent by the accounting team yesterday.',
      'Yesterday, the invoices were sent by the accounting team.',
    ]);
    const origin = PASSIVE_DEMO.steps[0]?.sentence;
    if (!origin) throw new Error('Missing passive origin');
    expect(tokenById(origin, 'passive-patient').role).toBe('O');
    expect(tokenById(origin, 'passive-agent').role).toBe('S');
    for (const step of PASSIVE_DEMO.steps.slice(1)) {
      expect(tokenById(step.sentence, 'passive-patient').role).toBe('S');
      expect(tokenById(step.sentence, 'passive-verb').text).toBe('were sent');
      expect(tokenById(step.sentence, 'passive-agent')).toMatchObject({
        role: 'M',
        text: 'by the accounting team',
      });
      expect(tokenById(step.sentence, 'passive-time').text.toLowerCase()).toBe('yesterday');
    }
  });

  it('reduces only the relative clause and keeps stable main-clause verbs', () => {
    expect(REDUCTION_DEMOS.map((demo) => demo.steps.map((step) => step.sentence.english))).toEqual([
      [
        'The employees who are attending the seminar will receive certificates.',
        'The employees attending the seminar will receive certificates.',
      ],
      [
        'The documents which are attached to the email are confidential.',
        'The documents attached to the email are confidential.',
      ],
    ]);
    for (const demo of REDUCTION_DEMOS) {
      const origin = demo.steps[0]?.sentence;
      const reduced = demo.steps[1]?.sentence;
      if (!origin || !reduced) throw new Error(`Missing reduction states for ${demo.id}`);
      expect(tokenById(reduced, `${demo.id}-main-verb`)).toEqual(
        tokenById(origin, `${demo.id}-main-verb`),
      );
      expect(tokenById(reduced, `${demo.id}-noun`)).toEqual(tokenById(origin, `${demo.id}-noun`));
      expect(
        allNodes(reduced.syntax).some((node) => node.id === `${demo.id}-relative-subject`),
      ).toBe(false);
    }
  });
});
