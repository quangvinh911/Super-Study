import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { FavoriteVocabularyRepository } from '../../core/persistence/favorite-vocabulary.repository';
import { FavoriteVocabularyEditor } from './favorite-vocabulary-editor';

// jsdom does not implement the native modal dialog lifecycle.
function mockDialog(element: HTMLElement): void {
  const dialog = element.querySelector('dialog');
  if (!dialog) throw new Error('Missing dialog');
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));
  };
}

describe('Favorite vocabulary editor', () => {
  it('restores a saved definition and persists the edited fields', async () => {
    const word = {
      term: 'shipment',
      meaning: 'lô hàng',
      pronunciation: '/ˈʃɪpmənt/',
      example: 'The shipment arrived.',
    };
    const save = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [FavoriteVocabularyEditor],
      providers: [
        { provide: FavoriteVocabularyRepository, useValue: { list: async () => [word], save } },
      ],
    });
    const fixture = TestBed.createComponent(FavoriteVocabularyEditor);
    await fixture.whenStable();
    mockDialog(fixture.nativeElement);
    await fixture.componentInstance.open({ term: 'Shipment', example: 'Another sentence.' });
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector<HTMLTextAreaElement>('[name=example]')?.value).toBe(word.example);
    const meaning = element.querySelector<HTMLTextAreaElement>('[name=meaning]');
    if (!meaning) throw new Error('Missing meaning field');
    meaning.value = 'hàng gửi';
    meaning.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    element
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(save).toHaveBeenCalledWith({ ...word, meaning: 'hàng gửi' });
    expect(element.querySelector('dialog')?.open).toBe(false);
    expect(element.querySelector('[role=status]')?.textContent).toContain('Đã lưu');
  });

  it('keeps the form open and reports a failed save', async () => {
    const word = {
      term: 'shipment',
      meaning: 'lô hàng',
      pronunciation: '/ˈʃɪpmənt/',
      example: 'The shipment arrived.',
    };
    TestBed.configureTestingModule({
      imports: [FavoriteVocabularyEditor],
      providers: [
        {
          provide: FavoriteVocabularyRepository,
          useValue: {
            list: async () => [],
            save: vi.fn().mockRejectedValue(new Error('Storage full')),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(FavoriteVocabularyEditor);
    await fixture.whenStable();
    mockDialog(fixture.nativeElement);
    await fixture.componentInstance.open(word);
    await fixture.whenStable();
    fixture.nativeElement
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('dialog')?.open).toBe(true);
    expect(fixture.nativeElement.querySelector('[role=alert]')?.textContent).toContain(
      'Không lưu được',
    );
    expect(fixture.nativeElement.querySelector('[role=status]')?.textContent).not.toContain(
      'Đã lưu',
    );
  });
});
