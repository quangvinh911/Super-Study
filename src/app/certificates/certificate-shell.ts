import {
  afterNextRender,
  Component,
  ElementRef,
  HostListener,
  inject,
  Injector,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QuizSessionStore } from '../core/state';
import { FavoriteVocabularyService } from '../features/vocabulary/favorite-vocabulary.service';
import { FavoriteVocabularyNotice } from '../features/vocabulary/favorite-vocabulary-notice';

export function wordAtOffset(text: string, offset: number): string | undefined {
  return [...text.matchAll(/[\p{L}]+(?:['’’-][\p{L}]+)*/gu)].find(
    (match) => offset >= match.index && offset < match.index + match[0].length,
  )?.[0];
}

@Component({
  selector: 'app-certificate-shell',
  imports: [RouterOutlet, FavoriteVocabularyNotice],
  template: `<router-outlet />
    <button class="button button--quiet" type="button" (click)="saveSelection()">
      Lưu từ đang bôi đen
    </button>
    @if (confirmation(); as word) {
      <div
        class="word-confirmation"
        role="dialog"
        aria-labelledby="word-confirmation-title"
        [style.left.px]="word.x"
        [style.top.px]="word.y"
      >
        <p id="word-confirmation-title">
          Lưu <strong lang="en">{{ word.term }}</strong> vào từ vựng yêu thích?
        </p>
        <div class="word-confirmation__actions">
          <button
            #confirmButton
            class="button button--primary"
            type="button"
            (click)="confirmWord()"
          >
            Thêm từ vựng
          </button>
          <button class="button button--quiet" type="button" (click)="dismissConfirmation()">
            Không
          </button>
        </div>
      </div>
    }
    <app-favorite-vocabulary-notice />`,
  styles: `
    .word-confirmation {
      position: fixed;
      z-index: 900;
      width: min(320px, calc(100vw - 24px));
      box-sizing: border-box;
      max-height: calc(100vh - 24px);
      overflow: auto;
      padding: 1rem;
      border: 1px solid var(--color-teal);
      border-radius: 0.75rem;
      background: var(--color-surface, white);
      color: var(--color-ink);
      box-shadow: 0 4px 20px #0002;
    }
    .word-confirmation p {
      margin: 0 0 0.75rem;
      overflow-wrap: anywhere;
    }
    .word-confirmation__actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  `,
})
export class CertificateShell implements OnDestroy {
  private readonly store = inject(QuizSessionStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly favorites = inject(FavoriteVocabularyService);
  private readonly injector = inject(Injector);
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  protected readonly confirmation = signal<{
    term: string;
    example: string;
    x: number;
    y: number;
  } | null>(null);
  private hold:
    { pointerId: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | undefined;
  private previousFocus: HTMLElement | null = null;

  constructor() {
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.cancelHold();
          this.dismissConfirmation(false);
        }
      });
  }

  protected saveSelection(): void {
    const selection = window.getSelection();
    const term = selection?.toString().trim();
    if (!term || !selection?.anchorNode || !this.host.nativeElement.contains(selection.anchorNode))
      return;
    const rectangle = selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    this.showConfirmation(
      {
        term,
        example: selection.anchorNode.parentElement?.textContent?.trim() ?? '',
      },
      rectangle?.left ?? 12,
      rectangle?.bottom ?? 12,
    );
  }

  @HostListener('dblclick', ['$event'])
  protected selectWord(event: MouseEvent): void {
    const word = this.wordUnderPointer(event);
    if (word) this.showConfirmation(word, event.clientX, event.clientY);
  }

  @HostListener('pointerdown', ['$event'])
  protected startHold(event: PointerEvent): void {
    this.cancelHold();
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    const word = this.wordUnderPointer(event);
    if (!word) return;
    this.hold = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        this.hold = undefined;
        this.showConfirmation(word, event.clientX, event.clientY);
      }, 1000),
    };
  }

  @HostListener('document:pointermove', ['$event'])
  protected moveHold(event: PointerEvent): void {
    if (
      this.hold?.pointerId === event.pointerId &&
      Math.hypot(event.clientX - this.hold.x, event.clientY - this.hold.y) > 10
    )
      this.cancelHold();
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  protected cancelHold(): void {
    if (this.hold) clearTimeout(this.hold.timer);
    this.hold = undefined;
  }

  @HostListener('contextmenu', ['$event'])
  protected suppressTouchMenu(event: MouseEvent): void {
    if ((this.hold || this.confirmation()) && this.wordUnderPointer(event)) event.preventDefault();
  }

  @HostListener('document:pointerdown', ['$event'])
  protected dismissOutside(event: PointerEvent): void {
    if (this.hold && event.pointerId !== this.hold.pointerId) this.cancelHold();
    if (
      this.confirmation() &&
      event.target instanceof Element &&
      !event.target.closest('.word-confirmation')
    )
      this.dismissConfirmation(false);
  }

  @HostListener('document:keydown.escape')
  protected dismissConfirmation(returnFocus = true): void {
    this.cancelHold();
    this.confirmation.set(null);
    if (returnFocus) this.previousFocus?.focus();
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  protected dismissOnViewportChange(): void {
    this.cancelHold();
    this.dismissConfirmation(false);
  }

  protected confirmWord(): void {
    const word = this.confirmation();
    if (!word) return;
    this.dismissConfirmation();
    void this.favorites.save({ term: word.term, example: word.example });
  }

  private showConfirmation(word: { term: string; example: string }, x: number, y: number): void {
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const width = Math.min(320, window.innerWidth - 24);
    this.confirmation.set({
      ...word,
      x: Math.max(12, Math.min(x, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(y + 16, window.innerHeight - 180)),
    });
    afterNextRender(() => this.confirmButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private wordUnderPointer(event: MouseEvent): { term: string; example: string } | undefined {
    if (event.target instanceof HTMLElement && event.target.closest('app-saved-vocabulary-page'))
      return;
    if (
      !(event.target instanceof HTMLElement) ||
      event.target.closest(
        'button, a, input, textarea, select, label, dialog, summary, audio, .word-confirmation',
      )
    )
      return;
    if (!event.target.closest('[lang="en"], .content-blocks')) return;
    // Resolve the text under the pointer without rewriting sentence markup or answer controls.
    const caretDocument = document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = caretDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
    const range = position
      ? null
      : caretDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
    const node = position?.offsetNode ?? range?.startContainer;
    const offset = position?.offset ?? range?.startOffset;
    if (
      !node ||
      node.nodeType !== Node.TEXT_NODE ||
      offset === undefined ||
      !event.target.contains(node)
    )
      return;
    const term = wordAtOffset(node.textContent ?? '', offset);
    if (!term || !/^[a-z]+(?:['’’-][a-z]+)*$/i.test(term)) return;
    return {
      term,
      example:
        node.parentElement?.closest('p, li, td, blockquote')?.textContent?.trim() ??
        node.textContent?.trim() ??
        '',
    };
  }
  ngOnDestroy(): void {
    this.cancelHold();
    void this.store.close();
  }
}
