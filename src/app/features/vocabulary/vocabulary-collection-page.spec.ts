import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VocabularyCollectionPage } from './vocabulary-collection-page';
import { FavoriteVocabularyService } from './favorite-vocabulary.service';

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
  it('saves via the star without opening a dialog', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'hacker-3',
            title: 'Hacker 3',
            reviewNote: 'Selected words',
            entries: [entry],
          }),
        }),
    );
    TestBed.configureTestingModule({
      imports: [VocabularyCollectionPage],
      providers: [
        provideRouter([]),
        { provide: FavoriteVocabularyService, useValue: { save } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ collectionId: 'hacker-3' }) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(VocabularyCollectionPage);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('.entry-favorite')?.click();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledWith({
      term: entry.term,
      meaning: entry.meaning,
      example: entry.usage,
    });
    expect(element.querySelector('dialog')).toBeNull();
  });
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
    element.querySelector<HTMLButtonElement>('.vocabulary-entry .button--secondary')?.click();
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
  it('offers pronunciation playback without the entry metadata row', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    class MockUtterance {
      lang = '';
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
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
    expect(element.querySelector('.entry-meta')).toBeNull();
    expect(element.querySelector('.pronunciation-hint')?.textContent).toContain('cách đọc');
    expect(element.querySelector('.entry-source')).toBeNull();
    element.querySelector<HTMLButtonElement>('.entry-term')?.click();
    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'shipment', lang: 'en-US' }),
    );
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
