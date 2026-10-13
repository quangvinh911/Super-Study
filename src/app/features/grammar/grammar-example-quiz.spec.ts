import { TestBed } from '@angular/core/testing';
import { GrammarExampleQuiz } from './grammar-example-quiz';
import { hackerGrammarFixture } from './hacker-grammar-examples.fixture';
import { parseHackerGrammarExamples } from './hacker-grammar-examples';

describe('Grammar example multiple-choice practice', () => {
  function element<T extends Element>(scope: ParentNode, selector: string): T {
    const result = scope.querySelector<T>(selector);
    if (!result) throw new Error('Missing element: ' + selector);
    return result;
  }

  async function render() {
    const examples = parseHackerGrammarExamples(hackerGrammarFixture())[0].examples;
    await TestBed.configureTestingModule({ imports: [GrammarExampleQuiz] }).compileComponents();
    const fixture = TestBed.createComponent(GrammarExampleQuiz);
    fixture.componentRef.setInput('example', examples[4]);
    fixture.componentRef.setInput('number', 5);
    await fixture.whenStable();
    return { fixture, examples, page: fixture.nativeElement as HTMLElement };
  }

  it('hides completed sentences and explanations until checking a chosen answer', async () => {
    const { fixture, examples, page } = await render();
    expect(page.querySelectorAll('input[type=radio]')).toHaveLength(4);
    expect(page.querySelector('legend')?.textContent).toContain('Câu 5');
    expect(page.textContent).toContain('The team _____ report 5.');
    expect(page.textContent).not.toContain(examples[4].english);
    expect(page.textContent).not.toContain(examples[4].source.quote);
    expect(page.querySelector('.grammar-example__explanation')).toBeNull();
    expect(element<HTMLButtonElement>(page, '.quiz-actions button').disabled).toBe(true);
    element<HTMLInputElement>(page, 'input[value=B]').click();
    await fixture.whenStable();
    const checkButton = element<HTMLButtonElement>(page, '.quiz-actions button');
    checkButton.focus();
    checkButton.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(checkButton);
    expect(page.querySelector('[role=status]')?.textContent).toContain('Chính xác!');
    expect(page.querySelector('[role=status]')?.textContent).toContain('B. reviews');
    expect(page.querySelector('.grammar-example__explanation')?.textContent).toBe(
      examples[4].explanation,
    );
    expect(page.querySelector('.grammar-example__original')?.textContent).toContain(
      examples[4].source.quote,
    );
    expect(element<HTMLFieldSetElement>(page, 'fieldset').disabled).toBe(true);
  });

  it('shows the correct answer for a wrong choice and supports a fresh retry', async () => {
    const { fixture, page } = await render();
    element<HTMLInputElement>(page, 'input[value=A]').click();
    await fixture.whenStable();
    element<HTMLButtonElement>(page, '.quiz-actions button').click();
    await fixture.whenStable();
    expect(page.querySelector('[role=status]')?.textContent).toContain('Chưa chính xác.');
    expect(page.querySelector('[role=status]')?.textContent).toContain('B. reviews');
    element<HTMLButtonElement>(page, '.quiz-actions button').click();
    await fixture.whenStable();
    expect(page.querySelector('[role=status]')).toBeNull();
    expect(page.querySelector('input:checked')).toBeNull();
    expect(element<HTMLFieldSetElement>(page, 'fieldset').disabled).toBe(false);
    expect(element<HTMLButtonElement>(page, '.quiz-actions button').disabled).toBe(true);
    expect(document.activeElement).toBe(element<HTMLInputElement>(page, 'input[type=radio]'));
  });

  it('clears an answer and its feedback when the example input changes', async () => {
    const { fixture, examples, page } = await render();
    element<HTMLInputElement>(page, 'input[value=B]').click();
    await fixture.whenStable();
    element<HTMLButtonElement>(page, '.quiz-actions button').click();
    await fixture.whenStable();
    fixture.componentRef.setInput('example', examples[0]);
    await fixture.whenStable();
    expect(page.querySelector('[role=status]')).toBeNull();
    expect(page.querySelector('input:checked')).toBeNull();
    expect(element<HTMLInputElement>(page, 'input').name).toBe(examples[0].id);
  });
});
