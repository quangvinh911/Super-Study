import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotesEditor } from './notes-editor';
import { NotesDialogService } from './notes-dialog.service';
import { NotesRepository } from '../../core/persistence/notes.repository';
import { AuthService } from '../../core/auth/auth.service';

async function setup() {
  // jsdom has no native dialog top layer.
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
    },
  });
  const save = vi.fn().mockRejectedValue(new Error('offline'));
  TestBed.configureTestingModule({
    imports: [NotesEditor],
    providers: [
      { provide: NotesRepository, useValue: { owner: () => 'guest', save, revision: signal(0) } },
      {
        provide: AuthService,
        useValue: { user: signal(null), registerBeforeChange: () => () => {} },
      },
    ],
  });
  const notes = TestBed.inject(NotesDialogService);
  notes.open(undefined, undefined, 'Nội dung cần giữ lại.');
  const fixture = TestBed.createComponent(NotesEditor);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element, notes, save };
}
afterEach(() => {
  TestBed.resetTestingModule();
  sessionStorage.clear();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
describe('Notes editor public behavior', () => {
  it('loads the selected text and keeps the editor open on failed save', async () => {
    const { fixture, element, notes, save } = await setup();
    expect(element.querySelector('[role=textbox]')?.textContent).toContain('Nội dung cần giữ lại.');
    const button = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Lưu ghi chú',
    );
    button?.click();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledOnce();
    expect(notes.draft()).not.toBeNull();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('Không thể lưu');
  });
  it('routes Ctrl+S through the save action and confirms Escape before discarding changes', async () => {
    const { fixture, element, notes, save } = await setup();
    element
      .querySelector('dialog')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    await fixture.whenStable();
    expect(save).toHaveBeenCalledOnce();
    element.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
    await fixture.whenStable();
    expect(notes.draft()).not.toBeNull();
    expect(element.querySelector<HTMLDialogElement>('.discard-confirm')?.open).toBe(true);
    expect(element.querySelector<HTMLDialogElement>('dialog')?.open).toBe(true);
    expect(element.querySelector('.discard-confirm')?.textContent).toContain('Bỏ thay đổi');
  });
  it('keeps edits when continuing or pressing Escape in the confirmation, and discards only on request', async () => {
    const { fixture, element, notes, save } = await setup();
    const draft = notes.draft();
    const editorDialog = element.querySelector('dialog');
    const confirmation = element.querySelector<HTMLDialogElement>('.discard-confirm');
    const continueButton = confirmation?.querySelector<HTMLButtonElement>('button');
    const discardButton = confirmation?.querySelector<HTMLButtonElement>('.button--danger');
    if (!editorDialog || !confirmation || !continueButton || !discardButton)
      throw new Error('Missing Notes dialogs');
    editorDialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(confirmation.open).toBe(true);
    continueButton.click();
    expect(confirmation.open).toBe(false);
    expect(notes.draft()).toBe(draft);
    editorDialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    const escape = new Event('cancel', { cancelable: true });
    confirmation.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(confirmation.open).toBe(false);
    expect(notes.draft()).toBe(draft);
    editorDialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    discardButton.click();
    await fixture.whenStable();
    expect(confirmation.open).toBe(false);
    expect(notes.draft()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('certificate-notes-draft:guest')).toBeNull();
  });
});
