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
      const ruleLabels = new Set(lesson.rules.map((rule) => rule.label));
      for (const example of lesson.examples) {
        expect(ruleLabels.has(example.ruleLabel)).toBe(true);
      }
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
    const params = new BehaviorSubject(convertToParamMap({ slug: 'cac-thi' }));
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
    const lessonSections = page.querySelectorAll('.grammar-article > section');
    expect(lessonSections).toHaveLength(2);
    expect(lessonSections[0].querySelector('h2')?.textContent).toContain('Cấu trúc / Quy tắc');
    expect(lessonSections[0].querySelector('.grammar-flow')).toBeNull();
    expect(lessonSections[0].querySelectorAll('.grammar-learning-card')).toHaveLength(1);
    expect(lessonSections[0].querySelector('.grammar-examples-block')).toBeNull();
    expect(lessonSections[0].querySelectorAll('.grammar-example')).toHaveLength(2);
    const firstRule = lessonSections[0].querySelector('.grammar-rule') as HTMLElement;
    expect(firstRule.querySelector('h3')?.textContent).toContain('Hiện tại');
    expect(firstRule.querySelector('.grammar-formula-label')?.textContent).toContain('Công thức');
    expect(firstRule.querySelector('.grammar-pattern')?.textContent).toContain('have/has + V3');
    expect(
      Array.from(firstRule.querySelectorAll('.grammar-rule__use-line')).map((line) =>
        line.textContent?.trim(),
      ),
    ).toEqual([
      'Lần lượt: thói quen.',
      'đang diễn ra.',
      'kết quả còn liên quan hiện tại.',
      'quá trình kéo dài đến nay.',
    ]);
    expect(firstRule.querySelector('.grammar-examples__label')?.textContent).toContain('Ví dụ');
    expect(
      firstRule.querySelector('.grammar-example')?.textContent?.replace(/\s+/g, ' ').trim(),
    ).toContain('The supplier has delivered the materials.');
    expect(firstRule.querySelector('.grammar-example__translation')?.textContent).toContain(
      'Nhà cung cấp đã giao vật liệu.',
    );
    expect(lessonSections[1].querySelector('h2')?.textContent).toContain('Thực hành trắc nghiệm');
    expect(
      Array.from(lessonSections[1].querySelectorAll('.grammar-check__meta')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['Câu 1 · Dễ', 'Câu 2 · Khó']);
    expect(page.querySelector('.grammar-sidebar a[href$="#checks-heading"]')).not.toBeNull();

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
