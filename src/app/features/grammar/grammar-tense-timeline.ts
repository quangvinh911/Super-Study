import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { GrammarSyntaxSentence } from './grammar-syntax-sentence';
import { TenseAspect, TenseExample, TensePeriod } from './grammar-visual.models';

@Component({
  selector: 'app-grammar-tense-timeline',
  imports: [GrammarSyntaxSentence],
  templateUrl: './grammar-tense-timeline.html',
  styleUrl: './grammar-tense-timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrammarTenseTimeline {
  readonly examples = input.required<readonly TenseExample[]>();
  protected readonly periods: readonly { readonly value: TensePeriod; readonly label: string }[] = [
    { value: 'past', label: 'Quá khứ' },
    { value: 'present', label: 'Hiện tại' },
    { value: 'future', label: 'Tương lai' },
  ];
  protected readonly aspects: readonly {
    readonly value: TenseAspect;
    readonly label: string;
    readonly clue: string;
  }[] = [
    { value: 'simple', label: 'Đơn', clue: 'Sự việc hoặc thói quen' },
    { value: 'continuous', label: 'Tiếp diễn', clue: 'Đang xảy ra ở mốc xét' },
    { value: 'perfect', label: 'Hoàn thành', clue: 'Việc xảy ra trước mốc xét' },
    {
      value: 'perfect-continuous',
      label: 'Hoàn thành tiếp diễn',
      clue: 'Nhấn thời gian kéo dài tới mốc xét',
    },
  ];
  protected readonly period = linkedSignal<readonly TenseExample[], TensePeriod>({
    source: this.examples,
    computation: () => 'present',
  });
  protected readonly aspect = linkedSignal<readonly TenseExample[], TenseAspect>({
    source: this.examples,
    computation: () => 'simple',
  });
  protected readonly example = computed(() =>
    this.examples().find(
      (example) => example.period === this.period() && example.aspect === this.aspect(),
    ),
  );
  protected readonly routinePoints = computed(() => {
    const diagram = this.example()?.diagram;
    return diagram ? [diagram.start, (diagram.start + diagram.end) / 2, diagram.end] : [];
  });
  protected readonly radioPrefix = computed(() => this.examples()[0]?.id ?? 'empty');
}
