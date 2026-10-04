import { TestBed } from '@angular/core/testing';
import { GrammarTenseTimeline } from './grammar-tense-timeline';
import { GrammarSentence, TenseAspect, TenseExample, TensePeriod } from './grammar-visual.models';

const SENTENCE: GrammarSentence = {
  id: 'tense-fixture',
  english: 'We work.',
  vietnamese: 'Chúng tôi làm việc.',
  clue: 'Ví dụ kiểm thử tổng hợp.',
  syntax: [
    { kind: 'token', id: 'subject', text: 'We', role: 'S', pos: 'Đại từ', explanation: 'Chủ ngữ.' },
    { kind: 'text', id: 'space', text: ' ' },
    {
      kind: 'token',
      id: 'verb',
      text: 'work',
      role: 'V',
      pos: 'Động từ',
      explanation: 'Hành động.',
    },
    { kind: 'text', id: 'period', text: '.' },
  ],
};
const PERIODS: readonly TensePeriod[] = ['past', 'present', 'future'];
const ASPECTS: readonly TenseAspect[] = ['simple', 'continuous', 'perfect', 'perfect-continuous'];
const SHAPES: Readonly<Record<TenseAspect, TenseExample['diagram']['shape']>> = {
  simple: 'routine',
  continuous: 'duration',
  perfect: 'perfect',
  'perfect-continuous': 'perfect-duration',
};
const EXAMPLES: readonly TenseExample[] = PERIODS.flatMap((period) =>
  ASPECTS.map((aspect) => ({
    id: `${period}-${aspect}`,
    period,
    aspect,
    label: `${period}/${aspect}`,
    formula: `${period}+${aspect}`,
    sentence: { ...SENTENCE, id: `${period}-${aspect}-sentence` },
    description: `Mô tả ${period}/${aspect}.`,
    diagram: { shape: SHAPES[aspect], start: 15, end: 45, reference: 50 },
  })),
);

describe('GrammarTenseTimeline', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [GrammarTenseTimeline] }).compileComponents();
    const fixture = TestBed.createComponent(GrammarTenseTimeline);
    fixture.componentRef.setInput('examples', EXAMPLES);
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  it('defaults to present simple and provides a text equivalent of its diagram', async () => {
    const { page } = await render();
    expect(page.querySelector('h3')?.textContent).toBe('present/simple');
    expect(page.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe('1');
    expect(page.querySelector('input[type="range"]')?.getAttribute('aria-valuetext')).toBe(
      'Hiện tại',
    );
    expect(page.querySelector<HTMLInputElement>('input[value="simple"]')?.checked).toBe(true);
    expect(page.querySelector('svg')?.getAttribute('aria-label')).toBe('Mô tả present/simple.');
    expect(page.querySelector('figcaption')?.textContent).toBe('Mô tả present/simple.');
    expect(page.querySelectorAll('.diagram-event')).toHaveLength(3);
    expect(page.querySelector('.diagram-now')?.getAttribute('x1')).toBe('50');
  });

  it('updates all twelve authored combinations through native range and radio controls', async () => {
    const { fixture, page } = await render();
    const range = page.querySelector<HTMLInputElement>('input[type="range"]');
    if (!range) throw new Error('Missing time control');
    for (const [index, period] of PERIODS.entries()) {
      range.value = String(index);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
      for (const aspect of ASPECTS) {
        page.querySelector<HTMLInputElement>(`input[value="${aspect}"]`)?.click();
        await fixture.whenStable();
        expect(page.querySelector('h3')?.textContent).toBe(`${period}/${aspect}`);
        expect(page.querySelector('.tense-formula strong')?.textContent).toBe(
          `${period}+${aspect}`,
        );
        expect(page.querySelector('figcaption')?.textContent).toBe(`Mô tả ${period}/${aspect}.`);
      }
    }
  });

  it('shows completion at the authored end and its result extending to the reference point', async () => {
    const { fixture, page } = await render();
    const example = EXAMPLES.find((item) => item.period === 'present' && item.aspect === 'perfect');
    if (!example) throw new Error('Missing authored perfect example');
    page.querySelector<HTMLInputElement>('input[value="perfect"]')?.click();
    await fixture.whenStable();
    const diagram = page.querySelector('svg');
    if (!diagram) throw new Error('Missing timeline diagram');
    expect(page.querySelector('h3')?.getAttribute('aria-live')).toBe('polite');
    expect(diagram.querySelector('circle')?.getAttribute('cx')).toBe(String(example.diagram.end));
    expect(
      Array.from(diagram.querySelectorAll('line')).some(
        (line) =>
          line.getAttribute('x1') === String(example.diagram.end) &&
          line.getAttribute('x2') === String(example.diagram.reference),
      ),
    ).toBe(true);
  });

  it('resets controls on a new examples input and reports missing data without a substitute', async () => {
    const { fixture, page } = await render();
    const range = page.querySelector<HTMLInputElement>('input[type="range"]');
    if (!range) throw new Error('Missing time control');
    range.value = '2';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    page.querySelector<HTMLInputElement>('input[value="perfect"]')?.click();
    await fixture.whenStable();
    expect(page.querySelector('h3')?.textContent).toBe('future/perfect');
    fixture.componentRef.setInput('examples', [...EXAMPLES]);
    await fixture.whenStable();
    expect(page.querySelector('h3')?.textContent).toBe('present/simple');
    fixture.componentRef.setInput('examples', []);
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Chưa có ví dụ');
    expect(page.querySelector('app-grammar-syntax-sentence')).toBeNull();
  });
});
