import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  GRAMMAR_LEARNING_ORDER,
  GRAMMAR_STAGES,
  GrammarLesson,
  GrammarStage,
} from './grammar-lessons';
import { GrammarSyntaxSentence } from './grammar-syntax-sentence';
import { GrammarMindMap } from './grammar-mind-map';

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi-VN')
    .trim();
}

@Component({
  selector: 'app-grammar-overview-page',
  imports: [RouterLink, GrammarSyntaxSentence, GrammarMindMap],
  templateUrl: './grammar-overview-page.html',
  styleUrl: './grammar-overview-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrammarOverviewPage {
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('pageHeading');
  private readonly searchControl = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly stages = GRAMMAR_STAGES;
  protected readonly lessonCount = GRAMMAR_LEARNING_ORDER.length;
  protected readonly demoSentence = GRAMMAR_LEARNING_ORDER[0]?.examples[0];
  protected readonly search = signal('');
  protected readonly stage = signal('all');
  protected readonly part = signal('all');
  protected readonly view = signal<'map' | 'cards'>('map');
  protected readonly hasFilters = computed(
    () => this.search().trim() !== '' || this.stage() !== 'all' || this.part() !== 'all',
  );
  protected readonly filteredLessons = computed(() => {
    const query = normalizeSearch(this.search());
    return GRAMMAR_LEARNING_ORDER.filter((lesson) => {
      const matchesStage = this.stage() === 'all' || lesson.stage === this.stage();
      const matchesPart = this.part() === 'all' || lesson.part === this.part();
      const matchesSearch = normalizeSearch(
        `${lesson.title} ${lesson.summary} ${lesson.goal}`,
      ).includes(query);
      return matchesStage && matchesPart && matchesSearch;
    });
  });
  protected readonly visibleStages = computed(() =>
    GRAMMAR_STAGES.map((name, index) => ({
      name,
      number: String(index + 1).padStart(2, '0'),
      lessons: this.filteredLessons().filter((lesson) => lesson.stage === name),
    })).filter((stage) => stage.lessons.length > 0),
  );
  protected readonly stageDescriptions: Readonly<Record<GrammarStage, string>> = {
    'Nền tảng': 'Nhìn vị trí, hiểu vai trò của từng từ.',
    'Động từ': 'Hiểu thời điểm, hành động và dạng động từ.',
    'Nối ý': 'Đọc mối liên hệ giữa các ý và mệnh đề.',
    'Mở rộng': 'Nhận ra sắc thái và cấu trúc thường gặp.',
  };

  constructor() {
    afterNextRender(() => {
      const fragment = this.route.snapshot.fragment;
      const target = fragment
        ? Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[id]')).find(
            (element) => element.id === fragment,
          )
        : undefined;
      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView();
      } else {
        this.heading()?.nativeElement.focus();
      }
    });
  }

  protected position(lesson: GrammarLesson): string {
    return String(GRAMMAR_LEARNING_ORDER.indexOf(lesson) + 1).padStart(2, '0');
  }

  protected clearFilters(): void {
    this.search.set('');
    this.stage.set('all');
    this.part.set('all');
    this.searchControl()?.nativeElement.focus();
  }
}
