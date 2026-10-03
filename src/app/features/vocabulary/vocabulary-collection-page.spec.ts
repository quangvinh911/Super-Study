import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VocabularyCollectionPage } from './vocabulary-collection-page';

const entry = {
  id: 'hacker-3-word-1',
  term: 'shipment',
  meaning: 'lô hàng',
  kind: 'word',
  topic: 'Vận chuyển',
  day: 16,
  usage: 'track a shipment',
  sources: [{ file: 'words.pdf', pdfPages: [42] }],
  occurrences: [],
};
describe('Vocabulary learning controls', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('filters the collection and reveals a meaning only on request in self-check mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'hacker-3',
          title: 'Hacker 3',
          reviewNote: 'Selected words',
          entries: [entry],
        }),
      }),
    );
    await TestBed.configureTestingModule({
      imports: [VocabularyCollectionPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ collectionId: 'hacker-3' }) } },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(VocabularyCollectionPage);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.meaning')?.textContent).toContain('lô hàng');
    const checkboxes = element.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    checkboxes[1].click();
    await fixture.whenStable();
    expect(element.querySelector('.meaning')).toBeNull();
    element.querySelector<HTMLButtonElement>('.vocabulary-entry button')?.click();
    await fixture.whenStable();
    expect(element.querySelector('.meaning')?.textContent).toContain('lô hàng');
    const search = element.querySelector<HTMLInputElement>('input[type=search]');
    if (!search) throw new Error('Missing search input');
    search.value = 'unknown';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.querySelector('.empty-results')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('.empty-results button')?.click();
    await fixture.whenStable();
    expect(element.querySelector('.vocabulary-entry')).not.toBeNull();
  });
  it('shows an explicit error when private collection data cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await TestBed.configureTestingModule({
      imports: [VocabularyCollectionPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ collectionId: 'hacker-3' }) } },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(VocabularyCollectionPage);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent,
    ).toContain('Chưa tải được');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
