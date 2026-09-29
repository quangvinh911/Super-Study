import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { GrammarLessonPage } from './grammar-lesson-page';
import { GRAMMAR_LESSONS } from './grammar-lessons';

describe('TOEIC grammar lessons', () => {
  it('provides 16 complete lessons with two valid self-check answers each', () => {
    expect(GRAMMAR_LESSONS).toHaveLength(16);
    expect(new Set(GRAMMAR_LESSONS.map((lesson) => lesson.slug)).size).toBe(16);
    for (const lesson of GRAMMAR_LESSONS) {
      expect(lesson.examples.length).toBeGreaterThanOrEqual(2);
      expect(lesson.rules.length).toBeGreaterThanOrEqual(3);
      expect(lesson.visual.steps.length).toBeGreaterThanOrEqual(3);
      expect(lesson.checks).toHaveLength(2);
      for (const check of lesson.checks) {
        expect(check.options).toHaveLength(4);
        expect(new Set(check.options).size).toBe(4);
        expect(check.answer).toBeGreaterThanOrEqual(0);
        expect(check.answer).toBeLessThan(4);
        expect(check.explanation.trim()).not.toBe('');
      }
    }
  });

  it('shows feedback, allows a retry, and clears answers on the next lesson', async () => {
    const params = new BehaviorSubject(convertToParamMap({ slug: 'cau-va-tu-loai' }));
    await TestBed.configureTestingModule({
      imports: [GrammarLessonPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(GrammarLessonPage);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const firstQuestion = page.querySelector('.grammar-check') as HTMLFieldSetElement;
    const correctOption = firstQuestion.querySelectorAll(
      'input[type="radio"]',
    )[1] as HTMLInputElement;
    correctOption.click();
    await fixture.whenStable();
    (firstQuestion.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(firstQuestion.querySelector('[role="status"]')?.textContent).toContain('Đúng rồi');

    (firstQuestion.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(firstQuestion.querySelector('[role="status"]')).toBeNull();
    expect(firstQuestion.querySelectorAll('input:checked')).toHaveLength(0);

    params.next(convertToParamMap({ slug: 'cau-bi-dong' }));
    await fixture.whenStable();
    expect(page.querySelector('h1')?.textContent).toContain('Câu bị động');
    expect(page.querySelectorAll('input:checked')).toHaveLength(0);
  });
});
