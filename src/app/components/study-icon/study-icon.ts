import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type StudyIconName =
  'home' | 'book' | 'pencil' | 'notes' | 'exam' | 'chart' | 'help' | 'bookmark' | 'repeat';

@Component({
  selector: 'app-study-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path [attr.d]="paths[name()]" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: 0 0 auto;
      width: 1.25rem;
      height: 1.25rem;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyIcon {
  readonly name = input.required<StudyIconName>();
  protected readonly paths: Record<StudyIconName, string> = {
    home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
    book: 'M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z',
    pencil: 'm15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14l-1 7 6-2',
    notes: 'M7 3h12v18H5V3h2ZM9 3v18M12 8h4M12 12h4',
    exam: 'M9 3h6v4H9ZM8 5H5v16h14V5h-3M8 13l3 3 5-6',
    chart: 'M4 3v17h17M8 15v-4M13 15V7M18 15V4',
    help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01',
    bookmark: 'M6 3h12v19l-6-4-6 4V3Z',
    repeat: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  };
}
