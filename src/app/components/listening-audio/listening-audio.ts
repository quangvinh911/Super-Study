import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnDestroy,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

@Component({
  selector: 'app-listening-audio',
  templateUrl: './listening-audio.html',
  styleUrl: './listening-audio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListeningAudio implements OnDestroy {
  readonly src = input.required<string>();
  readonly label = input.required<string>();
  private readonly media = viewChild<ElementRef<HTMLAudioElement>>('media');
  private playRequest = 0;
  protected readonly playing = signal(false);
  protected readonly pending = signal(false);
  protected readonly buffering = signal(false);
  protected readonly started = signal(false);
  protected readonly ended = signal(false);
  protected readonly error = signal('');
  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly volume = signal(1);
  protected readonly muted = signal(false);
  protected readonly speed = signal(1);
  protected readonly elapsed = computed(() => formatTime(this.currentTime()));
  protected readonly total = computed(() =>
    this.duration() > 0 ? formatTime(this.duration()) : '—:—',
  );
  protected readonly seekText = computed(() => `${this.elapsed()} / ${this.total()}`);
  protected readonly progress = computed(() =>
    this.duration() > 0 ? (this.currentTime() / this.duration()) * 100 : 0,
  );
  protected readonly status = computed(() => {
    if (this.error()) return 'Không thể phát audio';
    if (this.pending() || this.buffering()) return 'Đang tải audio…';
    if (this.playing()) return 'Đang phát';
    if (this.ended()) return 'Đã nghe hết';
    if (this.started()) return 'Đã tạm dừng';
    return 'Sẵn sàng nghe';
  });

  constructor() {
    effect(() => {
      this.src();
      // A new question can reuse this component; never carry playback into a new clip.
      untracked(() => {
        this.playRequest++;
        const audio = this.media()?.nativeElement;
        audio?.pause();
        if (audio) {
          audio.playbackRate = 1;
          audio.volume = 1;
          audio.muted = false;
        }
        this.playing.set(false);
        this.pending.set(false);
        this.buffering.set(false);
        this.started.set(false);
        this.ended.set(false);
        this.error.set('');
        this.currentTime.set(0);
        this.duration.set(0);
        this.speed.set(1);
        this.volume.set(1);
        this.muted.set(false);
      });
    });
  }

  protected async togglePlayback(): Promise<void> {
    const audio = this.media()?.nativeElement;
    if (!audio) return;
    const request = ++this.playRequest;
    if (!audio.paused) {
      audio.pause();
      this.pending.set(false);
      return;
    }
    if (this.error()) audio.load();
    this.error.set('');
    this.ended.set(false);
    this.pending.set(true);
    try {
      await audio.play();
    } catch {
      // Ignore a cancelled request when the learner leaves or changes clips.
      if (request === this.playRequest) this.fail();
    } finally {
      if (request === this.playRequest) this.pending.set(false);
    }
  }

  protected syncTime(): void {
    const audio = this.media()?.nativeElement;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0;
    this.duration.set(duration);
    this.currentTime.set(Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0);
  }

  protected onPlay(): void {
    this.started.set(true);
    this.playing.set(true);
    this.ended.set(false);
  }

  protected onPause(): void {
    this.playing.set(false);
    this.buffering.set(false);
  }

  protected onEnded(): void {
    this.onPause();
    this.ended.set(true);
    this.syncTime();
  }

  protected seek(seconds: number): void {
    const audio = this.media()?.nativeElement;
    if (!audio || this.duration() <= 0 || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.min(this.duration(), Math.max(0, seconds));
    this.ended.set(false);
    this.syncTime();
  }

  protected skip(seconds: number): void {
    this.seek(this.currentTime() + seconds);
  }

  protected changeSpeed(value: string): void {
    const rate = Number(value);
    const audio = this.media()?.nativeElement;
    if (!audio || ![0.75, 1, 1.25, 1.5].includes(rate)) return;
    audio.playbackRate = rate;
    this.speed.set(rate);
  }

  protected changeVolume(value: string): void {
    const volume = Number(value);
    const audio = this.media()?.nativeElement;
    if (!audio || !Number.isFinite(volume)) return;
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.muted = false;
    this.syncVolume();
  }

  protected toggleMute(): void {
    const audio = this.media()?.nativeElement;
    if (!audio) return;
    audio.muted = !audio.muted;
    this.syncVolume();
  }

  protected syncVolume(): void {
    const audio = this.media()?.nativeElement;
    if (!audio) return;
    this.volume.set(audio.volume);
    this.muted.set(audio.muted);
  }

  protected fail(): void {
    this.onPause();
    this.pending.set(false);
    this.error.set('Không tải được audio. Kiểm tra kết nối rồi bấm “Thử lại”.');
  }

  ngOnDestroy(): void {
    this.playRequest++;
    this.media()?.nativeElement.pause();
  }
}
