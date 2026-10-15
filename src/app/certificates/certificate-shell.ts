import { Component, ElementRef, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QuizSessionStore } from '../core/state';
import { FavoriteVocabularyNotice } from '../features/vocabulary/favorite-vocabulary-notice';
import { VocabularyLookupPopup } from '../features/vocabulary/vocabulary-lookup-popup';
import { NotesDialogService } from '../features/notes/notes-dialog.service';
import { noteDocumentFromSelection } from '../features/notes/notes-selection';
import { NoteNode } from '../core/models/notes.models';
import { CertificateContext } from './certificate-context';

const excludedVocabularyTargets =
  'button, a, input, textarea, select, label, dialog, summary, audio, [contenteditable], app-vocabulary-lookup-popup';

export function wordAtOffset(text: string, offset: number): string | undefined {
  return [...text.matchAll(/[\p{L}]+(?:['’’-][\p{L}]+)*/gu)].find(
    (match) => offset >= match.index && offset < match.index + match[0].length,
  )?.[0];
}

@Component({
  selector: 'app-certificate-shell',
  imports: [RouterOutlet, FavoriteVocabularyNotice, VocabularyLookupPopup],
  template: `<router-outlet />
    <button class="button button--quiet" type="button" (click)="lookupSelection()">
      Tra từ / cụm từ đang bôi đen
    </button>
    <button class="button button--quiet" type="button" (click)="noteSelection()">
      Ghi chú đoạn đang bôi đen
    </button>
    @if (selectedNote(); as selection) {
      <div
        class="selection-toolbar"
        [style.left.px]="selection.x"
        [style.top.px]="selection.y"
        aria-label="Thao tác với văn bản đã chọn"
      >
        @if (selectedWord(); as word) {
          <button
            class="dictionary-trigger"
            type="button"
            [attr.aria-label]="'Tra từ điển: ' + word.term"
            [title]="'Tra từ điển: ' + word.term"
            aria-haspopup="dialog"
            (click)="openDictionary()"
          >
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path d="M12 5v15M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z" />
              <path d="M5 8h4M5 11h4M15 8h4M15 11h4" />
            </svg>
          </button>
        }
        <button
          class="notes-trigger"
          type="button"
          aria-label="Thêm vào Notes"
          title="Thêm vào Notes"
          aria-haspopup="dialog"
          (click)="openNotes()"
        >
          <svg
            aria-hidden="true"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9Z" />
            <path d="M14 3v7h7M7 14h10M7 17h7" />
          </svg>
        </button>
      </div>
    }
    @if (lookupWord(); as word) {
      <app-vocabulary-lookup-popup [word]="word" (closed)="closeDictionary()" />
    }
    <app-favorite-vocabulary-notice />`,
  styles: `
    .selection-toolbar {
      position: fixed;
      z-index: 900;
      display: flex;
      gap: 6px;
      padding: 4px;
      border: 1px solid var(--color-border);
      border-radius: 0.8rem;
      background: var(--color-paper-strong);
      box-shadow: 0 4px 20px #0002;
    }
    .dictionary-trigger,
    .notes-trigger {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border: 1px solid var(--color-teal);
      border-radius: 0.75rem;
      background: var(--color-paper-strong);
      color: var(--color-teal-dark);
      cursor: pointer;
    }
    .notes-trigger {
      border-color: var(--color-warning);
      background: var(--color-warning-wash);
      color: var(--color-warning);
    }
  `,
})
export class CertificateShell implements OnDestroy {
  private readonly store = inject(QuizSessionStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly notes = inject(NotesDialogService);
  private readonly certificate = inject(CertificateContext);
  private readonly router = inject(Router);
  protected readonly selectedNote = signal<{
    text: string;
    document?: NoteNode;
    x: number;
    y: number;
  } | null>(null);
  protected readonly lookupWord = signal<{ term: string; example: string } | null>(null);
  protected readonly selectedWord = signal<{
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
          this.dismissSelection(false);
        }
      });
  }

  protected lookupSelection(): void {
    const word = this.selectedText();
    if (!word) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rectangle =
      range && typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : null;
    this.showDictionaryIcon(word, rectangle?.left ?? 12, rectangle?.bottom ?? 12);
  }

  @HostListener('mouseup', ['$event'])
  protected selectPhrase(event: MouseEvent): void {
    if (!this.isNotesText(event.target) || this.lookupWord() || this.notes.draft()) return;
    const text = this.selectedNotesText();
    const word = this.selectedText();
    if (text) this.showSelection(text, word, event.clientX, event.clientY);
  }

  @HostListener('dblclick', ['$event'])
  protected selectWord(event: MouseEvent): void {
    if (!this.isStudyText(event.target) || this.lookupWord()) return;
    const word =
      this.termFromCard(event.target) ??
      this.selectedText(event.target) ??
      this.wordUnderPointer(event);
    if (word) this.showDictionaryIcon(word, event.clientX, event.clientY);
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
        this.showDictionaryIcon(word, event.clientX, event.clientY);
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
    if ((this.hold || this.selectedWord()) && this.wordUnderPointer(event)) event.preventDefault();
  }

  @HostListener('document:pointerdown', ['$event'])
  protected dismissOutside(event: PointerEvent): void {
    if (this.hold && event.pointerId !== this.hold.pointerId) this.cancelHold();
    if (
      this.selectedNote() &&
      !this.lookupWord() &&
      event.target instanceof Element &&
      !event.target.closest('.selection-toolbar')
    )
      this.dismissSelection(false);
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.lookupWord()) this.closeDictionary();
    else this.dismissSelection();
  }

  protected dismissSelection(returnFocus = true): void {
    this.cancelHold();
    this.selectedWord.set(null);
    this.selectedNote.set(null);
    this.lookupWord.set(null);
    if (returnFocus) this.previousFocus?.focus();
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  protected dismissOnViewportChange(): void {
    this.cancelHold();
    if (!this.lookupWord()) this.dismissSelection(false);
  }

  protected openDictionary(): void {
    const word = this.selectedWord();
    if (!word) return;
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.lookupWord.set({ term: word.term, example: word.example });
  }

  protected closeDictionary(): void {
    this.lookupWord.set(null);
    this.previousFocus?.focus();
  }

  private showDictionaryIcon(word: { term: string; example: string }, x: number, y: number): void {
    if (word.term.length > 120) return;
    this.showSelection(word.term, word, x, y);
  }

  private showSelection(
    text: string,
    word: { term: string; example: string } | undefined,
    x: number,
    y: number,
  ): void {
    const left = Math.max(8, Math.min(x, window.innerWidth - (word ? 104 : 54) - 8));
    const top = Math.max(8, Math.min(y + 16, window.innerHeight - 60));
    const selection = window.getSelection();
    let document: NoteNode | undefined;
    if (selection?.rangeCount && this.selectedNotesText()) {
      try {
        document = noteDocumentFromSelection(selection.getRangeAt(0));
      } catch {
        // Keep the original text available when the selected markup is unsupported.
      }
    }
    this.selectedNote.set({ text, document, x: left, y: top });
    this.selectedWord.set({
      term: word?.term ?? '',
      example: word?.example ?? '',
      x: left,
      y: top,
    });
    if (!word) this.selectedWord.set(null);
  }

  protected openNotes(): void {
    const selection = this.selectedNote();
    if (!selection) return;
    const heading = this.host.nativeElement.querySelector('h1')?.textContent?.trim();
    this.notes.open(
      undefined,
      {
        certificateId: this.certificate.id,
        path: this.router.url,
        label: `${this.certificate.name}${heading ? ' · ' + heading : ''}`.slice(0, 200),
      },
      selection.document ?? selection.text,
    );
    this.dismissSelection(false);
  }

  protected noteSelection(): void {
    const text = this.selectedNotesText();
    if (!text) return;
    this.showSelection(text, this.selectedText(), 12, 12);
    this.openNotes();
  }

  @HostListener('document:selectionchange')
  protected selectionChanged(): void {
    if (this.lookupWord() || this.notes.draft()) return;
    const text = this.selectedNotesText();
    if (!text) return;
    const range = window.getSelection()?.getRangeAt(0);
    const rect =
      range && typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : null;
    this.showSelection(text, this.selectedText(), rect?.left ?? 12, rect?.bottom ?? 12);
  }

  private isNotesText(target: EventTarget | null): target is HTMLElement {
    return (
      target instanceof HTMLElement &&
      this.host.nativeElement.contains(target) &&
      (!target.closest(excludedVocabularyTargets) ||
        (!!target.closest('[data-note-grammar-text]') &&
          !target.closest('dialog, [contenteditable]')))
    );
  }

  private selectedNotesText(): string | undefined {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const start = range.startContainer.parentElement,
      end = range.endContainer.parentElement;
    if (!this.isNotesText(start) || !this.isNotesText(end)) return;
    const text = selection.toString();
    return text.trim() ? text : undefined;
  }

  private isStudyText(target: EventTarget | null): target is HTMLElement {
    return (
      target instanceof HTMLElement &&
      (!target.closest(excludedVocabularyTargets) || !!target.closest('[data-vocabulary-term]')) &&
      !target.closest('dialog, app-vocabulary-lookup-popup') &&
      !!target.closest('[lang="en"], .content-blocks')
    );
  }

  private termFromCard(target: HTMLElement): { term: string; example: string } | undefined {
    const cardTerm = target.closest<HTMLElement>('[data-vocabulary-term]');
    const term = cardTerm?.dataset['vocabularyTerm'];
    if (!term?.trim() || term.length > 120) return;
    return { term: term.trim(), example: cardTerm?.dataset['vocabularyExample'] ?? '' };
  }

  private selectedText(target?: HTMLElement): { term: string; example: string } | undefined {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const start = range.startContainer.parentElement;
    const end = range.endContainer.parentElement;
    if (
      !start ||
      !end ||
      !this.host.nativeElement.contains(start) ||
      !this.host.nativeElement.contains(end) ||
      !this.isStudyText(start) ||
      !this.isStudyText(end)
    )
      return;
    if (target && !target.contains(range.commonAncestorContainer)) return;
    const term = selection.toString().trim().replace(/\s+/g, ' ');
    if (
      term.length > 120 ||
      !/^[a-z]+(?:['’‘-][a-z]+)*(?:\s+[a-z]+(?:['’‘-][a-z]+)*)*$/i.test(term)
    )
      return;
    return {
      term,
      example:
        start.closest('p, li, td, blockquote')?.textContent?.trim() ??
        start.textContent?.trim() ??
        '',
    };
  }

  private wordUnderPointer(event: MouseEvent): { term: string; example: string } | undefined {
    if (!this.isStudyText(event.target)) return;
    const cardTerm = this.termFromCard(event.target);
    if (cardTerm) return cardTerm;
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
