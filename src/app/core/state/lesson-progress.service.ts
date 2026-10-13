import { Injectable, inject, signal } from '@angular/core';
import { ProgressRepository } from '../persistence/progress.repository';

interface LessonProgress {
  readonly completed: readonly string[];
  readonly lastOpened: string | null;
}
function parse(value: unknown): LessonProgress {
  if (value === undefined) return { completed: [], lastOpened: null };
  if (
    typeof value !== 'object' ||
    value === null ||
    !('completed' in value) ||
    !Array.isArray(value.completed) ||
    !value.completed.every((slug: unknown) => typeof slug === 'string') ||
    !('lastOpened' in value) ||
    !(value.lastOpened === null || typeof value.lastOpened === 'string')
  )
    throw new Error('Invalid lesson progress');
  return { completed: value.completed, lastOpened: value.lastOpened };
}
@Injectable()
export class LessonProgressService {
  private readonly repository = inject(ProgressRepository);
  readonly completed = signal<readonly string[]>([]);
  readonly lastOpened = signal<string | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  private async read(): Promise<LessonProgress> {
    return parse(await this.repository.getSetting<unknown>('grammar-progress'));
  }
  async load(): Promise<void> {
    try {
      const value = await this.read();
      this.completed.set(value.completed);
      this.lastOpened.set(value.lastOpened);
    } catch {
      this.error.set('Không thể đọc tiến độ bài học. Hãy thử lại.');
    }
  }
  async opened(slug: string): Promise<void> {
    try {
      const value = await this.read();
      await this.repository.setSetting('grammar-progress', { ...value, lastOpened: slug });
      this.completed.set(value.completed);
      this.lastOpened.set(slug);
    } catch {
      this.error.set('Chưa lưu được bài học gần nhất. Hãy thử lại.');
    }
  }
  async toggle(slug: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const value = await this.read();
      const completed = value.completed.includes(slug)
        ? value.completed.filter((item) => item !== slug)
        : [...value.completed, slug];
      await this.repository.setSetting('grammar-progress', { ...value, completed });
      this.completed.set(completed);
    } catch {
      this.error.set('Chưa lưu được trạng thái bài học. Hãy thử lại.');
    } finally {
      this.busy.set(false);
    }
  }
}
