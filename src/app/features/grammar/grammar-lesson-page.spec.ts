import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GrammarLessonPage } from './grammar-lesson-page';
import { GRAMMAR_LEARNING_ORDER, GRAMMAR_LESSONS } from './grammar-lessons';
import { HackerGrammarExamples, parseHackerGrammarExamples } from './hacker-grammar-examples';
import { hackerGrammarFixture } from './hacker-grammar-examples.fixture';

describe('TOEIC grammar lessons', () => {
  function element<T extends Element>(scope: ParentNode, selector: string): T {
    const result = scope.querySelector<T>(selector);
    if (!result) throw new Error('Missing element: ' + selector);
    return result;
  }
  async function render(slug = 'cac-thi') {
    const params = new BehaviorSubject(convertToParamMap({ slug }));
    const examples = {
      groups: signal(parseHackerGrammarExamples(hackerGrammarFixture())),
      loading: signal(false),
      error: signal(''),
      load: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [GrammarLessonPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
        { provide: HackerGrammarExamples, useValue: examples },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GrammarLessonPage);
    await fixture.whenStable();
    return { fixture, params, examples, page: fixture.nativeElement as HTMLElement };
  }

  it('retains all lesson slugs and keeps visual examples associated with valid rules', () => {
    expect(GRAMMAR_LESSONS).toHaveLength(19);
    expect(new Set(GRAMMAR_LESSONS.map((lesson) => lesson.slug)).size).toBe(19);
    for (const lesson of GRAMMAR_LESSONS) {
      const labels = new Set(lesson.rules.map((rule) => rule.label));
      for (const example of lesson.examples) expect(labels.has(example.ruleLabel)).toBe(true);
      expect('checks' in lesson).toBe(false);
    }
  });

  it('renders five sourced examples in a closed native disclosure for every rule in all 19 lessons', async () => {
    const { fixture, params, page } = await render();
    for (const [index, lesson] of GRAMMAR_LEARNING_ORDER.entries()) {
      params.next(convertToParamMap({ slug: lesson.slug }));
      await fixture.whenStable();
      expect(page.querySelector('h1')?.textContent).toContain(lesson.title);
      expect(page.querySelector('.grammar-lesson-meta')?.textContent).toContain(
        'Bài ' + (index + 1),
      );
      expect(page.querySelector('#checks-heading')).toBeNull();
      expect(page.querySelectorAll('.grammar-check')).toHaveLength(0);
      const disclosures = page.querySelectorAll<HTMLDetailsElement>('.grammar-rule-examples');
      expect(disclosures).toHaveLength(lesson.rules.length);
      for (const disclosure of disclosures) {
        expect(disclosure.open).toBe(false);
        expect(disclosure.querySelector('summary')?.textContent).toContain('5 câu trắc nghiệm');
        expect(disclosure.querySelectorAll('li')).toHaveLength(5);
        expect(disclosure.querySelectorAll('input[type=radio]')).toHaveLength(20);
        expect(disclosure.querySelectorAll('mark')).toHaveLength(0);
        expect(disclosure.textContent).toContain('Hacker 3 · Test 1 · Part 5');
        expect(disclosure.textContent).toContain('Câu biến đổi');
        expect(disclosure.querySelector('.grammar-example__original')).toBeNull();
        expect(disclosure.querySelector('.grammar-example__explanation')).toBeNull();
      }
      expect(page.querySelector('.grammar-practice a')?.getAttribute('href')).toBe(
        '/certificates/toeic/practice?part=' + lesson.part,
      );
      const neighbors = page.querySelectorAll<HTMLAnchorElement>('.grammar-neighbors a');
      const expected = [GRAMMAR_LEARNING_ORDER[index - 1], GRAMMAR_LEARNING_ORDER[index + 1]]
        .filter((item) => item !== undefined)
        .map((item) => '/certificates/toeic/grammar/' + item.slug);
      expect(Array.from(neighbors, (link) => link.getAttribute('href'))).toEqual(expected);
    }
  });

  it('keeps each exercise independent and clears answers when navigating to another lesson', async () => {
    const { fixture, params, page } = await render();
    const quizzes = page.querySelectorAll('app-grammar-example-quiz');
    element<HTMLInputElement>(quizzes[0], 'input[value=B]').click();
    await fixture.whenStable();
    element<HTMLButtonElement>(quizzes[0], '.quiz-actions button').click();
    await fixture.whenStable();
    expect(quizzes[0].querySelector('[role=status]')?.textContent).toContain('Chính xác!');
    expect(quizzes[1].querySelector('[role=status]')).toBeNull();
    expect(element<HTMLButtonElement>(quizzes[1], '.quiz-actions button').disabled).toBe(true);
    params.next(convertToParamMap({ slug: 'cau-bi-dong' }));
    await fixture.whenStable();
    expect(page.querySelector('.quiz-feedback')).toBeNull();
    expect(page.querySelector('app-grammar-example-quiz input[type=radio]:checked')).toBeNull();
    params.next(convertToParamMap({ slug: 'cac-thi' }));
    await fixture.whenStable();
    expect(page.querySelector('.quiz-feedback')).toBeNull();
    expect(page.querySelector('app-grammar-example-quiz input[type=radio]:checked')).toBeNull();
  });

  it('opens each rule independently and resets disclosures and timeline on navigation', async () => {
    const { fixture, params, page } = await render();
    const disclosures = page.querySelectorAll<HTMLDetailsElement>('.grammar-rule-examples');
    element<HTMLElement>(disclosures[0], 'summary').click();
    await fixture.whenStable();
    expect(disclosures[0].open).toBe(true);
    expect(disclosures[1].open).toBe(false);
    element<HTMLElement>(disclosures[0], 'summary').click();
    await fixture.whenStable();
    expect(disclosures[0].open).toBe(false);
    disclosures[0].open = true;
    const slider = element<HTMLInputElement>(page, 'input[type="range"]');
    slider.value = '2';
    slider.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    params.next(convertToParamMap({ slug: 'cau-bi-dong' }));
    await fixture.whenStable();
    expect(element<HTMLDetailsElement>(page, '.grammar-rule-examples').open).toBe(false);
    expect(page.querySelector('app-grammar-transformation')).not.toBeNull();
    params.next(convertToParamMap({ slug: 'cac-thi' }));
    await fixture.whenStable();
    expect(page.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe('1');
    expect(element<HTMLDetailsElement>(page, '.grammar-rule-examples').open).toBe(false);
  });

  it('offers retry when private examples are unavailable instead of showing invented data', async () => {
    const { fixture, examples, page } = await render();
    examples.groups.set([]);
    examples.error.set('Chưa tải được ví dụ Hacker.');
    await fixture.whenStable();
    expect(page.querySelectorAll('.grammar-hacker-examples li')).toHaveLength(0);
    expect(page.querySelector('.grammar-examples-error')?.textContent).toContain('Chưa tải được');
    element<HTMLButtonElement>(page, '.grammar-examples-error button').click();
    expect(examples.load).toHaveBeenCalledTimes(2);
  });

  it('offers a library link for an unknown slug', async () => {
    const { page } = await render('not-a-lesson');
    expect(page.querySelector('h1')?.textContent).toContain('Không tìm thấy bài học');
    expect(page.querySelector('.grammar-not-found a')?.getAttribute('href')).toBe(
      '/certificates/toeic/grammar',
    );
    expect(page.querySelector('.grammar-article')).toBeNull();
  });
});
