import { DOCUMENT } from '@angular/common';
import {
  AfterRenderRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { GrammarSyntaxSentence } from './grammar-syntax-sentence';
import { GrammarTransformationDemo } from './grammar-visual.models';

@Component({
  selector: 'app-grammar-transformation',
  imports: [GrammarSyntaxSentence],
  templateUrl: './grammar-transformation.html',
  styleUrl: './grammar-transformation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrammarTransformation {
  readonly demo = input.required<GrammarTransformationDemo>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly stepIndex = linkedSignal({ source: this.demo, computation: () => 0 });
  protected readonly step = computed(() => this.demo().steps[this.stepIndex()]);
  private readonly animations = new Set<Animation>();
  private pendingRender: AfterRenderRef | undefined;

  constructor() {
    effect(() => {
      this.demo();
      this.cancelAnimations();
    });
    this.destroyRef.onDestroy(() => this.cancelAnimations());
  }

  protected previous(): void {
    this.moveTo(this.stepIndex() - 1);
  }
  protected next(): void {
    this.moveTo(this.stepIndex() + 1);
  }
  protected reset(): void {
    this.moveTo(0);
  }

  private moveTo(index: number): void {
    if (index < 0 || index >= this.demo().steps.length || index === this.stepIndex()) return;
    this.cancelAnimations();
    const previousPositions = this.capturePositions();
    this.stepIndex.set(index);
    if (this.prefersReducedMotion()) return;

    this.pendingRender = afterNextRender(
      () => {
        this.pendingRender = undefined;
        if (this.prefersReducedMotion()) return;
        for (const token of this.tokenElements()) {
          if (typeof token.animate !== 'function') continue;
          const tokenId = token.dataset['syntaxId'];
          const previous = tokenId ? previousPositions.get(tokenId) : undefined;
          const current = token.getBoundingClientRect();
          const frames: Keyframe[] = previous
            ? [
                {
                  transform: `translate(${previous.left - current.left}px, ${previous.top - current.top}px)`,
                },
                { transform: 'translate(0, 0)' },
              ]
            : [
                { opacity: 0, transform: 'translateY(6px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ];
          const animation = token.animate(frames, { duration: 240, easing: 'ease-out' });
          this.animations.add(animation);
          animation.onfinish = () => this.animations.delete(animation);
          animation.oncancel = () => this.animations.delete(animation);
        }
      },
      { injector: this.injector },
    );
  }

  private tokenElements(): NodeListOf<HTMLButtonElement> {
    return this.host.nativeElement.querySelectorAll('.transformation-sentence [data-syntax-id]');
  }

  private capturePositions(): ReadonlyMap<string, DOMRect> {
    const positions = new Map<string, DOMRect>();
    for (const token of this.tokenElements()) {
      const id = token.dataset['syntaxId'];
      if (id) positions.set(id, token.getBoundingClientRect());
    }
    return positions;
  }

  private prefersReducedMotion(): boolean {
    const view = this.document.defaultView;
    return (
      typeof view?.matchMedia === 'function' &&
      view.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private cancelAnimations(): void {
    this.pendingRender?.destroy();
    this.pendingRender = undefined;
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
  }
}
