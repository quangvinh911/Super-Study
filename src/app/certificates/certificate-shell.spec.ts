import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CertificateShell } from './certificate-shell';
import { QuizSessionStore } from '../core/state';
import { FavoriteVocabularyService } from '../features/vocabulary/favorite-vocabulary.service';

const originalCaret = Object.getOwnPropertyDescriptor(document, 'caretPositionFromPoint');
async function setup() {
  const save = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    imports: [CertificateShell],
    providers: [
      provideRouter([]),
      { provide: QuizSessionStore, useValue: { close: vi.fn().mockResolvedValue(undefined) } },
      {
        provide: FavoriteVocabularyService,
        useValue: { save, notice: signal(null), dismiss: vi.fn() },
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
  return { fixture, element, paragraph, save };
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
describe('Word save confirmation gestures', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    if (originalCaret) Object.defineProperty(document, 'caretPositionFromPoint', originalCaret);
    else Reflect.deleteProperty(document, 'caretPositionFromPoint');
  });
  it('ignores a single click and saves only after confirming a double click', async () => {
    const { fixture, element, paragraph, save } = await setup();
    paragraph.click();
    fixture.detectChanges();
    expect(element.querySelector('[role=dialog]')).toBeNull();
    expect(save).not.toHaveBeenCalled();
    paragraph.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }),
    );
    fixture.detectChanges();
    expect(element.querySelector('[role=dialog]')?.textContent).toContain('shipment');
    expect(save).not.toHaveBeenCalled();
    element.querySelector<HTMLButtonElement>('.word-confirmation .button--primary')?.click();
    fixture.detectChanges();
    expect(save).toHaveBeenCalledWith({ term: 'shipment', example: 'The shipment arrived today.' });
    expect(element.querySelector('[role=dialog]')).toBeNull();
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
    expect(element.querySelector('[role=dialog]')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('.word-confirmation .button--quiet')?.click();
    fixture.detectChanges();
    expect(save).not.toHaveBeenCalled();
    expect(element.querySelector('[role=dialog]')).toBeNull();
  });
  it('cancels short touches, scrolling gestures and destruction', async () => {
    const { fixture, element, paragraph, save } = await setup();
    vi.useFakeTimers();
    paragraph.dispatchEvent(touch('pointerdown'));
    document.dispatchEvent(touch('pointerup'));
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(element.querySelector('[role=dialog]')).toBeNull();
    paragraph.dispatchEvent(touch('pointerdown'));
    document.dispatchEvent(touch('pointermove', 80));
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(element.querySelector('[role=dialog]')).toBeNull();
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
});
