import { TestBed } from '@angular/core/testing';
import { GrammarSyntaxSentence } from './grammar-syntax-sentence';
import { GrammarSentence } from './grammar-visual.models';

const SENTENCE: GrammarSentence = {
  id: 'syntax-fixture',
  english: 'The team works efficiently.',
  vietnamese: 'Nhóm làm việc hiệu quả.',
  clue: 'Trạng từ bổ nghĩa cho cách làm việc.',
  syntax: [
    {
      kind: 'group',
      id: 'main-clause',
      label: 'Mệnh đề chính',
      children: [
        {
          kind: 'token',
          id: 'team',
          text: 'The team',
          role: 'S',
          pos: 'Cụm danh từ',
          explanation: 'Nhóm thực hiện hành động.',
        },
        { kind: 'text', id: 'space-1', text: ' ' },
        {
          kind: 'token',
          id: 'works',
          text: 'works',
          role: 'V',
          pos: 'Động từ',
          explanation: 'Động từ chính chia theo chủ ngữ số ít.',
        },
        { kind: 'text', id: 'space-2', text: ' ' },
        {
          kind: 'group',
          id: 'manner',
          label: 'Cách thức',
          role: 'M',
          children: [
            {
              kind: 'token',
              id: 'efficiently',
              text: 'efficiently',
              role: 'M',
              pos: 'Trạng từ',
              explanation: 'Cho biết hành động được thực hiện thế nào.',
              wordFormation: 'efficient → efficiently',
              distractor: 'Tính từ efficient không bổ nghĩa trực tiếp cho works.',
            },
          ],
        },
        { kind: 'text', id: 'period', text: '.' },
      ],
    },
  ],
};

describe('GrammarSyntaxSentence', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [GrammarSyntaxSentence] }).compileComponents();
    const fixture = TestBed.createComponent(GrammarSyntaxSentence);
    fixture.componentRef.setInput('sentence', SENTENCE);
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  it('renders nested groups with neutral punctuation, role labels, translation and clue', async () => {
    const { fixture, page } = await render();
    expect(page.querySelectorAll('.syntax-group')).toHaveLength(2);
    expect(page.querySelectorAll('button button')).toHaveLength(0);
    expect(page.querySelector('.syntax-neutral')?.textContent).toBe(' ');
    expect(page.querySelector('[data-syntax-id="team"]')?.textContent).toContain('S · Chủ ngữ');
    expect(page.querySelector('.syntax-token__text')?.getAttribute('lang')).toBe('en');
    expect(page.querySelector('.syntax-token__role')?.getAttribute('lang')).toBe('vi');
    expect(page.querySelector('.syntax-translation')?.textContent).toBe(SENTENCE.vietnamese);
    expect(page.querySelector('.syntax-clue')?.textContent).toContain(SENTENCE.clue);
    expect(page.querySelector('.syntax-legend')).toBeNull();

    fixture.componentRef.setInput('showLegend', true);
    await fixture.whenStable();
    expect(page.querySelectorAll('.syntax-legend li')).toHaveLength(5);
  });

  it('shows only the selected token details and restores focus after Escape or closing', async () => {
    const { fixture, page } = await render();
    const manner = page.querySelector<HTMLButtonElement>('[data-syntax-id="efficiently"]');
    const verb = page.querySelector<HTMLButtonElement>('[data-syntax-id="works"]');
    if (!manner || !verb) throw new Error('Missing sentence controls');
    manner.click();
    await fixture.whenStable();
    expect(manner.getAttribute('aria-expanded')).toBe('true');
    expect(page.querySelector('.syntax-pos')?.textContent).toContain('Trạng từ');
    expect(page.querySelector('.syntax-extra')?.textContent).toContain('efficient → efficiently');
    expect(page.querySelector('.syntax-trap')?.textContent).toContain('Tính từ efficient');

    verb.click();
    await fixture.whenStable();
    expect(page.querySelectorAll('.syntax-detail')).toHaveLength(1);
    expect(page.querySelector('.syntax-pos')?.textContent).toContain('Động từ');
    expect(page.querySelector('.syntax-extra')).toBeNull();
    expect(manner.getAttribute('aria-expanded')).toBe('false');
    page
      .querySelector('.syntax-detail')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(page.querySelector('.syntax-detail')).toBeNull();
    expect(document.activeElement).toBe(verb);

    manner.click();
    await fixture.whenStable();
    page.querySelector<HTMLButtonElement>('.syntax-close')?.click();
    await fixture.whenStable();
    expect(page.querySelector('.syntax-detail')).toBeNull();
    expect(document.activeElement).toBe(manner);
  });

  it('clears selected details when the sentence input changes', async () => {
    const { fixture, page } = await render();
    page.querySelector<HTMLButtonElement>('[data-syntax-id="team"]')?.click();
    await fixture.whenStable();
    expect(page.querySelector('.syntax-detail')).not.toBeNull();
    fixture.componentRef.setInput('sentence', {
      ...SENTENCE,
      id: 'next-sentence',
      vietnamese: 'Câu tiếp theo.',
    });
    await fixture.whenStable();
    expect(page.querySelector('.syntax-detail')).toBeNull();
    expect(page.querySelector('[aria-expanded="true"]')).toBeNull();
    expect(page.querySelector('.syntax-translation')?.textContent).toBe('Câu tiếp theo.');
  });
});
