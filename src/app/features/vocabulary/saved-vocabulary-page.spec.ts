import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountUser, AuthService } from '../../core/auth/auth.service';
import {
  FavoriteVocabulary,
  FavoriteVocabularyRepository,
} from '../../core/persistence/favorite-vocabulary.repository';
import { SavedVocabularyPage } from './saved-vocabulary-page';
import { FavoriteVocabularyService } from './favorite-vocabulary.service';

describe('Saved vocabulary page', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  it('offers automatic enrichment for legacy words with a missing example', async () => {
    const word = {
      term: 'shipment',
      meaning: 'lô hàng',
      pronunciation: '/ˈʃɪpmənt/',
      example: '',
      enrichment: 'complete',
    };
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
    const element: HTMLElement = fixture.nativeElement;
    const retry = Array.from(element.querySelectorAll<HTMLButtonElement>('article button')).find(
      (button) => button.textContent?.includes('Thử bổ sung lại'),
    );
    if (!retry) throw new Error('Missing enrichment retry button');
    retry.click();
    expect(save).toHaveBeenCalledWith(word);
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
    element.querySelector<HTMLButtonElement>('.word-actions .button--quiet')?.click();
    await fixture.whenStable();
    expect(remove).toHaveBeenCalledWith('shipment');
    expect(element.querySelectorAll('article')).toHaveLength(0);
  });

  it('keeps selection across reloads and restores it after filtering other words', async () => {
    const words = [savedWord('shipment', 'lô hàng'), savedWord('schedule', 'lịch trình')];
    const revision = signal(0);
    const list = vi.fn().mockResolvedValue(words);
    const fixture = createPage(list, revision);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelectorAll<HTMLButtonElement>('.word-select')[1].click();
    await fixture.whenStable();
    expect(element.querySelector('.word-detail h2')?.textContent?.trim()).toBe('schedule');
    expect(element.querySelector('.vocabulary-workspace')?.classList).toContain('is-detail-open');
    element.querySelector<HTMLButtonElement>('.back-to-list')?.click();
    await fixture.whenStable();
    expect(element.querySelector('.vocabulary-workspace')?.classList).not.toContain(
      'is-detail-open',
    );

    const search = element.querySelector<HTMLInputElement>('input[type=search]');
    if (!search) throw new Error('Missing search');
    search.value = 'lo hang';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.querySelectorAll('.word-row')).toHaveLength(1);
    expect(element.querySelector('.word-detail h2')?.textContent?.trim()).toBe('shipment');
    search.value = 'không có từ này';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.querySelector('.word-detail')).toBeNull();
    search.value = '';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(element.querySelector('.word-detail h2')?.textContent?.trim()).toBe('schedule');

    list.mockResolvedValue([words[1], words[0]]);
    revision.update((value) => value + 1);
    await fixture.whenStable();
    expect(element.querySelector('.word-detail h2')?.textContent?.trim()).toBe('schedule');
  });

  it('plays another row without changing the selected word', async () => {
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(readonly text: string) {}
      },
    );
    const fixture = createPage(
      vi
        .fn()
        .mockResolvedValue([savedWord('shipment', 'lô hàng'), savedWord('schedule', 'lịch trình')]),
    );
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelectorAll<HTMLButtonElement>('.word-row .word-audio')[1].click();
    await fixture.whenStable();
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'schedule' }));
    expect(element.querySelector('.word-detail h2')?.textContent?.trim()).toBe('shipment');
    expect(element.querySelector('.vocabulary-workspace')?.classList).not.toContain(
      'is-detail-open',
    );
  });

  it('shows another available word after removing the selected word', async () => {
    const first = savedWord('shipment', 'lô hàng');
    const second = savedWord('schedule', 'lịch trình');
    const list = vi.fn().mockResolvedValue([first, second]);
    const remove = vi.fn().mockImplementation(async () => list.mockResolvedValue([first]));
    const fixture = createPage(list, signal(0), signal<AccountUser | null>(null), remove);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelectorAll<HTMLButtonElement>('.word-select')[1].click();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('.word-actions .button--quiet')?.click();
    await fixture.whenStable();
    expect(remove).toHaveBeenCalledWith('schedule');
    expect(element.querySelectorAll('.word-row')).toHaveLength(1);
    expect(element.querySelector('.word-detail h2')?.textContent?.trim()).toBe('shipment');
  });

  it('clears previous owner details and ignores their delayed load response', async () => {
    const previous = deferred<FavoriteVocabulary[]>();
    const next = deferred<FavoriteVocabulary[]>();
    const revision = signal(0);
    const user = signal<AccountUser | null>(null);
    const list = vi
      .fn()
      .mockResolvedValueOnce([savedWord('guest-only', 'từ của khách')])
      .mockReturnValueOnce(previous.promise)
      .mockReturnValueOnce(next.promise);
    const fixture = createPage(list, revision, user);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('.word-select')?.click();
    await fixture.whenStable();
    revision.update((value) => value + 1);
    fixture.detectChanges();
    user.set(accountUser('member'));
    fixture.detectChanges();
    expect(element.textContent).not.toContain('guest-only');
    expect(element.querySelector('.word-detail')).toBeNull();
    expect(element.querySelector('.vocabulary-workspace')?.classList).not.toContain(
      'is-detail-open',
    );
    next.resolve([savedWord('member-only', 'từ của tài khoản')]);
    await fixture.whenStable();
    previous.resolve([savedWord('guest-delayed', 'phản hồi cũ')]);
    await fixture.whenStable();
    expect(element.querySelector('.word-detail h2')?.textContent?.trim()).toBe('member-only');
    expect(element.textContent).not.toContain('guest-delayed');
    expect(element.querySelectorAll('.word-row')).toHaveLength(1);
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

function savedWord(term: string, meaning: string): FavoriteVocabulary {
  return { term, meaning, pronunciation: '/example/', example: `Example with ${term}.` };
}

function accountUser(id: string): AccountUser {
  return {
    id,
    username: id,
    email: null,
    role: 'user',
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

function createPage(
  list: () => Promise<FavoriteVocabulary[]>,
  revision = signal(0),
  user = signal<AccountUser | null>(null),
  remove: (term: string) => Promise<unknown> = vi.fn().mockResolvedValue(undefined),
) {
  TestBed.configureTestingModule({
    imports: [SavedVocabularyPage],
    providers: [
      { provide: FavoriteVocabularyRepository, useValue: { list, remove, revision } },
      {
        provide: FavoriteVocabularyService,
        useValue: { save: vi.fn().mockResolvedValue(undefined) },
      },
      { provide: AuthService, useValue: { user } },
    ],
  });
  return TestBed.createComponent(SavedVocabularyPage);
}

function deferred<T>() {
  let finish: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      if (!finish) throw new Error('Deferred promise was not initialized');
      finish(value);
    },
  };
}
