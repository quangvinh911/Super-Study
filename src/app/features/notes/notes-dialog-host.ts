import { Component, HostListener, OnInit, Type, effect, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { NotesDialogService } from './notes-dialog.service';

@Component({
  selector: 'app-notes-dialog-host',
  imports: [NgComponentOutlet],
  template: `
    @if (notes.recovery() && !notes.draft()) {
      <aside class="recovery" aria-label="Bản nháp Notes">
        <span>Bạn có một ghi chú chưa lưu trong tab này.</span>
        <button type="button" (click)="notes.restore()">Khôi phục</button>
        <button type="button" (click)="notes.discardRecovery()">Bỏ nháp</button>
      </aside>
    }
    @if (notes.storageWarning()) {
      <p class="recovery" role="alert">{{ notes.storageWarning() }}</p>
    }
    @if (notes.draft()) {
      @if (editor(); as component) {
        <ng-container *ngComponentOutlet="component" />
      } @else if (loadError()) {
        <aside class="recovery" role="alert">
          Không thể mở trình soạn thảo.
          <button type="button" (click)="loadEditor()">Thử lại</button>
          <button type="button" (click)="notes.confirmLeave()">Đóng</button>
        </aside>
      } @else {
        <p class="recovery" role="status">Đang mở trình soạn thảo…</p>
      }
    }
    @if (notes.notice()) {
      <p class="notice" role="status">{{ notes.notice() }}</p>
    }
  `,
  styles: `
    .recovery {
      position: fixed;
      inset: auto 1rem 1rem;
      z-index: 1001;
      margin: 0;
      padding: 1rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-paper-strong);
      box-shadow: var(--shadow-md);
      display: flex;
      gap: 0.8rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .recovery button {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 0.4rem 0.7rem;
      background: var(--color-paper);
    }
    .notice {
      position: fixed;
      right: 1rem;
      top: 5rem;
      max-width: calc(100% - 2rem);
      z-index: 1002;
      margin: 0;
      padding: 0.8rem 1rem;
      border-radius: var(--radius-sm);
      background: var(--color-navy);
      color: var(--color-paper-strong);
      box-shadow: var(--shadow-md);
    }
  `,
})
export class NotesDialogHost implements OnInit {
  protected readonly notes = inject(NotesDialogService);
  protected readonly editor = signal<Type<unknown> | null>(null);
  protected readonly loadError = signal(false);
  private loading = false;
  constructor() {
    effect(() => {
      if (this.notes.draft() && !this.editor() && !this.loadError()) void this.loadEditor();
    });
  }
  ngOnInit(): void {
    this.notes.recover();
  }
  protected async loadEditor(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.loadError.set(false);
    try {
      this.editor.set((await import('./notes-editor')).NotesEditor);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading = false;
    }
  }
  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    this.notes.persist();
    if (this.notes.dirty() || this.notes.saving()) event.preventDefault();
  }
}
