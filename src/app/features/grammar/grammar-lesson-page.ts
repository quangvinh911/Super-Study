import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GRAMMAR_LESSONS, GrammarLesson } from './grammar-lessons';

@Component({
  selector: 'app-grammar-lesson-page',
  imports: [RouterLink],
  templateUrl: './grammar-lesson-page.html',
  styleUrl: './grammar-lesson-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrammarLessonPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly lessonCount = GRAMMAR_LESSONS.length;
  protected readonly lesson = signal<GrammarLesson | undefined>(undefined);
  protected readonly index = computed(() => {
    const currentLesson = this.lesson();
    return currentLesson ? GRAMMAR_LESSONS.indexOf(currentLesson) : -1;
  });
  protected readonly previous = computed(() => GRAMMAR_LESSONS[this.index() - 1]);
  protected readonly next = computed(() => GRAMMAR_LESSONS[this.index() + 1]);
  protected readonly selectedAnswers = signal<Readonly<Record<number, number>>>({});
  protected readonly checkedAnswers = signal<Readonly<Record<number, boolean>>>({});

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.lesson.set(GRAMMAR_LESSONS.find((item) => item.slug === params.get('slug')));
      this.selectedAnswers.set({});
      this.checkedAnswers.set({});
    });
  }

  protected selectAnswer(questionIndex: number, optionIndex: number): void {
    if (this.checkedAnswers()[questionIndex]) return;
    this.selectedAnswers.update((answers) => ({ ...answers, [questionIndex]: optionIndex }));
  }

  protected checkAnswer(questionIndex: number): void {
    if (this.selectedAnswers()[questionIndex] === undefined) return;
    this.checkedAnswers.update((answers) => ({ ...answers, [questionIndex]: true }));
  }

  protected retry(questionIndex: number): void {
    this.selectedAnswers.update((answers) => {
      const remaining = { ...answers };
      delete remaining[questionIndex];
      return remaining;
    });
    this.checkedAnswers.update((answers) => {
      const remaining = { ...answers };
      delete remaining[questionIndex];
      return remaining;
    });
  }
}
