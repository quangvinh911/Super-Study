import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GRAMMAR_LESSONS, GRAMMAR_STAGES, GrammarLesson, GrammarStage } from './grammar-lessons';

@Component({
  selector: 'app-grammar-overview-page',
  imports: [RouterLink],
  templateUrl: './grammar-overview-page.html',
  styleUrl: './grammar-overview-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrammarOverviewPage {
  protected readonly stages = GRAMMAR_STAGES;
  protected readonly lessonCount = GRAMMAR_LESSONS.length;

  protected lessonsFor(stage: GrammarStage) {
    return GRAMMAR_LESSONS.filter((lesson) => lesson.stage === stage);
  }

  protected position(lesson: GrammarLesson): number {
    return GRAMMAR_LESSONS.indexOf(lesson) + 1;
  }
}
