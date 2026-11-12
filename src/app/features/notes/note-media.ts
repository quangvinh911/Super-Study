import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { noteMediaKind } from '../../core/domain/notes';
import { NoteAttachment, NoteMediaType } from '../../core/models/notes.models';
import { NotesRepository } from '../../core/persistence/notes.repository';

type MediaState = 'ready' | 'loading' | 'loaded' | 'failed';

@Component({
  selector: 'app-note-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="note-media">
      @if (state() === 'loaded') {
        @if (kind() === 'image') {
          <img [src]="url()" [alt]="alt() ?? attachment().fileName" (error)="failed()" />
        } @else {
          <video
            [src]="url()"
            [attr.aria-label]="attachment().fileName"
            controls
            playsinline
            preload="metadata"
            (error)="failed()"
          ></video>
        }
      } @else if (state() === 'loading') {
        <span role="status">{{ kind() === 'image' ? 'Đang tải ảnh…' : 'Đang tải video…' }}</span>
      } @else {
        @if (state() === 'failed') {
          <span role="status">{{
            kind() === 'image' ? 'Không thể mở ảnh.' : 'Không thể mở video.'
          }}</span>
        }
        <button type="button" class="button button--secondary" (click)="load()">
          {{ state() === 'failed' ? 'Thử lại' : 'Xem video' }}
        </button>
      }
      <figcaption>{{ attachment().fileName }}</figcaption>
    </figure>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .note-media {
      display: grid;
      justify-items: start;
      gap: 0.4rem;
      margin: 0.8rem 0;
      padding: 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: 0.6rem;
      background: var(--color-paper);
      font-size: 0.9rem;
      overflow-wrap: anywhere;
    }
    img,
    video {
      display: block;
      max-width: 100%;
      max-height: 32rem;
      object-fit: contain;
    }
    figcaption {
      color: var(--color-text-muted);
    }
  `,
})
export class NoteMedia {
  readonly attachmentId = input.required<string>();
  readonly fileName = input.required<string>();
  readonly mimeType = input.required<NoteMediaType>();
  readonly alt = input<string>();
  readonly draftId = input<string>();
  readonly noteId = input<string>();
  private readonly auth = inject(AuthService);
  private readonly repository = inject(NotesRepository);
  private readonly owner = this.repository.owner();
  private readonly request = signal<{ attachmentId: string; noteId?: string } | null>(null);
  protected readonly attachment = computed<NoteAttachment>(() => ({
    attachmentId: this.attachmentId(),
    fileName: this.fileName(),
    mimeType: this.mimeType(),
  }));
  protected readonly kind = computed(() => noteMediaKind(this.mimeType()));
  protected readonly state = signal<MediaState>('ready');
  protected readonly url = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const attachment = this.attachment();
      const draftId = this.draftId();
      const noteId = this.noteId();
      const request = this.request();
      this.auth.user();
      this.url.set(null);
      if (this.repository.owner() !== this.owner) {
        this.state.set('failed');
        return;
      }
      if (
        this.kind() === 'video' &&
        (request?.attachmentId !== attachment.attachmentId || request.noteId !== noteId)
      ) {
        this.state.set('ready');
        return;
      }

      const controller = new AbortController();
      let objectUrl: string | undefined;
      onCleanup(() => {
        controller.abort();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
      this.state.set('loading');
      void this.repository
        .readAttachment(attachment, { draftId, signal: controller.signal })
        .then((blob) => {
          if (controller.signal.aborted || this.repository.owner() !== this.owner) return;
          objectUrl = URL.createObjectURL(blob);
          this.url.set(objectUrl);
          this.state.set('loaded');
        })
        .catch(() => {
          if (!controller.signal.aborted) this.state.set('failed');
        });
    });
  }

  protected load(): void {
    this.request.set({ attachmentId: this.attachment().attachmentId, noteId: this.noteId() });
  }

  protected failed(): void {
    this.state.set('failed');
  }
}
