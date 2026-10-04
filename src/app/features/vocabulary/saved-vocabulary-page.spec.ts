import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FavoriteVocabularyRepository } from '../../core/persistence/favorite-vocabulary.repository';
import { SavedVocabularyPage } from './saved-vocabulary-page';
import { FavoriteVocabularyService } from './favorite-vocabulary.service';

describe('Saved vocabulary page', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  it('speaks a saved word without saving again even when pronunciation is missing', async () => {
    const word = {
      term: 'shipment',
      meaning: 'lô hàng',
      pronunciation: '',
      example: 'The shipment arrived.',
      enrichment: 'partial',
    };
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        constructor(public text: string) {}
      },
    );
    const save = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [SavedVocabularyPage],
      providers: [
        {
          provide: FavoriteVocabularyRepository,
          useValue: { list: vi.fn().mockResolvedValue([word]), revision: signal(0) },
        },
        { provide: FavoriteVocabularyService, useValue: { save } },
      ],
    });
    const fixture = TestBed.createComponent(SavedVocabularyPage);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.word-audio').click();
    expect(speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'shipment', lang: 'en-US' }),
    );
    expect(save).not.toHaveBeenCalled();
    fixture.destroy();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
  it('displays definitions, searches Vietnamese and removes a saved word', async () => {
    const word = {
      term: 'shipment',
      meaning: 'lô hàng',
      pronunciation: '/ˈʃɪpmənt/',
      example: 'The shipment arrived today.',
    };
    const list = vi.fn().mockResolvedValue([word]);
    const remove = vi.fn().mockImplementation(async () => {
      list.mockResolvedValue([]);
    });
    TestBed.configureTestingModule({
      imports: [SavedVocabularyPage],
      providers: [
        { provide: FavoriteVocabularyRepository, useValue: { list, remove, revision: signal(0) } },
      ],
    });
    const fixture = TestBed.createComponent(SavedVocabularyPage);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain(word.pronunciation);
    expect(element.textContent).toContain(word.example);
    const search = element.querySelector<HTMLInputElement>('input[type=search]');
    if (!search) throw new Error('Missing search');
    search.value = 'lo hang';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.querySelectorAll('article')).toHaveLength(1);
    element.querySelector<HTMLButtonElement>('article .button--quiet')?.click();
    await fixture.whenStable();
    expect(remove).toHaveBeenCalledWith('shipment');
    expect(element.querySelectorAll('article')).toHaveLength(0);
  });

  it('reports storage failures instead of presenting an empty saved list', async () => {
    TestBed.configureTestingModule({
      imports: [SavedVocabularyPage],
      providers: [
        {
          provide: FavoriteVocabularyRepository,
          useValue: {
            list: vi.fn().mockRejectedValue(new Error('Storage unavailable')),
            revision: signal(0),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SavedVocabularyPage);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain(
      'Không đọc được',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Chưa có từ vựng');
  });
});
