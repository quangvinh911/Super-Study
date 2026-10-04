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
  protected readonly aspects: readonly { readonly value: TenseAspect; readonly label: string }[] = [
    { value: 'simple', label: 'Đơn' },
    { value: 'continuous', label: 'Tiếp diễn' },
    { value: 'perfect', label: 'Hoàn thành' },
    { value: 'perfect-continuous', label: 'Hoàn thành tiếp diễn' },
  ];
  protected readonly periodIndex = linkedSignal({ source: this.examples, computation: () => 1 });
  protected readonly aspect = linkedSignal<readonly TenseExample[], TenseAspect>({
    source: this.examples,
    computation: () => 'simple',
  });
  protected readonly periodLabel = computed(() => this.periods[this.periodIndex()].label);
  protected readonly example = computed(() => {
    const period = this.periods[this.periodIndex()].value;
    return this.examples().find(
      (example) => example.period === period && example.aspect === this.aspect(),
    );
  });
  protected readonly routinePoints = computed(() => {
    const diagram = this.example()?.diagram;
    return diagram ? [diagram.start, (diagram.start + diagram.end) / 2, diagram.end] : [];
  });
  protected readonly radioName = computed(() => `${this.examples()[0]?.id ?? 'empty'}-aspect`);

  protected selectPeriod(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < this.periods.length) {
      this.periodIndex.set(index);
    }
  }

  protected selectAspect(aspect: TenseAspect): void {
    this.aspect.set(aspect);
  }
}
