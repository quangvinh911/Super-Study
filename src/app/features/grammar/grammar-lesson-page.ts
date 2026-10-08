import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GRAMMAR_LEARNING_ORDER, GrammarLesson } from './grammar-lessons';
import { GrammarSyntaxSentence } from './grammar-syntax-sentence';
import { GrammarTenseTimeline } from './grammar-tense-timeline';
import { GrammarTransformation } from './grammar-transformation';
import { PASSIVE_DEMO, REDUCTION_DEMOS, TENSE_EXAMPLES } from './grammar-visual-data';
import { HackerGrammarExamples } from './hacker-grammar-examples';

@Component({
  selector: 'app-grammar-lesson-page',
  imports: [RouterLink, GrammarSyntaxSentence, GrammarTenseTimeline, GrammarTransformation],
  templateUrl: './grammar-lesson-page.html',
  styleUrl: './grammar-lesson-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrammarLessonPage {
  protected readonly hackerExamples = inject(HackerGrammarExamples);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly lessonCount = GRAMMAR_LEARNING_ORDER.length;
  protected readonly tenseExamples = TENSE_EXAMPLES;
  protected readonly passiveDemo = PASSIVE_DEMO;
  protected readonly reductionDemos = REDUCTION_DEMOS;
  protected readonly lesson = signal<GrammarLesson | undefined>(undefined);
  protected readonly index = computed(() => {
    const currentLesson = this.lesson();
    return currentLesson ? GRAMMAR_LEARNING_ORDER.indexOf(currentLesson) : -1;
  });
  protected readonly previous = computed(() => GRAMMAR_LEARNING_ORDER[this.index() - 1]);
  protected readonly next = computed(() => GRAMMAR_LEARNING_ORDER[this.index() + 1]);

  constructor() {
    void this.hackerExamples.load();
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.lesson.set(GRAMMAR_LEARNING_ORDER.find((item) => item.slug === params.get('slug')));
      afterNextRender(
        () => {
          const fragment = this.route.snapshot?.fragment;
          const target = fragment
            ? Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[id]')).find(
                (element) => element.id === fragment,
              )
            : undefined;
          if (target) {
            target.focus({ preventScroll: true });
            target.scrollIntoView();
          } else {
            this.host.nativeElement.querySelector('h1')?.focus();
          }
        },
        { injector: this.injector },
      );
    });
  }

  protected examplesForRule(slug: string, ruleLabel: string) {
    return (
      this.hackerExamples
        .groups()
        .find((group) => group.slug === slug && group.ruleLabel === ruleLabel)?.examples ?? []
    );
  }

  protected sentenceParts(english: string, highlight: string): readonly [string, string] {
    const start = english.indexOf(highlight);
    return [english.slice(0, start), english.slice(start + highlight.length)];
  }

  protected ruleUseLines(use: string): readonly string[] {
    return use
      .split(';')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => (/[.!?]$/u.test(line) ? line : `${line}.`));
  }
}
