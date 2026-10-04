import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GRAMMAR_LEARNING_ORDER, GRAMMAR_STAGES, GrammarLesson } from './grammar-lessons';

@Component({
  selector: 'app-grammar-mind-map',
  imports: [RouterLink],
  templateUrl: './grammar-mind-map.html',
  styleUrl: './grammar-mind-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrammarMindMap {
  readonly lessons = input.required<readonly GrammarLesson[]>();
  protected readonly groups = computed(() =>
    GRAMMAR_STAGES.map((name, index) => ({
      name,
      index,
      lessons: this.lessons().filter((lesson) => lesson.stage === name),
    })).filter((group) => group.lessons.length > 0),
  );

  protected position(lesson: GrammarLesson): string {
    return String(GRAMMAR_LEARNING_ORDER.indexOf(lesson) + 1).padStart(2, '0');
  }
}
