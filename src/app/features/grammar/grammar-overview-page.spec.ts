import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GrammarOverviewPage } from './grammar-overview-page';
import { GRAMMAR_LEARNING_ORDER } from './grammar-lessons';

describe('TOEIC grammar overview', () => {
  let fixture: ComponentFixture<GrammarOverviewPage>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GrammarOverviewPage],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(GrammarOverviewPage);
    await fixture.whenStable();
    page = fixture.nativeElement;
  });

  async function search(value: string): Promise<void> {
    const input = page.querySelector<HTMLInputElement>('#grammar-search');
    if (!input) throw new Error('Grammar search input is missing.');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function select(id: string, value: string): Promise<void> {
    const input = page.querySelector<HTMLSelectElement>(id);
    if (!input) throw new Error(`Grammar filter ${id} is missing.`);
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  function lessonLinks(): string[] {
    return Array.from(
      page.querySelectorAll<HTMLAnchorElement>('.mind-map__lesson, .grammar-lesson-card'),
    ).map((link) => link.getAttribute('href') ?? '');
  }

  it('links all 19 lessons in the shared learning order with stable numbers', () => {
    const cards = page.querySelectorAll('.mind-map__lesson, .grammar-lesson-card');
    expect(cards).toHaveLength(19);
    expect(page.querySelectorAll('.mind-map__branch, .grammar-stage')).toHaveLength(4);
    expect(lessonLinks()).toEqual(
      GRAMMAR_LEARNING_ORDER.map((lesson) => `/certificates/toeic/grammar/${lesson.slug}`),
    );
    expect(
      Array.from(
        page.querySelectorAll('.mind-map__lesson-number, .grammar-lesson-card__number'),
      ).map((number) => number.textContent?.trim()),
    ).toEqual(
      Array.from({ length: 19 }, (_, index) => `Bài ${String(index + 1).padStart(2, '0')}`),
    );
    expect(page.querySelector('app-grammar-syntax-sentence')).not.toBeNull();
    expect(page.querySelector('.grammar-hero__actions a')?.getAttribute('href')).toBe(
      '/certificates/toeic/grammar#grammar-library',
    );
    expect(page.querySelector('nav[aria-label="Đường dẫn"]')).toBeNull();
    expect(page.querySelector<HTMLDetailsElement>('.grammar-sources')?.open).toBe(false);
  });

  it('defaults to the mind map and allows each branch to collapse independently', async () => {
    expect(page.querySelector('nav[aria-label="Sơ đồ tư duy ngữ pháp TOEIC"]')).not.toBeNull();
    const branches = Array.from(page.querySelectorAll<HTMLDetailsElement>('.mind-map__branch'));
    expect(branches.every((branch) => branch.open)).toBe(true);
    branches[0]?.querySelector('summary')?.click();
    await fixture.whenStable();
    expect(branches[0]?.open).toBe(false);
    expect(branches.slice(1).every((branch) => branch.open)).toBe(true);
    branches[0]?.querySelector('summary')?.click();
    expect(branches[0]?.open).toBe(true);
  });

  it('switches between map and cards while preserving filters and lesson links', async () => {
    await search('menh de');
    await select('#grammar-part', 'part-6');
    const links = lessonLinks();
    const switches = page.querySelectorAll<HTMLButtonElement>('.grammar-view-switch button');
    switches[1]?.click();
    await fixture.whenStable();
    expect(page.querySelector('app-grammar-mind-map')).toBeNull();
    expect(page.querySelectorAll('.grammar-lesson-card')).toHaveLength(links.length);
    expect(lessonLinks()).toEqual(links);
    expect(switches[1]?.getAttribute('aria-pressed')).toBe('true');
    switches[0]?.click();
    await fixture.whenStable();
    expect(page.querySelector('app-grammar-mind-map')).not.toBeNull();
    expect(lessonLinks()).toEqual(links);
    expect(page.querySelector<HTMLInputElement>('#grammar-search')?.value).toBe('menh de');
    expect(page.querySelector<HTMLSelectElement>('#grammar-part')?.value).toBe('part-6');
  });

  it('finds Vietnamese text without accents or case and keeps original lesson numbers', async () => {
    const originalNumber = page.querySelector(
      'a[href$="/cau-bi-dong"] .mind-map__lesson-number',
    )?.textContent;
    await search('CÂU BỊ ĐỘNG');
    const accentedLinks = lessonLinks();
    expect(accentedLinks).toContain('/certificates/toeic/grammar/cau-bi-dong');
    await search('  cau bi dong  ');
    expect(lessonLinks()).toEqual(accentedLinks);
    expect(
      page.querySelector('a[href$="/cau-bi-dong"] .mind-map__lesson-number')?.textContent,
    ).toBe(originalNumber);
  });

  it('combines the search, stage and Part filters and reports the visible count', async () => {
    await search('menh de');
    await select('#grammar-stage', 'Nối ý');
    await select('#grammar-part', 'part-6');
    expect(lessonLinks()).toEqual([
      '/certificates/toeic/grammar/lien-tu-va-tu-noi',
      '/certificates/toeic/grammar/menh-de',
    ]);
    expect(page.querySelector('.grammar-filter-status [role="status"]')?.textContent).toContain(
      '2 / 19 bài học',
    );
    expect(page.querySelectorAll('.mind-map__branch, .grammar-stage')).toHaveLength(1);
    await select('#grammar-part', 'part-5');
    expect(lessonLinks()).toHaveLength(0);
    expect(page.querySelector('.grammar-empty h3')?.textContent).toContain(
      'Chưa tìm thấy bài phù hợp',
    );
  });

  it('clears all filters from an empty search and restores the complete library', async () => {
    await search('khong-co-bai-hoc-nay');
    await select('#grammar-stage', 'Động từ');
    await select('#grammar-part', 'part-6');
    expect(page.querySelectorAll('.mind-map__lesson, .grammar-lesson-card')).toHaveLength(0);
    const clear = page.querySelector<HTMLButtonElement>('.grammar-empty button');
    if (!clear) throw new Error('Empty-state reset button is missing.');
    clear.click();
    await fixture.whenStable();
    expect(page.querySelector<HTMLInputElement>('#grammar-search')?.value).toBe('');
    expect(document.activeElement).toBe(page.querySelector('#grammar-search'));
    expect(page.querySelector<HTMLSelectElement>('#grammar-stage')?.value).toBe('all');
    expect(page.querySelector<HTMLSelectElement>('#grammar-part')?.value).toBe('all');
    expect(page.querySelectorAll('.mind-map__lesson, .grammar-lesson-card')).toHaveLength(19);
    expect(page.querySelector('.grammar-empty')).toBeNull();
    expect(page.querySelector('.grammar-clear')).toBeNull();
  });
});
