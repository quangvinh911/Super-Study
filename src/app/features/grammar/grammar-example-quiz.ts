import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { HackerGrammarExample } from './hacker-grammar-examples';

@Component({
  selector: 'app-grammar-example-quiz',
  templateUrl: './grammar-example-quiz.html',
  styleUrl: './grammar-example-quiz.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrammarExampleQuiz {
  readonly example = input.required<HackerGrammarExample>();
  readonly number = input.required<number>();
  private readonly injector = inject(Injector);
  private readonly firstOption = viewChild.required<ElementRef<HTMLInputElement>>('optionInput');
  protected readonly selectedOptionId = linkedSignal({
    source: this.example,
    computation: () => '',
  });
  protected readonly checked = linkedSignal({ source: this.example, computation: () => false });
  protected readonly correctOption = computed(() =>
    this.example().quiz.options.find((option) => option.id === this.example().quiz.correctOptionId),
  );
  protected readonly isCorrect = computed(
    () => this.selectedOptionId() === this.example().quiz.correctOptionId,
  );
  protected readonly sentenceParts = computed(() => {
    const { english, highlight } = this.example();
    const start = english.indexOf(highlight);
    return [english.slice(0, start), english.slice(start + highlight.length)];
  });

  protected choose(optionId: string): void {
    if (!this.checked()) this.selectedOptionId.set(optionId);
  }

  protected check(): void {
    if (this.selectedOptionId()) this.checked.set(true);
  }

  protected retry(): void {
    this.selectedOptionId.set('');
    this.checked.set(false);
    afterNextRender(() => this.firstOption().nativeElement.focus(), { injector: this.injector });
  }
}
