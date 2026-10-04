import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListeningAudio } from './listening-audio';

describe('Listening practice audio', () => {
  let fixture: ComponentFixture<ListeningAudio>;
  let page: HTMLElement;
  let audio: HTMLAudioElement;
  let paused: boolean;

  function find<T extends Element>(selector: string): T {
    const element = page.querySelector<T>(selector);
    if (!element) throw new Error(`Missing audio control: ${selector}`);
    return element;
  }

  async function metadata(duration = 60, currentTime = 0): Promise<void> {
    Object.defineProperty(audio, 'duration', { configurable: true, value: duration });
    audio.currentTime = currentTime;
    audio.dispatchEvent(new Event('loadedmetadata'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    paused = true;
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      paused = true;
      this.dispatchEvent(new Event('pause'));
    });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      paused = false;
      this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    });
    await TestBed.configureTestingModule({ imports: [ListeningAudio] }).compileComponents();
    fixture = TestBed.createComponent(ListeningAudio);
    fixture.componentRef.setInput('src', '/test-audio.mp3');
    fixture.componentRef.setInput('label', 'Đoạn hội thoại câu 32–34');
    await fixture.whenStable();
    page = fixture.nativeElement;
    audio = find<HTMLAudioElement>('audio');
    Object.defineProperty(audio, 'paused', { configurable: true, get: () => paused });
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('waits for user playback and shows real metadata, progress and buffering state', async () => {
    expect(audio.preload).toBe('none');
    expect(audio.autoplay).toBe(false);
    expect(find<HTMLInputElement>('.listening-player__seek').disabled).toBe(true);
    expect(find('.listening-player__times').textContent).toContain('—:—');
    await metadata(90, 20);
    expect(find('.listening-player__times').textContent).toContain('0:20');
    expect(find('.listening-player__times').textContent).toContain('1:30');
    find<HTMLButtonElement>('.listening-player__play').click();
    await fixture.whenStable();
    expect(find('[role="status"]').textContent).toBe('Đang phát');
    audio.dispatchEvent(new Event('waiting'));
    await fixture.whenStable();
    expect(find('[role="status"]').textContent).toBe('Đang tải audio…');
    audio.dispatchEvent(new Event('playing'));
    await fixture.whenStable();
    find<HTMLButtonElement>('.listening-player__play').click();
    await fixture.whenStable();
    expect(find('[role="status"]').textContent).toBe('Đã tạm dừng');
  });

  it('clamps seeking to the clip, supports replay and rejects invalid durations', async () => {
    await metadata(Infinity);
    expect(find<HTMLInputElement>('.listening-player__seek').disabled).toBe(true);
    await metadata(25, 2);
    find<HTMLButtonElement>('[aria-label="Tua lùi 10 giây"]').click();
    await fixture.whenStable();
    expect(audio.currentTime).toBe(0);
    await metadata(25, 22);
    find<HTMLButtonElement>('[aria-label="Tua tới 10 giây"]').click();
    await fixture.whenStable();
    expect(audio.currentTime).toBe(25);
    audio.dispatchEvent(new Event('ended'));
    await fixture.whenStable();
    expect(find('.listening-player__play').textContent).toContain('Nghe lại');
    const slider = find<HTMLInputElement>('.listening-player__seek');
    slider.value = '12';
    slider.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(audio.currentTime).toBe(12);
    expect(slider.getAttribute('aria-valuetext')).toBe('0:12 / 0:25');
  });

  it('changes speed and volume, restores sound, and resets when the source changes', async () => {
    const rate = find<HTMLSelectElement>('select');
    rate.value = '0.75';
    rate.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(audio.playbackRate).toBe(0.75);
    const volume = find<HTMLInputElement>('[aria-label="Âm lượng"]');
    volume.value = '0.4';
    volume.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(audio.volume).toBe(0.4);
    find<HTMLButtonElement>('[aria-label="Tắt âm thanh"]').click();
    await fixture.whenStable();
    expect(audio.muted).toBe(true);
    expect(volume.value).toBe('0');
    find<HTMLButtonElement>('[aria-label="Bật âm thanh"]').click();
    await fixture.whenStable();
    expect(audio.muted).toBe(false);
    expect(volume.value).toBe('0.4');
    await metadata(90, 45);
    find<HTMLButtonElement>('.listening-player__play').click();
    await fixture.whenStable();
    fixture.componentRef.setInput('src', '/next-audio.mp3');
    await fixture.whenStable();
    expect(paused).toBe(true);
    expect(audio.getAttribute('src')).toBe('/next-audio.mp3');
    expect(rate.value).toBe('1');
    expect(volume.value).toBe('1');
    expect(find<HTMLInputElement>('.listening-player__seek').disabled).toBe(true);
    expect(find('[role="status"]').textContent).toBe('Sẵn sàng nghe');
  });

  it('offers retry after a failed play and ignores a late failure after changing clips', async () => {
    const play = vi.spyOn(audio, 'play').mockRejectedValueOnce(new Error('Unavailable'));
    find<HTMLButtonElement>('.listening-player__play').click();
    await fixture.whenStable();
    expect(find('[role="alert"]').textContent).toContain('Không tải được audio');
    expect(find('.listening-player__play').textContent).toContain('Thử lại');
    find<HTMLButtonElement>('.listening-player__play').click();
    await fixture.whenStable();
    expect(audio.load).toHaveBeenCalled();
    expect(page.querySelector('[role="alert"]')).toBeNull();
    find<HTMLButtonElement>('.listening-player__play').click();
    await fixture.whenStable();
    let rejectPlayback: ((error: Error) => void) | undefined;
    play.mockImplementationOnce(
      () =>
        new Promise<void>((resolve, reject) => {
          rejectPlayback = reject;
        }),
    );
    find<HTMLButtonElement>('.listening-player__play').click();
    await fixture.whenStable();
    fixture.componentRef.setInput('src', '/new-clip.mp3');
    await fixture.whenStable();
    rejectPlayback?.(new Error('Cancelled'));
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(find('[role="status"]').textContent).toBe('Sẵn sàng nghe');
    fixture.destroy();
    expect(audio.pause).toHaveBeenCalled();
  });
});
