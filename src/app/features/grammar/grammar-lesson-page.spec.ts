import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { GrammarLessonPage } from './grammar-lesson-page';
import { GRAMMAR_LEARNING_ORDER, GRAMMAR_LESSONS } from './grammar-lessons';

describe('TOEIC grammar lessons', () => {
  function element<T extends Element>(scope: ParentNode, selector: string): T {
    const result = scope.querySelector<T>(selector);
    if (!result) throw new Error('Missing element: ' + selector);
    return result;
  }
  async function render(slug = 'cac-thi') {
    const params = new BehaviorSubject(convertToParamMap({ slug }));
    await TestBed.configureTestingModule({
      imports: [GrammarLessonPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GrammarLessonPage);
    await fixture.whenStable();
    return { fixture, params, page: fixture.nativeElement as HTMLElement };
  }

  it('retains 19 lessons and the two original self-checks per lesson', () => {
    expect(GRAMMAR_LESSONS).toHaveLength(19);
    expect(new Set(GRAMMAR_LESSONS.map((lesson) => lesson.slug)).size).toBe(19);
    for (const lesson of GRAMMAR_LESSONS) {
      const ruleLabels = new Set(lesson.rules.map((rule) => rule.label));
      expect(lesson.examples).toHaveLength(2);
      for (const example of lesson.examples) expect(ruleLabels.has(example.ruleLabel)).toBe(true);
      expect(lesson.checks).toHaveLength(2);
      for (const check of lesson.checks) {
        expect(check.options).toHaveLength(4);
        expect(new Set(check.options).size).toBe(4);
        expect(Number.isInteger(check.answer)).toBe(true);
        expect(check.answer).toBeGreaterThanOrEqual(0);
        expect(check.answer).toBeLessThan(4);
        expect(check.explanation.trim()).not.toBe('');
      }
    }
  });

  it('delays feedback, disables checked answers and supports retry for correct and incorrect choices', async () => {
    const { fixture, page } = await render();
    const fieldsets = page.querySelectorAll<HTMLFieldSetElement>('.grammar-check');
    const lesson = GRAMMAR_LESSONS.find((item) => item.slug === 'cac-thi');
    if (!lesson) throw new Error('Missing tense lesson');
    for (const [index, check] of lesson.checks.entries()) {
      const fieldset = fieldsets[index];
      let button = element<HTMLButtonElement>(fieldset, 'button');
      expect(button.disabled).toBe(true);
      expect(fieldset.querySelector('[role="status"]')).toBeNull();
      const radios = fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]');
      radios[index === 0 ? check.answer : (check.answer + 1) % 4].click();
      await fixture.whenStable();
      expect(fieldset.querySelector('[role="status"]')).toBeNull();
      button.focus();
      button.click();
      await fixture.whenStable();
      expect(fieldset.querySelector('[role="status"]')?.textContent).toContain(
        index === 0 ? 'Đúng rồi.' : 'Chưa đúng.',
      );
      expect(Array.from(radios).every((radio) => radio.disabled)).toBe(true);
      expect(document.activeElement).toBe(button);
      button = element<HTMLButtonElement>(fieldset, 'button');
      button.click();
      await fixture.whenStable();
      expect(fieldset.querySelector('[role="status"]')).toBeNull();
      expect(fieldset.querySelector('input:checked')).toBeNull();
      expect(Array.from(radios).every((radio) => !radio.disabled)).toBe(true);
      expect(document.activeElement).toBe(radios[0]);
      expect(fieldset.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
    }
  });

  it('renders all 19 lessons, preserves practice links and uses the same neighbor order as the library', async () => {
    const { fixture, params, page } = await render();
    for (const [index, lesson] of GRAMMAR_LEARNING_ORDER.entries()) {
      params.next(convertToParamMap({ slug: lesson.slug }));
      await fixture.whenStable();
      expect(page.querySelector('h1')?.textContent).toContain(lesson.title);
      expect(page.querySelector('.grammar-lesson-meta')?.textContent).toContain(
        'Bài ' + (index + 1),
      );
      expect(page.querySelectorAll('.grammar-check')).toHaveLength(2);
      expect(page.querySelectorAll('.grammar-rule app-grammar-syntax-sentence')).toHaveLength(2);
      expect(page.querySelector('.grammar-breadcrumb')).toBeNull();
      expect(page.querySelector('.grammar-sidebar')).toBeNull();
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

  it('clears answers and restores the default timeline after leaving and returning to a lesson', async () => {
    const { fixture, params, page } = await render();
    const radio = element<HTMLInputElement>(page, '.grammar-check input');
    radio.click();
    await fixture.whenStable();
    element<HTMLButtonElement>(page, '.grammar-check button').click();
    await fixture.whenStable();
    const slider = element<HTMLInputElement>(page, 'input[type="range"]');
    slider.value = '2';
    slider.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    params.next(convertToParamMap({ slug: 'cau-bi-dong' }));
    await fixture.whenStable();
    expect(page.querySelector('input:checked')).toBeNull();
    expect(page.querySelector('.grammar-check [role="status"]')).toBeNull();
    expect(page.querySelector('app-grammar-transformation')).not.toBeNull();
    params.next(convertToParamMap({ slug: 'cac-thi' }));
    await fixture.whenStable();
    expect(page.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe('1');
    expect(page.querySelector('.grammar-check input:checked')).toBeNull();
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
