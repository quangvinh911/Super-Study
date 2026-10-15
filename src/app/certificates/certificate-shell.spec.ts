import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CertificateShell } from './certificate-shell';
import { QuizSessionStore } from '../core/state';
import { NotesDialogService } from '../features/notes/notes-dialog.service';
import { documentFromText } from '../core/domain/notes';
import {
  FavoriteVocabularyService,
  VocabularyLookupError,
} from '../features/vocabulary/favorite-vocabulary.service';

const originalCaret = Object.getOwnPropertyDescriptor(document, 'caretPositionFromPoint');
const originalModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
async function setup() {
  const save = vi.fn().mockResolvedValue(true);
  const details = {
    term: 'shipment',
    meaning: 'lô hàng',
    englishMeaning: 'A delivery of goods.',
    pronunciation: '/ˈʃɪpmənt/',
    example: 'The shipment arrived today.',
    source: 'dictionary',
    enrichment: 'complete',
  };
  const lookup = vi.fn().mockResolvedValue(details);
  const openNote = vi.fn();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    },
  });
  TestBed.configureTestingModule({
    imports: [CertificateShell],
    providers: [
      provideRouter([]),
      { provide: NotesDialogService, useValue: { draft: signal(null), open: openNote } },
      { provide: QuizSessionStore, useValue: { close: vi.fn().mockResolvedValue(undefined) } },
      {
        provide: FavoriteVocabularyService,
        useValue: { savePreview: save, lookup, notice: signal(null), dismiss: vi.fn() },
      },
    ],
  });
  const fixture = TestBed.createComponent(CertificateShell);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const paragraph = document.createElement('p');
  paragraph.lang = 'en';
  paragraph.textContent = 'The shipment arrived today.';
  element.append(paragraph);
  Object.defineProperty(document, 'caretPositionFromPoint', {
    configurable: true,
    value: () => ({ offsetNode: paragraph.firstChild, offset: 6 }),
  });
  return { fixture, element, paragraph, save, lookup, details, openNote };
}
function touch(type: string, x = 40): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 40 });
  Object.defineProperties(event, {
    pointerType: { value: 'touch' },
    pointerId: { value: 1 },
    isPrimary: { value: true },
  });
  return event;
}
describe('Dictionary selection gestures', () => {
  it('offers Notes for a long Vietnamese paragraph and captures it before selection disappears', async () => {
    const { fixture, element, paragraph, openNote, lookup } = await setup();
    paragraph.lang = 'vi';
    paragraph.textContent = 'Ghi chú tiếng Việt: đoạn văn dài, có số 2026 và dấu câu. '.repeat(4);
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    window.getSelection()?.addRange(range);
    paragraph.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, clientX: 10000, clientY: 10000 }),
    );
    fixture.detectChanges();
    const toolbar = element.querySelector<HTMLElement>('.selection-toolbar');
    expect(toolbar).not.toBeNull();
    expect(element.querySelector('.dictionary-trigger')).toBeNull();
    expect(Number.parseFloat(toolbar?.style.left ?? '0')).toBeLessThan(window.innerWidth - 44);
    window.getSelection()?.removeAllRanges();
    element.querySelector<HTMLButtonElement>('.notes-trigger')?.click();
    expect(openNote).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ certificateId: 'ctfl' }),
      documentFromText(paragraph.textContent ?? ''),
    );
    expect(lookup).not.toHaveBeenCalled();
  });
  it('places the yellow Notes button immediately after the dictionary button', async () => {
    const { fixture, element, paragraph } = await setup();
    paragraph.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }),
    );
    fixture.detectChanges();
    expect(
      element
        .querySelector('.dictionary-trigger')
        ?.nextElementSibling?.classList.contains('notes-trigger'),
    ).toBe(true);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.getSelection()?.removeAllRanges();
    if (originalModal)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    if (originalCaret) Object.defineProperty(document, 'caretPositionFromPoint', originalCaret);
    else Reflect.deleteProperty(document, 'caretPositionFromPoint');
  });
  it('shows an icon on double click, previews on icon click and saves only on request', async () => {
    const { fixture, element, paragraph, save, lookup, details } = await setup();
    paragraph.click();
    fixture.detectChanges();
    expect(element.querySelector('[role=dialog]')).toBeNull();
    expect(save).not.toHaveBeenCalled();
    paragraph.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }),
    );
    fixture.detectChanges();
    expect(element.querySelector('.dictionary-trigger')?.getAttribute('aria-label')).toContain(
      'shipment',
    );
    expect(element.querySelector('dialog')).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    element.querySelector<HTMLButtonElement>('.dictionary-trigger')?.click();
    await fixture.whenStable();
    expect(lookup).toHaveBeenCalledWith(
      { term: 'shipment', example: 'The shipment arrived today.' },
      expect.any(AbortSignal),
    );
    expect(element.querySelector('dialog')?.textContent).toContain('lô hàng');
    expect(element.querySelector('dialog dt')?.textContent).toBe('Nghĩa tiếng Việt');
    const englishMeaning = element.querySelector<HTMLDetailsElement>('dialog .english-meaning');
    expect(englishMeaning?.open).toBe(false);
    expect(englishMeaning?.querySelector('summary')?.textContent).toBe('Nghĩa tiếng Anh');
    expect(englishMeaning?.querySelector('[lang=en]')?.textContent).toContain(
      'A delivery of goods.',
    );
    expect(element.querySelector('dialog')?.textContent).toContain('/ˈʃɪpmənt/');
    expect(save).not.toHaveBeenCalled();
    element.querySelector<HTMLButtonElement>('dialog .button--primary')?.click();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledWith(details);
    expect(element.querySelector('dialog')?.textContent).toContain('Đã thêm vào yêu thích');
  });
  it('pronounces the popup term in English without saving and stops on close', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    class Utterance {
      lang = '';
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    const { fixture, element, paragraph, save, lookup } = await setup();
    paragraph.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.dictionary-trigger')?.click();
    await fixture.whenStable();
    const audio = element.querySelector<HTMLButtonElement>('dialog .word-audio');
    expect(audio?.getAttribute('aria-label')).toBe('Nghe phát âm shipment');
    audio?.click();
    expect(speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'shipment', lang: 'en-US' }),
    );
    const first: Utterance = speak.mock.calls[0][0];
    first.onerror?.({ error: 'audio-busy' });
    fixture.detectChanges();
    expect(element.querySelector('dialog [role=alert]')?.textContent).toContain(
      'Không phát được âm thanh',
    );
    audio?.click();
    fixture.detectChanges();
    expect(element.querySelector('dialog [role=alert]')).toBeNull();
    expect(speak).toHaveBeenCalledTimes(2);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    cancel.mockClear();
    element.querySelector<HTMLButtonElement>('dialog .close-button')?.click();
    fixture.detectChanges();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('explains unavailable browser speech while keeping the dictionary usable', async () => {
    const { fixture, element, paragraph, save } = await setup();
    paragraph.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.dictionary-trigger')?.click();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('dialog .word-audio')?.click();
    fixture.detectChanges();
    expect(element.querySelector('dialog [role=alert]')?.textContent).toContain(
      'chưa hỗ trợ phát âm',
    );
    expect(element.querySelector('dialog')?.textContent).toContain('lô hàng');
    expect(save).not.toHaveBeenCalled();
  });
  it('opens after one second of touch and cancels without saving', async () => {
    const { fixture, element, paragraph, save } = await setup();
    vi.useFakeTimers();
    paragraph.dispatchEvent(touch('pointerdown'));
    vi.advanceTimersByTime(999);
    fixture.detectChanges();
    expect(element.querySelector('[role=dialog]')).toBeNull();
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(element.querySelector('.dictionary-trigger')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(save).not.toHaveBeenCalled();
    expect(element.querySelector('.dictionary-trigger')).toBeNull();
  });
  it('cancels short touches, scrolling gestures and destruction', async () => {
    const { fixture, element, paragraph, save } = await setup();
    vi.useFakeTimers();
    paragraph.dispatchEvent(touch('pointerdown'));
    document.dispatchEvent(touch('pointerup'));
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(element.querySelector('.dictionary-trigger')).toBeNull();
    paragraph.dispatchEvent(touch('pointerdown'));
    document.dispatchEvent(touch('pointermove', 80));
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(element.querySelector('.dictionary-trigger')).toBeNull();
    paragraph.dispatchEvent(touch('pointerdown'));
    fixture.destroy();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
  });
  it('dismisses the tooltip on Escape and ignores interactive controls', async () => {
    const { fixture, element, paragraph, save } = await setup();
    paragraph.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }),
    );
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('[role=dialog]')).toBeNull();
    const button = document.createElement('button');
    button.lang = 'en';
    button.textContent = 'shipment';
    element.append(button);
    button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }));
    fixture.detectChanges();
    expect(element.querySelector('[role=dialog]')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('previews the entire selected phrase across inline markup', async () => {
    const { fixture, element, paragraph, lookup, save } = await setup();
    paragraph.innerHTML = 'Please <strong>keep</strong> in mind the deadline.';
    const strong = paragraph.querySelector('strong');
    const ending = strong?.nextSibling;
    if (!strong?.firstChild || !ending) throw new Error('Missing phrase nodes');
    const range = document.createRange();
    range.setStart(strong.firstChild, 0);
    range.setEnd(ending, 8);
    window.getSelection()?.addRange(range);
    paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 40, clientY: 40 }));
    fixture.detectChanges();
    expect(element.querySelector('.dictionary-trigger')?.getAttribute('aria-label')).toContain(
      'keep in mind',
    );
    element.querySelector<HTMLButtonElement>('.dictionary-trigger')?.click();
    await fixture.whenStable();
    expect(lookup).toHaveBeenCalledWith(
      { term: 'keep in mind', example: 'Please keep in mind the deadline.' },
      expect.any(AbortSignal),
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('cancels a pending lookup when closed and restores focus to the icon', async () => {
    const { fixture, element, paragraph, lookup, save } = await setup();
    lookup.mockImplementation(() => new Promise(() => {}));
    paragraph.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }),
    );
    fixture.detectChanges();
    const trigger = element.querySelector<HTMLButtonElement>('.dictionary-trigger');
    trigger?.focus();
    trigger?.click();
    await fixture.whenStable();
    const lookupSignal: AbortSignal = lookup.mock.calls[0][1];
    expect(lookupSignal.aborted).toBe(false);
    element.querySelector<HTMLButtonElement>('.close-button')?.click();
    await fixture.whenStable();
    expect(element.querySelector('dialog')).toBeNull();
    expect(lookupSignal.aborted).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(save).not.toHaveBeenCalled();
  });

  it('closes the popup on Escape and restores focus to its dictionary icon', async () => {
    const { fixture, element, paragraph } = await setup();
    paragraph.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }),
    );
    fixture.detectChanges();
    const trigger = element.querySelector<HTMLButtonElement>('.dictionary-trigger');
    trigger?.focus();
    trigger?.click();
    await fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(element.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('uses the whole vocabulary-card phrase on double click while keeping a single click unchanged', async () => {
    const { fixture, element, lookup } = await setup();
    const term = document.createElement('button');
    term.lang = 'en';
    term.textContent = 'keep in mind';
    term.dataset['vocabularyTerm'] = 'keep in mind';
    term.dataset['vocabularyExample'] = 'Please keep in mind the deadline.';
    element.append(term);
    term.click();
    fixture.detectChanges();
    expect(element.querySelector('.dictionary-trigger')).toBeNull();
    term.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.dictionary-trigger')?.click();
    await fixture.whenStable();
    expect(lookup).toHaveBeenCalledWith(
      { term: 'keep in mind', example: 'Please keep in mind the deadline.' },
      expect.any(AbortSignal),
    );
  });

  it('shows missing dictionary fields honestly and retains attribution when saving', async () => {
    const { fixture, element, paragraph, lookup, save, details } = await setup();
    const partial = {
      ...details,
      pronunciation: '',
      example: '',
      meaningLanguage: 'en',
      englishMeaning: undefined,
      meaning: 'A delivery of goods.',
      sourceUrl: 'https://en.wiktionary.org/wiki/shipment',
      enrichment: 'partial',
    };
    lookup.mockResolvedValue(partial);
    paragraph.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }),
    );
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.dictionary-trigger')?.click();
    await fixture.whenStable();
    expect(element.querySelector('dialog')?.textContent).toContain('Chưa có phiên âm.');
    expect(element.querySelector('dialog')?.textContent).toContain('Chưa tìm thấy câu ví dụ.');
    expect(element.querySelector('dialog')?.textContent).toContain(
      'Chưa tìm được bản dịch tiếng Việt.',
    );
    expect(element.querySelector('dialog dd[lang=vi]')?.textContent).not.toContain(partial.meaning);
    expect(element.querySelector<HTMLDetailsElement>('dialog .english-meaning')?.open).toBe(false);
    expect(element.querySelector('dialog .english-meaning [lang=en]')?.textContent).toContain(
      partial.meaning,
    );
    expect(element.querySelector('dialog a')?.getAttribute('href')).toBe(
      'https://freedictionaryapi.com/',
    );
    element.querySelector<HTMLButtonElement>('dialog .button--primary')?.click();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledWith(partial);
  });

  it('shows lookup failures, retries and allows retrying a failed save without duplicates', async () => {
    const { fixture, element, paragraph, lookup, save, details } = await setup();
    lookup.mockRejectedValueOnce(new VocabularyLookupError('Nguồn từ điển đang không khả dụng.'));
    paragraph.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }),
    );
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.dictionary-trigger')?.click();
    await fixture.whenStable();
    expect(element.querySelector('dialog [role=alert]')?.textContent).toContain('không khả dụng');
    element.querySelector<HTMLButtonElement>('dialog .button--secondary')?.click();
    await fixture.whenStable();
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(element.querySelector('dialog')?.textContent).toContain(details.meaning);
    save.mockResolvedValueOnce(false);
    const saveButton = element.querySelector<HTMLButtonElement>('dialog .button--primary');
    saveButton?.click();
    saveButton?.click();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledTimes(1);
    expect(element.querySelector('dialog [role=alert]')?.textContent).toContain('Không lưu được');
    expect(saveButton?.disabled).toBe(false);
    saveButton?.click();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledTimes(2);
    expect(saveButton?.disabled).toBe(true);
  });
});
